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
import type { CommitProjectCommandResponse } from '@gantt/mcp/types';
import { runInitialGeneration } from './initial-generation/orchestrator.js';
import { resolveModelRoutingDecision } from './initial-generation/model-routing.js';
import { selectAgentRoute } from './initial-generation/route-selection.js';
import { runStagedMutation } from './mutation/orchestrator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = process.env.GANTT_PROJECT_ROOT ?? join(__dirname, '../../..');
const MCP_DEBUG_LOG_PATH = join(PROJECT_ROOT, '.planning/debug/mcp-agent.log');

dotenv.config({ path: join(PROJECT_ROOT, '.env') });

type ComparableTask = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  type?: 'task' | 'milestone';
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

type InitialGenerationPlannerQueryInput = {
  prompt: string;
  model: string;
  stage: 'structure_planning' | 'structure_planning_repair' | 'schedule_metadata' | 'schedule_metadata_repair';
};

type InitialGenerationRouteDecisionQueryInput = {
  prompt: string;
  model: string;
  stage: 'initial_request_interpretation' | 'initial_request_interpretation_repair';
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
type PrismaModule = typeof import('@gantt/mcp/prisma');

let servicesModulePromise: Promise<TaskServiceModule> | undefined;
let wsModulePromise: Promise<WsModule> | undefined;
let prismaModulePromise: Promise<PrismaModule> | undefined;

function resolveEnv(): {
  OPENAI_API_KEY: string;
  OPENAI_BASE_URL: string;
  OPENAI_MODEL: string;
  OPENAI_CHEAP_MODEL?: string;
} {
  return {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? process.env.ANTHROPIC_AUTH_TOKEN ?? '',
    OPENAI_BASE_URL: process.env.OPENAI_BASE_URL ?? 'https://api.z.ai/api/paas/v4/',
    OPENAI_MODEL: process.env.OPENAI_MODEL ?? process.env.ANTHROPIC_DEFAULT_SONNET_MODEL ?? 'glm-4.7',
    OPENAI_CHEAP_MODEL: process.env.OPENAI_CHEAP_MODEL ?? process.env.cheap_model ?? undefined,
  };
}

function buildSdkEnv(
  env: ReturnType<typeof resolveEnv>,
  extraEnv: Record<string, string> = {},
): Record<string, string> {
  const sdkEnv: Record<string, string> = {
    OPENAI_API_KEY: env.OPENAI_API_KEY,
    OPENAI_BASE_URL: env.OPENAI_BASE_URL,
    OPENAI_MODEL: env.OPENAI_MODEL,
    ...extraEnv,
  };

  if (env.OPENAI_CHEAP_MODEL) {
    sdkEnv.OPENAI_CHEAP_MODEL = env.OPENAI_CHEAP_MODEL;
  }

  return sdkEnv;
}

function extractAssistantText(content: Array<{ type: string; text?: string }>): string {
  return content
    .filter((block) => block.type === 'text' && typeof block.text === 'string' && block.text.length > 0)
    .map((block) => block.text ?? '')
    .join('');
}

async function executeInitialGenerationPlannerQuery(
  input: InitialGenerationPlannerQueryInput,
): Promise<{ content: string }> {
  const env = resolveEnv();
  if (!env.OPENAI_API_KEY) {
    throw new Error('API key not configured. Set OPENAI_API_KEY or ANTHROPIC_AUTH_TOKEN in .env');
  }

  const session = query({
    prompt: input.prompt,
    options: {
      authType: 'openai',
      model: input.model,
      cwd: PROJECT_ROOT,
      permissionMode: 'yolo',
      env: buildSdkEnv(env),
      maxSessionTurns: input.stage === 'structure_planning_repair' || input.stage === 'schedule_metadata_repair' ? 4 : 3,
    },
  });

  let content = '';

  for await (const event of session) {
    if (isSDKAssistantMessage(event)) {
      const text = extractAssistantText(event.message.content as Array<{ type: string; text?: string }>);
      if (text.trim().length > 0) {
        content = text;
      }
    }

    if (isSDKResultMessage(event)) {
      if (event.is_error) {
        throw new Error(typeof event.error === 'string' ? event.error : 'Initial generation planner failed');
      }

      if (typeof event.result === 'string' && event.result.trim().length > 0) {
        content = event.result;
      }
      break;
    }
  }

  if (content.trim().length === 0) {
    throw new Error('Initial generation planner returned an empty response');
  }

  return { content };
}

async function executeInitialGenerationRouteDecisionQuery(
  input: InitialGenerationRouteDecisionQueryInput,
): Promise<{ content: string }> {
  const env = resolveEnv();
  if (!env.OPENAI_API_KEY) {
    throw new Error('API key not configured. Set OPENAI_API_KEY or ANTHROPIC_AUTH_TOKEN in .env');
  }

  const session = query({
    prompt: input.prompt,
    options: {
      authType: 'openai',
      model: input.model,
      cwd: PROJECT_ROOT,
      permissionMode: 'yolo',
      env: buildSdkEnv(env),
      maxSessionTurns: input.stage === 'initial_request_interpretation_repair' ? 3 : 2,
    },
  });

  let content = '';

  for await (const event of session) {
    if (isSDKAssistantMessage(event)) {
      const text = extractAssistantText(event.message.content as Array<{ type: string; text?: string }>);
      if (text.trim().length > 0) {
        content = text;
      }
    }

    if (isSDKResultMessage(event)) {
      if (event.is_error) {
        throw new Error(typeof event.error === 'string' ? event.error : 'Initial route decision failed');
      }

      if (typeof event.result === 'string' && event.result.trim().length > 0) {
        content = event.result;
      }
      break;
    }
  }

  if (content.trim().length === 0) {
    throw new Error('Initial route decision returned an empty response');
  }

  return { content };
}

function normalizeTask(task: ComparableTask): ComparableTask {
  return {
    id: task.id,
    name: task.name,
    startDate: task.startDate,
    endDate: task.endDate,
    type: task.type ?? 'task',
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

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function assessMutationOutcome(
  mutationToolCalls: MutationToolCall[],
  actualChangedTaskIds: string[],
): MutationOutcomeAssessment {
  const actualChangedSorted = uniqueSorted(actualChangedTaskIds);
  const acceptedMutationCalls = mutationToolCalls.filter((call) => call.status === 'accepted');
  const rejectedMutationCalls = mutationToolCalls.filter((call) => call.status === 'rejected');
  const pendingMutationCalls = mutationToolCalls.filter((call) => call.status === undefined);
  const inferredAcceptedMutationCalls = acceptedMutationCalls.length === 0
    && rejectedMutationCalls.length === 0
    && pendingMutationCalls.length > 0
    && actualChangedSorted.length > 0
      ? pendingMutationCalls.map((call) => ({
        ...call,
        status: 'accepted' as const,
        changedTaskIds: actualChangedSorted,
      }))
      : acceptedMutationCalls;
  const acceptedChangedTaskIds = uniqueSorted(
    inferredAcceptedMutationCalls.flatMap((call) => call.changedTaskIds ?? []),
  );
  const acceptedChangedTaskIdMismatch = inferredAcceptedMutationCalls.length > 0 && (
    acceptedChangedTaskIds.length === 0
    || acceptedChangedTaskIds.length !== actualChangedSorted.length
    || acceptedChangedTaskIds.some((taskId, index) => taskId !== actualChangedSorted[index])
  );

  return {
    mutationAttempted: mutationToolCalls.length > 0,
    acceptedMutationCalls: inferredAcceptedMutationCalls,
    rejectedMutationCalls,
    acceptedChangedTaskIds,
    acceptedChangedTaskIdMismatch,
  };
}

async function collectMutationToolCallsFromMcpLog(runId: string, attempt: number): Promise<MutationToolCall[]> {
  if (!existsSync(MCP_DEBUG_LOG_PATH)) {
    return [];
  }

  const content = await readFile(MCP_DEBUG_LOG_PATH, 'utf-8');
  const lines = content.trim().split('\n').slice(-2000);
  const toolCalls = new Map<string, MutationToolCall>();
  let syntheticIndex = 0;

  for (const line of lines) {
    let parsed: { event?: string; payload?: Record<string, unknown> } | undefined;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }

    const payload = parsed?.payload;
    if (!payload) {
      continue;
    }

    if (payload.aiRunId !== runId || String(payload.aiAttempt ?? '') !== String(attempt)) {
      continue;
    }

    const toolName = payload.tool;
    if (typeof toolName !== 'string' || !NORMALIZED_MUTATION_TOOL_NAMES.has(toolName as NormalizedMutationToolName)) {
      continue;
    }

    const toolUseId = typeof payload.toolUseId === 'string'
      ? payload.toolUseId
      : `${toolName}:${syntheticIndex++}`;

    const existing = toolCalls.get(toolUseId) ?? {
      toolUseId,
      toolName: toolName as NormalizedMutationToolName,
    };

    if (parsed?.event === 'tool_call_failed') {
      existing.status = 'rejected';
      existing.reason = typeof payload.error === 'string' ? payload.error : 'tool_error';
    }

    const result = payload.result;
    if (result && typeof result === 'object') {
      const status = (result as { status?: unknown }).status;
      const reason = (result as { reason?: unknown }).reason;
      const changedTaskIds = (result as { changedTaskIds?: unknown }).changedTaskIds;
      if (status === 'accepted' || status === 'rejected') {
        existing.status = status;
        existing.reason = typeof reason === 'string' ? reason : undefined;
        existing.changedTaskIds = Array.isArray(changedTaskIds)
          ? changedTaskIds.filter((value): value is string => typeof value === 'string')
          : [];
      }
    }

    toolCalls.set(toolUseId, existing);
  }

  return [...toolCalls.values()];
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
  simpleMutationRequested: boolean,
  historyContext: string,
  userMessage: string,
  retryInstruction?: string,
): string {
  return [
    systemPrompt,
    `\n\n## State metadata:\n- projectId: ${projectId}\n- executionMode: unified`,
    [
      '\n\n## Mutation execution protocol:',
      '- First decide whether the latest user request is read-only or requires a project change.',
      '- If the request is read-only, answer directly and do not call mutation tools.',
      '- If the request changes project state, you must use one or more normalized mutation tools before giving a success answer.',
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
    ].join('\n'),
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

async function getPrismaModule(): Promise<PrismaModule> {
  if (!prismaModulePromise) {
    prismaModulePromise = import('@gantt/mcp/prisma');
  }

  return prismaModulePromise;
}

async function getProjectBaseVersion(projectId: string): Promise<number> {
  const { getPrisma } = await getPrismaModule();
  const project = await getPrisma().project.findUnique({
    where: { id: projectId },
    select: { version: true },
  });

  if (!project) {
    throw new Error(`Project ${projectId} was not found`);
  }

  return project.version;
}

async function executeAgentAttempt(
  prompt: string,
  runId: string,
  projectId: string,
  sessionId: string,
  attempt: number,
  simpleMutationRequested: boolean,
  mcpServerPath: string,
  env: ReturnType<typeof resolveEnv>,
  model: string,
  broadcastToSession: WsModule['broadcastToSession'],
): Promise<AgentAttemptResult> {
  const abortController = new AbortController();
  const timeoutMs = MUTATION_ATTEMPT_TIMEOUT_MS;

  const session = query({
    prompt,
    options: {
      authType: 'openai',
      model,
      cwd: PROJECT_ROOT,
      permissionMode: 'yolo',
      includePartialMessages: true,
      maxSessionTurns: simpleMutationRequested ? SIMPLE_MUTATION_MAX_SESSION_TURNS : DEFAULT_MUTATION_MAX_SESSION_TURNS,
      abortController,  // HARD-02: Timeout protection
      excludeTools: ['write_file', 'edit_file', 'run_terminal_cmd', 'run_python_code'],  // HARD-03: MCP-only access
      env: buildSdkEnv(env),
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

  if (mutationToolCalls.size === 0) {
    for (const toolCall of await collectMutationToolCallsFromMcpLog(runId, attempt)) {
      mutationToolCalls.set(toolCall.toolUseId, toolCall);
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
  tasksBefore: ComparableTask[],
  assistantResponse: string,
  mutationToolCalls: MutationToolCall[],
  taskService: TaskServiceModule['taskService'],
): Promise<VerificationResult> {
  const { tasks: tasksAfter } = await taskService.list(projectId);
  const tasksChanged = haveTasksChanged(tasksBefore, tasksAfter);
  const actualChangedTaskIds = getChangedTaskIds(tasksBefore, tasksAfter);
  const mutationOutcome = assessMutationOutcome(mutationToolCalls, actualChangedTaskIds);

  await writeServerDebugLog('mutation_verification', {
    runId,
    attempt,
    projectId,
    sessionId,
    mutationRequested: mutationOutcome.mutationAttempted || tasksChanged,
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
    const [{ taskService, messageService, commandService, getProjectScheduleOptionsForProject }, wsModule] = await Promise.all([
      getServicesModule(),
      getWsModule(),
    ]);
    broadcastToSession = wsModule.broadcastToSession;
    const runId = crypto.randomUUID();
    const { tasks: tasksBefore } = await taskService.list(projectId);
    const env = resolveEnv();
    const routeSelection = await selectAgentRoute({
      userMessage,
      taskCount: tasksBefore.length,
      hasHierarchy: tasksBefore.some((task) => Boolean(task.parentId)),
      model: env.OPENAI_MODEL,
      routeDecisionQuery: executeInitialGenerationRouteDecisionQuery,
    });
    const likelyMutationRequest = routeSelection.route === 'mutation';
    const simpleMutationRequested = false;

    await writeServerDebugLog('agent_run_started', {
      runId,
      projectId,
      sessionId,
      userMessage,
      mutationRequested: likelyMutationRequest,
      likelyMutationRequest,
      simpleMutationRequested,
      tasksBeforeCount: tasksBefore.length,
      tasksBeforeNames: tasksBefore.map((task) => task.name),
    });

    await messageService.add('user', userMessage, projectId);

    await writeServerDebugLog('route_selection', {
      runId,
      projectId,
      sessionId,
      userMessage,
      route: routeSelection.route,
      reason: routeSelection.reason,
      confidence: routeSelection.confidence,
      isEmptyProject: routeSelection.isEmptyProject,
      hasHierarchy: routeSelection.hasHierarchy,
      taskCount: routeSelection.taskCount,
      usedModelDecision: routeSelection.usedModelDecision,
    });

    await writeServerDebugLog('route_decision_evidence', {
      runId,
      projectId,
      sessionId,
      userMessage,
      route: routeSelection.route,
      confidence: routeSelection.confidence,
      reason: routeSelection.reason,
      signals: routeSelection.signals,
      projectStateSummary: routeSelection.projectStateSummary,
      usedModelDecision: routeSelection.usedModelDecision,
    });

    if (routeSelection.route === 'initial_generation') {
      const { getPrisma } = await getPrismaModule();
      const prisma = getPrisma();
      const [baseVersion, scheduleOptions] = await Promise.all([
        getProjectBaseVersion(projectId),
        getProjectScheduleOptionsForProject(prisma, projectId),
      ]);

      await runInitialGeneration({
        projectId,
        sessionId,
        runId,
        userMessage,
        tasksBefore,
        baseVersion,
        scheduleOptions,
        plannerQuery: executeInitialGenerationPlannerQuery,
        services: {
          commandService,
          messageService,
          taskService,
        },
        logger: {
          debug: (event, payload) => writeServerDebugLog(event, payload),
        },
        broadcastToSession,
      });
      return;
    }

    if (likelyMutationRequest) {
      const projectVersion = await getProjectBaseVersion(projectId);

      await writeServerDebugLog('mutation_lifecycle_started', {
        runId,
        projectId,
        sessionId,
        userMessage,
      });

      const stagedMutation = await runStagedMutation({
        userMessage,
        projectId,
        projectVersion,
        sessionId,
        runId,
        tasksBefore,
        env,
        messageService,
        taskService,
        commandService,
        broadcastToSession,
        logger: {
          debug: (event, payload) => writeServerDebugLog(event, payload),
        },
      });

      await writeServerDebugLog('intent_classified', {
        runId,
        projectId,
        sessionId,
        intent: stagedMutation.intent,
      });
      await writeServerDebugLog('execution_mode_selected', {
        runId,
        projectId,
        sessionId,
        executionMode: stagedMutation.executionMode,
      });

      if (stagedMutation.handled) {
        const stagedAssistantResponse = sanitizeAssistantResponse(
          userMessage,
          stagedMutation.assistantResponse ?? stagedMutation.result.userFacingMessage,
        );
        const stagedTasksAfter = stagedMutation.tasksAfter ?? tasksBefore;

        if (stagedAssistantResponse) {
          broadcastToSession(sessionId, { type: 'token', content: stagedAssistantResponse });
          await messageService.add('assistant', stagedAssistantResponse, projectId);
        }

        await writeServerDebugLog('agent_response_saved', {
          runId,
          projectId,
          sessionId,
          assistantResponse: stagedAssistantResponse,
          streamedContent: Boolean(stagedAssistantResponse),
          finalTasksChanged: stagedMutation.result.changedTaskIds.length > 0,
          finalChangedTaskIds: stagedMutation.result.changedTaskIds,
          finalAcceptedChangedTaskIds: stagedMutation.result.changedTaskIds,
          finalAcceptedChangedTaskIdMismatch: false,
        });

        broadcastToSession(sessionId, { type: 'tasks', tasks: stagedTasksAfter });
        await writeServerDebugLog('tasks_broadcast', {
          runId,
          projectId,
          sessionId,
          taskCount: stagedTasksAfter.length,
          taskIds: stagedTasksAfter.map((task) => task.id),
          taskNames: stagedTasksAfter.map((task) => task.name),
        });

        broadcastToSession(sessionId, { type: 'done' });
        await writeServerDebugLog('agent_run_completed', {
          runId,
          projectId,
          sessionId,
          stagedMutationHandled: true,
        });
        return;
      }

      if (stagedMutation.status !== 'deferred_to_legacy' || !stagedMutation.legacyFallbackAllowed) {
        throw new Error('Staged mutation shell returned an unhandled non-legacy outcome.');
      }
    }

    const messages = await messageService.list(projectId, 20);

    const systemPromptPath = process.env.GANTT_MCP_PROMPTS_DIR
      ? join(process.env.GANTT_MCP_PROMPTS_DIR, 'system.md')
      : join(PROJECT_ROOT, 'packages/mcp/agent/prompts/system.md');
    const systemPrompt = existsSync(systemPromptPath)
      ? await readFile(systemPromptPath, 'utf-8')
      : 'You are a Gantt chart planning assistant. Use the available MCP tools to manage tasks.';

    const historyContext = buildHistoryContext(messages.slice(0, -1), false);

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
      cheapModel: env.OPENAI_CHEAP_MODEL,
      projectRoot: PROJECT_ROOT,
    });

    const modelRoutingDecision = resolveModelRoutingDecision({
      route: 'mutation',
      env,
    });
    await writeServerDebugLog('model_routing_decision', {
      runId,
      projectId,
      sessionId,
      ...modelRoutingDecision,
    });

    const mcpServerPath = process.env.GANTT_MCP_SERVER_PATH
      ?? join(PROJECT_ROOT, 'packages/mcp/dist/index.js');

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

    const maxAttempts = 2;
    let retryInstruction: string | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const attemptPrompt = buildPrompt(
        systemPrompt,
        projectId,
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
          simpleMutationRequested,
          mcpServerPath,
          env,
          modelRoutingDecision.selectedModel,
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

        if (attempt < maxAttempts && /timed out/i.test(errorMessage)) {
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
        tasksBefore,
        assistantResponse,
        attemptResult.mutationToolCalls,
        taskService,
      );
      tasksAfter = finalVerification.tasksAfter as ComparableTask[];

      const mutationObserved = finalVerification.mutationAttempted || finalVerification.tasksChanged;

      if (!mutationObserved) {
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
        reason: mutationObserved ? 'mutation_not_confirmed' : 'no_valid_mutation_observed',
        previousAssistantResponse: assistantResponse,
      });
    }

    assistantResponse = sanitizeAssistantResponse(userMessage, assistantResponse);

      if (assistantResponse) {
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
