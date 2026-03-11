/**
 * Agent runner for the Gantt server.
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
const PROJECT_ROOT = process.env.GANTT_PROJECT_ROOT ?? join(__dirname, '../../..');

dotenv.config({ path: join(PROJECT_ROOT, '.env') });

type ComparableTask = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  dependencies?: Array<{ taskId: string; type: string; lag?: number }>;
};

type MutationEvent = {
  runId?: string;
  source: string;
  mutationType: string;
  taskId?: string;
  createdAt: string;
};

const reliableTaskStore = taskStore as typeof taskStore & {
  getTaskRevision(projectId?: string): Promise<number>;
  getMutationEventsByRun(runId: string, projectId?: string): Promise<MutationEvent[]>;
  getMutationEventsSince(since: string, projectId?: string): Promise<MutationEvent[]>;
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

function buildNoMutationMessage(): string {
  return 'Изменение не применилось: модель ответила как будто задача изменена, но в базе не было ни одной реальной мутации.';
}

function buildStaleStateMessage(): string {
  return 'График изменился вручную во время ответа агента. Запрос нужно повторить на актуальном состоянии задач.';
}

export async function runAgentWithHistory(
  userMessage: string,
  projectId: string,
  sessionId: string
): Promise<void> {
  try {
    const runId = crypto.randomUUID();
    const runStartedAt = new Date().toISOString();
    const mutationRequested = isMutationIntent(userMessage);
    const tasksBefore = mutationRequested
      ? await reliableTaskStore.list(projectId, true) as ComparableTask[]
      : [];
    const revisionBefore = await reliableTaskStore.getTaskRevision(projectId);

    await writeServerDebugLog('agent_run_started', {
      runId,
      projectId,
      sessionId,
      userMessage,
      mutationRequested,
      revisionBefore,
      tasksBeforeCount: tasksBefore.length,
      tasksBeforeNames: tasksBefore.map((task) => task.name),
    });

    await reliableTaskStore.addMessage('user', userMessage, projectId);
    const messages = await reliableTaskStore.getMessages(projectId);

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
      `\n\n## State metadata:\n- projectId: ${projectId}\n- taskRevision: ${revisionBefore}\n- mutationRequested: ${mutationRequested}`,
      historyContext.length > 0 ? `\n\n## Conversation history:\n${historyContext}` : '',
      `\n\nUser: ${userMessage}`,
    ].join('');
    await writeServerDebugLog('agent_prompt_built', {
      runId,
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
            env: {
              DB_PATH: dbPath,
              PROJECT_ID: projectId,
              AI_RUN_ID: runId,
              AI_SESSION_ID: sessionId,
              AI_MUTATION_SOURCE: 'agent',
            },
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
            runId,
            sessionId,
            projectId,
            text: event.event.delta.text,
          });
        }
        if (
          event.event.type === 'content_block_delta'
          && event.event.delta.type === 'thinking_delta'
          && event.event.delta.thinking
        ) {
          await writeServerDebugLog('sdk_thinking_delta', {
            runId,
            sessionId,
            projectId,
            thinking: event.event.delta.thinking,
          });
        }
        continue;
      }

      if (isSDKAssistantMessage(event)) {
        const text = extractAssistantText(event.message.content as Array<{ type: string; text?: string }>);
        if (!capturedPartialContent && text) {
          assistantResponse += text;
          if (!mutationRequested) {
            broadcastToSession(sessionId, { type: 'token', content: text });
            streamedContent = true;
          }
        }
        await writeServerDebugLog('sdk_assistant_message', {
          runId,
          sessionId,
          projectId,
          text,
          capturedPartialContent,
        });
      }

      if (isSDKResultMessage(event)) {
        const resultText = typeof event.result === 'string' ? event.result : '';
        if (!event.is_error && assistantResponse.trim().length === 0 && resultText.trim().length > 0) {
          assistantResponse = resultText;
          if (!mutationRequested) {
            broadcastToSession(sessionId, { type: 'token', content: resultText });
            streamedContent = true;
          }
        }
        await writeServerDebugLog('sdk_result_message', {
          runId,
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

    const tasksAfter = await reliableTaskStore.list(projectId, true) as ComparableTask[];
    const tasksChanged = mutationRequested ? haveTasksChanged(tasksBefore, tasksAfter) : false;
    const revisionAfter = await reliableTaskStore.getTaskRevision(projectId);
    const runMutations = await reliableTaskStore.getMutationEventsByRun(runId, projectId);
    const mutationsSinceStart = await reliableTaskStore.getMutationEventsSince(runStartedAt, projectId);
    const externalMutations = mutationsSinceStart.filter((event: MutationEvent) => event.runId !== runId);

    await writeServerDebugLog('mutation_verification', {
      runId,
      projectId,
      sessionId,
      mutationRequested,
      revisionBefore,
      revisionAfter,
      tasksChanged,
      runMutationCount: runMutations.length,
      runMutations,
      externalMutationCount: externalMutations.length,
      externalMutations,
      tasksAfterCount: tasksAfter.length,
      tasksAfterNames: tasksAfter.map((task) => task.name),
      assistantResponse,
    });

    if (mutationRequested) {
      if (externalMutations.length > 0) {
        assistantResponse = buildStaleStateMessage();
      } else if (runMutations.length === 0 || !tasksChanged) {
        assistantResponse = buildNoMutationMessage();
      } else {
        assistantResponse = assistantResponse.trim() || 'Изменения применены.';
      }

      if (assistantResponse) {
        broadcastToSession(sessionId, { type: 'token', content: assistantResponse });
        streamedContent = true;
      }
    }

    if (assistantResponse) {
      await reliableTaskStore.addMessage('assistant', assistantResponse, projectId);
    }
    await writeServerDebugLog('agent_response_saved', {
      runId,
      projectId,
      sessionId,
      assistantResponse,
      streamedContent,
    });

    broadcastToSession(sessionId, { type: 'tasks', tasks: tasksAfter });
    await writeServerDebugLog('tasks_broadcast', {
      runId,
      projectId,
      sessionId,
      taskCount: tasksAfter.length,
      taskIds: tasksAfter.map((task) => task.id),
      taskNames: tasksAfter.map((task) => task.name),
    });

    broadcastToSession(sessionId, { type: 'done' });
    await writeServerDebugLog('agent_run_completed', {
      runId,
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
