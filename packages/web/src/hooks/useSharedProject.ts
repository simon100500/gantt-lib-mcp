import type { Task } from '../types.ts';
import { useTaskStore, type SharedTaskProject } from '../stores/useTaskStore.ts';

export interface UseSharedProjectResult {
  shareToken: string | null;
  isSharedReadOnly: boolean;
  project: SharedTaskProject | null;
  tasks: Task[];
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  loading: boolean;
  error: string | null;
}

export function useSharedProject(): UseSharedProjectResult {
  const shareToken = useTaskStore((state) => state.shareToken);
  const isSharedReadOnly = useTaskStore((state) => state.isSharedReadOnly);
  const project = useTaskStore((state) => state.project);
  const tasks = useTaskStore((state) => state.tasks);
  const setTasks = useTaskStore((state) => state.setTasks);
  const loading = useTaskStore((state) => state.loading);
  const error = useTaskStore((state) => state.error);

  return {
    shareToken,
    isSharedReadOnly,
    project,
    tasks,
    setTasks,
    loading,
    error,
  };
}
