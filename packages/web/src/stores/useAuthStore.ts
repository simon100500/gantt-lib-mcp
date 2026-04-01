import { create } from 'zustand';
import type { CalendarDay } from '../types';

function getTokenExpMs(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1])) as { exp?: number };
    if (typeof payload.exp !== 'number') return null;
    return payload.exp * 1000;
  } catch {
    return null;
  }
}

const ACCESS_TOKEN_KEY = 'gantt_access_token';
const REFRESH_TOKEN_KEY = 'gantt_refresh_token';
const USER_KEY = 'gantt_user';
const PROJECT_KEY = 'gantt_project';
const PROJECTS_KEY = 'gantt_projects';
const AUTH_STORAGE_KEYS = [ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY, USER_KEY, PROJECT_KEY, PROJECTS_KEY] as const;

export interface AuthUser {
  id: string;
  email: string;
}

export type GanttDayMode = 'business' | 'calendar';

export interface AuthProject {
  id: string;
  name: string;
  ganttDayMode: GanttDayMode;
  calendarId?: string | null;
  calendarDays?: CalendarDay[];
  taskCount?: number;
}

export interface AuthState {
  isAuthenticated: boolean;
  user: AuthUser | null;
  project: AuthProject | null;
  accessToken: string | null;
  projects: AuthProject[];
  projectLimitReached: boolean;
}

export interface UseAuthResult extends AuthState {
  login(tokens: { accessToken: string; refreshToken: string }, user: AuthUser, project: AuthProject): void;
  logout(): void;
  switchProject(projectId: string): Promise<void>;
  createProject(name: string): Promise<AuthProject | null>;
  updateProject(projectId: string, updates: { name?: string; ganttDayMode?: GanttDayMode; calendarId?: string | null }): Promise<AuthProject>;
  syncProjectTaskCount(projectId: string, taskCount: number): void;
  refreshAccessToken(): Promise<string | null>;
  refreshProjects(): Promise<void>;
}

interface StoredAuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  project: AuthProject | null;
  projects: AuthProject[];
}

type AuthStore = UseAuthResult;

const INITIAL_AUTH_STATE: AuthState = {
  isAuthenticated: false,
  user: null,
  project: null,
  accessToken: null,
  projects: [],
  projectLimitReached: false,
};

let refreshPromise: Promise<string | null> | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let listenersInitialized = false;

