import { randomUUID } from 'node:crypto';

import { classifyMutationIntent } from './intent-classifier.js';
import { executeMutationPlan } from './execution.js';
import { selectMutationExecutionMode } from './execution-routing.js';
import { compileSemanticMutationPlan } from './semantic-compiler.js';
import {
  buildMutationFailureMessage,
  buildMutationSuccessMessage,
} from './messages.js';
import { buildMutationPlan } from './plan-builder.js';
import { resolveMutationContext } from './resolver.js';
import { planSemanticMutation } from './semantic-planner.js';
import { resolveSemanticMutationPlan } from './semantic-resolver.js';
import type { ServerMessage } from '../ws.js';
import type {
  MutationHistoryContext,
  MutationExecutionMode,
  MutationFailureReason,
  MutationOrchestrationResult,
  MutationTaskSnapshot,
  MutationRouteEnvelope,
  ResolvedMutationContext,
} from './types.js';

type TaskSearchMatch = {
  taskId: string;
  name: string;
  parentId: string | null;
  path: string[];
  startDate: string;
  endDate: string;
  matchType: 'exact' | 'includes' | 'token';
  score: number;
};

type GroupScopeMatch = {
  key: string;
  label: string;
  rootTaskId: string;
  memberTaskIds: string[];
  memberNames: string[];
};

type MutationServices = {
  messageService: {
    add(role: 'user' | 'assistant', content: string, projectId: string): Promise<unknown>;
  };
  taskService: {
    list(projectId: string): Promise<{ tasks: MutationTaskSnapshot[] }>;
    findTasksByName(projectId: string, query: string, limit?: number): Promise<TaskSearchMatch[]>;
    findContainerCandidates(projectId: string, query: string, limit?: number): Promise<TaskSearchMatch[]>;
    listBranchTasks(projectId: string, rootTaskId: string): Promise<TaskSearchMatch[]>;
    findGroupScopes(projectId: string, hint: string): Promise<GroupScopeMatch[]>;
  };
  commandService: {
    commitCommand(...args: unknown[]): Promise<unknown>;
  };
};

type MutationLogger = {
  debug(event: string, payload: Record<string, unknown>): void | Promise<void>;
};

type MutationSemanticIntentQueryInput = {
  prompt: string;
  model: string;
  stage: 'mutation_semantic_extraction' | 'mutation_semantic_planner';
};

type MutationSemanticIntentQueryResult = string | { content?: string };

export type RunStagedMutationInput = {
  userMessage: string;
  projectId: string;
  projectVersion: number;
  sessionId: string;
  runId: string;
  tasksBefore: MutationTaskSnapshot[];
  env: {
    OPENAI_API_KEY: string;
    OPENAI_BASE_URL: string;
    OPENAI_MODEL: string;
    OPENAI_CHEAP_MODEL?: string;
    USE_SEMANTIC_PLANNER?: string;
  };
  messageService: MutationServices['messageService'];
  taskService: MutationServices['taskService'];
  commandService: MutationServices['commandService'];
  broadcastToSession: (sessionId: string, message: ServerMessage) => void;
  logger: MutationLogger;
  semanticIntentQuery?: (input: MutationSemanticIntentQueryInput) => Promise<MutationSemanticIntentQueryResult>;
} & Partial<MutationHistoryContext>;

function useSemanticPlanner(input: RunStagedMutationInput): boolean {
  const flag = input.env.USE_SEMANTIC_PLANNER ?? process.env.USE_SEMANTIC_PLANNER ?? 'false';
  return flag !== 'false';
}

function buildDeferredResult(executionMode: MutationExecutionMode): MutationOrchestrationResult['result'] {
  return {
    status: 'deferred_to_legacy',
    executionMode,
    committedCommandTypes: [],
    changedTaskIds: [],
    verificationVerdict: 'not_run',
    userFacingMessage: '',
    historyUndoable: false,
  };
}

