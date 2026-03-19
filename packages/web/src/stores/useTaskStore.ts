import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { Task } from '../types.ts';

const LOCAL_STORAGE_KEY = 'gantt_local_tasks';
const PROJECT_NAME_KEY = 'gantt_project_name';
const DEFAULT_PROJECT_NAME = 'Мой проект';

export interface SharedTaskProject {
  id: string;
  name: string;
}

export type TaskSource = 'local' | 'auth' | 'shared';

export interface UseTaskStoreSyncOptions {
  accessToken: string | null;
  refreshAccessToken: () => Promise<string | null>;
  shareToken: string | null;
}

interface SharedResponse {
  project: SharedTaskProject;
  tasks: Task[];
}

interface LocalSnapshot {
  tasks: Task[];
  isDemoMode: boolean;
  projectName: string;
}

interface TaskState {
  tasks: Task[];
  loading: boolean;
  error: string | null;
  activeSource: TaskSource;
  shareToken: string | null;
  project: SharedTaskProject | null;
  isSharedReadOnly: boolean;
  isDemoMode: boolean;
  projectName: string;
  authToken: string | null;
  currentRequestId: number;
  collapsedParentIds: Set<string>;
  toggleCollapse: (parentId: string) => void;
  collapseAll: () => void;
  expandAll: () => void;
  setTasks: (tasks: Task[] | ((prev: Task[]) => Task[])) => void;
  replaceFromSystem: (tasks: Task[]) => void;
  fetchTasks: (accessToken: string, refreshAccessToken: () => Promise<string | null>) => Promise<void>;
  loadLocal: () => void;
  loadShared: (shareToken: string) => Promise<void>;
  syncSource: (options: UseTaskStoreSyncOptions) => Promise<void>;
  setProjectName: (name: string) => void;
}

let requestCounter = 0;

function getInitialShareToken(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return new URLSearchParams(window.location.search).get('share');
}

function isLegacyDemoTaskSet(tasks: Task[]): boolean {
  return tasks.length > 0 && tasks.every((task) => task.id.startsWith('demo-'));
}

function persistLocalTasks(tasks: Task[]) {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(tasks));
}

function loadLocalSnapshot(): LocalSnapshot {
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
    } catch (error) {
      console.error('Failed to parse local tasks:', error);
      localStorage.removeItem(LOCAL_STORAGE_KEY);
    }
  }

  return { tasks: [], isDemoMode: false, projectName };
}

