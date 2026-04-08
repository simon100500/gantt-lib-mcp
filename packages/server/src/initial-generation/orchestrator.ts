import { randomUUID } from 'node:crypto';

import type { ActorType, CommitProjectCommandRequest, CommitProjectCommandResponse } from '@gantt/mcp/types';
import type { ServerMessage } from '../ws.js';
import { buildGenerationBrief, type BuildGenerationBriefInput } from './brief.js';
import { resolveDomainReference, type ResolveDomainReferenceInput, type ResolvedDomainReference } from './domain-reference.js';
import {
  commitExpandedPhase,
  commitSkeletonStructure,
  type ExecuteIncrementalInitialGenerationResult,
  type IncrementalCommitContext,
} from './incremental-executor.js';
import { buildExecutablePlan } from './link-reconciliation.js';
import { resolveModelRoutingDecision } from './model-routing.js';
import { expandSinglePhase } from './phase-expander.js';
import type { PlanInitialProjectResult } from './planner.js';
import { planProjectSkeleton } from './skeleton-planner.js';
import type {
  ExpandedPhasePlan,
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
    route: 'initial_generation';
    env: Record<string, string | undefined>;
  }) => ModelRoutingDecision;
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
  };
}

function getServerDate(value?: string): string {
  return (value ?? new Date().toISOString()).slice(0, 10);
}

function buildSuccessResponse(outcome: 'complete' | 'partial'): string {
  if (outcome === 'partial') {
    return 'Я создал каркас графика и успел развернуть только часть фаз. Базовая структура уже в проекте.';
  }

  return 'Я подготовил стартовый график проекта с основными этапами и реалистичной последовательностью работ.';
}

