import { useCallback } from 'react';
import { useProjectStore } from '../stores/useProjectStore';
import type { FrontendProjectCommand } from '../types';
import type { ProjectLoadResponse } from '../lib/apiTypes';

function generateRequestId(): string {
  return crypto.randomUUID();
}

let commitQueue: Promise<void> = Promise.resolve();

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

  const commitCommand = useCallback(async (command: FrontendProjectCommand) => {
    const runCommit = async () => {
      if (!accessToken) throw new Error('Not authenticated');

      const requestId = generateRequestId();
      let attempt = 0;

      while (attempt < 2) {
        const baseVersion = useProjectStore.getState().confirmed.version;

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
            body: JSON.stringify({ clientRequestId: requestId, baseVersion, command }),
          });

          if (!response.ok && response.status !== 409) {
            const errorMessage = await readErrorMessage(response);
            clearTransientState();
            throw new Error(errorMessage);
          }

          const data = await response.json();

          if (data.accepted) {
            // Step 3a: Server accepted — update confirmed, remove pending
            resolvePending(requestId, data.newVersion, data.snapshot);
            return data;
          }

          rejectPending(requestId);

          if (data.reason === 'version_conflict' && attempt === 0) {
            if (data.snapshot) {
              setConfirmed(data.currentVersion, data.snapshot);
            } else {
              await syncConfirmedFromServer();
            }
            attempt += 1;
            continue;
          }

          if (data.reason === 'version_conflict') {
            if (data.snapshot) {
              setConfirmed(data.currentVersion, data.snapshot);
            } else {
              await syncConfirmedFromServer();
            }
          }
          return data;
        } catch (error) {
          clearTransientState();
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