export const useTaskStore = create<TaskState>()(
  persist(
    (set, get) => ({
      tasks: [],
      loading: false,
      error: null,
      activeSource: getInitialShareToken() ? 'shared' : 'local',
      shareToken: getInitialShareToken(),
      project: null,
      isSharedReadOnly: false,
      isDemoMode: false,
      projectName: DEFAULT_PROJECT_NAME,
      authToken: null,
      currentRequestId: 0,
      collapsedParentIds: new Set<string>(),
      toggleCollapse: (parentId) => {
        set((state) => {
          const newSet = new Set(state.collapsedParentIds);
          if (newSet.has(parentId)) {
            newSet.delete(parentId);
          } else {
            newSet.add(parentId);
          }
          return { collapsedParentIds: newSet };
        });
      },
      collapseAll: () => {
        const allParentIds = get().tasks
          .filter(t => t.parentId === null && get().tasks.some(c => c.parentId === t.id))
          .map(t => t.id);
        set({ collapsedParentIds: new Set(allParentIds) });
      },
      expandAll: () => set({ collapsedParentIds: new Set() }),
  setTasks: (tasks) => {
    set((state) => {
      const nextTasks = typeof tasks === 'function' ? tasks(state.tasks) : tasks;
      if (state.activeSource === 'local') {
        persistLocalTasks(nextTasks);
      }

      return {
        tasks: nextTasks,
        error: null,
      };
    });
  },
  replaceFromSystem: (tasks) => {
    set((state) => ({
      tasks,
      loading: false,
      error: null,
      ...(state.activeSource === 'local' ? (() => {
        persistLocalTasks(tasks);
        return {};
      })() : {}),
    }));
  },
  fetchTasks: async (accessToken, refreshAccessToken) => {
    const requestId = ++requestCounter;
    set({
      activeSource: 'auth',
      authToken: accessToken,
      shareToken: null,
      project: null,
      isSharedReadOnly: false,
      loading: true,
      error: null,
      currentRequestId: requestId,
    });

    const runRequest = async (token: string) => {
      const response = await fetch('/api/tasks', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.status === 401) {
        const refreshedToken = await refreshAccessToken();
        if (!refreshedToken) {
          return null;
        }

        const retryResponse = await fetch('/api/tasks', {
          headers: { Authorization: `Bearer ${refreshedToken}` },
        });

        if (!retryResponse.ok) {
          throw new Error(`HTTP ${retryResponse.status}`);
        }

        set({ authToken: refreshedToken });
        return retryResponse.json() as Promise<Task[]>;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return response.json() as Promise<Task[]>;
    };

    try {
      const tasks = await runRequest(accessToken);
      if (get().currentRequestId !== requestId || !tasks) {
        return;
      }

      set({
        tasks,
        loading: false,
        error: null,
      });
    } catch (error) {
      if (get().currentRequestId !== requestId) {
        return;
      }

      set({
        loading: false,
        error: String(error),
      });
    }
  },
  loadLocal: () => {
    const requestId = ++requestCounter;
    const snapshot = loadLocalSnapshot();

    set({
      tasks: snapshot.tasks,
      loading: false,
      error: null,
      activeSource: 'local',
      shareToken: null,
      project: null,
      isSharedReadOnly: false,
      isDemoMode: snapshot.isDemoMode,
      projectName: snapshot.projectName,
      authToken: null,
      currentRequestId: requestId,
    });
  },
  loadShared: async (shareToken) => {
    const requestId = ++requestCounter;
    set({
      activeSource: 'shared',
      shareToken,
      authToken: null,
      project: null,
      isSharedReadOnly: false,
      loading: true,
      error: null,
      currentRequestId: requestId,
    });

    try {
      const response = await fetch(`/api/share?token=${encodeURIComponent(shareToken)}`);
      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: `HTTP ${response.status}` })) as { error?: string };
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      const data = await response.json() as SharedResponse;
      if (get().currentRequestId !== requestId) {
        return;
      }

      set({
        tasks: data.tasks,
        project: data.project,
        isSharedReadOnly: true,
        loading: false,
        error: null,
      });
    } catch (error) {
      if (get().currentRequestId !== requestId) {
        return;
      }

      set({
        loading: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
  syncSource: async ({ accessToken, refreshAccessToken, shareToken }) => {
    const state = get();

    if (shareToken) {
      if (state.activeSource === 'shared' && state.shareToken === shareToken && !state.loading) {
        return;
      }

      await state.loadShared(shareToken);
      return;
    }

    if (accessToken) {
      if (state.activeSource === 'auth' && state.authToken === accessToken && !state.loading) {
        return;
      }

      await state.fetchTasks(accessToken, refreshAccessToken);
      return;
    }

    if (state.activeSource === 'local' && !state.loading) {
      return;
    }

    state.loadLocal();
  },
  setProjectName: (name) => {
    localStorage.setItem(PROJECT_NAME_KEY, name);
    set({ projectName: name });
  },
    }),
    {
      name: 'gantt_collapsed_parents',
      partialize: (state) => ({
        collapsedParentIds: Array.from(state.collapsedParentIds),
      }),
      merge: (persistedState: any, currentState) => ({
        ...currentState,
        ...persistedState,
        collapsedParentIds: new Set(persistedState.collapsedParentIds || []),
      }),
    }
  )
);
