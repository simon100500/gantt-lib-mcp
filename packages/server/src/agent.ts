/**
 * Agent runner for the Gantt server.
 *
 * runAgentWithHistory():
 * 1. Saves the user message to DB (messages table)
 * 2. Loads full conversation history from DB
 * 3. Builds prompt = system prompt + history context + current user message
 * 4. Runs @qwen-code/sdk query() with the MCP server as a child process
 * 5. Streams assistant text tokens to WebSocket via broadcast({ type: 'token' })
 * 6. Saves assistant response to DB
 * 7. Broadcasts updated task snapshot via broadcast({ type: 'tasks' })
 * 8. Broadcasts { type: 'done' } to signal turn complete
 *
 * The MCP child process shares the same DB_PATH as the server, so task
 * mutations performed by the AI are immediately visible via taskStore.list().
 */

import { query, isSDKResultMessage, isSDKAssistantMessage } from '@qwen-code/sdk';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import * as dotenv from 'dotenv';
import { taskStore } from '@gantt/mcp/store';
import { broadcastToSession } from './ws.js';

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
 * - streams tokens via WebSocket broadcast to specific session
 * - broadcasts task snapshot after each turn (session-scoped)
 *
 * @param userMessage - User's chat message
 * @param projectId - Project ID for scoping data
 * @param sessionId - Session ID for targeting WebSocket broadcasts
 */
export async function runAgentWithHistory(
  userMessage: string,
  projectId: string,
  sessionId: string
): Promise<void> {
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

    // GANTT_MCP_SERVER_PATH allows override for container deployments
    const mcpServerPath = process.env.GANTT_MCP_SERVER_PATH
      ?? join(PROJECT_ROOT, 'packages/mcp/dist/index.js');
    const dbPath = process.env.DB_PATH ?? join(PROJECT_ROOT, 'gantt.db');

    // 6. Run agent session
    const session = query({
      prompt: fullPrompt,
      options: {
        model: env.OPENAI_MODEL,
        cwd: PROJECT_ROOT,
        permissionMode: 'yolo',
        env: {
          ...env,
          DB_PATH: dbPath,
        },
        mcpServers: {
          gantt: {
            command: 'node',
            args: [mcpServerPath],
            env: { DB_PATH: dbPath, PROJECT_ID: projectId },
          },
        },
      },
    });

    // 7. Stream tokens to WebSocket (session-scoped)
    let assistantResponse = '';
    let streamedContent = false;

    for await (const event of session) {
      if (isSDKAssistantMessage(event)) {
        // Guard: if we have already streamed tokens from earlier iterations,
        // this is the final summary AssistantMessage — skip it to avoid duplicate broadcast.
        if (streamedContent) continue;
        // event.message.content is ContentBlock[] — extract text blocks
        for (const block of event.message.content) {
          if (block.type === 'text' && block.text) {
            assistantResponse += block.text;
            broadcastToSession(sessionId, { type: 'token', content: block.text });
            streamedContent = true;
          }
        }
      }
      if (isSDKResultMessage(event)) {
        break;
      }
    }

    // 8. Save assistant response to DB (project-scoped)
    if (assistantResponse) {
      await taskStore.addMessage('assistant', assistantResponse, projectId);
    }

    // 9. Broadcast updated tasks snapshot (session-scoped)
    const tasks = await taskStore.list(projectId, true);
    broadcastToSession(sessionId, { type: 'tasks', tasks });

    // 10. Signal turn complete (session-scoped)
    broadcastToSession(sessionId, { type: 'done' });

  } catch (err) {
    broadcastToSession(sessionId, { type: 'error', message: String(err) });
    throw err;
  }
}
