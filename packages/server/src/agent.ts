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

import {
  query,
  isSDKResultMessage,
  isSDKAssistantMessage,
  isSDKPartialAssistantMessage,
} from '@qwen-code/sdk';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import * as dotenv from 'dotenv';
import { taskStore } from '@gantt/mcp/store';
import { broadcastToSession } from './ws.js';
import { writeServerDebugLog } from './debug-log.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// In container: GANTT_PROJECT_ROOT=/app is set by docker-entrypoint.sh
// In dev: resolve from dist/agent.js -> packages/server/dist -> packages/server -> project root
const PROJECT_ROOT = process.env.GANTT_PROJECT_ROOT ?? join(__dirname, '../../..');

dotenv.config({ path: join(PROJECT_ROOT, '.env') });

type ComparableTask = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  dependencies?: Array<{ taskId: string; type: string; lag?: number }>;
};

function resolveEnv(): { OPENAI_API_KEY: string; OPENAI_BASE_URL: string; OPENAI_MODEL: string } {
  return {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? process.env.ANTHROPIC_AUTH_TOKEN ?? '',
    OPENAI_BASE_URL: process.env.OPENAI_BASE_URL ?? 'https://api.z.ai/api/paas/v4/',
    OPENAI_MODEL: process.env.OPENAI_MODEL ?? process.env.ANTHROPIC_DEFAULT_SONNET_MODEL ?? 'glm-4.7',
  };
}

function extractAssistantText(content: Array<{ type: string; text?: string }>): string {
  return content
    .filter((block) => block.type === 'text' && typeof block.text === 'string' && block.text.length > 0)
    .map((block) => block.text ?? '')
    .join('');
}

function isMutationIntent(message: string): boolean {
  return /(?:\badd\b|\bcreate\b|\bupdate\b|\bedit\b|\bdelete\b|\bremove\b|\binsert\b|\bsplit\b|\brename\b|добав|внес|созда|измени|обнов|удал|убер|разбей|раздели|переимен)/i.test(message);
}

function normalizeTask(task: ComparableTask): ComparableTask {
  return {
    id: task.id,
    name: task.name,
    startDate: task.startDate,
    endDate: task.endDate,
    dependencies: (task.dependencies ?? [])
      .map((dependency) => ({
        taskId: dependency.taskId,
        type: dependency.type,
        lag: dependency.lag ?? 0,
      }))
      .sort((left, right) =>
        `${left.taskId}:${left.type}:${left.lag}`.localeCompare(`${right.taskId}:${right.type}:${right.lag}`),
      ),
  };
}

function haveTasksChanged(before: ComparableTask[], after: ComparableTask[]): boolean {
  const beforeJson = JSON.stringify(before.map(normalizeTask).sort((left, right) => left.id.localeCompare(right.id)));
  const afterJson = JSON.stringify(after.map(normalizeTask).sort((left, right) => left.id.localeCompare(right.id)));
  return beforeJson !== afterJson;
}

