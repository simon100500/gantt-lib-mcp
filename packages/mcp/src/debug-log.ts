import { writeDebugLog } from './debug-log-store.js';

export async function writeMcpDebugLog(event: string, payload: Record<string, unknown> = {}): Promise<void> {
  await writeDebugLog({
    source: 'mcp',
    event,
    userId: process.env.AI_USER_ID,
    projectId: typeof payload.projectId === 'string' ? payload.projectId : process.env.PROJECT_ID,
    sessionId: typeof payload.sessionId === 'string' ? payload.sessionId : process.env.AI_SESSION_ID,
    runId: typeof payload.runId === 'string' ? payload.runId : process.env.AI_RUN_ID,
    attempt: typeof payload.attempt === 'number'
      ? payload.attempt
      : (process.env.AI_ATTEMPT ? Number.parseInt(process.env.AI_ATTEMPT, 10) : undefined),
    tool: typeof payload.tool === 'string' ? payload.tool : undefined,
    toolUseId: typeof payload.toolUseId === 'string' ? payload.toolUseId : undefined,
    aiMutationSource: typeof payload.aiMutationSource === 'string'
      ? payload.aiMutationSource
      : process.env.AI_MUTATION_SOURCE,
    payload: {
      aiRunId: process.env.AI_RUN_ID,
      aiSessionId: process.env.AI_SESSION_ID,
      aiAttempt: process.env.AI_ATTEMPT,
      aiMutationSource: process.env.AI_MUTATION_SOURCE,
      aiUserId: process.env.AI_USER_ID,
      ...payload,
    },
  });
}
