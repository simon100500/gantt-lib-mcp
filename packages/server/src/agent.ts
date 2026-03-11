/**
 * Agent runner for the Gantt server.
 *
 * runAgentWithHistory():
 * 1. Saves the user message to DB (messages table)
 * 2. Loads full conversation history from DB
 * 3. Builds prompt = system prompt + history context + current user message
 * 4. Runs @qwen-code/sdk query() with SDK-embedded MCP server
 * 5. Streams assistant text tokens to SSE via broadcastToProject({ type: 'token' })
 * 6. Saves assistant response to DB
 * 7. Broadcasts updated task snapshot via broadcastToProject({ type: 'tasks' })
 * 8. Broadcasts { type: 'done' } to signal turn complete
 *
 * The SDK-embedded MCP server runs in the same process, so task mutations are
 * immediately visible via taskStore.list().
 */

import { query, isSDKResultMessage, isSDKAssistantMessage, isSDKSystemMessage, type SDKSystemMessage, createSdkMcpServer } from '@qwen-code/sdk';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import * as dotenv from 'dotenv';
import { taskStore } from '@gantt/mcp/store';
import { broadcastToAI, broadcastToProject } from './sse.js';
import { ganttTools } from './gantt-tools.js';

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// In container: GANTT_PROJECT_ROOT=/app is set by docker-entrypoint.sh
// In dev: resolve from dist/agent.js → packages/server/dist → packages/server → project root
const PROJECT_ROOT = process.env.GANTT_PROJECT_ROOT ?? join(__dirname, '../../..');

// Load .env from project root (OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_MODEL)
dotenv.config({ path: join(PROJECT_ROOT, '.env') });

// ---------------------------------------------------------------------------
// Environment resolution
// ---------------------------------------------------------------------------

