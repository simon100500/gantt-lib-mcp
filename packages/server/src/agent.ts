/**
 * Agent runner for the Gantt server.
 */

import {
  Agent,
  Runner,
  type MCPServer,
  type RunStreamEvent,
  type Tool,
} from '@openai/agents';
import { OpenAIProvider, setOpenAIAPI } from '@openai/agents';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import * as dotenv from 'dotenv';
import { writeServerDebugLog } from './debug-log.js';
import type { CommitProjectCommandResponse } from '@gantt/mcp/types';
import {
  resolveOrdinaryAgentCompatibilityMode,
  resolveOrdinaryAgentToolRuntime,
  type OrdinaryAgentCompatibilityMode,
} from './agent/direct-tools.js';
import { runInitialGeneration } from './initial-generation/orchestrator.js';
import { resolveModelRoutingDecision } from './initial-generation/model-routing.js';
import { selectAgentRoute } from './initial-generation/route-selection.js';
import { runStagedMutation } from './mutation/orchestrator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = process.env.GANTT_PROJECT_ROOT ?? join(__dirname, '../../..');

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
  toolCallCount: number;
  metrics: {
    durationMs: number;
    timeToFirstToolCallMs: number | null;
    timeToFirstAssistantTextMs: number | null;
    timeToResultMs: number | null;
    partialEventCount: number;
    assistantMessageCount: number;
    textDeltaCount: number;
    toolResultCount: number;
    observedToolUseCount: number;
    assistantResponseChars: number;
  };
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

type ContentBlock =
  | { type: 'text'; text?: string }
  | { type: 'tool_use'; id: string; name: string; input?: unknown }
  | { type: 'tool_result'; tool_use_id: string; content?: string | ContentBlock[]; is_error?: boolean }
  | { type: string; [key: string]: unknown };

export type MutationOutcomeAssessment = {
  mutationAttempted: boolean;
  acceptedMutationCalls: MutationToolCall[];
  rejectedMutationCalls: MutationToolCall[];
  acceptedChangedTaskIds: string[];
  acceptedChangedTaskIdMismatch: boolean;
};

export type OrdinaryAgentPathTelemetry = {
  direct_tool_path: boolean;
  legacy_subprocess_fallback: boolean;
  embedded_tool_call: boolean;
  tool_calls_per_request: number;
  fallback_rate: number;
  first_direct_pass_accepted: boolean;
  authoritative_verification_accepted: boolean;
  acceptedMutationCalls: MutationToolCall[];
  acceptedChangedTaskIds: string[];
  actualChangedTaskIds: string[];
  accepted_changed_task_id_mismatch: boolean;
};

const ORDINARY_AGENT_PATH_CONTRACT =
  'Ordinary conversational mutations use the direct path by default with no external MCP subprocess; compatibility fallback remains explicit and bounded.';
const FORCE_MUTATIONS_TO_AGENT = process.env.GANTT_FORCE_MUTATIONS_TO_AGENT !== 'false';
const ENABLE_STAGED_MUTATION_FALLBACK = false;
const COMPACT_MUTATION_SYSTEM_PROMPT = [
  'You edit a Gantt project through normalized tools.',
  'For read-only requests, answer directly.',
  'For mutation requests, act quickly and use as few tool calls as possible.',
  'Use reads only when you truly need IDs, hierarchy, dates, or dependency context.',
  'Never guess placement or dependencies for schedule edits.',
  'Do not create standalone tasks when the request implies sequence, parent container, or semantic placement.',
  'If placement or dependency semantics are unclear, gather the minimum context first.',
  'When the user says "there too", "same place", "туда же", or similar, infer the target from recent chat history and current project context before mutating.',
  'For follow-up additions, prefer adding the new task as a sibling under the same parent or immediately after the most recently created or mentioned task.',
  'Use only normalized tools: get_project_summary, get_task_context, get_schedule_slice, create_tasks, update_tasks, move_tasks, delete_tasks, link_tasks, unlink_tasks, shift_tasks, recalculate_project.',
  'Never invent task IDs.',
  'Reply briefly with only what changed.',
  'Respond in the user language.',
].join(' ');

const MUTATION_HISTORY_MESSAGE_LIMIT = 2;
const READONLY_HISTORY_MESSAGE_LIMIT = 12;
const MUTATION_HISTORY_CHAR_LIMIT = 300;
const READONLY_HISTORY_CHAR_LIMIT = 4_000;
const MUTATION_ATTEMPT_TIMEOUT_MS = 90_000;
const READONLY_ATTEMPT_TIMEOUT_MS = 60_000;
const SIMPLE_MUTATION_MAX_SESSION_TURNS = 4;
const DEFAULT_MUTATION_MAX_SESSION_TURNS = 6;
const READONLY_MAX_SESSION_TURNS = 12;
const ENABLE_RAW_SDK_EVENT_LOGGING = process.env.GANTT_DEBUG_RAW_SDK === 'true';
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
const NORMALIZED_MUTATION_TOOL_NAME_LIST = [...NORMALIZED_MUTATION_TOOL_NAMES];
type TaskServiceModule = typeof import('@gantt/mcp/services');
type WsModule = typeof import('./ws.js');
type PrismaModule = typeof import('@gantt/runtime-core/prisma');

