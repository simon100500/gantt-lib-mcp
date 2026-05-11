/**
 * Agent runner for the Gantt server.
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import * as dotenv from 'dotenv';
import { writeServerDebugLog } from './debug-log.js';
import type { CommitProjectCommandResponse } from '@gantt/mcp/types';
import { runInitialGeneration } from './initial-generation/orchestrator.js';
import { selectAgentRoute } from './initial-generation/route-selection.js';
import { runPiOrdinaryAgent } from './agent/pi-agent-runner.js';
import {
  buildRouteContextSummary,
  buildSessionSnapshotMessages,
  buildSessionStateFromTranscript,
} from './agent/session-state.js';
import { completeTextPrompt } from './agent/pi-model.js';
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

type InitialGenerationPlannerQueryInput = {
  prompt: string;
  model: string;
  stage: 'structure_planning' | 'structure_planning_repair' | 'schedule_metadata' | 'schedule_metadata_repair';
  onTextDelta?: (delta: string, fullText: string) => Promise<void> | void;
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

type OrdinaryAgentCompatibilityMode = 'embedded-direct' | 'legacy-subprocess';

const MUTATION_HISTORY_MESSAGE_LIMIT = 2;
const READONLY_HISTORY_MESSAGE_LIMIT = 12;
const MUTATION_HISTORY_CHAR_LIMIT = 300;
const READONLY_HISTORY_CHAR_LIMIT = 4_000;
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
    OPENAI_BASE_URL: process.env.OPENAI_BASE_URL ?? 'https://api.z.ai/api/paas/v4/',
    OPENAI_MODEL: process.env.OPENAI_MODEL ?? process.env.ANTHROPIC_DEFAULT_SONNET_MODEL ?? 'glm-4.7',
    OPENAI_CHEAP_MODEL: process.env.OPENAI_CHEAP_MODEL ?? process.env.cheap_model ?? undefined,
    USE_SEMANTIC_PLANNER: process.env.USE_SEMANTIC_PLANNER ?? 'true',
  };
}

async function executeInitialGenerationPlannerQuery(
  input: InitialGenerationPlannerQueryInput,
): Promise<{ content: string }> {
  const env = resolveEnv();
  if (!env.OPENAI_API_KEY) {
    throw new Error('API key not configured. Set OPENAI_API_KEY or ANTHROPIC_AUTH_TOKEN in .env');
  }

  const content = await completeTextPrompt({
    env: {
      OPENAI_API_KEY: env.OPENAI_API_KEY,
      OPENAI_BASE_URL: env.OPENAI_BASE_URL,
      OPENAI_MODEL: input.model,
    },
    prompt: input.prompt,
    onTextDelta: input.onTextDelta,
  });

  return { content };
}

async function executeInitialGenerationRouteDecisionQuery(
  input: InitialGenerationRouteDecisionQueryInput,
): Promise<{ content: string }> {
  const env = resolveEnv();
  if (!env.OPENAI_API_KEY) {
    throw new Error('API key not configured. Set OPENAI_API_KEY or ANTHROPIC_AUTH_TOKEN in .env');
  }

  const content = await completeTextPrompt({
    env: {
      OPENAI_API_KEY: env.OPENAI_API_KEY,
      OPENAI_BASE_URL: env.OPENAI_BASE_URL,
      OPENAI_MODEL: input.model,
    },
    prompt: input.prompt,
  });

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

function resolveCheckpointGroupId(latestVisibleGroupId: string | null): string {
  return latestVisibleGroupId ?? 'initial';
}

function summarizeRecentConversation(
  messages: Array<{ role: string; content: string }>,
  limit: number = 4,
): string | undefined {
  const recent = messages
    .slice(-limit)
    .map((message) => ({
      role: message.role,
      content: message.content.trim().replace(/\s+/g, ' '),
    }))
    .filter((message) => message.content.length > 0);

  if (recent.length === 0) {
    return undefined;
  }

  return recent
    .map((message) => `${message.role}: ${message.content.slice(0, 240)}`)
    .join('\n');
}

function buildAgentHistoryTitle(userMessage: string, undoable: boolean): string {
  if (!undoable) {
    return 'AI — Неотменяемое действие';
  }

  const normalized = userMessage.trim().replace(/\s+/g, ' ');
  return normalized.length > 0 ? `AI — ${normalized}` : 'AI — Изменение графика';
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

export async function runAgentWithHistory(
  userMessage: string,
  projectId: string,
  sessionId: string,
  userId?: string,
  generationJob?: {
    id: string;
    markRunning(stage: 'interpreting' | 'planning' | 'compiling' | 'committing' | 'finalizing', statusMessage: string): Promise<void>;
    markPreviewAvailable(): Promise<void>;
    markSucceeded(input?: {
      requestContextId?: string | null;
      historyGroupId?: string | null;
      statusMessage?: string | null;
    }): Promise<void>;
    markFailed(input: {
      statusMessage?: string | null;
      errorCode?: string | null;
      errorMessage?: string | null;
    }): Promise<void>;
  },
): Promise<void> {
  let broadcastToSession: WsModule['broadcastToSession'] | undefined;
  try {
    const [{ taskService, messageService, commandService, getProjectScheduleOptionsForProject, historyService, agentSessionStateService }, wsModule] = await Promise.all([
      getServicesModule(),
      getWsModule(),
    ]);
    broadcastToSession = wsModule.broadcastToSession;
    const runId = crypto.randomUUID();
    const [{ tasks: tasksBefore }, recentMessages, sessionState] = await Promise.all([
      taskService.list(projectId),
      messageService.list(projectId, 24),
      agentSessionStateService.getByProjectId(projectId),
    ]);
    const env = resolveEnv();
    const recentConversationSummary = buildRouteContextSummary({
      sessionState,
      recentMessages,
    }) || summarizeRecentConversation(recentMessages);
    const routeSelection = await selectAgentRoute({
      userMessage,
      taskCount: tasksBefore.length,
      hasHierarchy: tasksBefore.some((task) => Boolean(task.parentId)),
      recentConversationSummary,
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
      recentConversationSummary,
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
      recentConversationSummary,
    });
    await generationJob?.markRunning('interpreting', 'AI анализирует запрос и контекст проекта');

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
        generationJob,
      });

      const transcriptAfterInitialGeneration = await messageService.list(projectId, 24);
      const rebuiltState = buildSessionStateFromTranscript({
        projectId,
        recentMessages: transcriptAfterInitialGeneration,
        priorState: sessionState,
        userMessage,
        mutationAccepted: true,
      });
      await agentSessionStateService.upsert({
        projectId,
        messagesSnapshot: rebuiltState.messagesSnapshot,
        rollingSummary: rebuiltState.rollingSummary,
        openThreads: rebuiltState.openThreads,
        lastRequestContextId: runId,
      });
      return;
    }

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

    const messages = await messageService.list(projectId, 24);
    const piHistoryGroupId = checkpointGroupId ?? crypto.randomUUID();
    const piResult = await runPiOrdinaryAgent({
      userMessage,
      projectId,
      sessionId,
      runId,
      userId,
      env: {
        OPENAI_API_KEY: env.OPENAI_API_KEY,
        OPENAI_BASE_URL: env.OPENAI_BASE_URL,
        OPENAI_MODEL: env.OPENAI_MODEL,
      },
      messages: sessionState?.messagesSnapshot?.length
        ? sessionState.messagesSnapshot
        : buildSessionSnapshotMessages(messages.slice(0, -1)),
      historyGroupId: piHistoryGroupId,
      requestContextId: runId,
      historyTitle: buildAgentHistoryTitle(userMessage, true),
      mutationRoute: likelyMutationRequest,
      rollingSummary: sessionState?.rollingSummary ?? null,
      openThreads: sessionState?.openThreads ?? null,
      taskService,
      broadcastToSession,
      logger: {
        debug: (event, payload) => writeServerDebugLog(event, payload),
      },
    });
    await generationJob?.markRunning('finalizing', 'Фиксируем результат AI-запроса');

    const assistantResponse = sanitizeAssistantResponse(userMessage, piResult.assistantResponse);
    let streamedContent = piResult.streamedContent;

    await writeServerDebugLog('pi_ordinary_agent_summary', {
      runId,
      projectId,
      sessionId,
      toolCallCount: piResult.toolCallCount,
      acceptedMutatingToolCalls: piResult.acceptedMutatingToolCalls,
      rejectedMutatingToolCalls: piResult.rejectedMutatingToolCalls,
      historyGroupId: piHistoryGroupId,
      ...piResult.metrics,
    });

    if (assistantResponse && !streamedContent) {
      broadcastToSession(sessionId, { type: 'token', content: assistantResponse });
      streamedContent = true;
    }

    if (assistantResponse) {
      await messageService.add('assistant', assistantResponse, projectId, {
        requestContextId: runId,
        historyGroupId: piHistoryGroupId,
      });
    }
    const transcriptAfterRun = await messageService.list(projectId, 24);
    const rebuiltState = buildSessionStateFromTranscript({
      projectId,
      recentMessages: transcriptAfterRun,
      priorState: sessionState,
      userMessage,
      assistantResponse,
      mutationAccepted: piResult.acceptedMutatingToolCalls.length > 0,
    });
    await agentSessionStateService.upsert({
      projectId,
      messagesSnapshot: piResult.sessionMessages.length > 0 ? piResult.sessionMessages : rebuiltState.messagesSnapshot,
      rollingSummary: rebuiltState.rollingSummary,
      openThreads: rebuiltState.openThreads,
      lastRequestContextId: runId,
    });
    await writeServerDebugLog('agent_response_saved', {
      runId,
      projectId,
      sessionId,
      assistantResponse,
      streamedContent,
      finalTasksChanged: piResult.acceptedMutatingToolCalls.length > 0,
      finalChangedTaskIds: piResult.acceptedMutatingToolCalls.flatMap((fact) => fact.changedTaskIds),
      finalAcceptedChangedTaskIds: piResult.acceptedMutatingToolCalls.flatMap((fact) => fact.changedTaskIds),
      finalAcceptedChangedTaskIdMismatch: false,
    });

    if (piResult.tasksAfter) {
      broadcastToSession(sessionId, { type: 'tasks', tasks: piResult.tasksAfter });
      await writeServerDebugLog('tasks_broadcast', {
        runId,
        projectId,
        sessionId,
        taskCount: piResult.tasksAfter.length,
      });
    }

    if (piResult.acceptedMutatingToolCalls.length > 0) {
      broadcastToSession(sessionId, { type: 'history_changed' });
    }
    broadcastToSession(sessionId, {
      type: 'done',
      chatMessage: assistantResponse
        ? {
            requestContextId: runId,
            historyGroupId: piHistoryGroupId ?? null,
          }
        : undefined,
    });
    await generationJob?.markSucceeded({
      requestContextId: runId,
      historyGroupId: piHistoryGroupId ?? null,
      statusMessage: 'AI-запрос завершён',
    });
    await writeServerDebugLog('agent_run_completed', {
      runId,
      projectId,
      sessionId,
    });
  } catch (err) {
    await generationJob?.markFailed({
      statusMessage: 'AI-запрос завершился ошибкой.',
      errorMessage: String(err),
    });
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