function resolveHistoryContext(input: RunStagedMutationInput): MutationHistoryContext {
  const requestContextId = input.requestContextId ?? input.runId;
  const normalizedMessage = input.userMessage.trim().replace(/\s+/g, ' ');
  return {
    groupId: input.groupId ?? randomUUID(),
    requestContextId,
    historyTitle: input.historyTitle ?? (normalizedMessage.length > 0 ? `AI — ${normalizedMessage}` : 'AI — Изменение графика'),
    historyUndoable: input.historyUndoable ?? true,
  };
}

function buildNonUndoableHistory(input: RunStagedMutationInput): MutationHistoryContext {
  const history = resolveHistoryContext(input);
  return {
    groupId: history.groupId,
    requestContextId: history.requestContextId,
    historyTitle: 'AI — Неотменяемое действие',
    historyUndoable: false,
  };
}

async function buildControlledFailure(
  input: RunStagedMutationInput,
  executionMode: MutationExecutionMode,
  failureReason: MutationFailureReason,
  resolutionContext: ResolvedMutationContext | null,
  plan: MutationOrchestrationResult['plan'],
  userFacingMessage: string,
  intent: MutationOrchestrationResult['intent'],
): Promise<MutationOrchestrationResult> {
  const history = buildNonUndoableHistory(input);
  const result: MutationOrchestrationResult = {
    handled: true,
    status: 'failed',
    legacyFallbackAllowed: false,
    failureReason,
    intent,
    executionMode,
    resolutionContext,
    plan,
    result: {
      status: 'failed',
      executionMode,
      committedCommandTypes: [],
      changedTaskIds: [],
      verificationVerdict: 'not_run',
      userFacingMessage,
      ...history,
      failureReason,
    },
    assistantResponse: userFacingMessage,
  };

  await input.logger.debug('final_outcome', {
    runId: input.runId,
    projectId: input.projectId,
    sessionId: input.sessionId,
    status: result.status,
    executionMode,
    failureReason,
    changedTaskIds: result.result.changedTaskIds,
    verificationVerdict: result.result.verificationVerdict,
  });

  return result;
}

function hasTiedTopTaskScores(resolutionContext: ResolvedMutationContext): boolean {
  if (resolutionContext.tasks.length < 2) {
    return false;
  }

  const [first, second] = resolutionContext.tasks;
  return typeof first?.score === 'number'
    && typeof second?.score === 'number'
    && first.score === second.score;
}

function resolveFailureReason(
  intentType: MutationOrchestrationResult['intent']['intentType'],
  resolutionContext: ResolvedMutationContext,
): MutationFailureReason {
  if (hasTiedTopTaskScores(resolutionContext)) {
    return 'multiple_low_confidence_targets';
  }

  if (
    intentType === 'shift_relative'
    || intentType === 'change_duration'
    || intentType === 'move_to_date'
    || intentType === 'rename_task'
    || intentType === 'update_metadata'
    || intentType === 'delete_task'
    || intentType === 'link_tasks'
    || intentType === 'unlink_tasks'
  ) {
    return 'anchor_not_found';
  }

  if (intentType === 'add_repeated_fragment') {
    return 'group_scope_not_resolved';
  }

  if (intentType === 'expand_wbs') {
    return 'expansion_anchor_not_resolved';
  }

  if (intentType === 'decompose_task') {
    return 'anchor_not_found';
  }

  if (intentType === 'add_single_task') {
    if (resolutionContext.selectedContainerId && resolutionContext.placementPolicy === 'unresolved') {
      return 'placement_not_resolved';
    }
    return 'container_not_resolved';
  }

  return 'unsupported_mutation_shape';
}

