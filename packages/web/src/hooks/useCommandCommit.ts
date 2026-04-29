import { useCallback, useEffect } from 'react';
import { useProjectStore } from '../stores/useProjectStore';
import { useUIStore } from '../stores/useUIStore';
import { useAuthStore } from '../stores/useAuthStore';
import type { FrontendHistoryGroupContext, FrontendProjectCommand, PendingCommand, ProjectSnapshot } from '../types';

type CommitResponse =
  | {
      clientRequestId: string;
      accepted: true;
      baseVersion: number;
      newVersion: number;
      result: {
        snapshot?: ProjectSnapshot;
        changedTaskIds: string[];
        changedTasks: ProjectSnapshot['tasks'];
        changedDependencyIds: string[];
        conflicts: unknown[];
        patches: unknown[];
      };
      snapshot?: ProjectSnapshot;
      changedTaskIds: string[];
      changedTasks: ProjectSnapshot['tasks'];
      changedDependencyIds: string[];
      conflicts: unknown[];
      historyGroupId: string;
    }
  | {
      clientRequestId: string;
      accepted: false;
      reason: 'version_conflict' | 'validation_error' | 'conflict';
      currentVersion: number;
      snapshot?: ProjectSnapshot;
      error?: string;
    };

type OutboxEntry = {
  projectId: string;
  requestId: string;
  baseVersion: number;
  baseSnapshot?: ProjectSnapshot;
  command: FrontendProjectCommand;
  history?: FrontendHistoryGroupContext;
  includeSnapshot?: boolean;
  createdAt: number;
  attempts: number;
  rebaseAttempts?: number;
  status: NonNullable<PendingCommand['status']>;
  lastError?: string;
};

type PendingCallbacks = {
  resolve: (value: CommitResponse) => void;
  reject: (error: unknown) => void;
};

const OUTBOX_PREFIX = 'gantt_command_outbox:v1:';
const RETRY_BASE_DELAY_MS = 1_000;
const RETRY_MAX_DELAY_MS = 30_000;

const callbacks = new Map<string, PendingCallbacks[]>();
let flushPromise: Promise<void> | null = null;
let retryTimeout: ReturnType<typeof setTimeout> | null = null;

function generateRequestId(): string {
  return crypto.randomUUID();
}

function getOutboxKey(projectId: string): string {
  return `${OUTBOX_PREFIX}${projectId}`;
}

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function readOutbox(projectId: string): OutboxEntry[] {
  if (!canUseStorage()) {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(getOutboxKey(projectId));
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as OutboxEntry[];
    return Array.isArray(parsed)
      ? parsed.filter((entry) => entry.projectId === projectId && entry.requestId && entry.command)
      : [];
  } catch {
    return [];
  }
}

function writeOutbox(projectId: string, entries: OutboxEntry[]): void {
  if (!canUseStorage()) {
    return;
  }

  if (entries.length === 0) {
    window.localStorage.removeItem(getOutboxKey(projectId));
    return;
  }

  window.localStorage.setItem(getOutboxKey(projectId), JSON.stringify(entries));
}

function toPending(entry: OutboxEntry): PendingCommand {
  return {
    requestId: entry.requestId,
    baseVersion: entry.baseVersion,
    command: entry.command,
    status: entry.status,
  };
}

function coalesceCommands(
  previous: FrontendProjectCommand,
  next: FrontendProjectCommand,
): FrontendProjectCommand | null {
  if (previous.type === 'update_task_fields' && next.type === 'update_task_fields' && previous.taskId === next.taskId) {
    return {
      type: 'update_task_fields',
      taskId: next.taskId,
      fields: {
        ...previous.fields,
        ...next.fields,
      },
    };
  }

  if (previous.type === 'reorder_tasks' && next.type === 'reorder_tasks') {
    return next;
  }

  if (
    (previous.type === 'move_task' || previous.type === 'resize_task' || previous.type === 'set_task_start' || previous.type === 'set_task_end')
    && previous.type === next.type
    && 'taskId' in next
    && previous.taskId === next.taskId
  ) {
    return next;
  }

  return null;
}

function resolveCallbacks(requestId: string, data: CommitResponse): void {
  for (const callback of callbacks.get(requestId) ?? []) {
    callback.resolve(data);
  }
  callbacks.delete(requestId);
}

async function readErrorMessage(response: Response): Promise<string> {
  const fallback = `HTTP ${response.status}`;

  try {
    const data = await response.json() as { error?: string; message?: string; reason?: string };
    return data.error || data.message || data.reason || fallback;
  } catch {
    try {
      const text = await response.text();
      const trimmed = text.trim();
      return trimmed.length > 0 ? `${fallback}: ${trimmed.slice(0, 200)}` : fallback;
    } catch {
      return fallback;
    }
  }
}