let servicesModulePromise: Promise<TaskServiceModule> | undefined;
let wsModulePromise: Promise<WsModule> | undefined;
let prismaModulePromise: Promise<PrismaModule> | undefined;

function resolveNormalizedMutationToolName(name: unknown): NormalizedMutationToolName | undefined {
  if (typeof name !== 'string' || name.trim().length === 0) {
    return undefined;
  }

  const trimmed = name.trim();
  if (NORMALIZED_MUTATION_TOOL_NAMES.has(trimmed as NormalizedMutationToolName)) {
    return trimmed as NormalizedMutationToolName;
  }

  return NORMALIZED_MUTATION_TOOL_NAME_LIST.find((candidate) => (
    trimmed.endsWith(`__${candidate}`)
    || trimmed.endsWith(`.${candidate}`)
    || trimmed.endsWith(`/${candidate}`)
  ));
}

function resolveEnv(): {
  OPENAI_API_KEY: string;
  OPENAI_BASE_URL: string;
  OPENAI_MODEL: string;
  OPENAI_CHEAP_MODEL?: string;
  USE_SEMANTIC_PLANNER?: string;
} {
  return {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? process.env.ANTHROPIC_AUTH_TOKEN ?? '',
    OPENAI_BASE_URL: process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1/',
    OPENAI_MODEL: process.env.OPENAI_MODEL ?? process.env.ANTHROPIC_DEFAULT_SONNET_MODEL ?? '',
    OPENAI_CHEAP_MODEL: process.env.OPENAI_CHEAP_MODEL ?? process.env.cheap_model ?? undefined,
    USE_SEMANTIC_PLANNER: process.env.USE_SEMANTIC_PLANNER ?? 'true',
  };
}

function assertOpenAIAgentsEnv(env: ReturnType<typeof resolveEnv>): void {
  if (!env.OPENAI_API_KEY) {
    throw new Error('API key not configured. Set OPENAI_API_KEY in .env');
  }
  if (!env.OPENAI_MODEL) {
    throw new Error('OPENAI_MODEL is required for OpenAI Agents JS.');
  }
  if (/^(glm|qwen)-/i.test(env.OPENAI_MODEL)) {
    throw new Error(`OPENAI_MODEL "${env.OPENAI_MODEL}" is not valid for the OpenAI Agents JS runtime.`);
  }
}

function createOpenAIRunner(env: ReturnType<typeof resolveEnv>, model: string): Runner {
  assertOpenAIAgentsEnv({ ...env, OPENAI_MODEL: model });
  setOpenAIAPI('chat_completions');
  return new Runner({
    modelProvider: new OpenAIProvider({
    apiKey: env.OPENAI_API_KEY,
    ...(env.OPENAI_BASE_URL ? { baseURL: env.OPENAI_BASE_URL } : {}),
      useResponses: false,
    }),
    tracingDisabled: true,
    traceIncludeSensitiveData: false,
    model,
  });
}

function extractAssistantText(content: Array<{ type: string; text?: string }>): string {
  return content
    .filter((block) => (block.type === 'text' || block.type === 'output_text') && typeof block.text === 'string' && block.text.length > 0)
    .map((block) => block.text ?? '')
    .join('');
}

function summarizeTextPayload(text: string): { chars: number; lines: number } {
  if (!text) {
    return { chars: 0, lines: 0 };
  }

  return {
    chars: text.length,
    lines: text.split('\n').length,
  };
}

function sanitizeRawPayload(value: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
}

async function executeInitialGenerationPlannerQuery(
  input: InitialGenerationPlannerQueryInput,
): Promise<{ content: string }> {
  const env = resolveEnv();
  const runner = createOpenAIRunner(env, input.model);
  const agent = new Agent({
    name: 'Initial Generation Planner',
    instructions: 'Return only the requested planning payload. Do not use markdown or code fences.',
    model: input.model,
  });
  const result = await runner.run(agent, input.prompt, {
    maxTurns: input.stage === 'structure_planning_repair' || input.stage === 'schedule_metadata_repair' ? 4 : 3,
  });
  const content = typeof result.finalOutput === 'string' ? result.finalOutput : '';

  if (content.trim().length === 0) {
    throw new Error('Initial generation planner returned an empty response');
  }

  return { content };
}

