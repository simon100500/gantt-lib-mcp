import { writeDebugLog } from '@gantt/mcp/debug-log';

const SUPPRESSED_SERVER_DEBUG_EVENTS = new Set([
  'ws_authenticated',
  'ws_broadcast',
  'ws_chat_message',
  'ws_closed',
  'sdk_text_delta',
  'sdk_thinking_delta',
  'sdk_assistant_message',
  'agent_env_resolved',
  'agent_prompt_built',
  'route_decision_evidence',
]);

export async function writeServerDebugLog(event: string, payload: Record<string, unknown> = {}): Promise<void> {
  if (SUPPRESSED_SERVER_DEBUG_EVENTS.has(event)) {
    return;
  }

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
