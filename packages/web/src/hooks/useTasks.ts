import { useEffect, useMemo } from 'react';
import type { Task } from '../types.ts';
import { useTaskStore } from '../stores/useTaskStore.ts';
import { useProjectStore } from '../stores/useProjectStore.ts';
import { replayProjectCommand } from '../lib/projectCommandReplay.ts';

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
  const activeSource = useTaskStore((state) => state.activeSource);
  const confirmedSnapshot = useProjectStore((state) => state.confirmed.snapshot);
  const pendingCommands = useProjectStore((state) => state.pending);
  const dragPreview = useProjectStore((state) => state.dragPreview);

  const visibleTasks = useMemo(() => {
    if (dragPreview) {
      return dragPreview.snapshot.tasks;
    }

    return pendingCommands.reduce(
      (snapshot, pending) => replayProjectCommand(snapshot, pending.command, { businessDays: false }, pending.requestId),
      confirmedSnapshot,
    ).tasks;
  }, [confirmedSnapshot, dragPreview, pendingCommands]);

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
