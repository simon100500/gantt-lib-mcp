import { writeDebugLog } from '@gantt/mcp/debug-log';

export async function writeServerDebugLog(event: string, payload: Record<string, unknown> = {}): Promise<void> {
  await writeDebugLog({
    source: 'server',
    event,
    userId: typeof payload.userId === 'string' ? payload.userId : undefined,
    projectId: typeof payload.projectId === 'string' ? payload.projectId : undefined,
    sessionId: typeof payload.sessionId === 'string' ? payload.sessionId : undefined,
    runId: typeof payload.runId === 'string' ? payload.runId : undefined,
    attempt: typeof payload.attempt === 'number' ? payload.attempt : undefined,
    tool: typeof payload.tool === 'string' ? payload.tool : undefined,
    toolUseId: typeof payload.toolUseId === 'string' ? payload.toolUseId : undefined,
    aiMutationSource: typeof payload.aiMutationSource === 'string' ? payload.aiMutationSource : undefined,
    payload,
  });
}
