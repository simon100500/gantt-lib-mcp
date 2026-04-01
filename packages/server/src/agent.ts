/**
 * Agent runner for the Gantt server.
 */

import {
  query,
  isSDKResultMessage,
  isSDKAssistantMessage,
  isSDKPartialAssistantMessage,
  type ContentBlock,
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

type AgentAttemptResult = {
  assistantResponse: string;
  streamedContent: boolean;
  mutationToolCalls: MutationToolCall[];
};

type VerificationResult = {
  tasksAfter: ComparableTask[];
  tasksChanged: boolean;
  actualChangedTaskIds: string[];
  mutationAttempted: boolean;
  acceptedMutationCalls: MutationToolCall[];
  rejectedMutationCalls: MutationToolCall[];
  acceptedChangedTaskIds: string[];
  acceptedChangedTaskIdMismatch: boolean;
};

type NormalizedMutationToolName =
  | 'create_tasks'
  | 'update_tasks'
  | 'move_tasks'
  | 'delete_tasks'
  | 'link_tasks'
  | 'unlink_tasks'
  | 'shift_tasks'
  | 'recalculate_project';

type MutationToolCall = {
  toolUseId: string;
  toolName: NormalizedMutationToolName;
  status?: 'accepted' | 'rejected';
  reason?: string;
  changedTaskIds?: string[];
};

export type MutationOutcomeAssessment = {
  mutationAttempted: boolean;
  acceptedMutationCalls: MutationToolCall[];
  rejectedMutationCalls: MutationToolCall[];
  acceptedChangedTaskIds: string[];
  acceptedChangedTaskIdMismatch: boolean;
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
const NORMALIZED_MUTATION_TOOL_NAMES = new Set<NormalizedMutationToolName>([
  'create_tasks',
  'update_tasks',
  'move_tasks',
  'delete_tasks',
  'link_tasks',
  'unlink_tasks',
  'shift_tasks',
  'recalculate_project',
]);

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

function getChangedTaskIds(before: ComparableTask[], after: ComparableTask[]): string[] {
  const beforeMap = new Map(before.map((task) => [task.id, JSON.stringify(normalizeTask(task))]));
  const afterMap = new Map(after.map((task) => [task.id, JSON.stringify(normalizeTask(task))]));
  const ids = new Set<string>([...beforeMap.keys(), ...afterMap.keys()]);

  return Array.from(ids).filter((id) => beforeMap.get(id) !== afterMap.get(id)).sort();
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

export function assessMutationOutcome(
  mutationToolCalls: MutationToolCall[],
  actualChangedTaskIds: string[],
): MutationOutcomeAssessment {
  const acceptedMutationCalls = mutationToolCalls.filter((call) => call.status === 'accepted');
  const rejectedMutationCalls = mutationToolCalls.filter((call) => call.status === 'rejected');
  const acceptedChangedTaskIds = uniqueSorted(
    acceptedMutationCalls.flatMap((call) => call.changedTaskIds ?? []),
  );
  const actualChangedSorted = uniqueSorted(actualChangedTaskIds);
  const acceptedChangedTaskIdMismatch = acceptedMutationCalls.length > 0 && (
    acceptedChangedTaskIds.length === 0
    || acceptedChangedTaskIds.length !== actualChangedSorted.length
    || acceptedChangedTaskIds.some((taskId, index) => taskId !== actualChangedSorted[index])
  );

  return {
    mutationAttempted: mutationToolCalls.length > 0,
    acceptedMutationCalls,
    rejectedMutationCalls,
    acceptedChangedTaskIds,
    acceptedChangedTaskIdMismatch,
  };
}

function buildNoMutationMessage(): string {
  return 'Изменение не применилось: модель не выполнила ни одного валидного mutation tool call, поэтому проект не изменился.';
}

function buildRejectedMutationMessage(rejectedCalls: MutationToolCall[]): string {
  const first = rejectedCalls[0];
  const reason = first?.reason ? ` (${first.reason})` : '';
  return `Изменение не применилось: mutation tool вернул отклонение${reason}.`;
}

function buildInconsistentMutationMessage(): string {
  return 'Изменение не подтверждено: mutation tool был принят, но итоговый изменённый набор задач не подтвердился в проекте.';
}

function buildTimeoutRetryInstruction(): string {
  return [
    'The previous attempt timed out before completing.',
    'Start with the smallest targeted read: `get_project_summary`, `get_task_context`, or `get_schedule_slice`.',
    'Then perform the smallest valid normalized mutation that satisfies the user request.',
    'If the container is still ambiguous after one targeted read, choose the closest existing phase or the top level and proceed.',
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
  mutationRequested: boolean,
  simpleMutationRequested: boolean,
  historyContext: string,
  userMessage: string,
  retryInstruction?: string,
): string {
  return [
    systemPrompt,
    `\n\n## State metadata:\n- projectId: ${projectId}\n- mutationRequested: ${mutationRequested}`,
    mutationRequested
      ? [
        '\n\n## Mutation execution protocol:',
        '- Start with the smallest targeted read: `get_project_summary`, `get_task_context`, or `get_schedule_slice`.',
        simpleMutationRequested
          ? '- Prefer one compact targeted read. Do not expand to broader context unless the first read is insufficient.'
          : '- Use targeted context first and avoid broad reads unless dependencies or hierarchy really require them.',
        '- Make the smallest valid change that satisfies the request.',
        '- If the container is still ambiguous after one targeted read, choose the closest existing phase or the top level and proceed.',
        '- Use only normalized mutation tools: `create_tasks`, `update_tasks`, `move_tasks`, `delete_tasks`, `link_tasks`, `unlink_tasks`, `shift_tasks`, `recalculate_project`.',
        '- Use `update_tasks` only for metadata and non-scheduling field edits.',
        '- Use `move_tasks` for hierarchy and structural placement.',
        '- Use `link_tasks` / `unlink_tasks` for dependency changes.',
        '- Use `shift_tasks` for relative date changes instead of computing absolute dates manually.',
        '- Never guess, synthesize, or paraphrase task IDs.',
        simpleMutationRequested
          ? '- For a small standalone block, keep the reasoning path minimal and create only the smallest coherent fragment.'
          : '- For structured additions, prefer a small coherent fragment over one vague generic task.',
        '- Do not spend extra turns on optional restructuring.',
        '- Treat the mutation tool result as authoritative. If the tool rejects the request, say so.',
      ].join('\n')
      : '',
    historyContext.length > 0 ? `\n\n## Conversation history:\n${historyContext}` : '',
    retryInstruction ? `\n\n## Execution correction:\n${retryInstruction}` : '',
    `\n\nUser: ${userMessage}`,
  ].join('');
}

function tryParseToolResultPayload(content?: string | ContentBlock[]): unknown {
  if (typeof content === 'string') {
    try {
      return JSON.parse(content);
    } catch {
      return undefined;
    }
  }

  if (Array.isArray(content)) {
    const text = content
      .filter((block): block is Extract<ContentBlock, { type: 'text' }> => block.type === 'text')
      .map((block) => block.text)
      .join('');
    if (!text) {
      return undefined;
    }
    try {
      return JSON.parse(text);
    } catch {
      return undefined;
    }
  }

  return undefined;
}

function collectMutationToolCalls(blocks: ContentBlock[]): MutationToolCall[] {
  const toolUseById = new Map<string, MutationToolCall>();

  for (const block of blocks) {
    if (block.type === 'tool_use' && NORMALIZED_MUTATION_TOOL_NAMES.has(block.name as NormalizedMutationToolName)) {
      toolUseById.set(block.id, {
        toolUseId: block.id,
        toolName: block.name as NormalizedMutationToolName,
      });
    }
  }

  for (const block of blocks) {
    if (block.type !== 'tool_result') {
      continue;
    }

    const toolCall = toolUseById.get(block.tool_use_id);
    if (!toolCall) {
      continue;
    }

    const payload = tryParseToolResultPayload(block.content) as
      | { status?: 'accepted' | 'rejected'; reason?: string; changedTaskIds?: string[] }
      | undefined;

    if (payload?.status) {
      toolCall.status = payload.status;
      toolCall.reason = payload.reason;
      toolCall.changedTaskIds = Array.isArray(payload.changedTaskIds) ? payload.changedTaskIds : [];
    } else if (block.is_error) {
      toolCall.status = 'rejected';
      toolCall.reason = 'tool_error';
    }
  }

  return [...toolUseById.values()];
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
  const mutationToolCalls = new Map<string, MutationToolCall>();

  try {
    const sessionPromise = (async () => {
      for await (const event of session) {
        if (isSDKPartialAssistantMessage(event)) {
          if (
            event.event.type === 'content_block_start'
            && event.event.content_block.type === 'tool_use'
            && NORMALIZED_MUTATION_TOOL_NAMES.has(event.event.content_block.name as NormalizedMutationToolName)
          ) {
            mutationToolCalls.set(event.event.content_block.id, {
              toolUseId: event.event.content_block.id,
              toolName: event.event.content_block.name as NormalizedMutationToolName,
            });
          }

          if (
            event.event.type === 'content_block_start'
            && event.event.content_block.type === 'tool_result'
          ) {
            const existing = mutationToolCalls.get(event.event.content_block.tool_use_id);
            if (existing) {
              const payload = tryParseToolResultPayload(event.event.content_block.content) as
                | { status?: 'accepted' | 'rejected'; reason?: string; changedTaskIds?: string[] }
                | undefined;
              if (payload?.status) {
                existing.status = payload.status;
                existing.reason = payload.reason;
                existing.changedTaskIds = Array.isArray(payload.changedTaskIds) ? payload.changedTaskIds : [];
              } else if (event.event.content_block.is_error) {
                existing.status = 'rejected';
                existing.reason = 'tool_error';
              }
            }
          }

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
          for (const toolCall of collectMutationToolCalls(event.message.content)) {
            const existing = mutationToolCalls.get(toolCall.toolUseId);
            mutationToolCalls.set(toolCall.toolUseId, {
              ...existing,
              ...toolCall,
            });
          }

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
    mutationToolCalls: [...mutationToolCalls.values()],
  };
}

async function verifyMutationAttempt(
  runId: string,
  projectId: string,
  sessionId: string,
  attempt: number,
  mutationRequested: boolean,
  tasksBefore: ComparableTask[],
  assistantResponse: string,
  mutationToolCalls: MutationToolCall[],
  taskService: TaskServiceModule['taskService'],
): Promise<VerificationResult> {
  const { tasks: tasksAfter } = await taskService.list(projectId);
  const tasksChanged = mutationRequested ? haveTasksChanged(tasksBefore, tasksAfter) : false;
  const actualChangedTaskIds = mutationRequested ? getChangedTaskIds(tasksBefore, tasksAfter) : [];
  const mutationOutcome = assessMutationOutcome(mutationToolCalls, actualChangedTaskIds);

  await writeServerDebugLog('mutation_verification', {
    runId,
    attempt,
    projectId,
    sessionId,
    mutationRequested,
    mutationAttempted: mutationOutcome.mutationAttempted,
    mutationToolCalls,
    acceptedMutationCalls: mutationOutcome.acceptedMutationCalls,
    rejectedMutationCalls: mutationOutcome.rejectedMutationCalls,
    acceptedChangedTaskIds: mutationOutcome.acceptedChangedTaskIds,
    acceptedChangedTaskIdMismatch: mutationOutcome.acceptedChangedTaskIdMismatch,
    tasksChanged,
    actualChangedTaskIds,
    tasksAfterCount: tasksAfter.length,
    tasksAfterNames: tasksAfter.map((task) => task.name),
    assistantResponse,
  });

  return {
    tasksAfter,
    tasksChanged,
    actualChangedTaskIds,
    mutationAttempted: mutationOutcome.mutationAttempted,
    acceptedMutationCalls: mutationOutcome.acceptedMutationCalls,
    rejectedMutationCalls: mutationOutcome.rejectedMutationCalls,
    acceptedChangedTaskIds: mutationOutcome.acceptedChangedTaskIds,
    acceptedChangedTaskIdMismatch: mutationOutcome.acceptedChangedTaskIdMismatch,
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

    await writeServerDebugLog('agent_run_started', {
      runId,
      projectId,
      sessionId,
      userMessage,
      mutationRequested,
      simpleMutationRequested,
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
      actualChangedTaskIds: [],
      mutationAttempted: false,
      acceptedMutationCalls: [],
      rejectedMutationCalls: [],
      acceptedChangedTaskIds: [],
      acceptedChangedTaskIdMismatch: false,
    };

    const maxAttempts = mutationRequested ? 2 : 1;
    let retryInstruction: string | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const attemptPrompt = buildPrompt(
        systemPrompt,
        projectId,
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
        mutationRequested,
        tasksBefore,
        assistantResponse,
        attemptResult.mutationToolCalls,
        taskService,
      );
      tasksAfter = finalVerification.tasksAfter as ComparableTask[];

      if (!mutationRequested) {
        break;
      }

      if (finalVerification.rejectedMutationCalls.length > 0) {
        assistantResponse = buildRejectedMutationMessage(finalVerification.rejectedMutationCalls);
        break;
      }

      if (finalVerification.tasksChanged && finalVerification.acceptedMutationCalls.length > 0) {
        if (finalVerification.acceptedChangedTaskIdMismatch) {
          assistantResponse = buildInconsistentMutationMessage();
          break;
        }
        assistantResponse = sanitizeAssistantResponse(
          userMessage,
          assistantResponse.trim() || 'Изменения применены.',
        );
        break;
      }

      if (finalVerification.acceptedMutationCalls.length > 0 && (!finalVerification.tasksChanged || finalVerification.acceptedChangedTaskIdMismatch)) {
        assistantResponse = buildInconsistentMutationMessage();
        break;
      }

      if (attempt >= maxAttempts) {
        assistantResponse = buildNoMutationMessage();
        break;
      }

      retryInstruction = [
        'The previous attempt did not perform a successful normalized mutation tool call.',
        'Start this retry with the smallest targeted read: `get_project_summary`, `get_task_context`, or `get_schedule_slice`.',
        'Identify the correct parent/container before mutating.',
        'Then call one or more normalized mutation tools: `create_tasks`, `update_tasks`, `move_tasks`, `delete_tasks`, `link_tasks`, `unlink_tasks`, `shift_tasks`, or `recalculate_project`.',
        'Use `move_tasks` for structural placement, `link_tasks` / `unlink_tasks` for dependency edits, and `shift_tasks` for relative date changes.',
        'Reuse only real task IDs returned by tool results or reads. Never invent an ID.',
        'Treat `changedTaskIds` and `changedTasks` as the authoritative success footprint.',
        'If the user requested a broad phase or discipline, create a small structured fragment instead of one generic task.',
        'The final user-visible answer must contain only the completed result, without analysis or narration.',
        'Do not output English text if the user wrote in Russian.',
        'A text-only success answer is invalid if no accepted mutation tool changed the project.',
        'If the request cannot be completed with available tools, say that explicitly and do not claim success.',
        assistantResponse.trim().length > 0 ? `Previous invalid answer: ${assistantResponse.trim()}` : '',
      ].filter(Boolean).join('\n');

      await writeServerDebugLog('mutation_retry_scheduled', {
        runId,
        attempt,
        projectId,
        sessionId,
        reason: 'no_snapshot_change_detected',
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
      finalTasksChanged: finalVerification.tasksChanged,
      finalChangedTaskIds: finalVerification.actualChangedTaskIds,
      finalAcceptedChangedTaskIds: finalVerification.acceptedChangedTaskIds,
      finalAcceptedChangedTaskIdMismatch: finalVerification.acceptedChangedTaskIdMismatch,
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
