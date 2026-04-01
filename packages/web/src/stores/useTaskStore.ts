import { create } from 'zustand';

import { normalizeTasks, type ProjectDependency, type Task } from '../types.ts';
import { useProjectStore } from './useProjectStore.ts';

const LOCAL_STORAGE_KEY = 'gantt_local_tasks';
const PROJECT_NAME_KEY = 'gantt_project_name';
const DEFAULT_PROJECT_NAME = 'Мой проект';

export interface SharedTaskProject {
  id: string;
  name: string;
  ganttDayMode: 'business' | 'calendar';
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

interface LoadProjectResponse {
  version: number;
  snapshot: {
    tasks: Task[];
    dependencies: ProjectDependency[];
  };
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
      const normalized = normalizeTasks(parsed);

      if (isLegacyDemoTaskSet(normalized)) {
        localStorage.removeItem(LOCAL_STORAGE_KEY);
        return { tasks: [], isDemoMode: false, projectName };
      }

      return { tasks: normalized, isDemoMode: false, projectName };
    } catch (error) {
      console.error('Failed to parse local tasks:', error);
      localStorage.removeItem(LOCAL_STORAGE_KEY);
    }
  }

  return { tasks: [], isDemoMode: false, projectName };
}

export const useTaskStore = create<TaskState>()((set, get) => ({
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
  setTasks: (tasks) => {
    set((state) => {
      const candidateTasks = typeof tasks === 'function' ? tasks(state.tasks) : tasks;
      const nextTasks = normalizeTasks(candidateTasks);
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
    const normalizedTasks = normalizeTasks(tasks);
    set((state) => ({
      tasks: normalizedTasks,
      loading: false,
      error: null,
      ...(state.activeSource === 'local' ? (() => {
        persistLocalTasks(normalizedTasks);
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
      const response = await fetch('/api/project', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.status === 401) {
        const refreshedToken = await refreshAccessToken();
        if (!refreshedToken) {
          return null;
        }

        const retryResponse = await fetch('/api/project', {
          headers: { Authorization: `Bearer ${refreshedToken}` },
        });

        if (!retryResponse.ok) {
          throw new Error(`HTTP ${retryResponse.status}`);
        }

        set({ authToken: refreshedToken });
        return await retryResponse.json() as LoadProjectResponse;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.json() as LoadProjectResponse;
    };

    try {
      const project = await runRequest(accessToken);
      if (get().currentRequestId !== requestId || !project) {
        return;
      }

      const normalizedTasks = normalizeTasks(project.snapshot.tasks);
      useProjectStore.getState().hydrateConfirmed(project.version, {
        tasks: normalizedTasks,
        dependencies: project.snapshot.dependencies,
      });

      set({
        tasks: normalizedTasks,
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
    useProjectStore.getState().hydrateConfirmed(0, {
      tasks: snapshot.tasks,
      dependencies: [],
    });

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
    useProjectStore.getState().hydrateConfirmed(0, {
      tasks: [],
      dependencies: [],
    });
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
        tasks: normalizeTasks(data.tasks),
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
      if (
        state.activeSource === 'shared'
        && state.shareToken === shareToken
        && state.isSharedReadOnly
        && state.project
        && !state.loading
      ) {
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
}));
