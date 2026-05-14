import { randomUUID } from 'node:crypto';
import { getPrisma } from '../prisma.js';
import type {
  AgentOpenThreadState,
  AgentSessionSnapshotMessage,
  AgentSessionStateRecord,
} from '../types.js';

type AgentSessionStateRow = {
  id: string;
  projectId: string;
  sessionKey: string;
  messagesSnapshot: unknown;
  rollingSummary: string | null;
  openThreads: unknown;
  lastRequestContextId: string | null;
  compactionVersion: number;
  schemaVersion: number;
  createdAt: Date;
  updatedAt: Date;
};

function clipText(value: string, limit: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= limit) {
    return trimmed;
  }

  return `${trimmed.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

function normalizeMessagesSnapshot(value: unknown): AgentSessionSnapshotMessage[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item): AgentSessionSnapshotMessage => ({
      role: item.role === 'assistant' ? 'assistant' : 'user',
      content: typeof item.content === 'string' ? clipText(item.content, 4_000) : '',
      timestamp: typeof item.timestamp === 'number' ? item.timestamp : Date.now(),
    }))
    .filter((item) => item.content.length > 0);
}

function normalizeOpenThreads(value: unknown): AgentOpenThreadState | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const raw = value as Record<string, unknown>;
  const stringArray = (input: unknown): string[] => (
    Array.isArray(input)
      ? input.filter((item): item is string => typeof item === 'string')
      : []
  );

  return {
    unresolved: raw.unresolved === true,
    activeOperationKind: typeof raw.activeOperationKind === 'string' ? raw.activeOperationKind as AgentOpenThreadState['activeOperationKind'] : null,
    recentAssistantQuestion: typeof raw.recentAssistantQuestion === 'string' ? raw.recentAssistantQuestion : null,
    lastUserMessage: typeof raw.lastUserMessage === 'string' ? raw.lastUserMessage : null,
    lastAssistantMessage: typeof raw.lastAssistantMessage === 'string' ? raw.lastAssistantMessage : null,
    targetEntityHints: stringArray(raw.targetEntityHints),
    lastResolvedTaskIds: stringArray(raw.lastResolvedTaskIds),
    lastCreatedTaskIds: stringArray(raw.lastCreatedTaskIds),
    activeParentId: typeof raw.activeParentId === 'string' ? raw.activeParentId : null,
    lastMutationTool: typeof raw.lastMutationTool === 'string' ? raw.lastMutationTool : null,
    lastSearchQuery: typeof raw.lastSearchQuery === 'string' ? raw.lastSearchQuery : null,
    scopeHint: typeof raw.scopeHint === 'string' ? raw.scopeHint as AgentOpenThreadState['scopeHint'] : null,
  };
}

export class AgentSessionStateService {
  private _prisma: ReturnType<typeof getPrisma> | undefined;

  private get prisma() {
    if (!this._prisma) {
      this._prisma = getPrisma();
    }
    return this._prisma;
  }

  private toDomain(row: AgentSessionStateRow): AgentSessionStateRecord {
    return {
      id: row.id,
      projectId: row.projectId,
      sessionKey: row.sessionKey,
      messagesSnapshot: normalizeMessagesSnapshot(row.messagesSnapshot),
      rollingSummary: row.rollingSummary,
      openThreads: normalizeOpenThreads(row.openThreads),
      lastRequestContextId: row.lastRequestContextId,
      compactionVersion: row.compactionVersion,
      schemaVersion: row.schemaVersion,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async getByProjectId(projectId: string): Promise<AgentSessionStateRecord | null> {
    const row = await (this.prisma as any).agentSessionState.findUnique({
      where: { projectId },
    }) as AgentSessionStateRow | null;

    return row ? this.toDomain(row) : null;
  }

  async upsert(input: {
    projectId: string;
    sessionKey?: string;
    messagesSnapshot: AgentSessionSnapshotMessage[];
    rollingSummary?: string | null;
    openThreads?: AgentOpenThreadState | null;
    lastRequestContextId?: string | null;
    compactionVersion?: number;
    schemaVersion?: number;
  }): Promise<AgentSessionStateRecord> {
    const row = await (this.prisma as any).agentSessionState.upsert({
      where: { projectId: input.projectId },
      create: {
        id: randomUUID(),
        projectId: input.projectId,
        sessionKey: input.sessionKey ?? 'project-chat',
        messagesSnapshot: input.messagesSnapshot,
        rollingSummary: input.rollingSummary ?? null,
        openThreads: input.openThreads ?? null,
        lastRequestContextId: input.lastRequestContextId ?? null,
        compactionVersion: input.compactionVersion ?? 1,
        schemaVersion: input.schemaVersion ?? 1,
      },
      update: {
        sessionKey: input.sessionKey ?? 'project-chat',
        messagesSnapshot: input.messagesSnapshot,
        rollingSummary: input.rollingSummary ?? null,
        openThreads: input.openThreads ?? null,
        lastRequestContextId: input.lastRequestContextId ?? null,
        compactionVersion: input.compactionVersion ?? 1,
        schemaVersion: input.schemaVersion ?? 1,
      },
    }) as AgentSessionStateRow;

    return this.toDomain(row);
  }
}

export const agentSessionStateService = new AgentSessionStateService();
