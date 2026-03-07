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
        // Only attempt refresh if this isn't a freshly changed token
        // This prevents the race condition where:
        // 1. switchProject sets new accessToken
        // 2. useTasks triggers with new token
        // 3. API returns 401 (maybe JWT not yet valid in server's cache)
        // 4. We call refreshAccessToken which uses OLD refresh token
        // 5. refreshAccessToken gets 401 and calls logout()
        console.log('[useTasks] Got 401, checking if we should refresh...');
        const shouldSkipRefresh = token !== lastProcessedToken.current;
        console.log('[useTasks] Skip refresh?', shouldSkipRefresh, '(token just changed)');

        if (shouldSkipRefresh) {
          // Token just changed, don't try to refresh - it might be a timing issue
          // Set the token as processed and return empty results
          // The next render cycle will re-fetch with the same token
          console.log('[useTasks] Token just changed, skipping refresh to avoid race condition');
          return [] as Task[];
        }

        // Token expired and it's not a fresh change — attempt refresh
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
