import { useCallback, useState } from 'react';

import type {
  BaselineCreateResponse,
  BaselineItem,
  BaselineListResponse,
  BaselineSnapshotResponse,
} from '../lib/apiTypes.ts';

const BASELINE_REQUEST_TIMEOUT_MS = 10_000;

function createRequestSignal(timeoutMs = BASELINE_REQUEST_TIMEOUT_MS): {
  signal: AbortSignal;
  cleanup: () => void;
} {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  return {
    signal: controller.signal,
    cleanup: () => window.clearTimeout(timeoutId),
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

function normalizeBaselineItem(data: Partial<BaselineItem> | null | undefined): BaselineItem {
  return {
    id: typeof data?.id === 'string' ? data.id : '',
    projectId: typeof data?.projectId === 'string' ? data.projectId : '',
    name: typeof data?.name === 'string' ? data.name : '',
    source: data?.source === 'history' ? 'history' : 'current',
    sourceHistoryGroupId: typeof data?.sourceHistoryGroupId === 'string' ? data.sourceHistoryGroupId : null,
    createdAt: typeof data?.createdAt === 'string' ? data.createdAt : '',
  };
}

function normalizeSnapshot(
  snapshot: BaselineSnapshotResponse['snapshot'] | Partial<BaselineSnapshotResponse['snapshot']> | null | undefined,
): BaselineSnapshotResponse['snapshot'] {
  return {
    tasks: Array.isArray(snapshot?.tasks) ? snapshot.tasks : [],
    dependencies: Array.isArray(snapshot?.dependencies) ? snapshot.dependencies : [],
  };
}

async function parseBaselineListResponse(response: Response): Promise<BaselineListResponse> {
  const data = await response.json() as Partial<BaselineListResponse>;
  const baselines = Array.isArray(data.baselines)
    ? data.baselines.map((item) => normalizeBaselineItem(item))
    : [];

  return { baselines };
}

async function parseBaselineSnapshotResponse(response: Response): Promise<BaselineSnapshotResponse> {
  const data = await response.json() as Partial<BaselineSnapshotResponse>;

  return {
    ...normalizeBaselineItem(data),
    snapshot: normalizeSnapshot(data.snapshot),
  };
}

function normalizeRequestError(error: unknown, fallback: string): Error {
  if (typeof error === 'object' && error !== null && 'name' in error && (error as { name?: string }).name === 'AbortError') {
    return new Error('Request timed out');
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error(fallback);
}

export type UseProjectBaselinesResult = ReturnType<typeof useProjectBaselines>;

export function useProjectBaselines(accessToken: string | null) {
  const [items, setItems] = useState<BaselineItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeBaselineId, setActiveBaselineId] = useState<string | null>(null);
  const [creatingFromCurrent, setCreatingFromCurrent] = useState(false);
  const [creatingFromHistoryGroupId, setCreatingFromHistoryGroupId] = useState<string | null>(null);

  const loadBaselines = useCallback(async () => {
    if (!accessToken) {
      setError('Not authenticated');
      throw new Error('Not authenticated');
    }

    setLoading(true);
    setError(null);
    const { signal, cleanup } = createRequestSignal();

    try {
      const response = await fetch('/api/baselines', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        signal,
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const data = await parseBaselineListResponse(response);
      setItems(data.baselines);
      return data;
    } catch (err) {
      const normalizedError = normalizeRequestError(err, 'Failed to load baselines');
      setError(normalizedError.message);
      throw normalizedError;
    } finally {
      cleanup();
      setLoading(false);
    }
  }, [accessToken]);

  const fetchBaseline = useCallback(async (baselineId: string) => {
    if (!accessToken) {
      throw new Error('Not authenticated');
    }

    const trimmedBaselineId = baselineId.trim();
    if (!trimmedBaselineId) {
      throw new Error('baselineId required');
    }

    setActiveBaselineId(trimmedBaselineId);
    setLoading(true);
    setError(null);
    const { signal, cleanup } = createRequestSignal();

    try {
      const response = await fetch(`/api/baselines/${encodeURIComponent(trimmedBaselineId)}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        signal,
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      return await parseBaselineSnapshotResponse(response);
    } catch (err) {
      const normalizedError = normalizeRequestError(err, 'Failed to load baseline');
      setError(normalizedError.message);
      throw normalizedError;
    } finally {
      cleanup();
      setActiveBaselineId((current) => (current === trimmedBaselineId ? null : current));
      setLoading(false);
    }
  }, [accessToken]);

  const createFromCurrent = useCallback(async (name: string): Promise<BaselineCreateResponse> => {
    if (!accessToken) {
      throw new Error('Not authenticated');
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      throw new Error('name required');
    }

    setCreatingFromCurrent(true);
    setLoading(true);
    setError(null);
    const { signal, cleanup } = createRequestSignal();

    try {
      const response = await fetch('/api/baselines/current', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ name: trimmedName }),
        signal,
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const data = await parseBaselineSnapshotResponse(response);
      setItems((current) => [data, ...current.filter((item) => item.id !== data.id)]);
      return data;
    } catch (err) {
      const normalizedError = normalizeRequestError(err, 'Failed to create baseline from current state');
      setError(normalizedError.message);
      throw normalizedError;
    } finally {
      cleanup();
      setCreatingFromCurrent(false);
      setLoading(false);
    }
  }, [accessToken]);

  const createFromHistory = useCallback(async (groupId: string, name: string): Promise<BaselineCreateResponse> => {
    if (!accessToken) {
      throw new Error('Not authenticated');
    }

    const trimmedGroupId = groupId.trim();
    if (!trimmedGroupId) {
      throw new Error('groupId required');
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      throw new Error('name required');
    }

    setCreatingFromHistoryGroupId(trimmedGroupId);
    setLoading(true);
    setError(null);
    const { signal, cleanup } = createRequestSignal();

    try {
      const response = await fetch(`/api/baselines/history/${encodeURIComponent(trimmedGroupId)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ name: trimmedName }),
        signal,
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const data = await parseBaselineSnapshotResponse(response);
      setItems((current) => [data, ...current.filter((item) => item.id !== data.id)]);
      return data;
    } catch (err) {
      const normalizedError = normalizeRequestError(err, 'Failed to create baseline from history');
      setError(normalizedError.message);
      throw normalizedError;
    } finally {
      cleanup();
      setCreatingFromHistoryGroupId((current) => (current === trimmedGroupId ? null : current));
      setLoading(false);
    }
  }, [accessToken]);

  return {
    items,
    loading,
    error,
    activeBaselineId,
    creatingFromCurrent,
    creatingFromHistoryGroupId,
    loadBaselines,
    refreshBaselines: loadBaselines,
    fetchBaseline,
    createFromCurrent,
    createFromHistory,
  };
}

export const __baselineHookInternals = {
  normalizeBaselineItem,
  normalizeSnapshot,
  parseBaselineListResponse,
  parseBaselineSnapshotResponse,
  normalizeRequestError,
};
