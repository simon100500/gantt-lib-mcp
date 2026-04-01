import { useEffect } from 'react';
import type { Task } from '../types.ts';
import { useTaskStore } from '../stores/useTaskStore.ts';
import { useProjectStore } from '../stores/useProjectStore.ts';

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
  const taskStoreTasks = useTaskStore((state) => state.tasks);
  const setTasks = useTaskStore((state) => state.setTasks);
  const loading = useTaskStore((state) => state.loading);
  const error = useTaskStore((state) => state.error);
  const visibleTasks = useProjectStore((state) => state.getVisibleTasks());
  const activeSource = useTaskStore((state) => state.activeSource);

  useEffect(() => {
    void useTaskStore.getState().syncSource({
      accessToken,
      refreshAccessToken,
      shareToken,
    });
  }, [accessToken, refreshAccessToken, shareToken]);

  useEffect(() => {
    if (activeSource !== 'auth') {
      return;
    }

    useTaskStore.getState().replaceFromSystem(visibleTasks);
  }, [activeSource, visibleTasks]);

  return {
    tasks: activeSource === 'auth' ? visibleTasks : taskStoreTasks,
    setTasks,
    loading,
    error,
  };
}
