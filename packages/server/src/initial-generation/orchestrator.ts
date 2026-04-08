import { randomUUID } from 'node:crypto';

import type { ActorType, CommitProjectCommandRequest, CommitProjectCommandResponse } from '@gantt/mcp/types';
import type { ServerMessage } from '../ws.js';
import { buildGenerationBrief, type BuildGenerationBriefInput } from './brief.js';
import { resolveDomainReference, type ResolveDomainReferenceInput, type ResolvedDomainReference } from './domain-reference.js';
import { executeInitialProjectPlan, type ExecuteInitialProjectPlanInput, type ExecuteInitialProjectPlanResult } from './executor.js';
import { resolveModelRoutingDecision } from './model-routing.js';
import { planInitialProject, type PlanInitialProjectInput, type PlanInitialProjectResult } from './planner.js';
import type { GenerationBrief, ModelRoutingDecision } from './types.js';

type ListedTask = {
  id: string;
  name: string;
  startDate?: string;
  endDate?: string;
  parentId?: string;
};

type PlannerQueryInput = {
  prompt: string;
  model: string;
  stage: 'planning' | 'repair';
};

type PlannerQueryResult = string | { content?: string };

export type InitialGenerationServices = {
  commandService: {
    commitCommand(
      request: CommitProjectCommandRequest,
      actorType: ActorType,
      actorId?: string,
    ): Promise<CommitProjectCommandResponse>;
  };
  messageService: {
    add(role: 'user' | 'assistant', content: string, projectId: string): Promise<unknown>;
  };
  taskService: {
    list(projectId: string): Promise<{ tasks: ListedTask[] }>;
  };
};

export type InitialGenerationLogger = {
  debug(event: string, payload: Record<string, unknown>): void | Promise<void>;
};

type InitialGenerationDeps = {
  resolveDomainReference: (input: ResolveDomainReferenceInput) => ResolvedDomainReference;
  buildGenerationBrief: (input: BuildGenerationBriefInput) => GenerationBrief;
  resolveModelRoutingDecision: (input: {
    route: 'initial_generation';
    env: Record<string, string | undefined>;
  }) => ModelRoutingDecision;
  planProject: (input: {
    userMessage: string;
    brief: GenerationBrief;
    reference: ResolvedDomainReference;
    modelDecision: ModelRoutingDecision;
    plannerQuery: (input: PlannerQueryInput) => Promise<PlannerQueryResult>;
  }) => Promise<PlanInitialProjectResult>;
  executePlan: (input: ExecuteInitialProjectPlanInput) => Promise<ExecuteInitialProjectPlanResult>;
};

type InitialGenerationSuccess = {
  ok: true;
  outcome: 'complete' | 'partial';
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
  brief?: GenerationBrief;
  modelRoutingDecision?: ModelRoutingDecision;
  routingEnv?: Record<string, string | undefined>;
  plannerQuery: (input: PlannerQueryInput) => Promise<PlannerQueryResult>;
  services: InitialGenerationServices;
  logger: InitialGenerationLogger;
  broadcastToSession: (sessionId: string, message: ServerMessage) => void;
  deps?: Partial<InitialGenerationDeps>;
};

function getDefaultDeps(): InitialGenerationDeps {
  return {
    resolveDomainReference,
    buildGenerationBrief,
    resolveModelRoutingDecision,
    planProject: async (input) => planInitialProject({
      userMessage: input.userMessage,
      brief: input.brief,
      reference: input.reference,
      modelDecision: input.modelDecision,
      sdkQuery: input.plannerQuery,
    } satisfies PlanInitialProjectInput),
    executePlan: executeInitialProjectPlan,
  };
}

function getServerDate(value?: string): string {
  return (value ?? new Date().toISOString()).slice(0, 10);
}

function buildSuccessResponse(outcome: 'complete' | 'partial'): string {
  if (outcome === 'partial') {
    return 'Я подготовил partial starter schedule: стартовый график построен частично, но основные этапы и ключевые работы уже на месте.';
  }

  return 'Я подготовил стартовый график проекта с основными этапами и реалистичной последовательностью работ.';
}

