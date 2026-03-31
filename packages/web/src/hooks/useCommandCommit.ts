import { useCallback } from 'react';
import { useProjectStore } from '../stores/useProjectStore';
import type { FrontendProjectCommand } from '../types';

function generateRequestId(): string {
  return crypto.randomUUID();
}

export function useCommandCommit(accessToken: string | null) {
  const { confirmed, addPending, resolvePending, rejectPending, setConfirmed } = useProjectStore();

  const commitCommand = useCallback(async (command: FrontendProjectCommand) => {
    if (!accessToken) throw new Error('Not authenticated');

    const requestId = generateRequestId();
    const baseVersion = confirmed.version;

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
        resolvePending(requestId, data.newVersion, { tasks: data.snapshot.tasks });
        return data;
      } else {
        // Step 3b: Server rejected — remove pending, re-sync on version conflict
        rejectPending(requestId);
        if (data.reason === 'version_conflict' && data.snapshot) {
          setConfirmed(data.currentVersion, { tasks: data.snapshot.tasks });
        }
        return data;
      }
    } catch (error) {
      rejectPending(requestId);
      throw error;
    }
  }, [accessToken, confirmed.version, addPending, resolvePending, rejectPending, setConfirmed]);

  return { commitCommand };
}
