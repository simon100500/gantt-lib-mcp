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

const MUTATION_HISTORY_MESSAGE_LIMIT = 6;
const READONLY_HISTORY_MESSAGE_LIMIT = 12;
const MUTATION_HISTORY_CHAR_LIMIT = 1_500;
const READONLY_HISTORY_CHAR_LIMIT = 4_000;
const MUTATION_ATTEMPT_TIMEOUT_MS = 90_000;
const READONLY_ATTEMPT_TIMEOUT_MS = 60_000;
const SIMPLE_MUTATION_MAX_SESSION_TURNS = 8;
const DEFAULT_MUTATION_MAX_SESSION_TURNS = 16;
const READONLY_MAX_SESSION_TURNS = 12;

type TaskServiceModule = typeof import('@gantt/mcp/services');
type WsModule = typeof import('./ws.js');

let servicesModulePromise: Promise<TaskServiceModule> | undefined;
let wsModulePromise: Promise<WsModule> | undefined;

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

export function isSimpleMutationRequest(message: string): boolean {
  const normalized = message.toLowerCase().trim();

  if (normalized.length > 120) {
    return false;
  }

  const compactStructuralMarkers = [
    'отдельным блоком',
    'отдельный блок',
    'новым блоком',
    'new block',
    'separate block',
  ];

  if (compactStructuralMarkers.some((marker) => normalized.includes(marker))) {
    return true;
  }

  const broadScopeMarkers = [
    'график',
    'проект',
    'wbs',
    'иерарх',
    'структур',
    'этап',
    'блок',
    'phase',
    'schedule',
    'plan',
    'fragment',
    'package',
    'dependencies',
    'dependency',
    'floor',
    'section',
    'секци',
    'этаж',
    'for all',
    'для всех',
    'массов',
  ];

  if (broadScopeMarkers.some((marker) => normalized.includes(marker))) {
    return false;
  }

  return /(?:\badd\b|\bcreate\b|\bupdate\b|\bedit\b|\bdelete\b|\bremove\b|\binsert\b|добав|созда|измени|обнов|удал|убер)/i.test(normalized);
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

function buildTimeoutRetryInstruction(): string {
  return [
    'The previous attempt timed out before completing.',
    'Call `get_tasks` once, then perform the smallest valid mutation that satisfies the user request.',
    'If the container is ambiguous after that single read, choose the closest existing phase or the top level and proceed.',
    'Do not spend extra turns on optional restructuring or validation.',
  ].join('\n');
}

export function buildHistoryContext(
  messages: Array<{ role: string; content: string }>,
  mutationRequested: boolean,
): string {
  const messageLimit = mutationRequested ? MUTATION_HISTORY_MESSAGE_LIMIT : READONLY_HISTORY_MESSAGE_LIMIT;
  const charLimit = mutationRequested ? MUTATION_HISTORY_CHAR_LIMIT : READONLY_HISTORY_CHAR_LIMIT;
  const relevantMessages = messages.slice(-messageLimit);
  const lines = relevantMessages.map((message) => `${message.role === 'user' ? 'User' : 'Assistant'}: ${message.content}`);

  if (lines.length === 0) {
    return '';
  }

  const selectedLines: string[] = [];
  let totalChars = 0;

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    const nextChars = totalChars + line.length + 1;
    if (selectedLines.length > 0 && nextChars > charLimit) {
      break;
    }
    selectedLines.unshift(line);
    totalChars = nextChars;
  }

  if (selectedLines.length < lines.length) {
    selectedLines.unshift('[Earlier conversation omitted]');
  }

  return selectedLines.join('\n');
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
  simpleMutationRequested: boolean,
  historyContext: string,
  userMessage: string,
  retryInstruction?: string,
): string {
  return [
    systemPrompt,
    `\n\n## State metadata:\n- projectId: ${projectId}\n- taskRevision: ${revision}\n- mutationRequested: ${mutationRequested}`,
    mutationRequested
      ? [
        '\n\n## Mutation execution protocol:',
        '- Start by calling `get_tasks`.',
        simpleMutationRequested
          ? '- Use compact `get_tasks` output first. Do not request full task data unless dependencies or deep hierarchy are required.'
          : '- Use compact `get_tasks` first unless you explicitly need dependencies or detailed hierarchy.',
        '- Make the smallest valid change that satisfies the request.',
        '- If the container is still ambiguous after one read, choose the closest existing phase or the top level and proceed.',
        '- If you create a new task and already know its predecessor, pass that link in `create_task.dependencies` instead of planning a later `set_dependency` call.',
        '- For sequential new tasks, dependency task IDs must come from actual tool results. Reuse the exact `createdTaskId` from the immediately previous `create_task` result.',
        '- Never guess, synthesize, or paraphrase a dependency task ID. If the predecessor ID is uncertain, do not send a speculative dependency.',
        '- Use `set_dependency` only as a fallback for links that cannot be known until after creation or for links between existing tasks.',
        simpleMutationRequested
          ? '- For a new standalone block with 2-5 child tasks, keep the reasoning path minimal: create the parent, then create the children once each, carrying forward sequential dependencies inline.'
          : '- For structured additions, prefer inline dependency creation during `create_task` whenever the predecessor is already known.',
        '- Do not spend extra turns on optional restructuring.',
      ].join('\n')
      : '',
    historyContext.length > 0 ? `\n\n## Conversation history:\n${historyContext}` : '',
    retryInstruction ? `\n\n## Execution correction:\n${retryInstruction}` : '',
    `\n\nUser: ${userMessage}`,
  ].join('');
}