async function executeInitialGenerationRouteDecisionQuery(
  input: InitialGenerationRouteDecisionQueryInput,
): Promise<{ content: string }> {
  const env = resolveEnv();
  const runner = createOpenAIRunner(env, input.model);
  const agent = new Agent({
    name: 'Initial Route Decision',
    instructions: 'Return strict JSON only. No markdown, no prose, no code fences.',
    model: input.model,
  });
  const result = await runner.run(agent, input.prompt, {
    maxTurns: input.stage === 'initial_request_interpretation_repair' ? 3 : 2,
  });
  const content = typeof result.finalOutput === 'string' ? result.finalOutput : '';

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

export function summarizeOrdinaryAgentPathTelemetry(input: {
  initialCompatibilityMode: OrdinaryAgentCompatibilityMode;
  finalCompatibilityMode?: OrdinaryAgentCompatibilityMode;
  toolCallCount: number;
  firstDirectPassAccepted: boolean;
  authoritativeVerificationAccepted: boolean;
  acceptedMutationCalls: MutationToolCall[];
  actualChangedTaskIds: string[];
}): OrdinaryAgentPathTelemetry {
  const finalCompatibilityMode = input.finalCompatibilityMode ?? input.initialCompatibilityMode;
  const acceptedChangedTaskIds = uniqueSorted(
    input.acceptedMutationCalls.flatMap((call) => call.changedTaskIds ?? []),
  );
  const actualChangedTaskIds = uniqueSorted(input.actualChangedTaskIds);
  const acceptedChangedTaskIdMismatch =
    acceptedChangedTaskIds.length !== actualChangedTaskIds.length
    || acceptedChangedTaskIds.some((taskId, index) => taskId !== actualChangedTaskIds[index]);
  const legacySubprocessFallback =
    input.initialCompatibilityMode === 'embedded-direct'
    && finalCompatibilityMode === 'legacy-subprocess'
    && !input.firstDirectPassAccepted;
  const directToolPath = finalCompatibilityMode === 'embedded-direct';

  return {
    direct_tool_path: directToolPath,
    legacy_subprocess_fallback: legacySubprocessFallback,
    embedded_tool_call: directToolPath && input.toolCallCount > 0,
    tool_calls_per_request: input.toolCallCount,
    fallback_rate: legacySubprocessFallback ? 1 : 0,
    first_direct_pass_accepted: input.firstDirectPassAccepted,
    authoritative_verification_accepted: input.authoritativeVerificationAccepted,
    acceptedMutationCalls: input.acceptedMutationCalls,
    acceptedChangedTaskIds,
    actualChangedTaskIds,
    accepted_changed_task_id_mismatch: acceptedChangedTaskIdMismatch,
  };
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
  const inferredAcceptedMutationCalls = (() => {
    if (acceptedMutationCalls.length > 0) {
      const acceptedChangedIds = uniqueSorted(
        acceptedMutationCalls.flatMap((call) => call.changedTaskIds ?? []),
      );
      if (acceptedChangedIds.length === 0 && actualChangedSorted.length > 0) {
        return acceptedMutationCalls.map((call) => ({
          ...call,
          changedTaskIds: actualChangedSorted,
        }));
      }
      return acceptedMutationCalls;
    }

    if (rejectedMutationCalls.length === 0 && pendingMutationCalls.length > 0 && actualChangedSorted.length > 0) {
      return pendingMutationCalls.map((call) => ({
        ...call,
        status: 'accepted' as const,
        changedTaskIds: actualChangedSorted,
      }));
    }

    return acceptedMutationCalls;
  })();
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
  const { getPrisma } = await getPrismaModule();
  const rows = await ((getPrisma() as any).agentDebugLog.findMany({
    where: {
      source: 'mcp',
      runId,
      attempt,
      tool: {
        in: [...NORMALIZED_MUTATION_TOOL_NAMES],
      },
    },
    orderBy: { createdAt: 'asc' },
    take: 2000,
  }) as Promise<Array<{ event: string; tool?: string | null; toolUseId?: string | null; payload?: unknown }>>);
  const toolCalls = new Map<string, MutationToolCall>();
  let syntheticIndex = 0;

  for (const row of rows) {
    const payload = row.payload && typeof row.payload === 'object'
      ? row.payload as Record<string, unknown>
      : undefined;
    if (!payload) {
      continue;
    }

    const toolName = resolveNormalizedMutationToolName(row.tool ?? payload.tool);
    if (!toolName) {
      continue;
    }

    const toolUseId = row.toolUseId
      ?? (typeof payload.toolUseId === 'string' ? payload.toolUseId : `${toolName}:${syntheticIndex++}`);

    const existing = toolCalls.get(toolUseId) ?? {
      toolUseId,
      toolName,
    };

    if (row.event === 'tool_call_failed') {
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

function resolveCheckpointGroupId(latestVisibleGroupId: string | null): string {
  return latestVisibleGroupId ?? 'initial';
}

function buildAgentHistoryTitle(userMessage: string, undoable: boolean): string {
  if (!undoable) {
    return 'AI — Неотменяемое действие';
  }

  const normalized = userMessage.trim().replace(/\s+/g, ' ');
  return normalized.length > 0 ? `AI — ${normalized}` : 'AI — Изменение графика';
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

export function shouldPreferStagedMutation(userMessage: string): boolean {
  const normalized = userMessage.trim();
  if (normalized.length === 0) {
    return false;
  }

  return true;
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
  projectId: string,
  _simpleMutationRequested: boolean,
  historyContext: string,
  userMessage: string,
  _retryInstruction?: string,
): string {
  return [
    `## Project context:\n- projectId: ${projectId}`,
    historyContext.length > 0 ? `\n\n## Conversation history:\n${historyContext}` : '',
    `\n\n## User request:\n${userMessage}`,
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
    const toolUseBlock = block as { id?: unknown; name?: unknown };
    const toolName = block.type === 'tool_use'
      ? resolveNormalizedMutationToolName(toolUseBlock.name)
      : undefined;
    if (block.type === 'tool_use' && toolName && typeof toolUseBlock.id === 'string') {
      toolUseById.set(toolUseBlock.id, {
        toolUseId: toolUseBlock.id,
        toolName,
      });
    }
  }

  for (const block of blocks) {
    if (block.type !== 'tool_result') {
      continue;
    }

    const toolResultBlock = block as { tool_use_id?: unknown; content?: string | ContentBlock[]; is_error?: boolean };
    const toolCall = typeof toolResultBlock.tool_use_id === 'string'
      ? toolUseById.get(toolResultBlock.tool_use_id)
      : undefined;
    if (!toolCall) {
      continue;
    }

    const payload = tryParseToolResultPayload(toolResultBlock.content) as
      | { status?: 'accepted' | 'rejected'; reason?: string; changedTaskIds?: string[] }
      | undefined;

    if (payload?.status) {
      toolCall.status = payload.status;
      toolCall.reason = payload.reason;
      toolCall.changedTaskIds = Array.isArray(payload.changedTaskIds) ? payload.changedTaskIds : [];
    } else if (toolResultBlock.is_error) {
      toolCall.status = 'rejected';
      toolCall.reason = 'tool_error';
    }
  }

  return [...toolUseById.values()];
}

function collectToolUseIds(blocks: ContentBlock[]): string[] {
  return blocks
    .flatMap((block) => {
      const id = (block as { id?: unknown }).id;
      return block.type === 'tool_use' && typeof id === 'string' ? [id] : [];
    });
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
    prismaModulePromise = import('@gantt/runtime-core/prisma');
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
  systemPrompt: string,
  runId: string,
  projectId: string,
  sessionId: string,
  historyGroupId: string,
  requestContextId: string,
  historyTitle: string,
  userId: string | undefined,
  attempt: number,
  simpleMutationRequested: boolean,
  compatibilityMode: OrdinaryAgentCompatibilityMode | undefined,
  env: ReturnType<typeof resolveEnv>,
  model: string,
  broadcastToSession: WsModule['broadcastToSession'],
): Promise<AgentAttemptResult> {
  const abortController = new AbortController();
  const timeoutMs = MUTATION_ATTEMPT_TIMEOUT_MS;
  const mutationToolCalls = new Map<string, MutationToolCall>();
  const observedToolUseIds = new Set<string>();
  const toolRuntime = resolveOrdinaryAgentToolRuntime({
    projectId,
    runId,
    sessionId,
    attempt,
    historyGroupId,
    requestContextId,
    historyTitle,
    userId,
    compatibilityMode,
    projectRoot: PROJECT_ROOT,
    databaseUrl: process.env.DATABASE_URL,
    onToolResult: (toolCall) => {
      observedToolUseIds.add(toolCall.toolUseId);
      const mutationToolName = resolveNormalizedMutationToolName(toolCall.toolName);
      if (!mutationToolName) {
        return;
      }
      const existing = mutationToolCalls.get(toolCall.toolUseId);
      mutationToolCalls.set(toolCall.toolUseId, {
        ...existing,
        toolUseId: toolCall.toolUseId,
        toolName: mutationToolName,
        status: toolCall.status,
        reason: toolCall.reason,
        changedTaskIds: toolCall.changedTaskIds,
      });
    },
  });

  const runner = createOpenAIRunner(env, model);
  const agent = new Agent({
    name: 'Gantt Mutation Agent',
    instructions: systemPrompt,
    model,
    tools: toolRuntime.tools as Tool[],
    mcpServers: toolRuntime.mcpServers as MCPServer[],
  });

  for (const server of toolRuntime.mcpServers) {
    await server.connect();
  }

  const session = await runner.run(agent, prompt, {
    stream: true,
    maxTurns: simpleMutationRequested ? SIMPLE_MUTATION_MAX_SESSION_TURNS : DEFAULT_MUTATION_MAX_SESSION_TURNS,
    signal: abortController.signal,
  });

  let assistantResponse = '';
  let streamedContent = false;
  const startedAt = Date.now();
  let firstToolCallAt: number | null = null;
  let firstAssistantTextAt: number | null = null;
  let resultAt: number | null = null;
  let partialEventCount = 0;
  let assistantMessageCount = 0;
  let textDeltaCount = 0;
  let toolResultCount = 0;
  let timeoutHandle: NodeJS.Timeout | undefined;

  function recordToolCall(toolUseId: string, toolName: unknown): void {
    observedToolUseIds.add(toolUseId);
    if (firstToolCallAt === null) {
      firstToolCallAt = Date.now();
    }
    const normalizedToolName = resolveNormalizedMutationToolName(toolName);
    if (normalizedToolName) {
      const existing = mutationToolCalls.get(toolUseId);
      mutationToolCalls.set(toolUseId, {
        ...existing,
        toolUseId,
        toolName: normalizedToolName,
      });
    }
  }

  function recordToolOutput(toolUseId: string, output: unknown, isError = false): void {
    toolResultCount += 1;
    const existing = mutationToolCalls.get(toolUseId);
    if (!existing) {
      return;
    }
    const payload = typeof output === 'string'
      ? tryParseToolResultPayload(output)
      : output;
    const parsed = payload as { status?: 'accepted' | 'rejected'; reason?: string; changedTaskIds?: string[] } | undefined;
    if (parsed?.status) {
      existing.status = parsed.status;
      existing.reason = parsed.reason;
      existing.changedTaskIds = Array.isArray(parsed.changedTaskIds) ? parsed.changedTaskIds : [];
    } else if (isError) {
      existing.status = 'rejected';
      existing.reason = 'tool_error';
    }
  }

  function extractTextFromRawEvent(event: RunStreamEvent): string {
    const raw = event as unknown as {
      data?: {
        event?: { type?: string; delta?: string; text?: string };
        chunk?: { choices?: Array<{ delta?: { content?: string } }> };
      };
    };
    return raw.data?.event?.delta
      ?? raw.data?.event?.text
      ?? raw.data?.chunk?.choices?.[0]?.delta?.content
      ?? '';
  }

  try {
    const sessionPromise = (async () => {
      for await (const event of session) {
        partialEventCount += 1;
        if (ENABLE_RAW_SDK_EVENT_LOGGING) {
          await writeServerDebugLog('sdk_raw_event', {
            runId,
            attempt,
            sessionId,
            projectId,
            streamType: event.type,
            raw: sanitizeRawPayload(event),
          });
        }

        if (event.type === 'raw_model_stream_event') {
          const deltaText = extractTextFromRawEvent(event);
          if (deltaText) {
            textDeltaCount += 1;
            assistantResponse += deltaText;
            streamedContent = true;
            if (firstAssistantTextAt === null) {
              firstAssistantTextAt = Date.now();
            }
            await writeServerDebugLog('sdk_text_delta', {
              runId,
              attempt,
              sessionId,
              projectId,
              text: deltaText,
            });
          }
          continue;
        }

        if (event.type !== 'run_item_stream_event') {
          continue;
        }

        const item = event.item as unknown as {
          type?: string;
          rawItem?: {
            type?: string;
            callId?: string;
            call_id?: string;
            name?: string;
            output?: unknown;
            content?: Array<{ type?: string; text?: string }>;
          };
          output?: unknown;
        };

        if (event.name === 'tool_called') {
          const toolUseId = item.rawItem?.callId ?? item.rawItem?.call_id ?? crypto.randomUUID();
          recordToolCall(toolUseId, item.rawItem?.name);
        }

        if (event.name === 'tool_output') {
          const toolUseId = item.rawItem?.callId ?? item.rawItem?.call_id;
          if (toolUseId) {
            recordToolOutput(toolUseId, item.output ?? item.rawItem?.output);
          }
        }

        if (event.name === 'message_output_created') {
          assistantMessageCount += 1;
          const text = extractAssistantText((item.rawItem?.content ?? []) as Array<{ type: string; text?: string }>);
          if (!streamedContent && text) {
            assistantResponse += text;
            if (firstAssistantTextAt === null) {
              firstAssistantTextAt = Date.now();
            }
          }
          await writeServerDebugLog('sdk_assistant_message', {
            runId,
            attempt,
            sessionId,
            projectId,
            text,
            capturedPartialContent: streamedContent,
          });
        }
      }

      await session.completed;
      resultAt = Date.now();
      const finalOutput = typeof session.finalOutput === 'string' ? session.finalOutput : '';
      if (assistantResponse.trim().length === 0 && finalOutput.trim().length > 0) {
        assistantResponse = finalOutput;
      }
      await writeServerDebugLog('sdk_result_message', {
        runId,
        attempt,
        sessionId,
        projectId,
        subtype: 'completed',
        isError: Boolean(session.error),
        result: finalOutput,
        error: session.error instanceof Error ? session.error.message : session.error ? String(session.error) : undefined,
        turns: session.currentTurn,
      });
      if (session.error) {
        throw session.error instanceof Error ? session.error : new Error(String(session.error));
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
    await Promise.allSettled(toolRuntime.mcpServers.map((server) => server.close()));
  }

  if (mutationToolCalls.size === 0) {
    for (const toolCall of await collectMutationToolCallsFromMcpLog(runId, attempt)) {
      mutationToolCalls.set(toolCall.toolUseId, toolCall);
    }
  }

  const durationMs = Date.now() - startedAt;
  await writeServerDebugLog('agent_attempt_metrics', {
    runId,
    attempt,
    projectId,
    sessionId,
    durationMs,
    timeToFirstToolCallMs: firstToolCallAt === null ? null : firstToolCallAt - startedAt,
    timeToFirstAssistantTextMs: firstAssistantTextAt === null ? null : firstAssistantTextAt - startedAt,
    timeToResultMs: resultAt === null ? null : resultAt - startedAt,
    partialEventCount,
    assistantMessageCount,
    textDeltaCount,
    toolResultCount,
    observedToolUseCount: observedToolUseIds.size,
    assistantResponseChars: assistantResponse.length,
  });

  return {
    assistantResponse,
    streamedContent,
    mutationToolCalls: [...mutationToolCalls.values()],
    toolCallCount: observedToolUseIds.size,
    metrics: {
      durationMs,
      timeToFirstToolCallMs: firstToolCallAt === null ? null : firstToolCallAt - startedAt,
      timeToFirstAssistantTextMs: firstAssistantTextAt === null ? null : firstAssistantTextAt - startedAt,
      timeToResultMs: resultAt === null ? null : resultAt - startedAt,
      partialEventCount,
      assistantMessageCount,
      textDeltaCount,
      toolResultCount,
      observedToolUseCount: observedToolUseIds.size,
      assistantResponseChars: assistantResponse.length,
    },
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
  sessionId: string,
  userId?: string,
): Promise<void> {
  let broadcastToSession: WsModule['broadcastToSession'] | undefined;
  try {
    const [{ taskService, messageService, commandService, getProjectScheduleOptionsForProject, historyService }, wsModule] = await Promise.all([
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

    const checkpointGroupId = likelyMutationRequest || routeSelection.route === 'initial_generation'
      ? resolveCheckpointGroupId(await historyService.getLatestVisibleGroupId(projectId))
      : undefined;

    await messageService.add('user', userMessage, projectId, {
      requestContextId: runId,
      historyGroupId: checkpointGroupId,
    });

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
      await writeServerDebugLog('initial_generation_interpretation', {
        runId,
        projectId,
        sessionId,
        userMessage,
        route: routeSelection.interpretation.route,
        requestKind: routeSelection.interpretation.requestKind,
        planningMode: routeSelection.interpretation.planningMode,
        scopeMode: routeSelection.interpretation.scopeMode,
        objectProfile: routeSelection.interpretation.objectProfile,
        projectArchetype: routeSelection.interpretation.projectArchetype,
        worklistPolicy: routeSelection.interpretation.worklistPolicy,
        locationScope: routeSelection.interpretation.locationScope,
        confidence: routeSelection.interpretation.confidence,
        signals: routeSelection.interpretation.signals,
        clarification: routeSelection.interpretation.clarification,
        usedModelDecision: routeSelection.usedModelDecision,
        routeDecisionReason: routeSelection.reason,
        projectStateSummary: routeSelection.projectStateSummary,
      });
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
        interpretationModel: env.OPENAI_MODEL,
        interpretationQuery: executeInitialGenerationRouteDecisionQuery,
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

    const messages = await messageService.list(projectId, 20);

    const systemPromptPath = process.env.GANTT_MCP_PROMPTS_DIR
      ? join(process.env.GANTT_MCP_PROMPTS_DIR, 'system.md')
      : join(PROJECT_ROOT, 'packages/mcp/agent/prompts/system.md');
    const verboseSystemPrompt = existsSync(systemPromptPath)
      ? await readFile(systemPromptPath, 'utf-8')
      : 'You are a Gantt chart planning assistant. Use the available MCP tools to manage tasks.';
    const systemPrompt = likelyMutationRequest ? COMPACT_MUTATION_SYSTEM_PROMPT : verboseSystemPrompt;
    const historyContext = buildHistoryContext(messages.slice(0, -1), likelyMutationRequest);

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

    const ordinaryCompatibilityMode = resolveOrdinaryAgentCompatibilityMode();
    let finalCompatibilityMode = ordinaryCompatibilityMode;

    let assistantResponse = '';
    let streamedContent = false;
    let tasksAfter: ComparableTask[] = tasksBefore;
    let ordinaryToolCallCount = 0;
    let firstDirectPassAccepted = false;
    const directHistoryGroupId = crypto.randomUUID();
    const directRequestContextId = runId;
    const directHistoryTitle = buildAgentHistoryTitle(userMessage, true);
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

    if (likelyMutationRequest && FORCE_MUTATIONS_TO_AGENT) {
      await writeServerDebugLog('mutation_forced_full_agent', {
        runId,
        projectId,
        sessionId,
        userMessage,
        reason: 'GANTT_FORCE_MUTATIONS_TO_AGENT default-on test mode',
      });
    }

    if (
      likelyMutationRequest
      && ordinaryCompatibilityMode === 'embedded-direct'
      && !FORCE_MUTATIONS_TO_AGENT
      && shouldPreferStagedMutation(userMessage)
    ) {
      const projectVersion = await getProjectBaseVersion(projectId);
      const requestContextId = runId;
      const groupId = crypto.randomUUID();
      const historyTitle = buildAgentHistoryTitle(userMessage, true);
      await writeServerDebugLog('mutation_lifecycle_started', {
        runId,
        projectId,
        sessionId,
        userMessage,
        mode: 'staged_preferred',
      });
      await writeServerDebugLog('mutation_staged_preferred_started', {
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
        groupId,
        requestContextId,
        historyTitle,
        historyUndoable: true,
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
        finalCompatibilityMode = 'legacy-subprocess';
        const stagedAssistantResponse = sanitizeAssistantResponse(
          userMessage,
          stagedMutation.assistantResponse ?? stagedMutation.result.userFacingMessage,
        );
        const stagedTasksAfter = stagedMutation.tasksAfter ?? tasksBefore;

        if (stagedAssistantResponse) {
          broadcastToSession(sessionId, { type: 'token', content: stagedAssistantResponse });
          await messageService.add('assistant', stagedAssistantResponse, projectId, {
            requestContextId: stagedMutation.result.requestContextId ?? requestContextId,
            historyGroupId: stagedMutation.result.historyUndoable
              ? checkpointGroupId
              : undefined,
          });
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

        broadcastToSession(sessionId, { type: 'history_changed' });
        broadcastToSession(sessionId, {
          type: 'done',
          chatMessage: stagedAssistantResponse
            ? {
                requestContextId: stagedMutation.result.requestContextId ?? requestContextId,
                historyGroupId: stagedMutation.result.historyUndoable
                  ? checkpointGroupId
                  : null,
              }
            : undefined,
        });
        await writeServerDebugLog('agent_run_completed', {
          runId,
          projectId,
          sessionId,
          stagedMutationHandled: true,
          stagedMutationPreferred: true,
        });
        return;
      }
    }

    const maxAttempts = 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const attemptPrompt = buildPrompt(
        projectId,
        simpleMutationRequested,
        historyContext,
        userMessage,
      );
      const systemPromptSummary = summarizeTextPayload(systemPrompt);
      const historySummary = summarizeTextPayload(historyContext);
      const userMessageSummary = summarizeTextPayload(userMessage);
      const promptSummary = summarizeTextPayload(attemptPrompt);

      await writeServerDebugLog('agent_payload_telemetry', {
        runId,
        attempt,
        projectId,
        sessionId,
        historyCount: messages.length,
        simpleMutationRequested,
        model: modelRoutingDecision.selectedModel,
        systemPromptChars: systemPromptSummary.chars,
        systemPromptLines: systemPromptSummary.lines,
        historyChars: historySummary.chars,
        historyLines: historySummary.lines,
        userMessageChars: userMessageSummary.chars,
        userMessageLines: userMessageSummary.lines,
        promptChars: promptSummary.chars,
        promptLines: promptSummary.lines,
        ...(ENABLE_RAW_SDK_EVENT_LOGGING
          ? {
              systemPrompt,
              historyContext,
              userMessage,
              prompt: attemptPrompt,
            }
          : {}),
      });

      let attemptResult: AgentAttemptResult;
      try {
        attemptResult = await executeAgentAttempt(
          attemptPrompt,
          systemPrompt,
          runId,
          projectId,
          sessionId,
          directHistoryGroupId,
          directRequestContextId,
          directHistoryTitle,
          userId,
          attempt,
          simpleMutationRequested,
          ordinaryCompatibilityMode,
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

        throw error;
      }
      assistantResponse = sanitizeAssistantResponse(userMessage, attemptResult.assistantResponse);
      streamedContent = streamedContent || attemptResult.streamedContent;
      ordinaryToolCallCount += attemptResult.toolCallCount;
      await writeServerDebugLog('agent_attempt_summary', {
        runId,
        attempt,
        projectId,
        sessionId,
        toolCallCount: attemptResult.toolCallCount,
        ...attemptResult.metrics,
      });

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
      if (attempt === 1 && ordinaryCompatibilityMode === 'embedded-direct') {
        firstDirectPassAccepted = finalVerification.tasksChanged
          && !finalVerification.acceptedChangedTaskIdMismatch;
      }

      if (finalVerification.rejectedMutationCalls.length > 0) {
        assistantResponse = buildRejectedMutationMessage(finalVerification.rejectedMutationCalls);
        break;
      }

      if (finalVerification.tasksChanged) {
        if (finalVerification.acceptedChangedTaskIdMismatch) {
          await writeServerDebugLog('mutation_verification_warning', {
            runId,
            attempt,
            projectId,
            sessionId,
            warning: 'accepted_changed_task_id_mismatch',
            acceptedChangedTaskIds: finalVerification.acceptedChangedTaskIds,
            actualChangedTaskIds: finalVerification.actualChangedTaskIds,
          });
        }
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
    }

    if (
      likelyMutationRequest
      && ENABLE_STAGED_MUTATION_FALLBACK
      && ordinaryCompatibilityMode === 'embedded-direct'
      && !firstDirectPassAccepted
    ) {
      const projectVersion = await getProjectBaseVersion(projectId);
      const requestContextId = runId;
      const groupId = crypto.randomUUID();
      const historyTitle = buildAgentHistoryTitle(userMessage, true);
      await writeServerDebugLog('mutation_staged_fallback_started', {
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
        groupId,
        requestContextId,
        historyTitle,
        historyUndoable: true,
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
        finalCompatibilityMode = 'legacy-subprocess';
        const stagedAssistantResponse = sanitizeAssistantResponse(
          userMessage,
          stagedMutation.assistantResponse ?? stagedMutation.result.userFacingMessage,
        );
        const stagedTasksAfter = stagedMutation.tasksAfter ?? tasksBefore;

        if (stagedAssistantResponse) {
          broadcastToSession(sessionId, { type: 'token', content: stagedAssistantResponse });
          await messageService.add('assistant', stagedAssistantResponse, projectId, {
            requestContextId: stagedMutation.result.requestContextId ?? requestContextId,
            historyGroupId: stagedMutation.result.historyUndoable
              ? checkpointGroupId
              : undefined,
          });
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

        broadcastToSession(sessionId, { type: 'history_changed' });
        broadcastToSession(sessionId, {
          type: 'done',
          chatMessage: stagedAssistantResponse
            ? {
                requestContextId: stagedMutation.result.requestContextId ?? requestContextId,
                historyGroupId: stagedMutation.result.historyUndoable
                  ? checkpointGroupId
                  : null,
              }
            : undefined,
        });
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
    } else if (likelyMutationRequest && !ENABLE_STAGED_MUTATION_FALLBACK) {
      await writeServerDebugLog('mutation_staged_fallback_disabled', {
        runId,
        projectId,
        sessionId,
        directPathAccepted: firstDirectPassAccepted,
      });
    }

    assistantResponse = sanitizeAssistantResponse(userMessage, assistantResponse);
    const ordinaryPathTelemetry = summarizeOrdinaryAgentPathTelemetry({
      initialCompatibilityMode: ordinaryCompatibilityMode,
      finalCompatibilityMode,
      toolCallCount: ordinaryToolCallCount,
      firstDirectPassAccepted,
      authoritativeVerificationAccepted: finalVerification.tasksChanged
        && !finalVerification.acceptedChangedTaskIdMismatch,
      acceptedMutationCalls: finalVerification.acceptedMutationCalls,
      actualChangedTaskIds: finalVerification.actualChangedTaskIds,
    });
    await writeServerDebugLog('ordinary_agent_path_telemetry', {
      runId,
      projectId,
      sessionId,
      path_contract: ORDINARY_AGENT_PATH_CONTRACT,
      ...ordinaryPathTelemetry,
    });

      if (assistantResponse) {
      broadcastToSession(sessionId, { type: 'token', content: assistantResponse });
      streamedContent = true;
    }

    if (assistantResponse) {
      await messageService.add('assistant', assistantResponse, projectId, {
        requestContextId: directRequestContextId,
        historyGroupId: checkpointGroupId,
      });
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

    broadcastToSession(sessionId, { type: 'history_changed' });
    broadcastToSession(sessionId, {
      type: 'done',
      chatMessage: assistantResponse
        ? {
            requestContextId: directRequestContextId,
            historyGroupId: checkpointGroupId ?? null,
          }
        : undefined,
    });
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
