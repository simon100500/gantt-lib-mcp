import type {
  AgentOpenThreadOperationKind,
  AgentOpenThreadState,
  AgentSessionSnapshotMessage,
  AgentSessionStateRecord,
  Message,
} from '@gantt/runtime-core/types';

const MAX_SNAPSHOT_MESSAGES = 12;

function clipText(value: string, limit: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= limit) {
    return trimmed;
  }

  return `${trimmed.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

function isShortFollowUp(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  return normalized.length <= 24
    || ['да', 'нет', 'во всех', 'туда же', 'сделай так же', 'а теперь свяжи их'].includes(normalized);
}

function inferOperationKind(value: string): AgentOpenThreadOperationKind | null {
  const text = value.toLowerCase();
  if (/свяж|link|dependency|зависим/.test(text)) return 'link';
  if (/сдвин|перенес|move|shift/.test(text)) return 'move';
  if (/добав|созда|create|insert/.test(text)) return 'create';
  if (/разбей|split/.test(text)) return 'split';
  if (/проверь|validate|диагност/.test(text)) return 'validate';
  if (/удал|delete/.test(text)) return 'delete';
  if (/измени|обнов|rename|update/.test(text)) return 'update';
  return null;
}

function extractTargetEntityHints(...values: Array<string | null | undefined>): string[] {
  const hints = values
    .flatMap((value) => (value ?? '').split(/[\n,.!?;:()]/g))
    .map((part) => part.trim())
    .filter((part) => part.length >= 3)
    .filter((part) => /[A-Za-zА-Яа-я0-9]/.test(part));

  return [...new Set(hints)].slice(0, 6);
}

function buildRollingSummary(input: {
  priorSummary?: string | null;
  recentMessages: Message[];
  openThreads: AgentOpenThreadState | null;
}): string | null {
  const lastUser = [...input.recentMessages].reverse().find((message) => message.role === 'user')?.content ?? null;
  const lastAssistant = [...input.recentMessages].reverse().find((message) => message.role === 'assistant')?.content ?? null;
  const lines = [
    input.priorSummary?.trim() ? `Previous summary: ${clipText(input.priorSummary, 240)}` : null,
    lastUser ? `Latest user intent: ${clipText(lastUser, 240)}` : null,
    lastAssistant ? `Latest assistant outcome: ${clipText(lastAssistant, 240)}` : null,
    input.openThreads?.unresolved && input.openThreads.recentAssistantQuestion
      ? `Open thread: ${clipText(input.openThreads.recentAssistantQuestion, 240)}`
      : null,
  ].filter((line): line is string => Boolean(line));

  return lines.length > 0 ? lines.join('\n') : null;
}

export function buildSessionOpenThreadState(input: {
  userMessage: string;
  assistantResponse?: string | null;
  priorOpenThreads?: AgentOpenThreadState | null;
  mutationAccepted?: boolean;
}): AgentOpenThreadState | null {
  const assistantResponse = input.assistantResponse?.trim() ?? '';
  const assistantAskedQuestion = assistantResponse.endsWith('?');
  const operationKind = inferOperationKind(input.userMessage)
    ?? input.priorOpenThreads?.activeOperationKind
    ?? inferOperationKind(assistantResponse);

  if (!assistantAskedQuestion && input.mutationAccepted) {
    return null;
  }

  if (!assistantAskedQuestion && !isShortFollowUp(input.userMessage) && !input.priorOpenThreads?.unresolved) {
    return null;
  }

  return {
    unresolved: assistantAskedQuestion || Boolean(input.priorOpenThreads?.unresolved && isShortFollowUp(input.userMessage)),
    activeOperationKind: operationKind,
    recentAssistantQuestion: assistantAskedQuestion ? clipText(assistantResponse, 400) : input.priorOpenThreads?.recentAssistantQuestion ?? null,
    lastUserMessage: clipText(input.userMessage, 240),
    lastAssistantMessage: assistantResponse ? clipText(assistantResponse, 240) : input.priorOpenThreads?.lastAssistantMessage ?? null,
    targetEntityHints: extractTargetEntityHints(
      input.priorOpenThreads?.lastUserMessage,
      input.priorOpenThreads?.recentAssistantQuestion,
      input.userMessage,
      assistantResponse,
    ),
  };
}

export function buildSessionSnapshotMessages(messages: Message[]): AgentSessionSnapshotMessage[] {
  return messages
    .filter((message) => message.deletedAt == null)
    .slice(-MAX_SNAPSHOT_MESSAGES)
    .map((message) => ({
      role: message.role,
      content: clipText(message.content, 4_000),
      timestamp: new Date(message.createdAt).getTime(),
    }));
}

export function buildRouteContextSummary(input: {
  sessionState?: AgentSessionStateRecord | null;
  recentMessages: Message[];
}): string {
  const lines = [
    input.sessionState?.rollingSummary?.trim() ?? null,
    input.sessionState?.openThreads?.unresolved
      ? `Open thread: ${input.sessionState.openThreads.recentAssistantQuestion ?? input.sessionState.openThreads.lastAssistantMessage ?? 'unresolved follow-up'}`
      : null,
    ...input.recentMessages.slice(-4).map((message) => `${message.role}: ${clipText(message.content, 160)}`),
  ].filter((line): line is string => Boolean(line));

  return lines.join('\n');
}

export function buildSessionStateFromTranscript(input: {
  projectId: string;
  recentMessages: Message[];
  priorState?: AgentSessionStateRecord | null;
  userMessage?: string;
  assistantResponse?: string | null;
  mutationAccepted?: boolean;
}): {
  messagesSnapshot: AgentSessionSnapshotMessage[];
  rollingSummary: string | null;
  openThreads: AgentOpenThreadState | null;
} {
  const fallbackUserMessage = input.userMessage
    ?? [...input.recentMessages].reverse().find((message) => message.role === 'user')?.content
    ?? '';
  const fallbackAssistantResponse = input.assistantResponse
    ?? [...input.recentMessages].reverse().find((message) => message.role === 'assistant')?.content
    ?? null;
  const openThreads = buildSessionOpenThreadState({
    userMessage: fallbackUserMessage,
    assistantResponse: fallbackAssistantResponse,
    priorOpenThreads: input.priorState?.openThreads ?? null,
    mutationAccepted: input.mutationAccepted,
  });

  return {
    messagesSnapshot: buildSessionSnapshotMessages(input.recentMessages),
    rollingSummary: buildRollingSummary({
      priorSummary: input.priorState?.rollingSummary ?? null,
      recentMessages: input.recentMessages,
      openThreads,
    }),
    openThreads,
  };
}
