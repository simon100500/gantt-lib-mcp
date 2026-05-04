import { create } from 'zustand';

import { normalizeTasks, type CalendarDay, type ProjectDependency, type Task } from '../types.ts';
import type { ProjectLoadResponse } from '../lib/apiTypes.ts';
import { useAuthStore } from './useAuthStore.ts';
import { useProjectStore } from './useProjectStore.ts';

const LOCAL_STORAGE_KEY = 'gantt_local_tasks';
const PROJECT_NAME_KEY = 'gantt_project_name';
const DEFAULT_PROJECT_NAME = 'Мой проект';

export interface SharedTaskProject {
  id: string;
  name: string;
  ganttDayMode: 'business' | 'calendar';
  calendarId?: string | null;
  calendarDays?: CalendarDay[];
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

function normalizeProjectResources(resources: ProjectLoadResponse['snapshot']['resources'] | undefined): ProjectLoadResponse['snapshot']['resources'] {
  if (!Array.isArray(resources)) {
    return [];
  }

  return resources.flatMap((resource) => {
    if (!resource || typeof resource !== 'object') {
      return [];
    }

    const id = typeof resource.id === 'string' ? resource.id : '';
    const userId = typeof resource.userId === 'string' ? resource.userId : '';
    const projectId = typeof resource.projectId === 'string'
      ? resource.projectId
      : resource.projectId === null
        ? null
        : null;
    const scope = resource.scope === 'project' ? 'project' : resource.scope === 'shared' ? 'shared' : null;
    const name = typeof resource.name === 'string' ? resource.name : '';
    const type = resource.type === 'equipment' || resource.type === 'material' || resource.type === 'other'
      ? resource.type
      : resource.type === 'human'
        ? 'human'
        : null;
    const isActive = typeof resource.isActive === 'boolean' ? resource.isActive : null;
    const createdAt = typeof resource.createdAt === 'string' ? resource.createdAt : '';
    const updatedAt = typeof resource.updatedAt === 'string' ? resource.updatedAt : '';
    const deactivatedAt = typeof resource.deactivatedAt === 'string'
      ? resource.deactivatedAt
      : resource.deactivatedAt === null
        ? null
        : null;

    if (!id || !userId || !scope || !name || !type || isActive === null || !createdAt || !updatedAt) {
      return [];
    }

    if ((scope === 'shared' && projectId !== null) || (scope === 'project' && !projectId)) {
      return [];
    }

    return [{
      id,
      userId,
      projectId,
      scope,
      name,
      type,
      isActive,
      createdAt,
      updatedAt,
      deactivatedAt,
    }];
  });
}

function normalizeTaskAssignments(
  assignments: ProjectLoadResponse['snapshot']['assignments'] | undefined,
  resources: ProjectLoadResponse['snapshot']['resources'],
  currentProjectId: string,
): ProjectLoadResponse['snapshot']['assignments'] {
  if (!Array.isArray(assignments)) {
    return [];
  }

  const visibleResourcesById = new Map(
    resources
      .filter((resource) => resource.scope === 'shared' || resource.projectId === currentProjectId)
      .map((resource) => [resource.id, resource]),
  );

  return assignments.flatMap((assignment) => {
    if (!assignment || typeof assignment !== 'object') {
      return [];
    }

    const id = typeof assignment.id === 'string' ? assignment.id : '';
    const projectId = typeof assignment.projectId === 'string' ? assignment.projectId : '';
    const taskId = typeof assignment.taskId === 'string' ? assignment.taskId : '';
    const resourceId = typeof assignment.resourceId === 'string' ? assignment.resourceId : '';
    const createdAt = typeof assignment.createdAt === 'string' ? assignment.createdAt : '';

    if (!id || !projectId || !taskId || !resourceId || !createdAt || !visibleResourcesById.has(resourceId)) {
      return [];
    }

    return [{
      id,
      projectId,
      taskId,
      resourceId,
      createdAt,
    }];
  });
}

function normalizeTaskProgressEntries(
  progressEntries: ProjectLoadResponse['snapshot']['progressEntries'] | undefined,
): ProjectLoadResponse['snapshot']['progressEntries'] {
  if (!Array.isArray(progressEntries)) {
    return [];
  }

  return progressEntries.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') {
      return [];
    }

    const id = typeof entry.id === 'string' ? entry.id : '';
    const projectId = typeof entry.projectId === 'string' ? entry.projectId : '';
    const taskId = typeof entry.taskId === 'string' ? entry.taskId : '';
    const entryDate = typeof entry.entryDate === 'string' ? entry.entryDate : '';
    const amount = typeof entry.amount === 'number' && Number.isFinite(entry.amount) ? entry.amount : null;
    const createdAt = typeof entry.createdAt === 'string' ? entry.createdAt : '';
    const updatedAt = typeof entry.updatedAt === 'string' ? entry.updatedAt : '';

    if (!id || !projectId || !taskId || !entryDate || amount === null || !createdAt || !updatedAt) {
      return [];
    }

    return [{ id, projectId, taskId, entryDate, amount, createdAt, updatedAt }];
  });
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
        return await retryResponse.json() as ProjectLoadResponse;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.json() as ProjectLoadResponse;
    };

    try {
      const project = await runRequest(accessToken);
      if (get().currentRequestId !== requestId || !project) {
        return;
      }

      const normalizedTasks = normalizeTasks(project.snapshot.tasks);
      const normalizedResources = normalizeProjectResources(project.snapshot.resources);
      const normalizedAssignments = normalizeTaskAssignments(project.snapshot.assignments, normalizedResources, project.project.id);
      const normalizedProgressEntries = normalizeTaskProgressEntries(project.snapshot.progressEntries);
      useProjectStore.getState().hydrateConfirmed(project.version, {
        tasks: normalizedTasks,
        dependencies: project.snapshot.dependencies,
      }, {
        resources: normalizedResources,
        assignments: normalizedAssignments,
        progressEntries: normalizedProgressEntries,
      });
      const authState = useAuthStore.getState();
      if (authState.project) {
        const updatedProject = authState.project.id === project.project.id
          ? { ...authState.project, ...project.project }
          : authState.project;
        const updatedProjects = authState.projects.map((item) => (
          item.id === project.project.id ? { ...item, ...project.project } : item
        ));
        useAuthStore.setState({
          project: updatedProject,
          projects: updatedProjects,
        });
      }

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
    }, {
      resources: [],
      assignments: [],
      progressEntries: [],
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
    }, {
      resources: [],
      assignments: [],
      progressEntries: [],
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