function buildFailureResponse(stage: 'planning' | 'compile'): string {
  if (stage === 'planning') {
    return 'Не удалось подготовить надежный стартовый график по этому запросу.';
  }

  return 'Не удалось собрать надежный стартовый график из подготовленного плана.';
}

async function saveAssistantMessage(
  input: RunInitialGenerationInput,
  assistantResponse: string,
): Promise<void> {
  await input.services.messageService.add('assistant', assistantResponse, input.projectId);
  input.broadcastToSession(input.sessionId, { type: 'token', content: assistantResponse });
}

async function finishSuccessfulRun(
  input: RunInitialGenerationInput,
  assistantResponse: string,
): Promise<ListedTask[]> {
  const { tasks } = await input.services.taskService.list(input.projectId);
  input.broadcastToSession(input.sessionId, { type: 'tasks', tasks });
  await input.logger.debug('tasks_broadcast', {
    runId: input.runId,
    projectId: input.projectId,
    sessionId: input.sessionId,
    taskCount: tasks.length,
    taskIds: tasks.map((task) => task.id),
    taskNames: tasks.map((task) => task.name),
  });
  input.broadcastToSession(input.sessionId, { type: 'done' });
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
): Promise<void> {
  input.broadcastToSession(input.sessionId, { type: 'done' });
  await input.logger.debug('agent_run_completed', {
    runId: input.runId,
    projectId: input.projectId,
    sessionId: input.sessionId,
    assistantResponse,
    controlledFailure: true,
  });
}