function mapSemanticActionToIntentType(
  operation: { action: string; moveMode?: string } | undefined,
): MutationOrchestrationResult['intent']['intentType'] {
  switch (operation?.action) {
    case 'add_task':
      return 'add_single_task';
    case 'change_duration':
      return 'change_duration';
    case 'move_task':
      if (operation.moveMode === 'relative_delta') {
        return 'shift_relative';
      }
      if (operation.moveMode === 'to_parent') {
        return 'move_in_hierarchy';
      }
      return 'move_to_date';
    case 'rename_task':
      return 'rename_task';
    case 'delete_task':
      return 'delete_task';
    case 'link_tasks':
      return 'link_tasks';
    case 'unlink_tasks':
      return 'unlink_tasks';
    case 'move_in_hierarchy':
      return 'move_in_hierarchy';
    default:
      return 'unsupported_or_ambiguous';
  }
}

function buildSemanticCompatIntent(
  input: RunStagedMutationInput,
  operation: { action: string; moveMode?: string } | undefined,
  executionMode: MutationExecutionMode,
): MutationOrchestrationResult['intent'] {
  const intentType = mapSemanticActionToIntentType(operation);
  const routeEnvelope: MutationRouteEnvelope = {
    route: executionMode === 'full_agent' ? 'agent_path' : 'fast_path',
    intentFamily: 'semantic_planner',
    intentType,
    confidence: 1,
    riskLevel: executionMode === 'full_agent' ? 'S3' : 'S1',
    params: {},
    ambiguities: [],
  };

  return {
    routeEnvelope,
    intentType,
    confidence: 1,
    rawRequest: input.userMessage.trim(),
    normalizedRequest: input.userMessage.trim().replace(/\s+/g, ' ').toLowerCase(),
    entitiesMentioned: [],
    requiresResolution: true,
    requiresSchedulingPlacement: operation?.action === 'add_task',
    executionMode,
  };
}

