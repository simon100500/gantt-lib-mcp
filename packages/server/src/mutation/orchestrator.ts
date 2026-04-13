import { classifyMutationIntent } from './intent-classifier.js';
import { executeMutationPlan } from './execution.js';
import { selectMutationExecutionMode } from './execution-routing.js';
import {
  buildMutationFailureMessage,
  buildMutationSuccessMessage,
} from './messages.js';
import { buildMutationPlan } from './plan-builder.js';
import { resolveMutationContext } from './resolver.js';
import type { ServerMessage } from '../ws.js';
import type {
  MutationExecutionMode,
  MutationFailureReason,
  MutationOrchestrationResult,
  MutationTaskSnapshot,
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
  stage: 'mutation_semantic_extraction';
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
  };
  messageService: MutationServices['messageService'];
  taskService: MutationServices['taskService'];
  commandService: MutationServices['commandService'];
  broadcastToSession: (sessionId: string, message: ServerMessage) => void;
  logger: MutationLogger;
  semanticIntentQuery?: (input: MutationSemanticIntentQueryInput) => Promise<MutationSemanticIntentQueryResult>;
};

function buildDeferredResult(executionMode: MutationExecutionMode): MutationOrchestrationResult['result'] {
  return {
    status: 'deferred_to_legacy',
    executionMode,
    committedCommandTypes: [],
    changedTaskIds: [],
    verificationVerdict: 'not_run',
    userFacingMessage: '',
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

  if (intentType === 'add_single_task') {
    if (resolutionContext.selectedContainerId && resolutionContext.placementPolicy === 'unresolved') {
      return 'placement_not_resolved';
    }
    return 'container_not_resolved';
  }

  return 'unsupported_mutation_shape';
}

export async function runStagedMutation(
  input: RunStagedMutationInput,
): Promise<MutationOrchestrationResult> {
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
  await input.logger.debug('execution_mode_selected', {
    runId: input.runId,
    projectId: input.projectId,
    sessionId: input.sessionId,
    executionMode,
  });

  let resolutionContext: ResolvedMutationContext | null = null;
  if (intent.requiresResolution) {
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
