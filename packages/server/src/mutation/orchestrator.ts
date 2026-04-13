import { classifyMutationIntent } from './intent-classifier.js';
import { selectMutationExecutionMode } from './execution-routing.js';
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

export type RunStagedMutationInput = {
  userMessage: string;
  projectId: string;
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

function buildControlledFailure(
  executionMode: MutationExecutionMode,
  failureReason: MutationFailureReason,
  resolutionContext: ResolvedMutationContext | null,
  userFacingMessage: string,
  intent: MutationOrchestrationResult['intent'],
): MutationOrchestrationResult {
  return {
    handled: true,
    status: 'failed',
    legacyFallbackAllowed: false,
    failureReason,
    intent,
    executionMode,
    resolutionContext,
    plan: null,
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

function buildFailureMessage(failureReason: MutationFailureReason): string {
  switch (failureReason) {
    case 'anchor_not_found':
      return 'Не удалось надежно определить целевую задачу для этого изменения.';
    case 'multiple_low_confidence_targets':
      return 'Нашлось несколько одинаково вероятных целей. Уточните, какую именно задачу нужно изменить.';
    case 'container_not_resolved':
      return 'Не удалось определить контейнер, куда нужно добавить работу.';
    case 'placement_not_resolved':
      return 'Контейнер найден, но не удалось определить точное место вставки.';
    case 'group_scope_not_resolved':
      return 'Не удалось определить повторяющиеся группы для массового добавления.';
    case 'expansion_anchor_not_resolved':
      return 'Не удалось определить пункт, который нужно детализировать.';
    default:
      return 'Этот тип изменения пока не поддерживается в staged-маршруте.';
  }
}

export async function runStagedMutation(
  input: RunStagedMutationInput,
): Promise<MutationOrchestrationResult> {
  const intent = classifyMutationIntent(input.userMessage);
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
      projectVersion: null,
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
      executionMode,
      failureReason,
      resolutionContext,
      buildFailureMessage(failureReason),
      {
        ...intent,
        executionMode,
      },
    );
  }

  if (resolutionContext && resolutionContext.confidence >= 0.7) {
    return buildControlledFailure(
      executionMode,
      'unsupported_mutation_shape',
      resolutionContext,
      buildFailureMessage('unsupported_mutation_shape'),
      {
        ...intent,
        executionMode,
      },
    );
  }

  if (resolutionContext && resolutionContext.confidence < 0.7) {
    const failureReason = resolveFailureReason(intent.intentType, resolutionContext);
    return buildControlledFailure(
      executionMode,
      failureReason,
      resolutionContext,
      buildFailureMessage(failureReason),
      {
        ...intent,
        executionMode,
      },
    );
  }

  return buildControlledFailure(
    executionMode,
    'unsupported_mutation_shape',
    resolutionContext,
    buildFailureMessage('unsupported_mutation_shape'),
    {
      ...intent,
      executionMode,
    },
  );
}
