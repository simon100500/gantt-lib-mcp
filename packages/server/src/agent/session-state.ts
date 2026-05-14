import type {
  AgentScopeHint,
  AgentOpenThreadOperationKind,
  AgentOpenThreadState,
  AgentSessionSnapshotMessage,
  AgentSessionStateRecord,
  Message,
} from '@gantt/runtime-core/types';

export const AGENT_SESSION_SCHEMA_VERSION = 2;
export const AGENT_SESSION_COMPACTION_VERSION = 2;

const MAX_SNAPSHOT_MESSAGES = 8;
const MAX_ENTITY_HINTS = 6;

export type AgentMemoryToolFact = {
  name: string;
  changedTaskIds?: string[];
  resolvedTaskIds?: string[];
  searchQuery?: string;
  status?: 'accepted' | 'rejected' | 'error' | 'ok';
};

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

  return [...new Set(hints)].slice(0, MAX_ENTITY_HINTS);
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => typeof value === 'string' && value.length > 0))];
}

function inferScopeHint(input: {
  userMessage: string;
  priorScopeHint?: AgentScopeHint | null;
  resolvedTaskIds: string[];
  createdTaskIds: string[];
}): AgentScopeHint | null {
  const text = input.userMessage.toLowerCase();

  if (/(во всех|все задачи|массов|весь проект|по всему проект)/.test(text)) {
    return 'project';
  }

  if (/(ветк|раздел|секци|этап|блок)/.test(text)) {
    return 'branch';
  }

  const targetCount = Math.max(input.resolvedTaskIds.length, input.createdTaskIds.length);
  if (targetCount > 1) {
    return 'multiple_tasks';
  }
  if (targetCount === 1) {
    return 'single_task';
  }

  return input.priorScopeHint ?? null;
}

function deriveStructuredMemory(input: {
  userMessage: string;
  priorOpenThreads?: AgentOpenThreadState | null;
  latestToolFacts?: AgentMemoryToolFact[];
}): Pick<
  AgentOpenThreadState,
  'lastResolvedTaskIds' | 'lastCreatedTaskIds' | 'lastMutationTool' | 'lastSearchQuery' | 'scopeHint'
> {
  const acceptedMutationFacts = (input.latestToolFacts ?? []).filter((fact) => (
    fact.status === 'accepted'
    && fact.name !== 'find_tasks'
  ));
  const latestMutationFact = acceptedMutationFacts.length > 0
    ? acceptedMutationFacts[acceptedMutationFacts.length - 1]
    : undefined;
  const latestSearchFact = [...(input.latestToolFacts ?? [])].reverse().find((fact) => fact.name === 'find_tasks');
  const resolvedTaskIds = uniqueStrings([
    ...(latestSearchFact?.resolvedTaskIds ?? []),
    ...(latestMutationFact?.changedTaskIds ?? []),
    ...(input.priorOpenThreads?.lastResolvedTaskIds ?? []),
  ]).slice(0, 12);
  const createdTaskIds = uniqueStrings([
    ...(latestMutationFact?.name === 'create_tasks' ? latestMutationFact.changedTaskIds ?? [] : []),
    ...(input.priorOpenThreads?.lastCreatedTaskIds ?? []),
  ]).slice(0, 12);

  return {
    lastResolvedTaskIds: resolvedTaskIds,
    lastCreatedTaskIds: createdTaskIds,
    lastMutationTool: latestMutationFact?.name ?? input.priorOpenThreads?.lastMutationTool ?? null,
    lastSearchQuery: latestSearchFact?.searchQuery ?? input.priorOpenThreads?.lastSearchQuery ?? null,
    scopeHint: inferScopeHint({
      userMessage: input.userMessage,
      priorScopeHint: input.priorOpenThreads?.scopeHint,
      resolvedTaskIds,
      createdTaskIds,
    }),
  };
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
    input.openThreads?.lastMutationTool ? `Last mutation tool: ${input.openThreads.lastMutationTool}` : null,
    input.openThreads?.lastResolvedTaskIds?.length
      ? `Resolved task ids: ${input.openThreads.lastResolvedTaskIds.slice(0, 6).join(', ')}`
      : null,
  ].filter((line): line is string => Boolean(line));

  return lines.length > 0 ? lines.join('\n') : null;
}

export function buildSessionOpenThreadState(input: {
  userMessage: string;
  assistantResponse?: string | null;
  priorOpenThreads?: AgentOpenThreadState | null;
  mutationAccepted?: boolean;
  latestToolFacts?: AgentMemoryToolFact[];
}): AgentOpenThreadState | null {
  const assistantResponse = input.assistantResponse?.trim() ?? '';
  const assistantAskedQuestion = assistantResponse.endsWith('?');
  const operationKind = inferOperationKind(input.userMessage)
    ?? input.priorOpenThreads?.activeOperationKind
    ?? inferOperationKind(assistantResponse);
  const structuredMemory = deriveStructuredMemory(input);

  if (!assistantAskedQuestion && input.mutationAccepted) {
    return {
      unresolved: false,
      activeOperationKind: operationKind,
      recentAssistantQuestion: null,
      lastUserMessage: clipText(input.userMessage, 240),
      lastAssistantMessage: assistantResponse ? clipText(assistantResponse, 240) : null,
      targetEntityHints: extractTargetEntityHints(
        input.priorOpenThreads?.lastUserMessage,
        input.userMessage,
        assistantResponse,
      ),
      activeParentId: input.priorOpenThreads?.activeParentId ?? null,
      ...structuredMemory,
    };
  }

  if (!assistantAskedQuestion && !isShortFollowUp(input.userMessage) && !input.priorOpenThreads?.unresolved) {
    return {
      unresolved: false,
      activeOperationKind: operationKind,
      recentAssistantQuestion: null,
      lastUserMessage: clipText(input.userMessage, 240),
      lastAssistantMessage: assistantResponse ? clipText(assistantResponse, 240) : input.priorOpenThreads?.lastAssistantMessage ?? null,
      targetEntityHints: extractTargetEntityHints(
        input.priorOpenThreads?.lastUserMessage,
        input.userMessage,
        assistantResponse,
      ),
      activeParentId: input.priorOpenThreads?.activeParentId ?? null,
      ...structuredMemory,
    };
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
    activeParentId: input.priorOpenThreads?.activeParentId ?? null,
    ...structuredMemory,
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
    input.sessionState?.openThreads?.lastMutationTool
      ? `Last mutation tool: ${input.sessionState.openThreads.lastMutationTool}`
      : null,
    input.sessionState?.openThreads?.scopeHint
      ? `Scope hint: ${input.sessionState.openThreads.scopeHint}`
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
  latestToolFacts?: AgentMemoryToolFact[];
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
    latestToolFacts: input.latestToolFacts,
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
