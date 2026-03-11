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
  parentId?: string;
  dependencies?: Array<{ taskId: string; type: string; lag?: number }>;
};

type MutationEvent = {
  runId?: string;
  source: string;
  mutationType: string;
  taskId?: string;
  createdAt: string;
};

type AgentAttemptResult = {
  assistantResponse: string;
  streamedContent: boolean;
};

type VerificationResult = {
  tasksAfter: ComparableTask[];
  tasksChanged: boolean;
  revisionAfter: number;
  runMutations: MutationEvent[];
  externalMutations: MutationEvent[];
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

export function isMutationIntent(message: string): boolean {
  const normalized = message.toLowerCase();
  const russianMutationMarkers = [
    '\u0434\u043e\u0431\u0430\u0432',
    '\u0432\u043d\u0435\u0441',
    '\u0441\u043e\u0437\u0434\u0430',
    '\u0438\u0437\u043c\u0435\u043d\u0438',
    '\u043e\u0431\u043d\u043e\u0432',
    '\u0443\u0434\u0430\u043b',
    '\u0443\u0431\u0435\u0440',
    '\u0440\u0430\u0437\u0431\u0435\u0439',
    '\u0440\u0430\u0437\u0434\u0435\u043b\u0438',
    '\u043f\u0435\u0440\u0435\u0438\u043c\u0435\u043d',
    '\u0431\u043b\u043e\u043a \u0440\u0430\u0431\u043e\u0442',
    '\u0440\u0430\u0431\u043e\u0442\u0443 \u0432 \u043a\u043e\u043d\u0435\u0446',
    '\u0432\u043b\u043e\u0436',
    '\u043f\u043e\u0434\u0437\u0430\u0434\u0430',
    '\u0434\u043e\u0447\u0435\u0440\u043d',
    '\u0432\u043d\u0443\u0442\u0440\u044c',
    '\u043f\u0435\u0440\u0435\u043d\u0435\u0441\u0438 \u0432',
    '\u0441\u0434\u0435\u043b\u0430\u0439 \u0438\u0435\u0440\u0430\u0440\u0445',
  ];

  if (russianMutationMarkers.some((marker) => normalized.includes(marker))) {
    return true;
  }

  return /(?:\badd\b|\bcreate\b|\bupdate\b|\bedit\b|\bdelete\b|\bremove\b|\binsert\b|\bsplit\b|\brename\b|\bnest(?:ed|ing)?\b|\bsubtask(?:s)?\b|\bchild(?:ren)?\b|\bhierarchy\b|\bindent\b|\boutdent\b|\bmove\b.+\bunder\b)/i.test(message);
}

function normalizeTask(task: ComparableTask): ComparableTask {
  return {
    id: task.id,
    name: task.name,
    startDate: task.startDate,
    endDate: task.endDate,
    parentId: task.parentId,
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
  const beforeJson = JSON.stringify(before.map(normalizeTask));
  const afterJson = JSON.stringify(after.map(normalizeTask));
  return beforeJson !== afterJson;
}

function buildNoMutationMessage(): string {
  return 'Изменение не применилось: модель ответила как будто задача изменена, но в базе не было ни одной реальной мутации.';
}

function buildStaleStateMessage(): string {
  return 'График изменился вручную во время ответа агента. Запрос нужно повторить на актуальном состоянии задач.';
}

function sanitizeAssistantResponse(userMessage: string, response: string): string {
  const trimmed = response.trim();
  const userHasCyrillic = /[\u0400-\u04FF]/.test(userMessage);
  const responseHasCyrillic = /[\u0400-\u04FF]/.test(trimmed);

  if (!userHasCyrillic || !responseHasCyrillic) {
    return trimmed;
  }

  const firstCyrillicIndex = trimmed.search(/[\u0400-\u04FF]/);
  if (firstCyrillicIndex <= 0) {
    return trimmed;
  }

  const prefix = trimmed.slice(0, firstCyrillicIndex);
  if (!/[A-Za-z]/.test(prefix)) {
    return trimmed;
  }

  return trimmed.slice(firstCyrillicIndex).trimStart();
}

function buildPrompt(
  systemPrompt: string,
  projectId: string,
  revision: number,
  mutationRequested: boolean,
  historyContext: string,
  userMessage: string,
  retryInstruction?: string,
): string {
  return [
    systemPrompt,
    `\n\n## State metadata:\n- projectId: ${projectId}\n- taskRevision: ${revision}\n- mutationRequested: ${mutationRequested}`,
    historyContext.length > 0 ? `\n\n## Conversation history:\n${historyContext}` : '',
    retryInstruction ? `\n\n## Execution correction:\n${retryInstruction}` : '',
    `\n\nUser: ${userMessage}`,
  ].join('');
}

async function executeAgentAttempt(
  prompt: string,
  runId: string,
  projectId: string,
  sessionId: string,
  attempt: number,
  mutationRequested: boolean,
  mcpServerPath: string,
  dbPath: string,
  env: ReturnType<typeof resolveEnv>,
): Promise<AgentAttemptResult> {
  const session = query({
    prompt,
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
            AI_ATTEMPT: String(attempt),
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
          attempt,
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
          attempt,
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
        attempt,
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
        attempt,
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

  return {
    assistantResponse,
    streamedContent,
  };
}

async function verifyMutationAttempt(
  runId: string,
  projectId: string,
  sessionId: string,
  attempt: number,
  runStartedAt: string,
  mutationRequested: boolean,
  tasksBefore: ComparableTask[],
  revisionBefore: number,
  assistantResponse: string,
): Promise<VerificationResult> {
  const tasksAfter = await reliableTaskStore.list(projectId, true) as ComparableTask[];
  const tasksChanged = mutationRequested ? haveTasksChanged(tasksBefore, tasksAfter) : false;
  const revisionAfter = await reliableTaskStore.getTaskRevision(projectId);
  const runMutations = await reliableTaskStore.getMutationEventsByRun(runId, projectId);
  const mutationsSinceStart = await reliableTaskStore.getMutationEventsSince(runStartedAt, projectId);
  const externalMutations = mutationsSinceStart.filter((event: MutationEvent) => event.runId !== runId);

  await writeServerDebugLog('mutation_verification', {
    runId,
    attempt,
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

  return {
    tasksAfter,
    tasksChanged,
    revisionAfter,
    runMutations,
    externalMutations,
  };
}

export async function runAgentWithHistory(
  userMessage: string,
  projectId: string,
  sessionId: string
): Promise<void> {
  try {
    const runId = crypto.randomUUID();
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

    const env = resolveEnv();
    if (!env.OPENAI_API_KEY) {
      throw new Error('API key not configured. Set OPENAI_API_KEY or ANTHROPIC_AUTH_TOKEN in .env');
    }

    const mcpServerPath = process.env.GANTT_MCP_SERVER_PATH
      ?? join(PROJECT_ROOT, 'packages/mcp/dist/index.js');
    const dbPath = process.env.DB_PATH ?? join(PROJECT_ROOT, 'gantt.db');

    let assistantResponse = '';
    let streamedContent = false;
    let tasksAfter = tasksBefore;
    let finalVerification: VerificationResult = {
      tasksAfter: tasksBefore,
      tasksChanged: false,
      revisionAfter: revisionBefore,
      runMutations: [],
      externalMutations: [],
    };

    const maxAttempts = mutationRequested ? 2 : 1;
    let retryInstruction: string | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const attemptPrompt = buildPrompt(
        systemPrompt,
        projectId,
        revisionBefore,
        mutationRequested,
        historyContext,
        userMessage,
        retryInstruction,
      );

      await writeServerDebugLog('agent_prompt_built', {
        runId,
        attempt,
        projectId,
        sessionId,
        historyCount: messages.length,
        prompt: attemptPrompt,
      });

      const attemptStartedAt = new Date().toISOString();
      const attemptResult = await executeAgentAttempt(
        attemptPrompt,
        runId,
        projectId,
        sessionId,
        attempt,
        mutationRequested,
        mcpServerPath,
        dbPath,
        env,
      );
      assistantResponse = sanitizeAssistantResponse(userMessage, attemptResult.assistantResponse);
      streamedContent = streamedContent || attemptResult.streamedContent;

      finalVerification = await verifyMutationAttempt(
        runId,
        projectId,
        sessionId,
        attempt,
        attemptStartedAt,
        mutationRequested,
        tasksBefore,
        revisionBefore,
        assistantResponse,
      );
      tasksAfter = finalVerification.tasksAfter;

      if (!mutationRequested) {
        break;
      }

      if (finalVerification.externalMutations.length > 0) {
        assistantResponse = buildStaleStateMessage();
        break;
      }

      if (finalVerification.runMutations.length > 0 && finalVerification.tasksChanged) {
        assistantResponse = sanitizeAssistantResponse(
          userMessage,
          assistantResponse.trim() || 'Изменения применены.',
        );
        break;
      }

      if (attempt >= maxAttempts) {
        assistantResponse = buildNoMutationMessage();
        break;
      }

      retryInstruction = [
        'The previous attempt did not perform any real mutation tool call.',
        'Call `get_tasks` again at the start of this retry.',
        'Then call one or more mutation tools: `create_task`, `create_tasks_batch`, `update_task`, or `delete_task`.',
        'The final user-visible answer must contain only the completed result, without analysis or narration.',
        'Do not output English text if the user wrote in Russian.',
        'A text-only success answer is invalid and will be rejected if no mutation event is recorded.',
        'If the request cannot be completed with available tools, say that explicitly and do not claim success.',
        assistantResponse.trim().length > 0 ? `Previous invalid answer: ${assistantResponse.trim()}` : '',
      ].filter(Boolean).join('\n');

      await writeServerDebugLog('mutation_retry_scheduled', {
        runId,
        attempt,
        projectId,
        sessionId,
        reason: 'no_mutation_recorded',
        previousAssistantResponse: assistantResponse,
      });
    }

    assistantResponse = sanitizeAssistantResponse(userMessage, assistantResponse);

    if (mutationRequested && assistantResponse) {
      broadcastToSession(sessionId, { type: 'token', content: assistantResponse });
      streamedContent = true;
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
      finalRevisionAfter: finalVerification.revisionAfter,
      finalRunMutationCount: finalVerification.runMutations.length,
      finalExternalMutationCount: finalVerification.externalMutations.length,
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