function canUseDOM(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function clearStoredAuth(): void {
  if (!canUseDOM()) return;

  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
  window.localStorage.removeItem(PROJECT_KEY);
  window.localStorage.removeItem(PROJECTS_KEY);
}

function persistStoredAuth(nextState: StoredAuthState): void {
  if (!canUseDOM()) return;

  const { accessToken, refreshToken, user, project, projects } = nextState;

  if (accessToken) {
    window.localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  } else {
    window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  }

  if (refreshToken) {
    window.localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  } else {
    window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  }

  if (user) {
    window.localStorage.setItem(USER_KEY, JSON.stringify(user));
  } else {
    window.localStorage.removeItem(USER_KEY);
  }

  if (project) {
    window.localStorage.setItem(PROJECT_KEY, JSON.stringify(project));
  } else {
    window.localStorage.removeItem(PROJECT_KEY);
  }

  window.localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
}

function readStoredAuth(): StoredAuthState | null {
  if (!canUseDOM()) return null;

  const accessToken = window.localStorage.getItem(ACCESS_TOKEN_KEY);
  const refreshToken = window.localStorage.getItem(REFRESH_TOKEN_KEY);
  const userStr = window.localStorage.getItem(USER_KEY);
  const projectStr = window.localStorage.getItem(PROJECT_KEY);
  const projectsStr = window.localStorage.getItem(PROJECTS_KEY);

  if (!accessToken || !userStr || !projectStr) {
    return null;
  }

  try {
    const user = JSON.parse(userStr) as AuthUser;
    const project = JSON.parse(projectStr) as AuthProject;
    const projects = projectsStr ? JSON.parse(projectsStr) as AuthProject[] : [project];

    return {
      accessToken,
      refreshToken,
      user,
      project,
      projects,
    };
  } catch {
    clearStoredAuth();
    return null;
  }
}

function toAuthState(storedState: StoredAuthState | null): AuthState {
  if (!storedState?.accessToken || !storedState.user || !storedState.project) {
    return INITIAL_AUTH_STATE;
  }

  return {
    isAuthenticated: true,
    user: storedState.user,
    project: storedState.project,
    accessToken: storedState.accessToken,
    projects: storedState.projects.length > 0 ? storedState.projects : [storedState.project],
    projectLimitReached: false,
  };
}

function getRefreshToken(): string | null {
  return canUseDOM() ? window.localStorage.getItem(REFRESH_TOKEN_KEY) : null;
}

async function fetchProjects(accessToken: string): Promise<AuthProject[]> {
  const response = await fetch('/api/projects', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const data = await response.json() as { projects: AuthProject[] };
  return data.projects;
}

async function fetchWithAuthRetry(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<{ response: Response; token: string | null }> {
  let token = useAuthStore.getState().accessToken;
  if (!token) {
    return { response: new Response(null, { status: 401 }), token: null };
  }

  const withToken = (accessToken: string): RequestInit => ({
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${accessToken}`,
    },
  });

  let response = await fetch(input, withToken(token));
  if (response.status !== 401) {
    return { response, token };
  }

  token = await useAuthStore.getState().refreshAccessToken();
  if (!token) {
    return { response, token: null };
  }

  response = await fetch(input, withToken(token));
  return { response, token };
}

function scheduleRefresh(accessToken: string | null): void {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }

  if (!accessToken) {
    return;
  }

  const expMs = getTokenExpMs(accessToken);
  if (!expMs) {
    return;
  }

  const refreshAt = expMs - Date.now() - 2 * 60 * 1000;
  if (refreshAt <= 0) {
    void useAuthStore.getState().refreshAccessToken();
    return;
  }

  refreshTimer = setTimeout(() => {
    void useAuthStore.getState().refreshAccessToken();
  }, refreshAt);
}

function initializeStoreListeners(): void {
  if (!canUseDOM() || listenersInitialized) {
    return;
  }

  listenersInitialized = true;
  useAuthStore.setState(toAuthState(readStoredAuth()));

  let previousAccessToken = useAuthStore.getState().accessToken;
  scheduleRefresh(previousAccessToken);

  useAuthStore.subscribe((state) => {
    if (state.accessToken === previousAccessToken) {
      return;
    }

    previousAccessToken = state.accessToken;
    scheduleRefresh(state.accessToken);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;

    const token = useAuthStore.getState().accessToken;
    if (!token) return;

    const expMs = getTokenExpMs(token);
    if (!expMs) return;

    if (expMs - Date.now() < 5 * 60 * 1000) {
      void useAuthStore.getState().refreshAccessToken();
    }
  });

  window.addEventListener('storage', (event) => {
    if (!event.key || !AUTH_STORAGE_KEYS.includes(event.key as typeof AUTH_STORAGE_KEYS[number])) {
      return;
    }

    useAuthStore.setState(toAuthState(readStoredAuth()));
  });
}

function persistAuthSnapshot(state: {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  project: AuthProject | null;
  projects: AuthProject[];
}): void {
  persistStoredAuth({
    accessToken: state.accessToken,
    refreshToken: state.refreshToken,
    user: state.user,
    project: state.project,
    projects: state.projects,
  });
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  ...INITIAL_AUTH_STATE,

  login(tokens, user, project) {
    const fallbackProjects = [project];

    persistStoredAuth({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user,
      project,
      projects: fallbackProjects,
    });

    set({
      isAuthenticated: true,
      user,
      project,
      accessToken: tokens.accessToken,
      projects: fallbackProjects,
    });

    void fetchProjects(tokens.accessToken)
      .then((projects) => {
        const nextProjects = projects.length > 0 ? projects : fallbackProjects;
        persistStoredAuth({
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          user,
          project,
          projects: nextProjects,
        });

        set({
          isAuthenticated: true,
          user,
          project,
          accessToken: tokens.accessToken,
          projects: nextProjects,
        });
      })
      .catch((error) => {
        console.error('Failed to fetch projects:', error);
      });
  },

  logout() {
    clearStoredAuth();
    set(INITIAL_AUTH_STATE);
  },

  async refreshAccessToken() {
    if (refreshPromise) {
      return refreshPromise;
    }

    refreshPromise = (async () => {
      const refreshToken = getRefreshToken();
      if (!refreshToken) {
        get().logout();
        return null;
      }

      try {
        const response = await fetch('/api/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });

        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            get().logout();
          }
          return null;
        }

        const data = await response.json() as { accessToken: string; refreshToken: string };
        const state = get();

        persistStoredAuth({
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          user: state.user,
          project: state.project,
          projects: state.projects,
        });

        set({
          accessToken: data.accessToken,
          isAuthenticated: true,
        });

        return data.accessToken;
      } catch (error) {
        console.warn('[useAuthStore] refreshAccessToken network error', error);
        return null;
      } finally {
        refreshPromise = null;
      }
    })();

    return refreshPromise;
  },

  async switchProject(projectId) {
    if (!get().accessToken) {
      get().logout();
      return;
    }

    const { response } = await fetchWithAuthRetry('/api/auth/switch-project', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ projectId }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json() as {
      accessToken: string;
      refreshToken: string;
      project: AuthProject;
    };

    let projects = get().projects;
    try {
      const fetchedProjects = await fetchProjects(data.accessToken);
      projects = fetchedProjects.length > 0 ? fetchedProjects : projects;
    } catch (error) {
      console.error('Failed to refresh projects after switch:', error);
    }

    const state = get();
    persistStoredAuth({
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      user: state.user,
      project: data.project,
      projects,
    });

    set({
      accessToken: data.accessToken,
      project: data.project,
      projects,
      isAuthenticated: true,
    });
  },

  async createProject(name) {
    if (!get().accessToken) {
      return null;
    }

    try {
      const { response } = await fetchWithAuthRetry('/api/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name }),
      });

      if (response.status === 403) {
        set({ projectLimitReached: true });
        return null;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json() as { project: AuthProject };
      const state = get();
      const hasProject = state.projects.some((project) => project.id === data.project.id);
      const projects = hasProject ? state.projects : [...state.projects, data.project];

      persistStoredAuth({
        accessToken: state.accessToken,
        refreshToken: getRefreshToken(),
        user: state.user,
        project: state.project,
        projects,
      });

      set({ projects });
      return data.project;
    } catch (error) {
      console.error('Failed to create project:', error);
      return null;
    }
  },

  async updateProject(projectId, updates) {
    const state = get();
    if (!state.accessToken) {
      throw new Error('Not authenticated');
    }

    const previousProject = state.project;
    const previousProjects = state.projects;
    const optimisticProject = state.project?.id === projectId
      ? { ...state.project, ...updates }
      : state.project;
    const optimisticProjects = state.projects.map((item) => (
      item.id === projectId
        ? { ...item, ...updates }
        : item
    ));

    persistAuthSnapshot({
      accessToken: state.accessToken,
      refreshToken: getRefreshToken(),
      user: state.user,
      project: optimisticProject,
      projects: optimisticProjects,
    });

    set({ project: optimisticProject, projects: optimisticProjects });

    const { response, token } = await fetchWithAuthRetry(`/api/projects/${projectId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updates),
    });

    if (!response.ok) {
      persistAuthSnapshot({
        accessToken: state.accessToken,
        refreshToken: getRefreshToken(),
        user: state.user,
        project: previousProject,
        projects: previousProjects,
      });

      set({ project: previousProject, projects: previousProjects });
      const data = await response.json().catch(() => ({ error: `HTTP ${response.status}` })) as { error?: string };
      throw new Error(data.error || 'Failed to update project');
    }

    const data = await response.json() as { project: AuthProject };
    const nextState = get();
    const project = nextState.project?.id === data.project.id ? { ...nextState.project, ...data.project } : nextState.project;
    const hasProject = nextState.projects.some((item) => item.id === data.project.id);
    const projects = hasProject
      ? nextState.projects.map((item) => (item.id === data.project.id ? { ...item, ...data.project } : item))
      : [...nextState.projects, data.project];
    const accessToken = token ?? state.accessToken;

    persistAuthSnapshot({
      accessToken,
      refreshToken: getRefreshToken(),
      user: state.user,
      project,
      projects,
    });

    set({ accessToken, project, projects });
    return data.project;
  },

  async refreshProjects() {
    const token = get().accessToken;
    if (!token) {
      return;
    }

    try {
      const projects = await fetchProjects(token);
      const state = get();
      const nextProjects = projects.length > 0 ? projects : state.projects;

      persistStoredAuth({
        accessToken: state.accessToken,
        refreshToken: getRefreshToken(),
        user: state.user,
        project: state.project,
        projects: nextProjects,
      });

      set({ projects: nextProjects });
    } catch (error) {
      console.error('Failed to refresh projects:', error);
    }
  },

  syncProjectTaskCount(projectId, taskCount) {
    const state = get();
    const currentProjectCount = state.project?.id === projectId ? state.project.taskCount : undefined;
    const listProjectCount = state.projects.find((project) => project.id === projectId)?.taskCount;

    // NEVER overwrite non-zero with zero - zero means "not loaded yet"
    if (taskCount === 0 && (currentProjectCount !== undefined || listProjectCount !== undefined)) {
      return;
    }

    if (currentProjectCount === taskCount && listProjectCount === taskCount) {
      return;
    }

    const projects = state.projects.map((project) => (
      project.id === projectId
        ? { ...project, taskCount }
        : project
    ));
    const project = state.project?.id === projectId
      ? { ...state.project, taskCount }
      : state.project;

    persistAuthSnapshot({
      accessToken: state.accessToken,
      refreshToken: getRefreshToken(),
      user: state.user,
      project,
      projects,
    });

    set({ project, projects });
  },
}));

initializeStoreListeners();