export async function runStagedMutation(
  input: RunStagedMutationInput,
): Promise<MutationOrchestrationResult> {
  if (useSemanticPlanner(input)) {
    const semanticPlan = await planSemanticMutation({
      userMessage: input.userMessage,
      env: input.env,
      semanticPlannerQuery: input.semanticIntentQuery
        ? (queryInput) => input.semanticIntentQuery?.({
            prompt: queryInput.prompt,
            model: queryInput.model,
            stage: 'mutation_semantic_planner',
          }) ?? Promise.resolve('')
        : undefined,
    });
    const executionMode: MutationExecutionMode = 'deterministic';
    const semanticIntent = buildSemanticCompatIntent(input, semanticPlan.operations[0], executionMode);

    await input.logger.debug('semantic_plan_created', {
      runId: input.runId,
      projectId: input.projectId,
      sessionId: input.sessionId,
      semanticPlan,
    });

    if (semanticPlan.ambiguity !== 'none') {
      return {
        handled: false,
        status: 'deferred_to_legacy',
        legacyFallbackAllowed: true,
        failureReason: undefined,
        intent: semanticIntent,
        executionMode: 'full_agent',
        resolutionContext: null,
        plan: null,
        result: buildDeferredResult('full_agent'),
      };
    }

    await input.logger.debug('semantic_resolution_started', {
      runId: input.runId,
      projectId: input.projectId,
      sessionId: input.sessionId,
      operationCount: semanticPlan.operations.length,
    });

    const resolvedSemanticPlan = await resolveSemanticMutationPlan({
      projectId: input.projectId,
      plan: semanticPlan,
      taskService: input.taskService,
    });

    await input.logger.debug('semantic_resolution_result', {
      runId: input.runId,
      projectId: input.projectId,
      sessionId: input.sessionId,
      resolvedSemanticPlan,
    });

    if (resolvedSemanticPlan.ambiguity !== 'none') {
      return {
        handled: false,
        status: 'deferred_to_legacy',
        legacyFallbackAllowed: true,
        failureReason: undefined,
        intent: semanticIntent,
        executionMode: 'full_agent',
        resolutionContext: null,
        plan: null,
        result: buildDeferredResult('full_agent'),
      };
    }

    const compiledSemanticPlan = compileSemanticMutationPlan({
      projectId: input.projectId,
      tasksBefore: input.tasksBefore,
      resolvedPlan: resolvedSemanticPlan,
    });

    await input.logger.debug('semantic_compile_result', {
      runId: input.runId,
      projectId: input.projectId,
      sessionId: input.sessionId,
      compiledSemanticPlan,
    });

    if (compiledSemanticPlan.ambiguity !== 'none') {
      return {
        handled: false,
        status: 'deferred_to_legacy',
        legacyFallbackAllowed: true,
        failureReason: undefined,
        intent: semanticIntent,
        executionMode: 'full_agent',
        resolutionContext: null,
        plan: null,
        result: buildDeferredResult('full_agent'),
      };
    }

    const history = resolveHistoryContext(input);
    const execution = await executeMutationPlan({
      projectId: input.projectId,
      projectVersion: input.projectVersion,
      tasksBefore: input.tasksBefore,
      plan: compiledSemanticPlan.plan,
      history: {
        groupId: history.groupId,
        requestContextId: history.requestContextId,
        historyTitle: history.historyTitle,
        historyUndoable: history.historyUndoable,
      },
      commandService: input.commandService as Parameters<typeof executeMutationPlan>[0]['commandService'],
    });

    const tasksAfter = execution.status === 'completed'
      ? (await input.taskService.list(input.projectId)).tasks
      : input.tasksBefore;
    const knownChangedTasks = Array.from(
      new Map(
        [...tasksAfter, ...input.tasksBefore].map((task) => [task.id, task]),
      ).values(),
    );
    const userFacingMessage = execution.status === 'completed'
      ? buildMutationSuccessMessage({
          changedTaskIds: execution.changedTaskIds,
          changedTasks: knownChangedTasks,
        })
      : buildMutationFailureMessage(execution.failureReason ?? 'deterministic_execution_failed', {
          details: execution.userFacingMessage,
        });
    const result = {
      ...execution,
      userFacingMessage,
    };

    await input.logger.debug('final_outcome', {
      runId: input.runId,
      projectId: input.projectId,
      sessionId: input.sessionId,
      status: execution.status,
      executionMode,
      failureReason: execution.failureReason,
      changedTaskIds: execution.changedTaskIds,
      verificationVerdict: execution.verificationVerdict,
    });

    return {
      handled: true,
      status: execution.status,
      legacyFallbackAllowed: false,
      failureReason: execution.failureReason,
      intent: semanticIntent,
      executionMode,
      resolutionContext: null,
      plan: compiledSemanticPlan.plan,
      result,
      assistantResponse: result.userFacingMessage,
      tasksAfter,
    };
  }

  const history = resolveHistoryContext(input);
  const intent = await classifyMutationIntent({
    userMessage: input.userMessage,
    env: input.env,
    semanticIntentQuery: input.semanticIntentQuery,
  });
  await input.logger.debug('intent_classified', {
    runId: input.runId,
    projectId: input.projectId,
    sessionId: input.sessionId,
    intent,
  });

  const executionMode = selectMutationExecutionMode(intent);
  await input.logger.debug('route_selected', {
    runId: input.runId,
    projectId: input.projectId,
    sessionId: input.sessionId,
    route: intent.routeEnvelope.route,
    intentType: intent.intentType,
    riskLevel: intent.routeEnvelope.riskLevel,
    routeConfidence: intent.routeEnvelope.confidence,
    executionMode,
  });

  let resolutionContext: ResolvedMutationContext | null = null;
  if (intent.requiresResolution && intent.routeEnvelope.route !== 'clarify') {
    await input.logger.debug('resolution_started', {
      runId: input.runId,
      projectId: input.projectId,
      sessionId: input.sessionId,
      resolutionQuery: intent.normalizedRequest,
    });

    resolutionContext = await resolveMutationContext({
      projectId: input.projectId,
      projectVersion: input.projectVersion,
      intent: {
        ...intent,
        executionMode,
      },
      userMessage: input.userMessage,
      taskService: input.taskService,
    });

    await input.logger.debug('resolution_result', {
      runId: input.runId,
      projectId: input.projectId,
      sessionId: input.sessionId,
      resolutionContext,
    });
  }

  if (intent.routeEnvelope.route === 'clarify') {
    return buildControlledFailure(
      input,
      executionMode,
      'unsupported_mutation_shape',
      resolutionContext,
      null,
      buildMutationFailureMessage('unsupported_mutation_shape', {
        details: intent.routeEnvelope.ambiguities.join(', '),
        resolutionContext,
      }),
      {
        ...intent,
        executionMode,
      },
    );
  }

  if (intent.routeEnvelope.route === 'agent_path') {
    return buildControlledFailure(
      input,
      executionMode,
      'unsupported_mutation_shape',
      resolutionContext,
      null,
      buildMutationFailureMessage('unsupported_mutation_shape', {
        details: 'Требуется расширенный агентный маршрут для этой операции.',
        resolutionContext,
      }),
      {
        ...intent,
        executionMode,
      },
    );
  }

  if (intent.routeEnvelope.route === 'specialized_fast_path' && intent.intentType === 'decompose_task') {
    if (!resolutionContext?.specializedExecutor?.ready) {
      const failureReason = resolveFailureReason(
        intent.intentType,
        resolutionContext ?? {
          projectId: input.projectId,
          projectVersion: input.projectVersion,
          resolutionQuery: intent.normalizedRequest,
          containers: [],
          groupMemberIds: [],
          tasks: [],
          predecessors: [],
          successors: [],
          selectedContainerId: null,
          selectedPredecessorTaskId: null,
          selectedSuccessorTaskId: null,
          placementPolicy: 'unresolved',
          confidence: 0,
          ambiguities: intent.routeEnvelope.ambiguities,
        },
      );
      return buildControlledFailure(
        input,
        executionMode,
        failureReason,
        resolutionContext,
        null,
        buildMutationFailureMessage(failureReason, { resolutionContext }),
        {
          ...intent,
          executionMode,
        },
      );
    }

    return buildControlledFailure(
      input,
      executionMode,
      'unsupported_mutation_shape',
      resolutionContext,
      null,
      buildMutationFailureMessage('unsupported_mutation_shape', {
        details: 'Специализированный split-task handoff будет подключен в следующем плане.',
        resolutionContext,
      }),
      {
        ...intent,
        executionMode,
      },
    );
  }

  if (executionMode === 'full_agent' || intent.intentType === 'unsupported_or_ambiguous') {
    return {
      handled: false,
      status: 'deferred_to_legacy',
      legacyFallbackAllowed: true,
      failureReason: undefined,
      intent: {
        ...intent,
        executionMode,
      },
      executionMode,
      resolutionContext,
      plan: null,
      result: buildDeferredResult(executionMode),
    };
  }

  if (resolutionContext && hasTiedTopTaskScores(resolutionContext)) {
    const failureReason = 'multiple_low_confidence_targets';
    return buildControlledFailure(
      input,
      executionMode,
      failureReason,
      resolutionContext,
      null,
      buildMutationFailureMessage(failureReason, { resolutionContext }),
      {
        ...intent,
        executionMode,
      },
    );
  }

  if (resolutionContext && resolutionContext.confidence >= 0.7) {
    const plan = await buildMutationPlan({
      intent: {
        ...intent,
        executionMode,
      },
      resolutionContext,
      userMessage: input.userMessage,
      tasksBefore: input.tasksBefore,
    });

    await input.logger.debug('mutation_plan_built', {
      runId: input.runId,
      projectId: input.projectId,
      sessionId: input.sessionId,
      plan,
    });

    if (plan.needsAgentExecution) {
      return {
        handled: false,
        status: 'deferred_to_legacy',
        legacyFallbackAllowed: true,
        failureReason: undefined,
        intent: {
          ...intent,
          executionMode,
        },
        executionMode,
        resolutionContext,
        plan,
        result: buildDeferredResult(executionMode),
      };
    }

    await input.logger.debug('deterministic_execution_started', {
      runId: input.runId,
      projectId: input.projectId,
      sessionId: input.sessionId,
      executionMode,
      operationKinds: plan.operations.map((operation) => operation.kind),
    });

    const execution = await executeMutationPlan({
      projectId: input.projectId,
      projectVersion: input.projectVersion,
      tasksBefore: input.tasksBefore,
      plan,
      history: {
        groupId: history.groupId,
        requestContextId: history.requestContextId,
        historyTitle: history.historyTitle,
        historyUndoable: history.historyUndoable,
      },
      commandService: input.commandService as Parameters<typeof executeMutationPlan>[0]['commandService'],
    });

    await input.logger.debug('execution_committed', {
      runId: input.runId,
      projectId: input.projectId,
      sessionId: input.sessionId,
      committedCommandTypes: execution.committedCommandTypes,
      changedTaskIds: execution.changedTaskIds,
    });

    await input.logger.debug('verification_result', {
      runId: input.runId,
      projectId: input.projectId,
      sessionId: input.sessionId,
      verificationVerdict: execution.verificationVerdict,
      expectedChangedTaskIds: plan.expectedChangedTaskIds,
      changedTaskIds: execution.changedTaskIds,
    });

    const tasksAfter = execution.status === 'completed'
      ? (await input.taskService.list(input.projectId)).tasks
      : input.tasksBefore;
    const knownChangedTasks = Array.from(
      new Map(
        [...tasksAfter, ...input.tasksBefore].map((task) => [task.id, task]),
      ).values(),
    );
    const userFacingMessage = execution.status === 'completed'
      ? buildMutationSuccessMessage({
          changedTaskIds: execution.changedTaskIds,
          changedTasks: knownChangedTasks,
        })
      : buildMutationFailureMessage(execution.failureReason ?? 'deterministic_execution_failed', {
          details: execution.userFacingMessage,
          resolutionContext,
        });
    const resultHistory = execution.status === 'completed'
      ? {
          groupId: execution.groupId ?? history.groupId,
          requestContextId: execution.requestContextId ?? history.requestContextId,
          historyTitle: execution.historyTitle ?? history.historyTitle,
          historyUndoable: execution.historyUndoable ?? history.historyUndoable,
        }
      : buildNonUndoableHistory({ ...input, ...history });
    const result = {
      ...execution,
      userFacingMessage,
      ...resultHistory,
    };

    await input.logger.debug('final_outcome', {
      runId: input.runId,
      projectId: input.projectId,
      sessionId: input.sessionId,
      status: execution.status,
      executionMode,
      failureReason: execution.failureReason,
      changedTaskIds: execution.changedTaskIds,
      verificationVerdict: execution.verificationVerdict,
    });

    return {
      handled: true,
      status: execution.status,
      legacyFallbackAllowed: false,
      failureReason: execution.failureReason,
      intent: {
        ...intent,
        executionMode,
      },
      executionMode,
      resolutionContext,
      plan,
      result,
      assistantResponse: result.userFacingMessage,
      tasksAfter,
    };
  }

  if (resolutionContext && resolutionContext.confidence < 0.7) {
    const failureReason = resolveFailureReason(intent.intentType, resolutionContext);
    return buildControlledFailure(
      input,
      executionMode,
      failureReason,
      resolutionContext,
      null,
      buildMutationFailureMessage(failureReason, { resolutionContext }),
      {
        ...intent,
        executionMode,
      },
    );
  }

  return buildControlledFailure(
    input,
    executionMode,
    'unsupported_mutation_shape',
    resolutionContext,
    null,
    buildMutationFailureMessage('unsupported_mutation_shape', { resolutionContext }),
    {
      ...intent,
      executionMode,
    },
  );
}
