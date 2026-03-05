import { useState, useEffect, useCallback } from 'react';

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

        setState({
          isAuthenticated: true,
          user,
          project,
          accessToken,
          projects,
        });
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
        setState(prev => ({
          ...prev,
          isAuthenticated: true,
          user,
          project,
          accessToken: tokens.accessToken,
          projects: data.projects,
        }));
      })
      .catch(err => {
        console.error('Failed to fetch projects:', err);
        // Still log in with just the current project
        setState(prev => ({
          ...prev,
          isAuthenticated: true,
          user,
          project,
          accessToken: tokens.accessToken,
          projects: [project],
        }));
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
    setState({
      isAuthenticated: false,
      user: null,
      project: null,
      accessToken: null,
      projects: [],
    });
  }, []);

  const refreshAccessToken = useCallback(async (): Promise<string | null> => {
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (!refreshToken) {
      logout();
      return null;
    }

    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (!res.ok) {
        logout();
        return null;
      }

      const data = await res.json() as { accessToken: string; refreshToken: string };
      localStorage.setItem(ACCESS_TOKEN_KEY, data.accessToken);
      localStorage.setItem(REFRESH_TOKEN_KEY, data.refreshToken);

      setState(prev => ({ ...prev, accessToken: data.accessToken }));
      return data.accessToken;
    } catch {
      logout();
      return null;
    }
  }, [logout]);

  const switchProject = useCallback(async (projectId: string): Promise<void> => {
    const currentToken = state.accessToken;
    if (!currentToken) {
      logout();
      return;
    }

    try {
      const res = await fetch('/api/auth/switch-project', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentToken}`,
        },
        body: JSON.stringify({ projectId }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json() as { accessToken: string; refreshToken: string; project: AuthProject };
      localStorage.setItem(ACCESS_TOKEN_KEY, data.accessToken);
      localStorage.setItem(REFRESH_TOKEN_KEY, data.refreshToken);
      localStorage.setItem(PROJECT_KEY, JSON.stringify(data.project));

      setState(prev => ({
        ...prev,
        accessToken: data.accessToken,
        project: data.project,
      }));
    } catch (err) {
      console.error('Failed to switch project:', err);
      throw err;
    }
  }, [state.accessToken, logout]);

  const createProject = useCallback(async (name: string): Promise<AuthProject | null> => {
    const currentToken = state.accessToken;
    if (!currentToken) {
      return null;
    }

    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentToken}`,
        },
        body: JSON.stringify({ name }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json() as { project: AuthProject };
      const newProjects = [...state.projects, data.project];

      localStorage.setItem(PROJECTS_KEY, JSON.stringify(newProjects));
      setState(prev => ({ ...prev, projects: newProjects }));

      return data.project;
    } catch (err) {
      console.error('Failed to create project:', err);
      return null;
    }
  }, [state.accessToken, state.projects]);

  return {
    ...state,
    login,
    logout,
    switchProject,
    createProject,
    refreshAccessToken,
  };
}
