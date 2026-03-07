import { useState, useEffect } from 'react';
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

  useEffect(() => {
    if (!accessToken) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    const fetchTasks = async (token: string) => {
      const res = await fetch('/api/tasks', {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (res.status === 401) {
        // Token expired — attempt refresh once
        const newToken = await refreshAccessToken();
        if (!newToken || cancelled) return; // logout() already called inside refreshAccessToken
        const retryRes = await fetch('/api/tasks', {
          headers: { 'Authorization': `Bearer ${newToken}` },
        });
        if (!retryRes.ok) throw new Error(`HTTP ${retryRes.status}`);
        return retryRes.json() as Promise<Task[]>;
      }

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<Task[]>;
    };

    fetchTasks(accessToken)
      .then(data => {
        if (cancelled || !data) return;
        setTasks(data);
        setLoading(false);
      })
      .catch(err => {
        if (cancelled) return;
        setError(String(err));
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [accessToken, refreshAccessToken]);

  return { tasks, setTasks, loading, error };
}