async function parseCommitResponse(response: Response): Promise<CommitResponse> {
  return await response.json() as CommitResponse;
}

function scheduleRetry(projectId: string, accessToken: string): void {
  if (retryTimeout) {
    return;
  }

  const firstEntry = readOutbox(projectId)[0];
  const attempts = firstEntry?.attempts ?? 0;
  const delay = Math.min(RETRY_BASE_DELAY_MS * 2 ** Math.max(0, attempts - 1), RETRY_MAX_DELAY_MS);

  retryTimeout = setTimeout(() => {
    retryTimeout = null;
    void flushOutbox(projectId, accessToken);
  }, delay);
}

async function postCommit(accessToken: string, entry: OutboxEntry): Promise<CommitResponse> {
  const command = entry.command;
  const isProjectShift = command.type === 'shift_project';
  const requestBody = isProjectShift
    ? {
        clientRequestId: entry.requestId,
        baseVersion: entry.baseVersion,
        deltaDays: command.deltaDays,
        history: entry.history,
        includeSnapshot: entry.includeSnapshot,
      }
    : {
        clientRequestId: entry.requestId,
        baseVersion: entry.baseVersion,
        command,
        history: entry.history,
        includeSnapshot: entry.includeSnapshot,
      };
  const response = await fetch(isProjectShift ? '/api/commands/shift-project' : '/api/commands/commit', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok && response.status !== 409) {
    throw new Error(await readErrorMessage(response));
  }

  return parseCommitResponse(response);
}

async function flushOutbox(projectId: string, accessToken: string): Promise<void> {
  if (flushPromise) {
    return flushPromise;
  }

  flushPromise = (async () => {
    if (!accessToken || !projectId) {
      return;
    }

    while (true) {
      const entries = readOutbox(projectId);
      const entry = entries[0];
      if (!entry) {
        useUIStore.getState().setSavingState('idle');
        return;
      }
      if (entry.status === 'failed' || (entry.status === 'conflict' && (entry.rebaseAttempts ?? 0) >= 3)) {
        useProjectStore.getState().hydratePending(entries.map(toPending));
        useUIStore.getState().setSavingState('error');
        return;
      }

      const activeLock = useUIStore.getState().aiMutationLock;
      if (activeLock.active) {
        return;
      }

      const confirmed = useProjectStore.getState().confirmed;
      const sendBaseVersion = confirmed.version;
      const nextEntry: OutboxEntry = {
        ...entry,
        baseVersion: sendBaseVersion,
        baseSnapshot: confirmed.snapshot,
        attempts: entry.attempts + 1,
        status: entry.attempts > 0 ? 'retrying' : 'pending',
        lastError: undefined,
      };
      writeOutbox(projectId, [nextEntry, ...entries.slice(1)]);
      useProjectStore.getState().updatePendingStatus(entry.requestId, nextEntry.status);
      useUIStore.getState().setSavingState('saving');

      try {
        const data = await postCommit(accessToken, nextEntry);

        if (data.accepted) {
          const remaining = readOutbox(projectId).filter((candidate) => candidate.requestId !== entry.requestId);
          writeOutbox(projectId, remaining);
          useProjectStore.getState().resolvePending(
            entry.requestId,
            data.newVersion,
            data.snapshot ?? {
              changedTasks: data.changedTasks ?? data.result.changedTasks,
              changedDependencyIds: data.changedDependencyIds ?? data.result.changedDependencyIds,
            },
          );
          resolveCallbacks(entry.requestId, data);
          continue;
        }

        if (data.reason === 'version_conflict') {
          const rebaseAttempts = nextEntry.rebaseAttempts ?? 0;
          if (data.snapshot && rebaseAttempts < 3) {
            const rebasedEntries = readOutbox(projectId).map((candidate) => (
              candidate.requestId === entry.requestId
                ? {
                    ...candidate,
                    baseVersion: data.currentVersion,
                    baseSnapshot: data.snapshot,
                    attempts: 0,
                    rebaseAttempts: rebaseAttempts + 1,
                    status: 'pending' as const,
                    lastError: undefined,
                  }
                : candidate
            ));
            writeOutbox(projectId, rebasedEntries);
            useProjectStore.getState().setConfirmed(data.currentVersion, data.snapshot);
            useProjectStore.getState().hydratePending(rebasedEntries.map(toPending));
            continue;
          }

          const conflicted = readOutbox(projectId).map((candidate) => (
            candidate.requestId === entry.requestId
              ? { ...candidate, status: 'conflict' as const, lastError: 'server_version_changed' }
              : candidate
          ));
          writeOutbox(projectId, conflicted);
          useProjectStore.getState().hydratePending(conflicted.map(toPending));
          useUIStore.getState().setSavingState('error');
          resolveCallbacks(entry.requestId, data);
          return;
        }

        const failed = readOutbox(projectId).map((candidate) => (
          candidate.requestId === entry.requestId
            ? { ...candidate, status: 'failed' as const, lastError: data.error ?? data.reason }
            : candidate
        ));
        writeOutbox(projectId, failed);
        useProjectStore.getState().hydratePending(failed.map(toPending));
        useUIStore.getState().setSavingState('error');
        resolveCallbacks(entry.requestId, data);
        return;
      } catch (error) {
        const failedEntries = readOutbox(projectId).map((candidate) => (
          candidate.requestId === entry.requestId
            ? {
                ...candidate,
                status: 'retrying' as const,
                attempts: nextEntry.attempts,
                lastError: error instanceof Error ? error.message : String(error),
              }
            : candidate
        ));
        writeOutbox(projectId, failedEntries);
        useProjectStore.getState().hydratePending(failedEntries.map(toPending));
        useUIStore.getState().setSavingState('saving');
        scheduleRetry(projectId, accessToken);
        return;
      }
    }
  })().finally(() => {
    flushPromise = null;
  });

  return flushPromise;
}

