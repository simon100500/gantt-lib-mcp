import { useState, useCallback } from 'react';
import type { Task } from '../types.ts';
import { normalizeTaskOrder, sortTasksByOrder } from '../lib/taskOrder.ts';

const LOCAL_STORAGE_KEY = 'gantt_local_tasks';
const DEMO_MODE_KEY = 'gantt_demo_mode';
const PROJECT_NAME_KEY = 'gantt_project_name';

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
  projectName: string;
  setProjectName: (name: string) => void;
}

/**
 * localStorage-based task storage hook for unauthenticated users.
 * Provides the same interface as useTasks but works entirely client-side.
 * Shows demo project when no local data exists.
 */
// Helper function to load initial state (synchronous)
function loadInitialState(): { tasks: Task[]; isDemoMode: boolean; projectName: string } {
  const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
  const demoMode = localStorage.getItem(DEMO_MODE_KEY);
  const projectName = localStorage.getItem(PROJECT_NAME_KEY) || 'Мой проект';

  if (stored) {
    try {
      const parsed = JSON.parse(stored) as Task[];
      return {
        tasks: normalizeTaskOrder(sortTasksByOrder(parsed)),
        isDemoMode: demoMode === 'true',
        projectName,
      };
    } catch (err) {
      console.error('Failed to parse local tasks:', err);
      // Clear invalid data
      localStorage.removeItem(LOCAL_STORAGE_KEY);
      localStorage.removeItem(DEMO_MODE_KEY);
    }
  }

  // No local data or invalid data, show demo project
  localStorage.setItem(DEMO_MODE_KEY, 'true');
  return { tasks: normalizeTaskOrder(DEMO_TASKS), isDemoMode: true, projectName };
}

export function useLocalTasks(): UseLocalTasksResult {
  // Single lazy initialization call - more reliable
  const [{ tasks, isDemoMode, projectName }, setState] = useState(() => loadInitialState());

  const setTasks: React.Dispatch<React.SetStateAction<Task[]>> = useCallback((updater) => {
    setState(prev => {
      const newTasks = typeof updater === 'function' ? (updater as (prev: Task[]) => Task[])(prev.tasks) : updater;
      const normalizedTasks = normalizeTaskOrder(sortTasksByOrder(newTasks));

      // If we're in demo mode and tasks changed, exit demo mode
      if (prev.isDemoMode && JSON.stringify(normalizedTasks) !== JSON.stringify(normalizeTaskOrder(DEMO_TASKS))) {
        localStorage.setItem(DEMO_MODE_KEY, 'false');
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(normalizedTasks));
        return { tasks: normalizedTasks, isDemoMode: false, projectName: prev.projectName };
      }

      // Persist tasks if not in demo mode
      if (!prev.isDemoMode) {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(normalizedTasks));
      }

      return { tasks: normalizedTasks, isDemoMode: prev.isDemoMode, projectName: prev.projectName };
    });
  }, []);

  const setProjectName = useCallback((name: string) => {
    localStorage.setItem(PROJECT_NAME_KEY, name);
    setState(prev => ({ ...prev, projectName: name }));
  }, []);

  return {
    tasks,
    setTasks,
    loading: false,  // No async operation
    error: null,     // No network errors
    isDemoMode,
    projectName,
    setProjectName,
  };
}
