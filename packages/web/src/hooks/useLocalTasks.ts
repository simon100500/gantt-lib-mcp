import type { Task } from '../types.ts';
import { useTaskStore } from '../stores/useTaskStore.ts';

export interface UseLocalTasksResult {
  tasks: Task[];
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  loading: boolean;
  error: string | null;
  isDemoMode: boolean;
  projectName: string;
  setProjectName: (name: string) => void;
}

export function useLocalTasks(): UseLocalTasksResult {
  const tasks = useTaskStore((state) => state.tasks);
  const setTasks = useTaskStore((state) => state.setTasks);
  const loading = useTaskStore((state) => state.loading);
  const error = useTaskStore((state) => state.error);
  const isDemoMode = useTaskStore((state) => state.isDemoMode);
  const projectName = useTaskStore((state) => state.projectName);
  const setProjectName = useTaskStore((state) => state.setProjectName);

  return {
    tasks,
    setTasks,
    loading,
    error,
    isDemoMode,
    projectName,
    setProjectName,
  };
}
