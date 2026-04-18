import { randomUUID } from 'node:crypto';

import type { ActorType, CommitProjectCommandRequest, CommitProjectCommandResponse } from '@gantt/mcp/types';
import type { ScheduleCommandOptions } from '@gantt/mcp/types';
import { historyService } from '@gantt/mcp/services';
import type { ServerMessage } from '../ws.js';
import { buildGenerationBrief, type BuildGenerationBriefInput } from './brief.js';
import { classifyInitialRequest } from './classification.js';
import { decideInitialClarification } from './clarification-gate.js';
import { assembleDomainSkeleton } from './domain/assembly.js';
import { executeInitialProjectPlan } from './executor.js';
import { normalizeInitialRequest } from './intake-normalization.js';
import * as initialRequestInterpreter from './interpreter.js';
import { resolveModelRoutingDecision } from './model-routing.js';
import { planInitialProject } from './planner.js';
import type { DomainSkeleton } from './domain/contracts.js';
import type {
  ClarificationDecision,
  GenerationBrief,
  InitialGenerationClassification,
  InitialGenerationPlannerStage,
  InitialRequestInterpretation,
  ModelRoutingDecision,
  NormalizedInitialRequest,
} from './types.js';

type ListedTask = {
  id: string;
  name: string;
  startDate?: string;
  endDate?: string;
  parentId?: string;
  dependencies?: Array<{ taskId: string; type: string; lag?: number }>;
  sortOrder?: number;
};

type PlannerQueryInput = {
  prompt: string;
  model: string;
  stage: InitialGenerationPlannerStage;
};

type PlannerQueryResult = string | { content?: string };

type InterpretationQueryInput = {
  prompt: string;
  model: string;
  stage: 'initial_request_interpretation' | 'initial_request_interpretation_repair';
};

type InterpretationQueryResult = string | { content?: string };

export type InitialGenerationServices = {
  commandService: {
    commitCommand(
      request: CommitProjectCommandRequest,
      actorType: ActorType,
      actorId?: string,
    ): Promise<CommitProjectCommandResponse>;
  };
  messageService: {
    add(
      role: 'user' | 'assistant',
      content: string,
      projectId: string,
      options?: {
        requestContextId?: string;
        historyGroupId?: string;
      },
    ): Promise<unknown>;
  };
  taskService: {
    list(projectId: string): Promise<{ tasks: ListedTask[] }>;
  };
};

export type InitialGenerationLogger = {
  debug(event: string, payload: Record<string, unknown>): void | Promise<void>;
};

type InitialGenerationDeps = {
  buildGenerationBrief: (input: BuildGenerationBriefInput) => GenerationBrief;
  normalizeInitialRequest: (rawRequest: string) => NormalizedInitialRequest;
  interpretRequest: (input: {
    userMessage: string;
    normalizedRequest: NormalizedInitialRequest;
    projectState: {
      taskCount: number;
      hasHierarchy: boolean;
      isEmptyProject: boolean;
    };
    model: string;
    interpretationQuery: (input: InterpretationQueryInput) => Promise<InterpretationQueryResult>;
  }) => Promise<{
    interpretation: InitialRequestInterpretation;
    usedModelDecision: boolean;
    repairAttempted: boolean;
    fallbackReason: 'none' | 'model_unavailable' | 'schema_invalid' | 'empty_response';
  }>;
  classifyInitialRequest: (input: {
    normalizedRequest: NormalizedInitialRequest;
    interpretation: InitialRequestInterpretation;
  }) => InitialGenerationClassification;
  decideInitialClarification: (input: {
    normalizedRequest: NormalizedInitialRequest;
    interpretation: InitialRequestInterpretation;
    classification: InitialGenerationClassification;
  }) => ClarificationDecision;
  assembleDomainSkeleton: (input: {
    normalizedRequest: NormalizedInitialRequest;
    interpretation: InitialRequestInterpretation;
    classification: InitialGenerationClassification;
    clarificationDecision: ClarificationDecision;
  }) => DomainSkeleton;
  resolveModelRoutingDecision: (input: {
    route: 'initial_generation' | 'mutation';
    env: Record<string, string | undefined>;
  }) => ModelRoutingDecision;
};

