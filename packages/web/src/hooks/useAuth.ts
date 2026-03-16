import { useState, useEffect, useCallback } from 'react';

// Decode JWT payload to get expiry time (ms). Returns null on parse error.
function getTokenExpMs(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1])) as { exp?: number };
    if (typeof payload.exp !== 'number') return null;
    return payload.exp * 1000;
  } catch {
    return null;
  }
}

// LocalStorage keys
const ACCESS_TOKEN_KEY = 'gantt_access_token';
const REFRESH_TOKEN_KEY = 'gantt_refresh_token';
const USER_KEY = 'gantt_user';
const PROJECT_KEY = 'gantt_project';
const PROJECTS_KEY = 'gantt_projects';

// Types
export interface AuthUser {
  id: string;
  email: string;
}

export interface AuthProject {
  id: string;
  name: string;
  taskCount?: number;
}

export interface AuthState {
  isAuthenticated: boolean;
  user: AuthUser | null;
  project: AuthProject | null;
  accessToken: string | null;
  projects: AuthProject[];
}

export interface UseAuthResult extends AuthState {
  login(tokens: { accessToken: string; refreshToken: string }, user: AuthUser, project: AuthProject): void;
  logout(): void;
  switchProject(projectId: string): Promise<void>;
  createProject(name: string): Promise<AuthProject | null>;
  syncProjectTaskCount(projectId: string, taskCount: number): void;
  refreshAccessToken(): Promise<string | null>;
}

