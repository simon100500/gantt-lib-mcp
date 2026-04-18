import { useCallback, useEffect, useState } from 'react';

import type {
  HistoryItem,
  HistoryListResponse,
  HistoryRestoreResponse,
  HistorySnapshotResponse,
} from '../lib/apiTypes.ts';
import { useProjectStore } from '../stores/useProjectStore.ts';

const DEFAULT_HISTORY_LIMIT = 50;

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

async function parseHistoryRestoreResponse(response: Response): Promise<HistoryRestoreResponse> {
  const data = await response.json() as Partial<HistoryRestoreResponse>;

  return {
    groupId: data.groupId ?? '',
    targetGroupId: data.targetGroupId ?? '',
    version: data.version ?? 0,
    snapshot: data.snapshot ?? { tasks: [], dependencies: [] },
  };
}

async function parseHistorySnapshotResponse(response: Response): Promise<HistorySnapshotResponse> {
  const data = await response.json() as Partial<HistorySnapshotResponse>;

  return {
    groupId: data.groupId ?? '',
    isCurrent: data.isCurrent ?? false,
    currentVersion: data.currentVersion ?? 0,
    snapshot: data.snapshot ?? { tasks: [], dependencies: [] },
  };
}

export function useProjectHistory(accessToken: string | null) {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);
  const setConfirmed = useProjectStore((state) => state.setConfirmed);
  const clearTransientState = useProjectStore((state) => state.clearTransientState);

  const refreshHistory = useCallback(async (cursor?: string) => {
    if (!accessToken) {
      setItems([]);
      setNextCursor(undefined);
      setError(null);
      return { items: [], nextCursor: undefined };
    }

    setLoading(true);
    setError(null);

    try {
      const searchParams = new URLSearchParams();
      searchParams.set('limit', String(DEFAULT_HISTORY_LIMIT));
      if (cursor) {
        searchParams.set('cursor', cursor);
      }

      const response = await fetch(`/api/history?${searchParams.toString()}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const data = await response.json() as HistoryListResponse;
      setItems((current) => cursor ? [...current, ...data.items] : data.items);
      setNextCursor(data.nextCursor);
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load history';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  const fetchSnapshot = useCallback(async (groupId: string) => {
    if (!accessToken) {
      throw new Error('Not authenticated');
    }

    const response = await fetch(`/api/history/${groupId}/snapshot`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(await readErrorMessage(response));
    }

    return parseHistorySnapshotResponse(response);
  }, [accessToken]);

  const restoreGroup = useCallback(async (groupId: string) => {
    if (!accessToken) {
      throw new Error('Not authenticated');
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/history/${groupId}/restore`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const data = await parseHistoryRestoreResponse(response);
      setConfirmed(data.version, data.snapshot);
      clearTransientState();
      await refreshHistory();
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to restore history version';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [accessToken, clearTransientState, refreshHistory, setConfirmed]);

  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory]);

  return {
    items,
    loading,
    error,
    nextCursor,
    refreshHistory,
    fetchSnapshot,
    restoreGroup,
  };
}