function resolveEnv(): { OPENAI_API_KEY: string; OPENAI_BASE_URL: string; OPENAI_MODEL: string } {
  return {
    OPENAI_API_KEY:  process.env.OPENAI_API_KEY  ?? process.env.ANTHROPIC_AUTH_TOKEN  ?? '',
    OPENAI_BASE_URL: process.env.OPENAI_BASE_URL ?? 'https://api.z.ai/api/paas/v4/',
    OPENAI_MODEL:    process.env.OPENAI_MODEL    ?? process.env.ANTHROPIC_DEFAULT_SONNET_MODEL ?? 'glm-4.7',
  };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Run one agent turn:
 * - persists user/assistant messages in DB (project-scoped)
 * - streams tokens via SSE broadcast to project
 * - broadcasts task snapshot after each turn (project-scoped)
 *
 * @param userMessage - User's chat message
 * @param projectId - Project ID for scoping data
 * @param sessionId - Session ID (unused but kept for interface compatibility)
 */
export async function runAgentWithHistory(
  userMessage: string,
  projectId: string,
  sessionId: string
): Promise<void> {
  // Set PROJECT_ID for this request so tools can use it
  const originalProjectId = process.env.PROJECT_ID;
  process.env.PROJECT_ID = projectId;

  try {
    // 1. Save user message to DB (project-scoped)
    await taskStore.addMessage('user', userMessage, projectId);

    // 2. Load full conversation history from DB (project-scoped)
    const messages = await taskStore.getMessages(projectId);

    // 3. Load system prompt (optional fallback if file missing)
    // GANTT_MCP_PROMPTS_DIR allows override for container deployments where paths differ
    const systemPromptPath = process.env.GANTT_MCP_PROMPTS_DIR
      ? join(process.env.GANTT_MCP_PROMPTS_DIR, 'system.md')
      : join(PROJECT_ROOT, 'packages/mcp/agent/prompts/system.md');
    const systemPrompt = existsSync(systemPromptPath)
      ? await readFile(systemPromptPath, 'utf-8')
      : 'You are a Gantt chart planning assistant. Use the available MCP tools to manage tasks.';

    // 4. Build prompt with history
    // Exclude the last message (current user turn — already included in "User: ..." below)
    const historyContext = messages
      .slice(0, -1)
      .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n');

    const fullPrompt = [
      systemPrompt,
      historyContext.length > 0 ? `\n\n## Conversation history:\n${historyContext}` : '',
      `\n\nUser: ${userMessage}`,
    ].join('');

    // 5. Validate API key
    const env = resolveEnv();
    if (!env.OPENAI_API_KEY) {
      throw new Error('API key not configured. Set OPENAI_API_KEY or ANTHROPIC_AUTH_TOKEN in .env');
    }

    // 6. Create SDK-embedded MCP server with Gantt tools
    // This runs in the same process as the SDK, ensuring proper tool discovery
    console.error('[AGENT] Creating SDK-embedded MCP server...');
    console.error('[AGENT] PROJECT_ROOT:', PROJECT_ROOT);
    console.error('[AGENT] projectId:', projectId);
    console.error('[AGENT] Number of tools:', ganttTools.length);

    const ganttMcpServer = createSdkMcpServer({
      name: 'gantt',
      version: '0.1.0',
      tools: ganttTools,
    });

    console.error('[AGENT] SDK-embedded MCP server created:', ganttMcpServer.name);

    const databaseUrl = process.env.DATABASE_URL ?? '';
    console.error('[AGENT] DATABASE_URL set:', !!databaseUrl);

    const queryOptions = {
      prompt: fullPrompt,
      options: {
        model: env.OPENAI_MODEL,
        cwd: PROJECT_ROOT,
        permissionMode: 'yolo' as const,
        debug: true,
        logLevel: 'debug' as const,
        stderr: (msg: string) => console.error('[SDK STDERR]', msg),
        env: {
          ...env,
          DATABASE_URL: databaseUrl,
        },
        mcpServers: {
          gantt: ganttMcpServer,
        },
      },
    };

    console.error('[AGENT] Starting query with options:', JSON.stringify({
      model: queryOptions.options.model,
      cwd: queryOptions.options.cwd,
      permissionMode: queryOptions.options.permissionMode,
      hasMcpServers: !!queryOptions.options.mcpServers,
      mcpServerNames: Object.keys(queryOptions.options.mcpServers || {}),
      mcpServerTypes: Object.entries(queryOptions.options.mcpServers || {}).map(([k, v]) => [k, (v as any).type || 'external']),
    }, null, 2));

    const session = query(queryOptions);

    console.error('[AGENT] Query session created, starting iteration...');

    // 7. Stream tokens to SSE (project-scoped)
    let assistantResponse = '';
    let streamedContent = false;
    let eventCount = 0;
    let agentError: string | null = null;

    console.error('[AGENT] Starting event iteration loop...');

    for await (const event of session) {
      eventCount++;
      console.error('[AGENT] Event received:', event.type, 'event #', eventCount);

      if (isSDKSystemMessage(event)) {
        console.error('[AGENT] System message:', JSON.stringify({
          type: event.type,
          subtype: (event as SDKSystemMessage).subtype,
          hasMcpServers: !!(event as SDKSystemMessage).mcp_servers,
          mcpServers: (event as SDKSystemMessage).mcp_servers,
          model: (event as SDKSystemMessage).model,
          permissionMode: (event as SDKSystemMessage).permission_mode,
        }, null, 2));
      }

      if (isSDKAssistantMessage(event)) {
        // Guard: if we have already streamed tokens from earlier iterations,
        // this is the final summary AssistantMessage — skip it to avoid duplicate broadcast.
        if (streamedContent) continue;
        // event.message.content is ContentBlock[] — extract text blocks
        for (const block of event.message.content) {
          if (block.type === 'text' && block.text) {
            assistantResponse += block.text;
            broadcastToAI(sessionId, { type: 'token', content: block.text });
            streamedContent = true;
          }
        }
      }
      if (isSDKResultMessage(event)) {
        console.error('[AGENT] Result message:', JSON.stringify({
          type: event.type,
          subtype: event.subtype,
          isError: event.is_error,
          result: event.is_error ? 'ERROR - see error field' : event.result?.substring(0, 200),
          duration_ms: event.duration_ms,
          num_turns: event.num_turns,
        }, null, 2));
        if (event.is_error && event.error) {
          console.error('[AGENT] ERROR details:', JSON.stringify(event.error, null, 2));
          agentError = JSON.stringify(event.error);
        }
        break;
      }
    }

    console.error('[AGENT] Event iteration complete. Total events:', eventCount, 'Streamed content:', streamedContent, 'Response length:', assistantResponse.length);

    // 8. Save assistant response to DB (project-scoped)
    if (assistantResponse) {
      await taskStore.addMessage('assistant', assistantResponse, projectId);
    }

    // 9. Broadcast updated tasks snapshot (project-scoped)
    const tasks = await taskStore.list(projectId, true);
    broadcastToProject(projectId, { type: 'tasks', tasks });

    // 10. Signal turn completion on the AI stream
    if (agentError) {
      broadcastToAI(sessionId, { type: 'error', message: agentError });
    } else {
      broadcastToAI(sessionId, { type: 'done' });
    }

  } finally {
    // Restore original PROJECT_ID
    if (originalProjectId !== undefined) {
      process.env.PROJECT_ID = originalProjectId;
    } else {
      delete process.env.PROJECT_ID;
    }
  }
}