type InitialGenerationSuccess = {
  ok: true;
  outcome: 'complete';
  assistantResponse: string;
  repairAttempted: boolean;
  tasksAfter: ListedTask[];
};

type InitialGenerationFailure = {
  ok: false;
  assistantResponse: string;
  repairAttempted: boolean;
  failureStage: 'planning' | 'compile';
};

export type InitialGenerationResult = InitialGenerationSuccess | InitialGenerationFailure;

export type RunInitialGenerationInput = {
  projectId: string;
  sessionId: string;
  runId: string;
  userMessage: string;
  tasksBefore: Array<{ id: string; name: string }>;
  baseVersion: number;
  serverDate?: string;
  scheduleOptions?: Pick<ScheduleCommandOptions, 'businessDays' | 'weekendPredicate'>;
  brief?: GenerationBrief;
  interpretationModel?: string;
  interpretationQuery?: (input: InterpretationQueryInput) => Promise<InterpretationQueryResult>;
  structureModelRoutingDecision?: ModelRoutingDecision;
  schedulingModelRoutingDecision?: ModelRoutingDecision;
  routingEnv?: Record<string, string | undefined>;
  plannerQuery: (input: PlannerQueryInput) => Promise<PlannerQueryResult>;
  services: InitialGenerationServices;
  logger: InitialGenerationLogger;
  broadcastToSession: (sessionId: string, message: ServerMessage) => void;
  deps?: Partial<InitialGenerationDeps>;
};

function getDefaultDeps(): InitialGenerationDeps {
  return {
    buildGenerationBrief,
    normalizeInitialRequest,
    interpretRequest: initialRequestInterpreter.interpretInitialRequest,
    classifyInitialRequest,
    decideInitialClarification,
    assembleDomainSkeleton,
    resolveModelRoutingDecision,
  };
}

function getServerDate(value?: string): string {
  return (value ?? new Date().toISOString()).slice(0, 10);
}

function readPlannerQueryContent(result: PlannerQueryResult): string {
  if (typeof result === 'string') {
    return result;
  }

  return typeof result?.content === 'string' ? result.content : '';
}

function buildSuccessResponse(): string {
  return 'Я подготовил стартовый график проекта с фазами, подэтапами и задачами.';
}

function buildFailureResponse(stage: InitialGenerationFailure['failureStage']): string {
  if (stage === 'compile') {
    return 'Не удалось собрать и сохранить стартовый график полностью.';
  }

  return 'Не удалось подготовить надежный стартовый график по этому запросу.';
}

async function saveAssistantMessage(
  input: RunInitialGenerationInput,
  assistantResponse: string,
  metadata?: {
    requestContextId?: string;
    historyGroupId?: string;
  },
): Promise<void> {
  await input.services.messageService.add('assistant', assistantResponse, input.projectId, metadata);
  input.broadcastToSession(input.sessionId, { type: 'token', content: assistantResponse });
}

function resolveCheckpointGroupId(latestVisibleGroupId: string | null): string {
  return latestVisibleGroupId ?? 'initial';
}

async function broadcastTasksSnapshot(
  input: RunInitialGenerationInput,
  reason: string,
): Promise<ListedTask[]> {
  const { tasks } = await input.services.taskService.list(input.projectId);
  input.broadcastToSession(input.sessionId, { type: 'tasks', tasks });
  await input.logger.debug('tasks_broadcast', {
    runId: input.runId,
    projectId: input.projectId,
    sessionId: input.sessionId,
    reason,
    taskCount: tasks.length,
    taskIds: tasks.map((task) => task.id),
    taskNames: tasks.map((task) => task.name),
  });

  return tasks;
}