export function useCommandCommit(accessToken: string | null) {
  const { addPending, hydratePending } = useProjectStore();
  const projectId = useAuthStore((state) => state.project?.id ?? null);

  useEffect(() => {
    if (!projectId) {
      hydratePending([]);
      return;
    }

    const entries = readOutbox(projectId);
    if (entries[0]?.baseSnapshot) {
      useProjectStore.getState().setConfirmed(entries[0].baseVersion, entries[0].baseSnapshot);
    }
    hydratePending(entries.map(toPending));

    if (accessToken && entries.length > 0 && !entries.some((entry) => entry.status === 'conflict' || entry.status === 'failed')) {
      void flushOutbox(projectId, accessToken);
    }
  }, [accessToken, hydratePending, projectId]);

  useEffect(() => {
    if (!projectId || !accessToken || typeof window === 'undefined') {
      return;
    }

    const handleOnline = () => {
      void flushOutbox(projectId, accessToken);
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [accessToken, projectId]);

  const commitCommand = useCallback(async (
    command: FrontendProjectCommand,
    history?: FrontendHistoryGroupContext,
    options?: { includeSnapshot?: boolean },
  ): Promise<CommitResponse> => {
    const aiMutationLock = useUIStore.getState().aiMutationLock;
    if (aiMutationLock.active) {
      throw new Error(aiMutationLock.message ?? 'График временно заблокирован, пока AI применяет изменения.');
    }

    if (!accessToken) {
      throw new Error('Not authenticated');
    }
    if (!projectId) {
      throw new Error('No active project');
    }

    const currentEntries = readOutbox(projectId);
    const lastEntry = currentEntries[currentEntries.length - 1];
    const coalescedCommand = !flushPromise && lastEntry && lastEntry.attempts === 0 && lastEntry.status === 'pending'
      ? coalesceCommands(lastEntry.command, command)
      : null;
    const requestId = coalescedCommand ? lastEntry!.requestId : generateRequestId();
    const baseVersion = coalescedCommand
      ? lastEntry!.baseVersion
      : useProjectStore.getState().confirmed.version + currentEntries.length;
    const entry: OutboxEntry = {
      projectId,
      requestId,
      baseVersion,
      baseSnapshot: useProjectStore.getState().confirmed.snapshot,
      command: coalescedCommand ?? command,
      history: coalescedCommand ? lastEntry!.history : history,
      includeSnapshot: options?.includeSnapshot,
      createdAt: Date.now(),
      attempts: 0,
      status: 'pending',
    };

    const resultPromise = new Promise<CommitResponse>((resolve, reject) => {
      callbacks.set(requestId, [...(callbacks.get(requestId) ?? []), { resolve, reject }]);
    });

    if (coalescedCommand) {
      const nextEntries = [...currentEntries.slice(0, -1), entry];
      writeOutbox(projectId, nextEntries);
      hydratePending(nextEntries.map(toPending));
    } else {
      writeOutbox(projectId, [...currentEntries, entry]);
      addPending(toPending(entry));
    }

    void flushOutbox(projectId, accessToken);
    return resultPromise;
  }, [accessToken, addPending, projectId]);

  return { commitCommand };
}
