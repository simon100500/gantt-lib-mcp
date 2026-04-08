import { randomUUID } from 'node:crypto';

import type { ActorType, CommitProjectCommandRequest, CommitProjectCommandResponse } from '@gantt/mcp/types';
import type { ServerMessage } from '../ws.js';
import { buildGenerationBrief, type BuildGenerationBriefInput } from './brief.js';
import { resolveDomainReference, type ResolveDomainReferenceInput, type ResolvedDomainReference } from './domain-reference.js';
import { executeInitialProjectPlan } from './executor.js';
import { resolveModelRoutingDecision } from './model-routing.js';
import { planInitialProject } from './planner.js';
import type {
  GenerationBrief,
  InitialGenerationPlannerStage,
  ModelRoutingDecision,
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
  brief?: GenerationBrief;
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
    resolveDomainReference,
    buildGenerationBrief,
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
): Promise<void> {
  await input.services.messageService.add('assistant', assistantResponse, input.projectId);
  input.broadcastToSession(input.sessionId, { type: 'token', content: assistantResponse });
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
): Promise<ListedTask[]> {
  const tasks = await broadcastTasksSnapshot(input, 'final_state');
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

  let repairAttempted = false;
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
      reference,
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
      await saveAssistantMessage(input, assistantResponse);
      await input.logger.debug('initial_generation_result', {
        runId: input.runId,
        projectId: input.projectId,
        sessionId: input.sessionId,
        accepted: false,
        outcome: execution.reason,
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

    const assistantResponse = buildSuccessResponse();
    await saveAssistantMessage(input, assistantResponse);
    await input.logger.debug('initial_generation_result', {
      runId: input.runId,
      projectId: input.projectId,
      sessionId: input.sessionId,
      accepted: true,
      outcome: 'complete',
      repairAttempted,
      assistantResponse,
    });
    const tasksAfter = await finishSuccessfulRun(input, assistantResponse);

    return {
      ok: true,
      outcome: 'complete',
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