async function finishSuccessfulRun(
  input: RunInitialGenerationInput,
  assistantResponse: string,
  metadata?: {
    requestContextId?: string;
    historyGroupId?: string;
  },
): Promise<ListedTask[]> {
  const tasks = await broadcastTasksSnapshot(input, 'final_state');
  input.broadcastToSession(input.sessionId, {
    type: 'done',
    chatMessage: metadata,
  });
  await input.logger.debug('agent_run_completed', {
    runId: input.runId,
    projectId: input.projectId,
    sessionId: input.sessionId,
    assistantResponse,
  });

  return tasks;
}

async function finishFailedRun(
  input: RunInitialGenerationInput,
  assistantResponse: string,
  metadata?: {
    requestContextId?: string;
    historyGroupId?: string;
  },
): Promise<void> {
  input.broadcastToSession(input.sessionId, {
    type: 'done',
    chatMessage: metadata,
  });
  await input.logger.debug('agent_run_completed', {
    runId: input.runId,
    projectId: input.projectId,
    sessionId: input.sessionId,
    assistantResponse,
    controlledFailure: true,
  });
}

function buildInterpretationTelemetry(input: {
  interpretation: InitialRequestInterpretation;
  usedModelDecision: boolean;
  repairAttempted: boolean;
  fallbackReason: 'none' | 'model_unavailable' | 'schema_invalid' | 'empty_response';
}): Record<string, unknown> {
  return {
    route: input.interpretation.route,
    requestKind: input.interpretation.requestKind,
    planningMode: input.interpretation.planningMode,
    scopeMode: input.interpretation.scopeMode,
    objectProfile: input.interpretation.objectProfile,
    projectArchetype: input.interpretation.projectArchetype,
    worklistPolicy: input.interpretation.worklistPolicy,
    locationScope: input.interpretation.locationScope,
    confidence: input.interpretation.confidence,
    signals: input.interpretation.signals,
    clarification: input.interpretation.clarification,
    usedModelDecision: input.usedModelDecision,
    repairAttempted: input.repairAttempted,
    fallbackReason: input.fallbackReason,
  };
}

function buildNormalizedDecisionTelemetry(input: {
  interpretation: InitialRequestInterpretation;
  classification: InitialGenerationClassification;
  clarificationDecision: ClarificationDecision;
  brief: GenerationBrief;
  domainSkeleton: DomainSkeleton;
  usedModelDecision: boolean;
  repairAttempted: boolean;
  fallbackReason: 'none' | 'model_unavailable' | 'schema_invalid' | 'empty_response';
}): Record<string, unknown> {
  return {
    ...buildInterpretationTelemetry({
      interpretation: input.interpretation,
      usedModelDecision: input.usedModelDecision,
      repairAttempted: input.repairAttempted,
      fallbackReason: input.fallbackReason,
    }),
    classification: input.classification,
    clarificationDecision: input.clarificationDecision,
    brief: input.brief,
    domainSkeleton: input.domainSkeleton,
  };
}