function buildMutationFailureMessage(): string {
  return 'Изменение не применилось: агент ответил как будто задача изменена, но набор задач в базе не изменился.';
}

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
    const mutationRequested = isMutationIntent(userMessage);
    const tasksBefore = mutationRequested
      ? await taskStore.list(projectId, true) as ComparableTask[]
      : [];

    console.log(`[agent-run] start project=${projectId} session=${sessionId} userMessageLength=${userMessage.length}`);
    await writeServerDebugLog('agent_run_started', {
      projectId,
      sessionId,
      userMessage,
      mutationRequested,
      tasksBeforeCount: tasksBefore.length,
      tasksBeforeNames: tasksBefore.map((task) => task.name),
    });

    await taskStore.addMessage('user', userMessage, projectId);
    const messages = await taskStore.getMessages(projectId);

    const systemPromptPath = process.env.GANTT_MCP_PROMPTS_DIR
      ? join(process.env.GANTT_MCP_PROMPTS_DIR, 'system.md')
      : join(PROJECT_ROOT, 'packages/mcp/agent/prompts/system.md');
    const systemPrompt = existsSync(systemPromptPath)
      ? await readFile(systemPromptPath, 'utf-8')
      : 'You are a Gantt chart planning assistant. Use the available MCP tools to manage tasks.';

    const historyContext = messages
      .slice(0, -1)
      .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n');

    const fullPrompt = [
      systemPrompt,
      historyContext.length > 0 ? `\n\n## Conversation history:\n${historyContext}` : '',
      `\n\nUser: ${userMessage}`,
    ].join('');
    await writeServerDebugLog('agent_prompt_built', {
      projectId,
      sessionId,
      historyCount: messages.length,
      prompt: fullPrompt,
    });

    const env = resolveEnv();
    if (!env.OPENAI_API_KEY) {
      throw new Error('API key not configured. Set OPENAI_API_KEY or ANTHROPIC_AUTH_TOKEN in .env');
    }

    const mcpServerPath = process.env.GANTT_MCP_SERVER_PATH
      ?? join(PROJECT_ROOT, 'packages/mcp/dist/index.js');
    const dbPath = process.env.DB_PATH ?? join(PROJECT_ROOT, 'gantt.db');

    const session = query({
      prompt: fullPrompt,
      options: {
        model: env.OPENAI_MODEL,
        cwd: PROJECT_ROOT,
        permissionMode: 'yolo',
        includePartialMessages: true,
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

    let assistantResponse = '';
    let streamedContent = false;
    let capturedPartialContent = false;

    for await (const event of session) {
      if (isSDKPartialAssistantMessage(event)) {
        if (
          event.event.type === 'content_block_delta'
          && event.event.delta.type === 'text_delta'
          && event.event.delta.text
        ) {
          assistantResponse += event.event.delta.text;
          capturedPartialContent = true;
          if (!mutationRequested) {
            broadcastToSession(sessionId, { type: 'token', content: event.event.delta.text });
            streamedContent = true;
          }
          await writeServerDebugLog('sdk_text_delta', {
            sessionId,
            projectId,
            text: event.event.delta.text,
            mutationRequested,
          });
        }
        if (
          event.event.type === 'content_block_delta'
          && event.event.delta.type === 'thinking_delta'
          && event.event.delta.thinking
        ) {
          await writeServerDebugLog('sdk_thinking_delta', {
            sessionId,
            projectId,
            thinking: event.event.delta.thinking,
          });
        }
        continue;
      }

      if (isSDKAssistantMessage(event)) {
        const text = extractAssistantText(event.message.content as Array<{ type: string; text?: string }>);
        console.log(
          `[agent-run] assistant-message session=${sessionId} textLength=${text.length} partial=${capturedPartialContent}`,
        );

        if (!capturedPartialContent && text) {
          assistantResponse += text;
          if (!mutationRequested) {
            broadcastToSession(sessionId, { type: 'token', content: text });
            streamedContent = true;
          }
        }
        await writeServerDebugLog('sdk_assistant_message', {
          sessionId,
          projectId,
          text,
          capturedPartialContent,
          mutationRequested,
        });
      }

      if (isSDKResultMessage(event)) {
        const resultText = typeof event.result === 'string' ? event.result : '';
        console.log(
          `[agent-run] result-message session=${sessionId} subtype=${event.subtype} isError=${event.is_error} resultLength=${resultText.length}`,
        );
        if (!event.is_error && assistantResponse.trim().length === 0 && resultText.trim().length > 0) {
          assistantResponse = resultText;
          if (!mutationRequested) {
            broadcastToSession(sessionId, { type: 'token', content: resultText });
            streamedContent = true;
          }
        }
        await writeServerDebugLog('sdk_result_message', {
          sessionId,
          projectId,
          subtype: event.subtype,
          isError: event.is_error,
          result: resultText,
          error: event.is_error ? event.error : undefined,
          turns: event.num_turns,
        });
        break;
      }
    }

    const tasksAfter = await taskStore.list(projectId, true) as ComparableTask[];
    const tasksChanged = mutationRequested ? haveTasksChanged(tasksBefore, tasksAfter) : false;
    await writeServerDebugLog('mutation_verification', {
      projectId,
      sessionId,
      mutationRequested,
      tasksChanged,
      tasksBeforeCount: tasksBefore.length,
      tasksAfterCount: tasksAfter.length,
      tasksAfterNames: tasksAfter.map((task) => task.name),
      assistantResponse,
    });

    if (mutationRequested) {
      assistantResponse = tasksChanged
        ? (assistantResponse.trim() || 'Изменения применены.')
        : buildMutationFailureMessage();

      if (assistantResponse) {
        broadcastToSession(sessionId, { type: 'token', content: assistantResponse });
        streamedContent = true;
      }
    }

    if (assistantResponse) {
      await taskStore.addMessage('assistant', assistantResponse, projectId);
    }
    console.log(
      `[agent-run] complete session=${sessionId} assistantResponseLength=${assistantResponse.length} streamed=${streamedContent} tasksChanged=${tasksChanged}`,
    );
    await writeServerDebugLog('agent_response_saved', {
      projectId,
      sessionId,
      assistantResponse,
      streamedContent,
      tasksChanged,
    });

    broadcastToSession(sessionId, { type: 'tasks', tasks: tasksAfter });
    await writeServerDebugLog('tasks_broadcast', {
      projectId,
      sessionId,
      taskCount: tasksAfter.length,
      taskIds: tasksAfter.map((task) => task.id),
      taskNames: tasksAfter.map((task) => task.name),
    });

    broadcastToSession(sessionId, { type: 'done' });
    await writeServerDebugLog('agent_run_completed', {
      projectId,
      sessionId,
    });
  } catch (err) {
    broadcastToSession(sessionId, { type: 'error', message: String(err) });
    await writeServerDebugLog('agent_run_failed', {
      projectId,
      sessionId,
      error: String(err),
    });
    throw err;
  }
}
