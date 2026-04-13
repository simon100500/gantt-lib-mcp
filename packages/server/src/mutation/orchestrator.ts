import { classifyMutationIntent } from './intent-classifier.js';
import { selectMutationExecutionMode } from './execution-routing.js';
import type {
  MutationExecutionMode,
  MutationOrchestrationResult,
  MutationTaskSnapshot,
} from './types.js';

type MutationServices = {
  messageService: {
    add(role: 'user' | 'assistant', content: string, projectId: string): Promise<unknown>;
  };
  taskService: {
    list(projectId: string): Promise<{ tasks: MutationTaskSnapshot[] }>;
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
  services: MutationServices;
  broadcastToSession: (sessionId: string, message: unknown) => void;
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

  return {
    handled: false,
    status: 'deferred_to_legacy',
    legacyFallbackAllowed: true,
    intent: {
      ...intent,
      executionMode,
    },
    executionMode,
    resolutionContext: null,
    plan: null,
    result: buildDeferredResult(executionMode),
  };
}
