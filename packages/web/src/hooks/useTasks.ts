import { useState, useEffect, useRef } from 'react';
import type { Task } from '../types.ts';

export interface UseTasksResult {
  tasks: Task[];
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  loading: boolean;
  error: string | null;
}

export function useTasks(
  accessToken: string | null,
  refreshAccessToken: () => Promise<string | null>
): UseTasksResult {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Track the last token we've successfully used to fetch tasks
  const lastProcessedToken = useRef<string | null>(null);

  useEffect(() => {
    console.log('[useTasks] useEffect triggered', {
      accessToken: accessToken?.substring(0, 20) + '...',
      hasToken: !!accessToken,
      lastProcessedToken: lastProcessedToken.current?.substring(0, 20) + '...'
    });

    if (!accessToken) {
      setLoading(false);
      // Don't setTasks([]) here - let the UI handle empty state
      // This prevents clearing demo tasks in local mode
      lastProcessedToken.current = null;
      return;
    }

    // Skip if we've already processed this exact token
    if (accessToken === lastProcessedToken.current) {
      console.log('[useTasks] Skipping - already processed this token');
      return;
    }

    let cancelled = false;
    const fetchTasks = async (token: string) => {
      const res = await fetch('/api/tasks', {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (res.status === 401) {
        // When we get a 401, always attempt to refresh the token first.
        // The refreshAccessToken function will handle logging out if refresh token is invalid.
        // This handles both cases:
        // 1. Token expired after idle period (refresh token should be valid)
        // 2. Server restart (session may be invalid, refresh will fail and logout)
        console.log('[useTasks] Got 401, attempting token refresh...');

        const newToken = await refreshAccessToken();
        if (!newToken || cancelled) return null; // logout() already called inside refreshAccessToken

        // Retry with the new token
        const retryRes = await fetch('/api/tasks', {
          headers: { 'Authorization': `Bearer ${newToken}` },
        });
        if (!retryRes.ok) {
          console.log('[useTasks] Retry with refreshed token also failed:', retryRes.status);
          throw new Error(`HTTP ${retryRes.status}`);
        }
        console.log('[useTasks] Successfully refreshed token and retried request');
        return retryRes.json() as Promise<Task[]>;
      }

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<Task[]>;
    };

    setLoading(true);
    setError(null);
    fetchTasks(accessToken)
      .then(data => {
        if (cancelled) return;
        if (data) {
          console.log('[useTasks] Tasks loaded:', data.length);
          setTasks(data);
          lastProcessedToken.current = accessToken;
        }
        setLoading(false);
      })
      .catch(err => {
        if (cancelled) return;
        console.error('[useTasks] Error loading tasks:', err);
        setError(String(err));
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [accessToken, refreshAccessToken]);

  return { tasks, setTasks, loading, error };
}
