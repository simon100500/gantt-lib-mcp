import { useState, useEffect, useRef } from 'react';
import type { Task } from '../types.ts';

export interface UseTasksResult {
  tasks: Task[];
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useTasks(
  accessToken: string | null,
  refreshAccessToken: () => Promise<string | null>,
): UseTasksResult {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Track the last token we've successfully used to fetch tasks
  const lastProcessedToken = useRef<string | null>(null);
  const accessTokenRef = useRef<string | null>(accessToken);
  const refreshAccessTokenRef = useRef(refreshAccessToken);

  accessTokenRef.current = accessToken;
  refreshAccessTokenRef.current = refreshAccessToken;

  const fetchTasks = async (token: string): Promise<Task[] | null> => {
    const res = await fetch('/api/tasks', {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (res.status === 401) {
      const newToken = await refreshAccessTokenRef.current();
      if (!newToken) return null;

      const retryRes = await fetch('/api/tasks', {
        headers: { 'Authorization': `Bearer ${newToken}` },
      });
      if (!retryRes.ok) {
        throw new Error(`HTTP ${retryRes.status}`);
      }
      return retryRes.json() as Promise<Task[]>;
    }

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json() as Promise<Task[]>;
  };

  const applyFetchedTasks = (data: Task[] | null, token: string | null) => {
    if (!data || !token) return;

    setTasks(data);
    lastProcessedToken.current = token;
  };

  const refetch = async (): Promise<void> => {
    const token = accessTokenRef.current;
    if (!token) return;

    setLoading(true);
    setError(null);

    try {
      const data = await fetchTasks(token);
      const currentToken = accessTokenRef.current;
      applyFetchedTasks(data, currentToken);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!accessToken) {
      setLoading(false);
      // Don't setTasks([]) here - let the UI handle empty state
      // This prevents clearing demo tasks in local mode
      lastProcessedToken.current = null;
      return;
    }

    // Skip if we've already processed this exact token
    if (accessToken === lastProcessedToken.current) {
      return;
    }

    let cancelled = false;

    setLoading(true);
    setError(null);
    fetchTasks(accessToken)
      .then(data => {
        if (cancelled) return;
        applyFetchedTasks(data, accessTokenRef.current);
        setLoading(false);
      })
      .catch(err => {
        if (cancelled) return;
        setError(String(err));
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [accessToken, refreshAccessToken]);

  return { tasks, setTasks, loading, error, refetch };
}
