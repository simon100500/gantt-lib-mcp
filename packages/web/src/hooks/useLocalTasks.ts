import { useState, useCallback } from 'react';
import type { Task } from '../types.ts';

const LOCAL_STORAGE_KEY = 'gantt_local_tasks';
const PROJECT_NAME_KEY = 'gantt_project_name';
const DEFAULT_PROJECT_NAME = '\u041c\u043e\u0439 \u043f\u0440\u043e\u0435\u043a\u0442';

function isLegacyDemoTaskSet(tasks: Task[]): boolean {
  return tasks.length > 0 && tasks.every(task => task.id.startsWith('demo-'));
}

export interface UseLocalTasksResult {
  tasks: Task[];
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  loading: boolean;
  error: string | null;
  isDemoMode: boolean;
  projectName: string;
  setProjectName: (name: string) => void;
}

/**
 * localStorage-based task storage hook for unauthenticated users.
 * Provides the same interface as useTasks but works entirely client-side.
 * Uses an empty task list when no local data exists.
 */
function loadInitialState(): { tasks: Task[]; isDemoMode: boolean; projectName: string } {
  const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
  const projectName = localStorage.getItem(PROJECT_NAME_KEY) || DEFAULT_PROJECT_NAME;

  if (stored) {
    try {
      const parsed = JSON.parse(stored) as Task[];

      if (isLegacyDemoTaskSet(parsed)) {
        localStorage.removeItem(LOCAL_STORAGE_KEY);
        return { tasks: [], isDemoMode: false, projectName };
      }

      return { tasks: parsed, isDemoMode: false, projectName };
    } catch (err) {
      console.error('Failed to parse local tasks:', err);
      localStorage.removeItem(LOCAL_STORAGE_KEY);
    }
  }

  return { tasks: [], isDemoMode: false, projectName };
}

export function useLocalTasks(): UseLocalTasksResult {
  const [{ tasks, projectName }, setState] = useState(() => loadInitialState());

  const setTasks: React.Dispatch<React.SetStateAction<Task[]>> = useCallback((updater) => {
    setState(prev => {
      const newTasks = typeof updater === 'function' ? (updater as (prev: Task[]) => Task[])(prev.tasks) : updater;
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(newTasks));
      return { tasks: newTasks, isDemoMode: false, projectName: prev.projectName };
    });
  }, []);

  const setProjectName = useCallback((name: string) => {
    localStorage.setItem(PROJECT_NAME_KEY, name);
    setState(prev => ({ ...prev, projectName: name }));
  }, []);

  return {
    tasks,
    setTasks,
    loading: false,
    error: null,
    isDemoMode: false,
    projectName,
    setProjectName,
  };
}
