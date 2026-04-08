import type { CompiledInitialSchedule, GenerationBrief, ModelRoutingDecision } from './types.js';

export type InitialGenerationServices = {
  commandService: unknown;
  messageService: unknown;
  taskService: unknown;
};

export type InitialGenerationLogger = {
  debug(event: string, payload: Record<string, unknown>): void | Promise<void>;
};

export type RunInitialGenerationInput = {
  projectId: string;
  sessionId: string;
  runId: string;
  userMessage: string;
  tasksBefore: Array<{ id: string; name: string }>;
  brief?: GenerationBrief;
  modelRoutingDecision?: ModelRoutingDecision;
  services: InitialGenerationServices;
  logger: InitialGenerationLogger;
};

export async function runInitialGeneration(
  input: RunInitialGenerationInput,
): Promise<CompiledInitialSchedule> {
  await input.logger.debug('initial_generation_not_implemented', {
    runId: input.runId,
    projectId: input.projectId,
    sessionId: input.sessionId,
    taskCountBefore: input.tasksBefore.length,
  });

  throw new Error('initial_generation orchestration is not implemented yet');
}
