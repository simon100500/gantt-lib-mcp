import { useState, useEffect, useCallback } from 'react';
import type { Task } from '../types.ts';

const LOCAL_STORAGE_KEY = 'gantt_local_tasks';

export interface UseLocalTasksResult {
  tasks: Task[];
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  loading: boolean;  // Always false (local)
  error: string | null;  // Always null (local)
}

/**
 * localStorage-based task storage hook for unauthenticated users.
 * Provides the same interface as useTasks but works entirely client-side.
 */
export function useLocalTasks(): UseLocalTasksResult {
  const [tasks, setTasks] = useState<Task[]>([]);

  // Load tasks from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as Task[];
        setTasks(parsed);
      } catch (err) {
        console.error('Failed to parse local tasks:', err);
        // Clear invalid data
        localStorage.removeItem(LOCAL_STORAGE_KEY);
      }
    }
  }, []);

  // Persist tasks to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(tasks));
  }, [tasks]);

  return {
    tasks,
    setTasks,
    loading: false,  // No async operation
    error: null,     // No network errors
  };
}
