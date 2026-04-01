import { useCallback } from 'react';
import { useProjectStore } from '../stores/useProjectStore';
import type { FrontendProjectCommand } from '../types';
import type { ProjectLoadResponse } from '../lib/apiTypes';

function generateRequestId(): string {
  return crypto.randomUUID();
}

let commitQueue: Promise<void> = Promise.resolve();

export function useCommandCommit(accessToken: string | null) {
  const { addPending, resolvePending, rejectPending, setConfirmed } = useProjectStore();

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
          rejectPending(requestId);
          throw error;
        }
      }

      throw new Error('Unreachable commit retry state');
    };

    const queuedCommit = commitQueue.then(runCommit);
    commitQueue = queuedCommit.then(() => undefined, () => undefined);
    return queuedCommit;
  }, [accessToken, addPending, resolvePending, rejectPending, setConfirmed, syncConfirmedFromServer]);

  return { commitCommand };
}
