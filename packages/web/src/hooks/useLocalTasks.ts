import { useState, useEffect, useCallback } from 'react';
import type { Task } from '../types.ts';

const LOCAL_STORAGE_KEY = 'gantt_local_tasks';
const DEMO_MODE_KEY = 'gantt_demo_mode';

// Demo project tasks with realistic dependencies
const DEMO_TASKS: Task[] = [
  {
    id: 'demo-1',
    name: 'Проектирование базы данных',
    startDate: '2026-03-10',
    endDate: '2026-03-12',
    color: '#3b82f6',
    progress: 100,
    accepted: true,
  },
  {
    id: 'demo-2',
    name: 'Разработка API эндпоинтов',
    startDate: '2026-03-13',
    endDate: '2026-03-16',
    color: '#8b5cf6',
    progress: 60,
    dependencies: [{ taskId: 'demo-1', type: 'FS' }],
  },
  {
    id: 'demo-3',
    name: 'Создание UI компонентов',
    startDate: '2026-03-13',
    endDate: '2026-03-17',
    color: '#ec4899',
    progress: 40,
  },
  {
    id: 'demo-4',
    name: 'Интеграция фронтенда с бэкендом',
    startDate: '2026-03-17',
    endDate: '2026-03-20',
    color: '#f59e0b',
    progress: 0,
    dependencies: [
      { taskId: 'demo-2', type: 'FS' },
      { taskId: 'demo-3', type: 'FS' },
    ],
  },
  {
    id: 'demo-5',
    name: 'Тестирование и деплой',
    startDate: '2026-03-21',
    endDate: '2026-03-23',
    color: '#10b981',
    progress: 0,
    dependencies: [{ taskId: 'demo-4', type: 'FS' }],
  },
];

export interface UseLocalTasksResult {
  tasks: Task[];
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  loading: boolean;  // Always false (local)
  error: string | null;  // Always null (local)
  isDemoMode: boolean;
}

/**
 * localStorage-based task storage hook for unauthenticated users.
 * Provides the same interface as useTasks but works entirely client-side.
 * Shows demo project when no local data exists.
 */
// Helper function to load initial state (synchronous)
function loadInitialState(): { tasks: Task[]; isDemoMode: boolean } {
  const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
  const demoMode = localStorage.getItem(DEMO_MODE_KEY);

  if (stored) {
    try {
      const parsed = JSON.parse(stored) as Task[];
      return { tasks: parsed, isDemoMode: demoMode === 'true' };
    } catch (err) {
      console.error('Failed to parse local tasks:', err);
      // Clear invalid data
      localStorage.removeItem(LOCAL_STORAGE_KEY);
      localStorage.removeItem(DEMO_MODE_KEY);
    }
  }

  // No local data or invalid data, show demo project
  localStorage.setItem(DEMO_MODE_KEY, 'true');
  return { tasks: DEMO_TASKS, isDemoMode: true };
}

export function useLocalTasks(): UseLocalTasksResult {
  // Lazy initialization with synchronous localStorage read
  const initialState = loadInitialState();
  const [tasks, setTasks] = useState<Task[]>(initialState.tasks);
  const [isDemoMode, setIsDemoMode] = useState(initialState.isDemoMode);

  // Persist tasks to localStorage whenever they change
  useEffect(() => {
    if (isDemoMode) {
      // Don't persist demo tasks to localStorage
      // They stay as the default until user makes changes
      return;
    }
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(tasks));
  }, [tasks, isDemoMode]);

  // Transition out of demo mode when tasks are modified
  const wrappedSetTasks: React.Dispatch<React.SetStateAction<Task[]>> = useCallback((updater) => {
    setTasks(prev => {
      const newTasks = typeof updater === 'function' ? (updater as (prev: Task[]) => Task[])(prev) : updater;

      // If we're in demo mode and tasks changed, exit demo mode
      if (isDemoMode && JSON.stringify(newTasks) !== JSON.stringify(DEMO_TASKS)) {
        setIsDemoMode(false);
        localStorage.setItem(DEMO_MODE_KEY, 'false');
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(newTasks));
      }

      return newTasks;
    });
  }, [isDemoMode]);

  return {
    tasks,
    setTasks: wrappedSetTasks,
    loading: false,  // No async operation
    error: null,     // No network errors
    isDemoMode,
  };
}
