import { useEffect } from 'react';
import type { Task } from '../types.ts';
import { useTaskStore } from '../stores/useTaskStore.ts';

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
  const shareToken = new URLSearchParams(window.location.search).get('share');
  const tasks = useTaskStore((state) => state.tasks);
  const setTasks = useTaskStore((state) => state.setTasks);
  const loading = useTaskStore((state) => state.loading);
  const error = useTaskStore((state) => state.error);

  useEffect(() => {
    void useTaskStore.getState().syncSource({
      accessToken,
      refreshAccessToken,
      shareToken,
    });
  }, [accessToken, refreshAccessToken, shareToken]);

  return { tasks, setTasks, loading, error };
}
