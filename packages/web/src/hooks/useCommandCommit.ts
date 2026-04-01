import { useCallback } from 'react';
import { useProjectStore } from '../stores/useProjectStore';
import type { FrontendProjectCommand } from '../types';

function generateRequestId(): string {
  return crypto.randomUUID();
}

let commitQueue: Promise<void> = Promise.resolve();

export function useCommandCommit(accessToken: string | null) {
  const { addPending, resolvePending, rejectPending, setConfirmed } = useProjectStore();

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

          if (data.reason === 'version_conflict' && data.snapshot && attempt === 0) {
            setConfirmed(data.currentVersion, data.snapshot);
            attempt += 1;
            continue;
          }

          if (data.reason === 'version_conflict' && data.snapshot) {
            setConfirmed(data.currentVersion, data.snapshot);
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
  }, [accessToken, addPending, resolvePending, rejectPending, setConfirmed]);

  return { commitCommand };
}
