import { useCallback } from 'react';
import { useProjectStore } from '../stores/useProjectStore';
import type { FrontendHistoryGroupContext, FrontendProjectCommand } from '../types';
import type { ProjectLoadResponse } from '../lib/apiTypes';

function generateRequestId(): string {
  return crypto.randomUUID();
}

let commitQueue: Promise<void> = Promise.resolve();

function summarizeSnapshot(snapshot: ProjectLoadResponse['snapshot'] | null | undefined) {
  if (!snapshot) {
    return null;
  }

  return {
    taskCount: snapshot.tasks.length,
    dependencyCount: snapshot.dependencies.length,
    tasks: snapshot.tasks.slice(0, 10).map((task) => ({
      id: task.id,
      name: task.name,
      startDate: task.startDate,
      endDate: task.endDate,
    })),
  };
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

export function useCommandCommit(accessToken: string | null) {
  const { addPending, resolvePending, rejectPending, setConfirmed, clearTransientState } = useProjectStore();

  const syncConfirmedFromServer = useCallback(async () => {
    if (!accessToken) {
      return null;
    }

    const response = await fetch('/api/project', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to reload project after conflict: ${response.status}`);
    }

    const project = await response.json() as ProjectLoadResponse;
    setConfirmed(project.version, project.snapshot);
    return project;
  }, [accessToken, setConfirmed]);

  const commitCommand = useCallback(async (
    command: FrontendProjectCommand,
    history?: FrontendHistoryGroupContext,
  ) => {
    const runCommit = async () => {
      if (!accessToken) throw new Error('Not authenticated');

      const requestId = generateRequestId();
      let attempt = 0;

      while (attempt < 2) {
        const baseVersion = useProjectStore.getState().confirmed.version;
        console.log('[COMMIT] enqueue', { requestId, attempt, baseVersion, command, history });

        // Step 1: Add to pending (optimistic display)
        addPending({ requestId, baseVersion, command });

        // Step 2: Send to server
        try {
          const response = await fetch('/api/commands/commit', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${accessToken}`,
            },
            body: JSON.stringify({ clientRequestId: requestId, baseVersion, command, history }),
          });

          console.log('[COMMIT] response:raw', {
            requestId,
            status: response.status,
            ok: response.ok,
          });

          if (!response.ok && response.status !== 409) {
            const errorMessage = await readErrorMessage(response);
            clearTransientState();
            console.error('[COMMIT] response:error', { requestId, errorMessage });
            throw new Error(errorMessage);
          }

          const data = await response.json();
          console.log('[COMMIT] response:json', {
            requestId,
            accepted: data.accepted,
            reason: data.reason,
            currentVersion: data.currentVersion,
            newVersion: data.newVersion,
            result: data.result,
            snapshot: summarizeSnapshot(data.snapshot),
          });

          if (data.accepted) {
            // Step 3a: Server accepted — update confirmed, remove pending
            resolvePending(requestId, data.newVersion, data.snapshot);
            console.log('[COMMIT] resolved', {
              requestId,
              newVersion: data.newVersion,
              snapshot: summarizeSnapshot(data.snapshot),
            });
            return data;
          }

          rejectPending(requestId);
          console.warn('[COMMIT] rejected', { requestId, reason: data.reason });

          if (data.reason === 'version_conflict' && attempt === 0) {
            if (data.snapshot) {
              setConfirmed(data.currentVersion, data.snapshot);
              console.warn('[COMMIT] version-conflict:setConfirmed', {
                requestId,
                currentVersion: data.currentVersion,
                snapshot: summarizeSnapshot(data.snapshot),
              });
            } else {
              await syncConfirmedFromServer();
            }
            attempt += 1;
            continue;
          }

          if (data.reason === 'version_conflict') {
            if (data.snapshot) {
              setConfirmed(data.currentVersion, data.snapshot);
              console.warn('[COMMIT] version-conflict:final-setConfirmed', {
                requestId,
                currentVersion: data.currentVersion,
                snapshot: summarizeSnapshot(data.snapshot),
              });
            } else {
              await syncConfirmedFromServer();
            }
          }
          return data;
        } catch (error) {
          clearTransientState();
          console.error('[COMMIT] exception', { requestId, command, history, error });
          throw error;
        }
      }

      throw new Error('Unreachable commit retry state');
    };

    const queuedCommit = commitQueue.then(runCommit);
    commitQueue = queuedCommit.then(() => undefined, () => undefined);
    return queuedCommit;
  }, [accessToken, addPending, resolvePending, rejectPending, setConfirmed, clearTransientState, syncConfirmedFromServer]);

  return { commitCommand };
}