function buildFailureResponse(stage: 'planning' | 'compile'): string {
  if (stage === 'planning') {
    return 'Не удалось подготовить надежный стартовый график по этому запросу.';
  }

  return 'Не удалось собрать и сохранить стартовый график полностью, но часть структуры могла уже появиться в проекте.';
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

function isCommitFailure(
  result: IncrementalCommitContext | Exclude<ExecuteIncrementalInitialGenerationResult, { ok: true }>,
): result is Exclude<ExecuteIncrementalInitialGenerationResult, { ok: true }> {
  return 'ok' in result && result.ok === false;
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
    const skeletonResult = await planProjectSkeleton({
      userMessage: input.userMessage,
      brief,
      reference,
      modelDecision: modelRoutingDecision,
      sdkQuery: input.plannerQuery,
    });
    repairAttempted = skeletonResult.repairAttempted;

    await input.logger.debug('wbs_skeleton_output', {
      runId: input.runId,
      projectId: input.projectId,
      sessionId: input.sessionId,
      selectedModel: modelRoutingDecision.selectedModel,
      skeleton: skeletonResult.skeleton,
      repairAttempted: skeletonResult.repairAttempted,
      phaseCount: skeletonResult.verdict.metrics.phaseCount,
      workPackageCount: skeletonResult.verdict.metrics.workPackageCount,
    });

    await input.logger.debug('wbs_skeleton_verdict', {
      runId: input.runId,
      projectId: input.projectId,
      sessionId: input.sessionId,
      accepted: skeletonResult.verdict.accepted,
      reasons: skeletonResult.verdict.reasons,
      score: skeletonResult.verdict.score,
      metrics: skeletonResult.verdict.metrics,
    });

    if (!skeletonResult.verdict.accepted) {
      const assistantResponse = buildFailureResponse('planning');
      await saveAssistantMessage(input, assistantResponse);
      await input.logger.debug('initial_generation_result', {
        runId: input.runId,
        projectId: input.projectId,
        sessionId: input.sessionId,
        accepted: false,
        outcome: 'skeleton_rejected',
        repairAttempted,
        assistantResponse,
        reasons: skeletonResult.verdict.reasons,
        metrics: skeletonResult.verdict.metrics,
      });
      await finishFailedRun(input, assistantResponse);

      return {
        ok: false,
        assistantResponse,
        repairAttempted,
        failureStage: 'planning',
      };
    }

    const planningShell: PlanInitialProjectResult = {
      skeleton: skeletonResult.skeleton,
      skeletonVerdict: skeletonResult.verdict,
      expandedPhases: [],
      crossPhaseLinkPlan: { links: [] },
      plan: {
        projectType: skeletonResult.skeleton.projectType,
        assumptions: skeletonResult.skeleton.assumptions,
        nodes: [],
      },
      verdict: {
        accepted: false,
        reasons: ['missing_hierarchy'],
        score: 0,
        metrics: {
          phaseCount: 0,
          taskNodeCount: 0,
          dependencyCount: 0,
          crossPhaseDependencyCount: 0,
          genericTitleCount: 0,
          genericTitleRatio: 1,
          objectTypeSignalCoverage: 0,
          passesProductAdequacyFloor: false,
        },
      },
      repairAttempted,
    };

    let commitContext = await commitSkeletonStructure({
      projectId: input.projectId,
      baseVersion: input.baseVersion,
      clientRequestId: randomUUID(),
      serverDate: getServerDate(input.serverDate),
      planning: planningShell,
      commandService: input.services.commandService,
    });

    if (isCommitFailure(commitContext)) {
      const assistantResponse = buildFailureResponse('compile');
      await saveAssistantMessage(input, assistantResponse);
      await input.logger.debug('compile_verdict', {
        runId: input.runId,
        projectId: input.projectId,
        sessionId: input.sessionId,
        ok: false,
        outcome: commitContext.reason,
        message: commitContext.message,
        committedPhaseKeys: commitContext.committedPhaseKeys,
        committedTaskNodeKeys: commitContext.committedTaskNodeKeys,
      });
      await finishFailedRun(input, assistantResponse);

      return {
        ok: false,
        assistantResponse,
        repairAttempted,
        failureStage: 'compile',
      };
    }

    const orderedPhases = [...skeletonResult.skeleton.phases].sort((left, right) => left.orderHint - right.orderHint);
    const expandedPhases: Array<{
      phaseKey: string;
      title: string;
      expansion: ExpandedPhasePlan;
      verdict: Awaited<ReturnType<typeof expandSinglePhase>>['verdict'];
      repairAttempted: boolean;
    }> = [];

    for (const phase of orderedPhases) {
      const expandedPhase = await expandSinglePhase({
        userMessage: input.userMessage,
        brief,
        reference,
        skeleton: skeletonResult.skeleton,
        modelDecision: modelRoutingDecision,
        sdkQuery: input.plannerQuery,
      }, phase);

      expandedPhases.push({
        phaseKey: expandedPhase.phase.phaseKey,
        title: expandedPhase.phase.title,
        expansion: expandedPhase.expansion,
        verdict: expandedPhase.verdict,
        repairAttempted: expandedPhase.repairAttempted,
      });
      repairAttempted = repairAttempted || expandedPhase.repairAttempted;

      await input.logger.debug('phase_expansion_output', {
        runId: input.runId,
        projectId: input.projectId,
        sessionId: input.sessionId,
        phaseKey: expandedPhase.phase.phaseKey,
        phaseTitle: expandedPhase.phase.title,
        expansion: expandedPhase.expansion,
        repairAttempted: expandedPhase.repairAttempted,
      });

      await input.logger.debug('phase_expansion_verdict', {
        runId: input.runId,
        projectId: input.projectId,
        sessionId: input.sessionId,
        phaseKey: expandedPhase.phase.phaseKey,
        phaseTitle: expandedPhase.phase.title,
        accepted: expandedPhase.verdict.accepted,
        reasons: expandedPhase.verdict.reasons,
        score: expandedPhase.verdict.score,
        metrics: expandedPhase.verdict.metrics,
      });

      if (!expandedPhase.verdict.accepted) {
        const assistantResponse = buildSuccessResponse('partial');
        await saveAssistantMessage(input, assistantResponse);
        await input.logger.debug('initial_generation_result', {
          runId: input.runId,
          projectId: input.projectId,
          sessionId: input.sessionId,
          accepted: true,
          outcome: 'partial',
          repairAttempted,
          assistantResponse,
          stoppingPhaseKey: expandedPhase.phase.phaseKey,
          reasons: expandedPhase.verdict.reasons,
        });
        const tasksAfter = await finishSuccessfulRun(input, assistantResponse);
        return {
          ok: true,
          outcome: 'partial',
          assistantResponse,
          repairAttempted,
          tasksAfter,
        };
      }

      const commitResult = await commitExpandedPhase({
        projectId: input.projectId,
        baseVersion: input.baseVersion,
        clientRequestId: randomUUID(),
        serverDate: getServerDate(input.serverDate),
        planning: {
          ...planningShell,
          expandedPhases,
        },
        commandService: input.services.commandService,
      }, commitContext, expandedPhases, expandedPhases[expandedPhases.length - 1]!);

      if (isCommitFailure(commitResult)) {
        const assistantResponse = buildSuccessResponse('partial');
        await saveAssistantMessage(input, assistantResponse);
        await input.logger.debug('compile_verdict', {
          runId: input.runId,
          projectId: input.projectId,
          sessionId: input.sessionId,
          ok: false,
          outcome: commitResult.reason,
          message: commitResult.message,
          committedPhaseKeys: commitResult.committedPhaseKeys,
          committedTaskNodeKeys: commitResult.committedTaskNodeKeys,
        });
        await input.logger.debug('initial_generation_result', {
          runId: input.runId,
          projectId: input.projectId,
          sessionId: input.sessionId,
          accepted: true,
          outcome: 'partial',
          repairAttempted,
          assistantResponse,
        });
        const tasksAfter = await finishSuccessfulRun(input, assistantResponse);
        return {
          ok: true,
          outcome: 'partial',
          assistantResponse,
          repairAttempted,
          tasksAfter,
        };
      }

      commitContext = commitResult;
    }

    const executable = buildExecutablePlan({
      brief,
      skeleton: skeletonResult.skeleton,
      expansions: expandedPhases.map((phase) => phase.expansion),
    });

    await input.logger.debug('cross_phase_linking_verdict', {
      runId: input.runId,
      projectId: input.projectId,
      sessionId: input.sessionId,
      linkCount: executable.crossPhaseLinkPlan.links.length,
      links: executable.crossPhaseLinkPlan.links,
    });

    await input.logger.debug('executable_plan_output', {
      runId: input.runId,
      projectId: input.projectId,
      sessionId: input.sessionId,
      plan: executable.plan,
    });

    await input.logger.debug('plan_quality_verdict', {
      runId: input.runId,
      projectId: input.projectId,
      sessionId: input.sessionId,
      accepted: executable.verdict.accepted,
      reasons: executable.verdict.reasons,
      score: executable.verdict.score,
      metrics: executable.verdict.metrics,
      repairAttempted,
    });

    const outcome = executable.verdict.accepted ? 'complete' : 'partial';
    const assistantResponse = buildSuccessResponse(outcome);
    await saveAssistantMessage(input, assistantResponse);
    await input.logger.debug('compile_verdict', {
      runId: input.runId,
      projectId: input.projectId,
      sessionId: input.sessionId,
      ok: true,
      outcome,
      message: 'Incremental commit completed',
      committedPhaseKeys: commitContext.committedPhaseKeys,
      committedTaskNodeKeys: commitContext.committedTaskNodeKeys,
    });
    await input.logger.debug('initial_generation_result', {
      runId: input.runId,
      projectId: input.projectId,
      sessionId: input.sessionId,
      accepted: true,
      outcome,
      repairAttempted,
      assistantResponse,
      committedPhaseKeys: commitContext.committedPhaseKeys,
      committedTaskNodeKeys: commitContext.committedTaskNodeKeys,
    });
    const tasksAfter = await finishSuccessfulRun(input, assistantResponse);

    return {
      ok: true,
      outcome,
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