async function getServicesModule(): Promise<TaskServiceModule> {
  if (!servicesModulePromise) {
    servicesModulePromise = import('@gantt/mcp/services');
  }

  return servicesModulePromise;
}

async function getWsModule(): Promise<WsModule> {
  if (!wsModulePromise) {
    wsModulePromise = import('./ws.js');
  }

  return wsModulePromise;
}

async function executeAgentAttempt(
  prompt: string,
  runId: string,
  projectId: string,
  sessionId: string,
  attempt: number,
  mutationRequested: boolean,
  simpleMutationRequested: boolean,
  mcpServerPath: string,
  dbPath: string,
  env: ReturnType<typeof resolveEnv>,
  broadcastToSession: WsModule['broadcastToSession'],
): Promise<AgentAttemptResult> {
  const abortController = new AbortController();
  const timeoutMs = mutationRequested ? MUTATION_ATTEMPT_TIMEOUT_MS : READONLY_ATTEMPT_TIMEOUT_MS;

  const session = query({
    prompt,
    options: {
      authType: 'openai',
      model: env.OPENAI_MODEL,
      cwd: PROJECT_ROOT,
      permissionMode: 'yolo',
      includePartialMessages: true,
      maxSessionTurns: mutationRequested
        ? (simpleMutationRequested ? SIMPLE_MUTATION_MAX_SESSION_TURNS : DEFAULT_MUTATION_MAX_SESSION_TURNS)
        : READONLY_MAX_SESSION_TURNS,
      abortController,  // HARD-02: Timeout protection
      excludeTools: ['write_file', 'edit_file', 'run_terminal_cmd', 'run_python_code'],  // HARD-03: MCP-only access
      env: {
        ...env,
        DB_PATH: dbPath,
      },
      mcpServers: {
        gantt: {
          command: 'node',
          args: [mcpServerPath],
          env: {
            DATABASE_URL: process.env.DATABASE_URL ?? '',
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
  let timeoutHandle: NodeJS.Timeout | undefined;

  try {
    const sessionPromise = (async () => {
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
    })();

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        abortController.abort();
        reject(new Error(`Agent attempt timed out after ${Math.floor(timeoutMs / 1000)}s.`));
      }, timeoutMs);
    });

    await Promise.race([sessionPromise, timeoutPromise]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
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
  taskService: TaskServiceModule['taskService'],
): Promise<VerificationResult> {
  const { tasks: tasksAfter } = await taskService.list(projectId);
  const tasksChanged = mutationRequested ? haveTasksChanged(tasksBefore, tasksAfter) : false;
  const revisionAfter = await taskService.getTaskRevision(projectId);
  const runMutations = await taskService.getMutationEventsByRun(runId, projectId);
  const mutationsSinceStart = await taskService.getMutationEventsSince(runStartedAt, projectId);
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
  let broadcastToSession: WsModule['broadcastToSession'] | undefined;
  try {
    const [{ taskService, messageService }, wsModule] = await Promise.all([
      getServicesModule(),
      getWsModule(),
    ]);
    broadcastToSession = wsModule.broadcastToSession;
    const runId = crypto.randomUUID();
    const mutationRequested = isMutationIntent(userMessage);
    const simpleMutationRequested = mutationRequested && isSimpleMutationRequest(userMessage);
    const { tasks: tasksBefore } = mutationRequested
      ? await taskService.list(projectId)
      : { tasks: [] };
    const revisionBefore = await taskService.getTaskRevision(projectId);

    await writeServerDebugLog('agent_run_started', {
      runId,
      projectId,
      sessionId,
      userMessage,
      mutationRequested,
      simpleMutationRequested,
      revisionBefore,
      tasksBeforeCount: tasksBefore.length,
      tasksBeforeNames: tasksBefore.map((task) => task.name),
    });

    await messageService.add('user', userMessage, projectId);
    const messages = await messageService.list(projectId, 20);

    const systemPromptPath = process.env.GANTT_MCP_PROMPTS_DIR
      ? join(process.env.GANTT_MCP_PROMPTS_DIR, 'system.md')
      : join(PROJECT_ROOT, 'packages/mcp/agent/prompts/system.md');
    const systemPrompt = existsSync(systemPromptPath)
      ? await readFile(systemPromptPath, 'utf-8')
      : 'You are a Gantt chart planning assistant. Use the available MCP tools to manage tasks.';

    const historyContext = buildHistoryContext(messages.slice(0, -1), mutationRequested);

    const env = resolveEnv();
    if (!env.OPENAI_API_KEY) {
      throw new Error('API key not configured. Set OPENAI_API_KEY or ANTHROPIC_AUTH_TOKEN in .env');
    }

    await writeServerDebugLog('agent_env_resolved', {
      runId,
      projectId,
      sessionId,
      authType: 'openai',
      baseUrl: env.OPENAI_BASE_URL,
      model: env.OPENAI_MODEL,
      projectRoot: PROJECT_ROOT,
    });

    const mcpServerPath = process.env.GANTT_MCP_SERVER_PATH
      ?? join(PROJECT_ROOT, 'packages/mcp/dist/index.js');
    const dbPath = process.env.DB_PATH ?? join(PROJECT_ROOT, 'gantt.db');

    let assistantResponse = '';
    let streamedContent = false;
    let tasksAfter: ComparableTask[] = tasksBefore;
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
        simpleMutationRequested,
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
        simpleMutationRequested,
        prompt: attemptPrompt,
      });

      const attemptStartedAt = new Date().toISOString();
      let attemptResult: AgentAttemptResult;
      try {
        attemptResult = await executeAgentAttempt(
          attemptPrompt,
          runId,
          projectId,
          sessionId,
          attempt,
          mutationRequested,
          simpleMutationRequested,
          mcpServerPath,
          dbPath,
          env,
          broadcastToSession,
        );
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        await writeServerDebugLog('agent_attempt_failed', {
          runId,
          attempt,
          projectId,
          sessionId,
          error: errorMessage,
        });

        if (mutationRequested && attempt < maxAttempts && /timed out/i.test(errorMessage)) {
          retryInstruction = buildTimeoutRetryInstruction();
          continue;
        }

        throw error;
      }
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
        taskService,
      );
      tasksAfter = finalVerification.tasksAfter as ComparableTask[];

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
        'Identify the correct parent/container before mutating.',
        'Then call one or more mutation tools: `create_task`, `create_tasks_batch`, `update_task`, `delete_task`, `set_dependency`, or `remove_dependency`.',
        'If you create sequential new tasks and already know the predecessor, include that dependency inside `create_task` instead of scheduling a separate `set_dependency` step.',
        'Reuse only real task IDs returned by tool results. Never invent a UUID for `dependencies.taskId`.',
        'If the predecessor ID is uncertain, omit the speculative dependency and use a safe fallback instead of retrying with a guessed ID.',
        'If the user requested a broad phase or discipline, create a small structured fragment instead of one generic task.',
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
      await messageService.add('assistant', assistantResponse, projectId);
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
    const wsModule = broadcastToSession ? null : await getWsModule();
    (broadcastToSession ?? wsModule?.broadcastToSession)?.(sessionId, { type: 'error', message: String(err) });
    await writeServerDebugLog('agent_run_failed', {
      projectId,
      sessionId,
      error: String(err),
    });
    throw err;
  }
}