export async function runInitialGeneration(
  input: RunInitialGenerationInput,
): Promise<InitialGenerationResult> {
  const deps = {
    ...getDefaultDeps(),
    ...(input.deps ?? {}),
  } satisfies InitialGenerationDeps;

  const normalizedRequest = deps.normalizeInitialRequest(input.userMessage);
  const interpretationResult = await deps.interpretRequest({
    userMessage: input.userMessage,
    normalizedRequest,
    projectState: {
      taskCount: input.tasksBefore.length,
      hasHierarchy: input.tasksBefore.some((task) => Boolean(task.id)),
      isEmptyProject: input.tasksBefore.length === 0,
    },
    model: input.interpretationModel ?? input.structureModelRoutingDecision?.selectedModel ?? 'unavailable',
    interpretationQuery: async (queryInput) => {
      if (!input.interpretationQuery) {
        throw new Error('model_unavailable');
      }
      return input.interpretationQuery(queryInput);
    },
  });
  const interpretation = interpretationResult.interpretation;
  const classification = deps.classifyInitialRequest({
    normalizedRequest,
    interpretation,
  });
  const clarificationDecision = deps.decideInitialClarification({
    normalizedRequest,
    interpretation,
    classification,
  });
  const domainSkeleton = deps.assembleDomainSkeleton({
    normalizedRequest,
    interpretation,
    classification,
    clarificationDecision,
  });
  const brief = input.brief ?? deps.buildGenerationBrief({
    userMessage: input.userMessage,
    normalizedRequest,
    interpretation,
    classification,
    clarificationDecision,
    domainSkeleton,
  });
  const structureModelRoutingDecision = input.structureModelRoutingDecision ?? deps.resolveModelRoutingDecision({
    route: 'initial_generation',
    env: input.routingEnv ?? process.env,
  });
  const schedulingModelRoutingDecision = input.schedulingModelRoutingDecision ?? deps.resolveModelRoutingDecision({
    route: 'mutation',
    env: input.routingEnv ?? process.env,
  });

  await input.logger.debug('model_routing_decision', {
    runId: input.runId,
    projectId: input.projectId,
    sessionId: input.sessionId,
    stage: 'structure_planning',
    ...structureModelRoutingDecision,
  });
  await input.logger.debug('model_routing_decision', {
    runId: input.runId,
    projectId: input.projectId,
    sessionId: input.sessionId,
    stage: 'schedule_metadata',
    ...schedulingModelRoutingDecision,
  });
  await input.logger.debug('initial_generation_intake_normalized', {
    runId: input.runId,
    projectId: input.projectId,
    sessionId: input.sessionId,
    normalizedRequest,
  });
  const interpretationTelemetry = buildInterpretationTelemetry({
    interpretation,
    usedModelDecision: interpretationResult.usedModelDecision,
    repairAttempted: interpretationResult.repairAttempted,
    fallbackReason: interpretationResult.fallbackReason,
  });
  await input.logger.debug('initial_generation_interpretation', {
    runId: input.runId,
    projectId: input.projectId,
    sessionId: input.sessionId,
    interpretation,
    ...interpretationTelemetry,
  });
  await input.logger.debug('initial_generation_interpretation_validation', {
    runId: input.runId,
    projectId: input.projectId,
    sessionId: input.sessionId,
    validationVerdict: interpretationResult.fallbackReason === 'none' ? 'accepted' : 'fallback_applied',
    ...interpretationTelemetry,
  });
  await input.logger.debug('initial_generation_interpretation_fallback', {
    runId: input.runId,
    projectId: input.projectId,
    sessionId: input.sessionId,
    fallbackApplied: interpretationResult.fallbackReason !== 'none',
    ...interpretationTelemetry,
  });
  await input.logger.debug('initial_generation_classification', {
    runId: input.runId,
    projectId: input.projectId,
    sessionId: input.sessionId,
    classification,
  });
  await input.logger.debug('initial_generation_clarification', {
    runId: input.runId,
    projectId: input.projectId,
    sessionId: input.sessionId,
    clarificationDecision,
  });
  await input.logger.debug('initial_generation_domain_skeleton', {
    runId: input.runId,
    projectId: input.projectId,
    sessionId: input.sessionId,
    domainSkeleton,
  });
  await input.logger.debug('initial_generation_normalized_decisions', {
    runId: input.runId,
    projectId: input.projectId,
    sessionId: input.sessionId,
    ...buildNormalizedDecisionTelemetry({
      interpretation,
      classification,
      clarificationDecision,
      brief,
      domainSkeleton,
      usedModelDecision: interpretationResult.usedModelDecision,
      repairAttempted: interpretationResult.repairAttempted,
      fallbackReason: interpretationResult.fallbackReason,
    }),
  });

  let repairAttempted = false;
  let previewBroadcasted = false;
  const historyGroupId = randomUUID();
  const checkpointGroupId = resolveCheckpointGroupId(await historyService.getLatestVisibleGroupId(input.projectId));
  const loggedPlannerQuery = async (plannerInput: PlannerQueryInput): Promise<PlannerQueryResult> => {
    const startedAt = Date.now();
    await input.logger.debug('planner_query_request', {
      runId: input.runId,
      projectId: input.projectId,
      sessionId: input.sessionId,
      stage: plannerInput.stage,
      model: plannerInput.model,
      prompt: plannerInput.prompt,
      promptLength: plannerInput.prompt.length,
    });

    try {
      const result = await input.plannerQuery(plannerInput);
      const content = readPlannerQueryContent(result);
      await input.logger.debug('planner_query_response', {
        runId: input.runId,
        projectId: input.projectId,
        sessionId: input.sessionId,
        stage: plannerInput.stage,
        model: plannerInput.model,
        durationMs: Date.now() - startedAt,
        response: content,
        responseLength: content.length,
        responseType: typeof result === 'string' ? 'string' : 'object',
      });
      return result;
    } catch (error) {
      await input.logger.debug('planner_query_failed', {
        runId: input.runId,
        projectId: input.projectId,
        sessionId: input.sessionId,
        stage: plannerInput.stage,
        model: plannerInput.model,
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };

  try {
    const planning = await planInitialProject({
      userMessage: input.userMessage,
      brief,
      normalizedRequest,
      classification,
      clarificationDecision,
      domainSkeleton,
      structureModelDecision: structureModelRoutingDecision,
      schedulingModelDecision: schedulingModelRoutingDecision,
      sdkQuery: loggedPlannerQuery,
    });
    repairAttempted = planning.repairAttempted;

    await input.logger.debug('structure_plan_output', {
      runId: input.runId,
      projectId: input.projectId,
      sessionId: input.sessionId,
      selectedModel: structureModelRoutingDecision.selectedModel,
      structure: planning.structure,
      repairAttempted: planning.repairAttempted,
    });
    await input.logger.debug('structure_gate_verdict', {
      runId: input.runId,
      projectId: input.projectId,
      sessionId: input.sessionId,
      accepted: planning.structureVerdict.accepted,
      reasons: planning.structureVerdict.reasons,
      score: planning.structureVerdict.score,
      metrics: planning.structureVerdict.metrics,
    });

    await input.logger.debug('schedule_metadata_output', {
      runId: input.runId,
      projectId: input.projectId,
      sessionId: input.sessionId,
      selectedModel: schedulingModelRoutingDecision.selectedModel,
      scheduled: planning.scheduled,
    });
    await input.logger.debug('scheduling_gate_verdict', {
      runId: input.runId,
      projectId: input.projectId,
      sessionId: input.sessionId,
      accepted: planning.schedulingVerdict.accepted,
      reasons: planning.schedulingVerdict.reasons,
      score: planning.schedulingVerdict.score,
      metrics: planning.schedulingVerdict.metrics,
    });

    await input.logger.debug('executable_plan_output', {
      runId: input.runId,
      projectId: input.projectId,
      sessionId: input.sessionId,
      plan: planning.plan,
    });

    const execution = await executeInitialProjectPlan({
      projectId: input.projectId,
      baseVersion: input.baseVersion,
      clientRequestId: randomUUID(),
      actorId: input.runId,
      plan: planning.plan,
      commandService: input.services.commandService,
      serverDate: getServerDate(input.serverDate),
      scheduleOptions: input.scheduleOptions,
      history: {
        groupId: historyGroupId,
        origin: 'agent_run',
        title: `AI — ${input.userMessage.trim().replace(/\s+/g, ' ') || 'Стартовый график'}`,
        requestContextId: input.runId,
        finalizeGroup: true,
      },
      onCompiled: async (compiledSchedule) => {
        const previewTasks = compiledSchedule.command.tasks.map((task) => ({
          id: task.id,
          name: task.name,
          startDate: task.startDate,
          endDate: task.endDate,
          parentId: task.parentId,
          dependencies: task.dependencies,
          sortOrder: task.sortOrder,
        }));

        input.broadcastToSession(input.sessionId, { type: 'preview_tasks', tasks: previewTasks, provisional: true });
        previewBroadcasted = true;
        await input.logger.debug('preview_tasks_broadcast', {
          runId: input.runId,
          projectId: input.projectId,
          sessionId: input.sessionId,
          taskCount: previewTasks.length,
          taskIds: previewTasks.map((task) => task.id),
          taskNames: previewTasks.map((task) => task.name),
        });
      },
    });

    await input.logger.debug('compile_verdict', {
      runId: input.runId,
      projectId: input.projectId,
      sessionId: input.sessionId,
      ok: execution.ok,
      ...(execution.ok
        ? {
            outcome: execution.outcome,
            retainedNodeCount: execution.compiledSchedule.retainedNodeCount,
            compiledTaskCount: execution.compiledSchedule.compiledTaskCount,
            compiledDependencyCount: execution.compiledSchedule.compiledDependencyCount,
            topLevelPhaseCount: execution.compiledSchedule.topLevelPhaseCount,
          }
        : {
            outcome: execution.reason,
            message: execution.message,
            retainedNodeCount: execution.retainedNodeCount,
            retainedTopLevelPhaseCount: execution.retainedTopLevelPhaseCount,
            compiledTaskCount: execution.compiledTaskCount,
            compiledDependencyCount: execution.compiledDependencyCount,
          }),
    });

    if (!execution.ok) {
      const assistantResponse = buildFailureResponse('compile');
      if (previewBroadcasted) {
        input.broadcastToSession(input.sessionId, {
          type: 'preview_failed',
          message: 'Предварительный график не был сохранён. Проверьте ошибку и повторите запуск.',
        });
      }
      await saveAssistantMessage(input, assistantResponse, {
        requestContextId: input.runId,
      });
      await input.logger.debug('initial_generation_result', {
        runId: input.runId,
        projectId: input.projectId,
        sessionId: input.sessionId,
        accepted: false,
        outcome: execution.reason,
        repairAttempted,
        assistantResponse,
      });
      await finishFailedRun(input, assistantResponse, {
        requestContextId: input.runId,
      });

      return {
        ok: false,
        assistantResponse,
        repairAttempted,
        failureStage: 'compile',
      };
    }

    const assistantResponse = buildSuccessResponse();
    await saveAssistantMessage(input, assistantResponse, {
      requestContextId: input.runId,
      historyGroupId: checkpointGroupId,
    });
    await input.logger.debug('initial_generation_result', {
      runId: input.runId,
      projectId: input.projectId,
      sessionId: input.sessionId,
      accepted: true,
      outcome: 'complete',
      repairAttempted,
      assistantResponse,
    });
    const tasksAfter = await finishSuccessfulRun(input, assistantResponse, {
      requestContextId: input.runId,
      historyGroupId: checkpointGroupId,
    });

    return {
      ok: true,
      outcome: 'complete',
      assistantResponse,
      repairAttempted,
      tasksAfter,
    };
  } catch (error) {
    const assistantResponse = buildFailureResponse('planning');
    await saveAssistantMessage(input, assistantResponse, {
      requestContextId: input.runId,
    });
    await input.logger.debug('initial_generation_result', {
      runId: input.runId,
      projectId: input.projectId,
      sessionId: input.sessionId,
      accepted: false,
      reason: 'planning_error',
      repairAttempted,
      assistantResponse,
      error: error instanceof Error ? error.message : String(error),
    });
    await finishFailedRun(input, assistantResponse, {
      requestContextId: input.runId,
    });

    return {
      ok: false,
      assistantResponse,
      repairAttempted,
      failureStage: 'planning',
    };
  }
}