export async function runInitialGeneration(
  input: RunInitialGenerationInput,
): Promise<InitialGenerationResult> {
  const deps = {
    ...getDefaultDeps(),
    ...(input.deps ?? {}),
  } satisfies InitialGenerationDeps;
  const reference = deps.resolveDomainReference({
    userMessage: input.userMessage,
  });

  await input.logger.debug('object_type_inference', {
    runId: input.runId,
    projectId: input.projectId,
    sessionId: input.sessionId,
    userMessage: input.userMessage,
    referenceKey: reference.referenceKey,
    projectType: reference.projectType,
    defaultInterpretation: reference.defaultInterpretation,
    stageHints: reference.stageHints,
  });

  const brief = input.brief ?? deps.buildGenerationBrief({
    userMessage: input.userMessage,
    reference,
  });
  const modelRoutingDecision = input.modelRoutingDecision ?? deps.resolveModelRoutingDecision({
    route: 'initial_generation',
    env: input.routingEnv ?? process.env,
  });

  await input.logger.debug('model_routing_decision', {
    runId: input.runId,
    projectId: input.projectId,
    sessionId: input.sessionId,
    ...modelRoutingDecision,
  });

  let repairAttempted = false;

  try {
    const planning = await deps.planProject({
      userMessage: input.userMessage,
      brief,
      reference,
      modelDecision: modelRoutingDecision,
      plannerQuery: input.plannerQuery,
    });
    repairAttempted = planning.repairAttempted;

    await input.logger.debug('planning_output', {
      runId: input.runId,
      projectId: input.projectId,
      sessionId: input.sessionId,
      selectedModel: modelRoutingDecision.selectedModel,
      plan: planning.plan,
      repairAttempted: planning.repairAttempted,
      phaseCount: planning.verdict.metrics.phaseCount,
      taskNodeCount: planning.verdict.metrics.taskNodeCount,
      dependencyCount: planning.verdict.metrics.dependencyCount,
      crossPhaseDependencyCount: planning.verdict.metrics.crossPhaseDependencyCount,
    });

    await input.logger.debug('plan_quality_verdict', {
      runId: input.runId,
      projectId: input.projectId,
      sessionId: input.sessionId,
      accepted: planning.verdict.accepted,
      reasons: planning.verdict.reasons,
      score: planning.verdict.score,
      metrics: planning.verdict.metrics,
      repairAttempted: planning.repairAttempted,
    });

    if (planning.repairAttempted) {
      await input.logger.debug('plan_repair_requested', {
        runId: input.runId,
        projectId: input.projectId,
        sessionId: input.sessionId,
        reasons: planning.verdict.reasons,
      });
    }

    if (!planning.verdict.accepted) {
      const assistantResponse = buildFailureResponse('planning');
      await saveAssistantMessage(input, assistantResponse);
      await input.logger.debug('initial_generation_result', {
        runId: input.runId,
        projectId: input.projectId,
        sessionId: input.sessionId,
        accepted: false,
        outcome: 'quality_gate_rejected',
        repairAttempted,
        assistantResponse,
        reasons: planning.verdict.reasons,
        metrics: planning.verdict.metrics,
      });
      await finishFailedRun(input, assistantResponse);

      return {
        ok: false,
        assistantResponse,
        repairAttempted,
        failureStage: 'planning',
      };
    }

    const compileResult = await deps.executePlan({
      projectId: input.projectId,
      baseVersion: input.baseVersion,
      clientRequestId: randomUUID(),
      plan: planning.plan,
      commandService: input.services.commandService,
      serverDate: getServerDate(input.serverDate),
    });

    await input.logger.debug('compile_verdict', {
      runId: input.runId,
      projectId: input.projectId,
      sessionId: input.sessionId,
      ok: compileResult.ok,
      outcome: compileResult.ok ? compileResult.outcome : compileResult.reason,
      message: compileResult.message,
      batchSize: compileResult.ok ? compileResult.compiledSchedule.command.tasks.length : 0,
      taskCount: compileResult.ok ? compileResult.compiledSchedule.retainedNodeCount : compileResult.retainedNodeCount,
      compiledTaskCount: compileResult.ok ? compileResult.compiledSchedule.compiledTaskCount : compileResult.compiledTaskCount,
      compiledDependencyCount: compileResult.ok ? compileResult.compiledSchedule.compiledDependencyCount : compileResult.compiledDependencyCount,
      topLevelPhaseCount: compileResult.ok ? compileResult.compiledSchedule.topLevelPhaseCount : compileResult.retainedTopLevelPhaseCount,
      crossPhaseDependencyCount: compileResult.ok ? compileResult.compiledSchedule.crossPhaseDependencyCount : compileResult.crossPhaseDependencyCount,
      droppedNodeKeys: compileResult.droppedNodeKeys,
      droppedDependencyNodeKeys: compileResult.droppedDependencyNodeKeys,
    });

    if (!compileResult.ok) {
      const assistantResponse = buildFailureResponse('compile');
      await saveAssistantMessage(input, assistantResponse);
      await input.logger.debug('initial_generation_result', {
        runId: input.runId,
        projectId: input.projectId,
        sessionId: input.sessionId,
        accepted: false,
        outcome: compileResult.reason,
        repairAttempted,
        assistantResponse,
      });
      await finishFailedRun(input, assistantResponse);

      return {
        ok: false,
        assistantResponse,
        repairAttempted,
        failureStage: 'compile',
      };
    }

    const assistantResponse = buildSuccessResponse(compileResult.outcome);
    await saveAssistantMessage(input, assistantResponse);
    await input.logger.debug('initial_generation_result', {
      runId: input.runId,
      projectId: input.projectId,
      sessionId: input.sessionId,
      accepted: true,
      outcome: compileResult.outcome,
      repairAttempted,
      assistantResponse,
      compiledTaskCount: compileResult.compiledSchedule.compiledTaskCount,
      compiledDependencyCount: compileResult.compiledSchedule.compiledDependencyCount,
      droppedNodeKeys: compileResult.droppedNodeKeys,
      droppedDependencyNodeKeys: compileResult.droppedDependencyNodeKeys,
    });
    const tasksAfter = await finishSuccessfulRun(input, assistantResponse);

    return {
      ok: true,
      outcome: compileResult.outcome,
      assistantResponse,
      repairAttempted,
      tasksAfter,
    };
  } catch (error) {
    const assistantResponse = buildFailureResponse('planning');
    await saveAssistantMessage(input, assistantResponse);
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
    await finishFailedRun(input, assistantResponse);

    return {
      ok: false,
      assistantResponse,
      repairAttempted,
      failureStage: 'planning',
    };
  }
}