export function useAuth(): UseAuthResult {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    user: null,
    project: null,
    accessToken: null,
    projects: [],
  });

  // Wrapped setState to log all state changes (no dependencies to avoid recreation)
  const loggedSetState = useCallback((updater: React.SetStateAction<AuthState>, source: string) => {
    console.log(`[useAuth] setState from ${source}:`, {
      isFunction: typeof updater === 'function',
    });
    setState(prev => {
      const newState = typeof updater === 'function' ? (updater as (prev: AuthState) => AuthState)(prev) : updater;
      console.log(`[useAuth] setState result from ${source}:`, {
        prevToken: prev.accessToken?.substring(0, 20) + '...',
        newToken: newState.accessToken?.substring(0, 20) + '...',
        hasPrevToken: !!prev.accessToken,
        hasNewToken: !!newState.accessToken,
        prevIsAuthenticated: prev.isAuthenticated,
        newIsAuthenticated: newState.isAuthenticated,
        prevProject: prev.project?.id,
        newProject: newState.project?.id,
      });
      return newState;
    });
  }, []);

  // Initialize from localStorage on mount
  useEffect(() => {
    const accessToken = localStorage.getItem(ACCESS_TOKEN_KEY);
    const userStr = localStorage.getItem(USER_KEY);
    const projectStr = localStorage.getItem(PROJECT_KEY);
    const projectsStr = localStorage.getItem(PROJECTS_KEY);

    if (accessToken && userStr && projectStr) {
      try {
        const user = JSON.parse(userStr) as AuthUser;
        const project = JSON.parse(projectStr) as AuthProject;
        const projects = projectsStr ? JSON.parse(projectsStr) as AuthProject[] : [project];

        loggedSetState({
          isAuthenticated: true,
          user,
          project,
          accessToken,
          projects,
        }, 'initialization');
      } catch {
        // Invalid stored data, clear everything
        localStorage.removeItem(ACCESS_TOKEN_KEY);
        localStorage.removeItem(REFRESH_TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        localStorage.removeItem(PROJECT_KEY);
        localStorage.removeItem(PROJECTS_KEY);
      }
    }
  }, []);

  // Refresh projects (with taskCount) after mount or whenever accessToken changes
  useEffect(() => {
    const token = state.accessToken;
    if (!token) return;
    fetch('/api/projects', { headers: { 'Authorization': `Bearer ${token}` } })
      .then(res => res.ok ? res.json() as Promise<{ projects: AuthProject[] }> : Promise.reject())
      .then(data => {
        localStorage.setItem(PROJECTS_KEY, JSON.stringify(data.projects));
        loggedSetState(prev => ({ ...prev, projects: data.projects }), 'refresh-projects');
      })
      .catch(() => { /* silently ignore, stale data is fine */ });
  }, [state.accessToken]);

  const login = useCallback((tokens: { accessToken: string; refreshToken: string }, user: AuthUser, project: AuthProject) => {
    // Save to localStorage
    localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    localStorage.setItem(PROJECT_KEY, JSON.stringify(project));

    // Fetch projects list
    fetch('/api/projects', {
      headers: {
        'Authorization': `Bearer ${tokens.accessToken}`,
      },
    })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<{ projects: AuthProject[] }>;
      })
      .then(data => {
        localStorage.setItem(PROJECTS_KEY, JSON.stringify(data.projects));
        loggedSetState(prev => ({
          ...prev,
          isAuthenticated: true,
          user,
          project,
          accessToken: tokens.accessToken,
          projects: data.projects,
        }), 'login-fetch-projects');
      })
      .catch(err => {
        console.error('Failed to fetch projects:', err);
        // Still log in with just the current project
        loggedSetState(prev => ({
          ...prev,
          isAuthenticated: true,
          user,
          project,
          accessToken: tokens.accessToken,
          projects: [project],
        }), 'login-catch-fallback');
      });
  }, []);

  const logout = useCallback(() => {
    // Remove from localStorage
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(PROJECT_KEY);
    localStorage.removeItem(PROJECTS_KEY);

    // Reset state
    loggedSetState({
      isAuthenticated: false,
      user: null,
      project: null,
      accessToken: null,
      projects: [],
    }, 'logout');
  }, []);

  const refreshAccessToken = useCallback(async (): Promise<string | null> => {
    console.log('[useAuth] refreshAccessToken called');
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    console.log('[useAuth] refreshAccessToken: refresh token from localStorage:', refreshToken ? refreshToken.substring(0, 20) + '...' : 'null');
    if (!refreshToken) {
      console.log('[useAuth] refreshAccessToken: no refresh token, logging out');
      logout();
      return null;
    }

    try {
      console.log('[useAuth] refreshAccessToken: calling /api/auth/refresh');
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      console.log('[useAuth] refreshAccessToken: response status:', res.status, res.statusText);
      if (!res.ok) {
        console.log('[useAuth] refreshAccessToken: response not OK, logging out');
        const errorBody = await res.text();
        console.log('[useAuth] refreshAccessToken: error body:', errorBody);
        logout();
        return null;
      }

      const data = await res.json() as { accessToken: string; refreshToken: string };
      console.log('[useAuth] refreshAccessToken: got new tokens');
      localStorage.setItem(ACCESS_TOKEN_KEY, data.accessToken);
      localStorage.setItem(REFRESH_TOKEN_KEY, data.refreshToken);

      loggedSetState(prev => ({ ...prev, accessToken: data.accessToken }), 'refreshAccessToken');
      return data.accessToken;
    } catch (err) {
      console.log('[useAuth] refreshAccessToken: exception, logging out', err);
      logout();
      return null;
    }
  }, [logout]);

  // Proactive token refresh: schedule refreshAccessToken ~2 min before access token expires
  useEffect(() => {
    const token = state.accessToken;
    if (!token) return;

    const expMs = getTokenExpMs(token);
    if (!expMs) return;

    const refreshAt = expMs - Date.now() - 2 * 60 * 1000; // 2 min before expiry
    if (refreshAt <= 0) {
      // Already expired or about to expire — refresh immediately
      void refreshAccessToken();
      return;
    }

    const timer = setTimeout(() => {
      void refreshAccessToken();
    }, refreshAt);

    return () => clearTimeout(timer);
  }, [state.accessToken, refreshAccessToken]);

  const fetchWithAuthRetry = useCallback(async (
    input: RequestInfo | URL,
    init: RequestInit = {},
  ): Promise<{ response: Response; token: string | null }> => {
    let token = state.accessToken;
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

    token = await refreshAccessToken();
    if (!token) {
      return { response, token: null };
    }

    response = await fetch(input, withToken(token));
    return { response, token };
  }, [refreshAccessToken, state.accessToken]);

  const switchProject = useCallback(async (projectId: string): Promise<void> => {
    console.log('[useAuth] switchProject called with projectId:', projectId);
    console.log('[useAuth] switchProject closure state:', {
      closureToken: state.accessToken?.substring(0, 20) + '...',
      closureProject: state.project?.id,
      hasClosureToken: !!state.accessToken,
    });
    if (!state.accessToken) {
      logout();
      return;
    }

    try {
      const { response: res } = await fetchWithAuthRetry('/api/auth/switch-project', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ projectId }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json() as { accessToken: string; refreshToken: string; project: AuthProject };
      console.log('[useAuth] switchProject response:', {
        projectId: data.project.id,
        projectName: data.project.name,
        hasAccessToken: !!data.accessToken,
        accessTokenPrefix: data.accessToken?.substring(0, 20) + '...',
      });

      // Fetch projects list with the new access token to ensure we have the latest list
      // This prevents a race condition where the useEffect refresh overwrites a newly created project
      const projectsRes = await fetch('/api/projects', {
        headers: { Authorization: `Bearer ${data.accessToken}` },
      });
      let projects = state.projects; // fallback to current projects if fetch fails
      if (projectsRes.ok) {
        const projectsData = await projectsRes.json() as { projects: AuthProject[] };
        projects = projectsData.projects;
        localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
      }

      localStorage.setItem(ACCESS_TOKEN_KEY, data.accessToken);
      localStorage.setItem(REFRESH_TOKEN_KEY, data.refreshToken);
      localStorage.setItem(PROJECT_KEY, JSON.stringify(data.project));

      // Update state atomically - use functional form to prevent stale closure issues
      loggedSetState(prev => {
        console.log('[useAuth] switchProject setState callback:', {
          prevAccessToken: prev.accessToken?.substring(0, 20) + '...',
          newAccessToken: data.accessToken?.substring(0, 20) + '...',
          hasPrevAccessToken: !!prev.accessToken,
          hasNewAccessToken: !!data.accessToken,
          prevIsAuthenticated: prev.isAuthenticated,
          prevProjectId: prev.project?.id,
          newProjectId: data.project.id,
          projectsCount: projects.length,
        });
        return {
          ...prev,
          accessToken: data.accessToken,
          project: data.project,
          projects, // Explicitly set projects to prevent race condition with useEffect
        };
      }, 'switchProject');
    } catch (err) {
      console.error('Failed to switch project:', err);
      throw err;
    }
  }, [fetchWithAuthRetry, logout, state.accessToken, state.projects]);

  const createProject = useCallback(async (name: string): Promise<AuthProject | null> => {
    if (!state.accessToken) {
      return null;
    }

    try {
      const { response: res } = await fetchWithAuthRetry('/api/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json() as { project: AuthProject };
      const newProjects = [...state.projects, data.project];

      localStorage.setItem(PROJECTS_KEY, JSON.stringify(newProjects));
      loggedSetState(prev => ({ ...prev, projects: newProjects }), 'createProject');

      return data.project;
    } catch (err) {
      console.error('Failed to create project:', err);
      return null;
    }
  }, [fetchWithAuthRetry, state.accessToken, state.projects]);

  const syncProjectTaskCount = useCallback((projectId: string, taskCount: number) => {
    loggedSetState(prev => {
      const currentProjectCount = prev.project?.id === projectId ? prev.project.taskCount : undefined;
      const listProjectCount = prev.projects.find(project => project.id === projectId)?.taskCount;
      if (currentProjectCount === taskCount && listProjectCount === taskCount) {
        return prev;
      }

      const projects = prev.projects.map(project => (
        project.id === projectId
          ? { ...project, taskCount }
          : project
      ));
      const project = prev.project?.id === projectId
        ? { ...prev.project, taskCount }
        : prev.project;

      localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
      if (project) {
        localStorage.setItem(PROJECT_KEY, JSON.stringify(project));
      }

      return {
        ...prev,
        project,
        projects,
      };
    }, 'syncProjectTaskCount');
  }, [loggedSetState]);

  return {
    ...state,
    login,
    logout,
    switchProject,
    createProject,
    syncProjectTaskCount,
    refreshAccessToken,
  };
}
