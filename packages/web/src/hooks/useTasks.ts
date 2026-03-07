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
      setTasks([]);
      lastProcessedToken.current = null;
      return;
    }

    // Skip if we've already processed this exact token
    if (accessToken === lastProcessedToken.current) {
      console.log('[useTasks] Skipping - already processed this token');
      return;
    }

    let cancelled = false;
    // Track if this is the first attempt with this token (to detect fresh token change)
    const isFirstAttemptWithToken = accessToken !== lastProcessedToken.current;

    const fetchTasks = async (token: string, isRetry: boolean = false) => {
      const res = await fetch('/api/tasks', {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (res.status === 401) {
        // Only attempt refresh if:
        // 1. This is NOT the first attempt with a new token (isRetry is true)
        // OR
        // 2. We've already successfully processed this token before
        const shouldAttemptRefresh = isRetry || token === lastProcessedToken.current;
        console.log('[useTasks] Got 401, shouldAttemptRefresh:', shouldAttemptRefresh, 'isRetry:', isRetry, 'token matches lastProcessed:', token === lastProcessedToken.current);

        if (!shouldAttemptRefresh) {
          // This is a fresh token change (e.g., from switchProject)
          // Don't call refreshAccessToken because it might have the old refresh token
          // Instead, just retry once with the same token after a brief delay
          // This handles cases where the JWT needs a moment to be valid on the server
          console.log('[useTasks] Fresh token, retrying once without refresh...');
          await new Promise(resolve => setTimeout(resolve, 100));
          if (cancelled) return null;
          const retryRes = await fetch('/api/tasks', {
            headers: { 'Authorization': `Bearer ${token}` },
          });
          if (!retryRes.ok) {
            console.log('[useTasks] Retry also failed:', retryRes.status);
            throw new Error(`HTTP ${retryRes.status}`);
          }
          return retryRes.json() as Promise<Task[]>;
        }

        // Token expired and we've already tried once, or it's an old token — attempt refresh
        console.log('[useTasks] Attempting token refresh...');
        const newToken = await refreshAccessToken();
        if (!newToken || cancelled) return null; // logout() already called inside refreshAccessToken
        const retryRes = await fetch('/api/tasks', {
          headers: { 'Authorization': `Bearer ${newToken}` },
        });
        if (!retryRes.ok) throw new Error(`HTTP ${retryRes.status}`);
        return retryRes.json() as Promise<Task[]>;
      }

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<Task[]>;
    };

    setLoading(true);
    setError(null);
    fetchTasks(accessToken, false)
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
