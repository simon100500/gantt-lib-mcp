import { create } from 'zustand';
import type { ConstraintDenialPayload } from '../lib/constraintUi';
import type { CalendarDay, ProjectGroup, ProjectGroupMembersPayload, ProjectSectionPermissions, TimelineMarker } from '../types';

function getTokenExpMs(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1])) as { exp?: number };
    if (typeof payload.exp !== 'number') return null;
    return payload.exp * 1000;
  } catch {
    return null;
  }
}

function getTokenProjectId(token: string | null): string | null {
  if (!token) {
    return null;
  }

  try {
    const payload = JSON.parse(atob(token.split('.')[1])) as { projectId?: unknown };
    return typeof payload.projectId === 'string' && payload.projectId.trim() ? payload.projectId : null;
  } catch {
    return null;
  }
}

const ACCESS_TOKEN_KEY = 'gantt_access_token';
const REFRESH_TOKEN_KEY = 'gantt_refresh_token';
const USER_KEY = 'gantt_user';
const PROJECT_KEY = 'gantt_project';
const PROJECTS_KEY = 'gantt_projects';
const PROJECT_GROUPS_KEY = 'gantt_project_groups';
const ADMIN_CONTEXT_KEY = 'gantt_admin_context';
const AUTH_STORAGE_KEYS = [ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY, USER_KEY, PROJECT_KEY, PROJECTS_KEY, PROJECT_GROUPS_KEY, ADMIN_CONTEXT_KEY] as const;

export interface AuthUser {
  id: string;
  email: string;
}

export type GanttDayMode = 'business' | 'calendar';
export type ProjectStatus = 'active' | 'archived';

export interface AuthProject {
  id: string;
  groupId?: string;
  name: string;
  status: ProjectStatus;
  accessRole?: 'owner' | 'editor' | 'viewer';
  permissions?: ProjectSectionPermissions;
  ganttDayMode: GanttDayMode;
  calendarId?: string | null;
  calendarDays?: CalendarDay[];
  timelineMarkers?: TimelineMarker[];
  taskCount?: number;
  archivedAt?: string | null;
  deletedAt?: string | null;
}

export interface AdminContext {
  mode: 'project_override';
  targetUserId: string | null;
}

export interface AuthState {
  isAuthenticated: boolean;
  user: AuthUser | null;
  project: AuthProject | null;
  accessToken: string | null;
  projects: AuthProject[];
  projectGroups: ProjectGroup[];
  adminContext: AdminContext | null;
  constraintDenial: Partial<ConstraintDenialPayload> | null;
}

export interface UseAuthResult extends AuthState {
  login(tokens: { accessToken: string; refreshToken: string }, user: AuthUser, project: AuthProject): void;
  logout(): void;
  assumeAdminProjectSession(
    tokens: { accessToken: string; refreshToken: string },
    project: AuthProject,
    adminContext: AdminContext,
  ): void;
  switchProject(projectId: string): Promise<void>;
  createProject(name: string, groupId?: string): Promise<AuthProject | null>;
  createProjectGroup(name: string): Promise<ProjectGroup | null>;
  updateProjectGroup(groupId: string, updates: { name: string }): Promise<ProjectGroup>;
  deleteProjectGroup(groupId: string): Promise<void>;
  fetchProjectGroupMembers(groupId: string): Promise<ProjectGroupMembersPayload>;
  inviteProjectGroupMember(groupId: string, payload: { email: string; role?: 'editor' | 'viewer'; permissions: ProjectSectionPermissions }): Promise<void>;
  updateProjectGroupMember(groupId: string, userId: string, payload: { role?: 'editor' | 'viewer'; permissions: ProjectSectionPermissions }): Promise<void>;
  transferProjectGroupOwner(groupId: string, userId: string): Promise<ProjectGroup | null>;
  removeProjectGroupMember(groupId: string, userId: string): Promise<void>;
  updateProjectGroupInvite(groupId: string, inviteId: string, payload: { role?: 'editor' | 'viewer'; permissions: ProjectSectionPermissions }): Promise<void>;
  removeProjectGroupInvite(groupId: string, inviteId: string): Promise<void>;
  updateProject(projectId: string, updates: { name?: string; ganttDayMode?: GanttDayMode; calendarId?: string | null; groupId?: string; timelineMarkers?: TimelineMarker[] }): Promise<AuthProject>;
  archiveProject(projectId: string): Promise<AuthProject>;
  restoreProject(projectId: string): Promise<AuthProject>;
  deleteProject(projectId: string): Promise<void>;
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
  projectGroups?: ProjectGroup[];
  adminContext: AdminContext | null;
}

type AuthStore = UseAuthResult;

const INITIAL_AUTH_STATE: AuthState = {
  isAuthenticated: false,
  user: null,
  project: null,
  accessToken: null,
  projects: [],
  projectGroups: [],
  adminContext: null,
  constraintDenial: null,
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
  window.localStorage.removeItem(PROJECT_GROUPS_KEY);
  window.localStorage.removeItem(ADMIN_CONTEXT_KEY);
}

function persistStoredAuth(nextState: StoredAuthState): void {
  if (!canUseDOM()) return;

  const { accessToken, refreshToken, user, project, projects, projectGroups = [], adminContext } = nextState;

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
  window.localStorage.setItem(PROJECT_GROUPS_KEY, JSON.stringify(projectGroups));

  if (adminContext) {
    window.localStorage.setItem(ADMIN_CONTEXT_KEY, JSON.stringify(adminContext));
  } else {
    window.localStorage.removeItem(ADMIN_CONTEXT_KEY);
  }
}

function readStoredAuth(): StoredAuthState | null {
  if (!canUseDOM()) return null;

  const accessToken = window.localStorage.getItem(ACCESS_TOKEN_KEY);
  const refreshToken = window.localStorage.getItem(REFRESH_TOKEN_KEY);
  const userStr = window.localStorage.getItem(USER_KEY);
  const projectStr = window.localStorage.getItem(PROJECT_KEY);
  const projectsStr = window.localStorage.getItem(PROJECTS_KEY);
  const projectGroupsStr = window.localStorage.getItem(PROJECT_GROUPS_KEY);
  const adminContextStr = window.localStorage.getItem(ADMIN_CONTEXT_KEY);

  if (!accessToken || !userStr) {
    return null;
  }

  try {
    const user = JSON.parse(userStr) as AuthUser;
    const normalizeProject = (value: AuthProject): AuthProject => ({
      ...value,
      groupId: value.groupId ?? '',
      status: value.status ?? 'active',
      accessRole: value.accessRole ?? 'owner',
      permissions: value.permissions ?? { schedule: 'edit', resources: 'edit', finance: 'edit' },
      timelineMarkers: Array.isArray(value.timelineMarkers) ? value.timelineMarkers : [],
      archivedAt: value.archivedAt ?? null,
      deletedAt: value.deletedAt ?? null,
    });
    const storedProject = projectStr ? normalizeProject(JSON.parse(projectStr) as AuthProject) : null;
    const projects = projectsStr
      ? (JSON.parse(projectsStr) as AuthProject[]).map(normalizeProject)
      : storedProject ? [storedProject] : [];
    const projectGroups = projectGroupsStr ? JSON.parse(projectGroupsStr) as ProjectGroup[] : [];
    const project = mergeCurrentProject(projects, storedProject, accessToken);

    return {
      accessToken,
      refreshToken,
      user,
      project,
      projects,
      projectGroups,
      adminContext: adminContextStr ? JSON.parse(adminContextStr) as AdminContext : null,
    };
  } catch {
    clearStoredAuth();
    return null;
  }
}

function toAuthState(storedState: StoredAuthState | null): AuthState {
  if (!storedState?.accessToken || !storedState.user) {
    return INITIAL_AUTH_STATE;
  }

  return {
    isAuthenticated: true,
    user: storedState.user,
    project: storedState.project,
    accessToken: storedState.accessToken,
    projects: storedState.projects.length > 0 ? storedState.projects : (storedState.project ? [storedState.project] : []),
    projectGroups: storedState.projectGroups ?? [],
    adminContext: storedState.adminContext,
    constraintDenial: null,
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

async function fetchProjectGroups(accessToken: string): Promise<ProjectGroup[]> {
  const response = await fetch('/api/project-groups', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const data = await response.json() as { groups: ProjectGroup[] };
  return data.groups;
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
  projectGroups?: ProjectGroup[];
  adminContext: AdminContext | null;
}): void {
  persistStoredAuth({
    accessToken: state.accessToken,
    refreshToken: state.refreshToken,
    user: state.user,
    project: state.project,
    projects: state.projects,
    projectGroups: state.projectGroups ?? useAuthStore.getState().projectGroups,
    adminContext: state.adminContext,
  });
}

function mergeCurrentProject(projects: AuthProject[], currentProject: AuthProject | null, accessToken?: string | null): AuthProject | null {
  if (projects.length === 0) {
    return null;
  }

  const tokenProjectId = getTokenProjectId(accessToken ?? null);
  if (tokenProjectId) {
    const tokenProject = projects.find((project) => project.id === tokenProjectId);
    if (tokenProject) {
      return tokenProject;
    }
  }

  if (!currentProject) {
    return projects.find((project) => project.status === 'active') ?? projects[0];
  }

  return projects.find((project) => project.id === currentProject.id)
    ?? projects.find((project) => project.status === 'active')
    ?? projects[0];
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  ...INITIAL_AUTH_STATE,

  login(tokens, user, project) {
    const fallbackProjects = [project];
    const fallbackGroups: ProjectGroup[] = project.groupId ? [{
      id: project.groupId,
      userId: user.id,
      name: 'Проекты',
      isDefault: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      projectCount: fallbackProjects.length,
      accessRole: 'owner',
    }] : [];

    persistStoredAuth({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user,
      project,
      projects: fallbackProjects,
      projectGroups: fallbackGroups,
      adminContext: null,
    });

    set({
      isAuthenticated: true,
      user,
      project,
      accessToken: tokens.accessToken,
      projects: fallbackProjects,
      projectGroups: fallbackGroups,
      adminContext: null,
    });

    void Promise.all([fetchProjects(tokens.accessToken), fetchProjectGroups(tokens.accessToken)])
      .then(([projects, projectGroups]) => {
        const nextProjects = projects.length > 0 ? projects : fallbackProjects;
        const nextProjectGroups = projectGroups.length > 0 ? projectGroups : fallbackGroups;
        persistStoredAuth({
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          user,
          project,
          projects: nextProjects,
          projectGroups: nextProjectGroups,
          adminContext: null,
        });

        set({
          isAuthenticated: true,
          user,
          project,
          accessToken: tokens.accessToken,
          projects: nextProjects,
          projectGroups: nextProjectGroups,
          adminContext: null,
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

  assumeAdminProjectSession(tokens, project, adminContext) {
    const state = get();
    const projects = [project];
    const projectGroups: ProjectGroup[] = project.groupId ? [{
      id: project.groupId,
      userId: adminContext.targetUserId ?? '',
      name: 'Проекты',
      isDefault: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      projectCount: projects.length,
      accessRole: 'owner',
    }] : [];

    persistStoredAuth({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: state.user,
      project,
      projects,
      projectGroups,
      adminContext,
    });

    set({
      isAuthenticated: true,
      accessToken: tokens.accessToken,
      project,
      projects,
      projectGroups,
      adminContext,
    });
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
          projectGroups: state.projectGroups,
          adminContext: state.adminContext,
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
    let projectGroups = get().projectGroups;
    try {
      const [fetchedProjects, fetchedGroups] = await Promise.all([fetchProjects(data.accessToken), fetchProjectGroups(data.accessToken)]);
      projects = fetchedProjects.length > 0 ? fetchedProjects : projects;
      projectGroups = fetchedGroups.length > 0 ? fetchedGroups : projectGroups;
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
      projectGroups,
      adminContext: null,
    });

    set({
      accessToken: data.accessToken,
      project: data.project,
      projects,
      projectGroups,
      isAuthenticated: true,
      adminContext: null,
    });
  },

  async createProject(name, groupId) {
    if (!get().accessToken) {
      return null;
    }

    try {
      const { response } = await fetchWithAuthRetry('/api/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name, ...(groupId ? { groupId } : {}) }),
      });

      if (response.status === 403) {
        const denial = await response.json().catch(() => null) as Partial<ConstraintDenialPayload> | null;
        set({ constraintDenial: denial });
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
        projectGroups: state.projectGroups,
        adminContext: state.adminContext,
      });

      set({ projects });
      return data.project;
    } catch (error) {
      console.error('Failed to create project:', error);
      return null;
    }
  },

  async createProjectGroup(name) {
    const state = get();
    if (!state.accessToken) {
      return null;
    }

    const { response, token } = await fetchWithAuthRetry('/api/project-groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json() as { group: ProjectGroup };
    const nextState = get();
    const projectGroups = [...nextState.projectGroups, data.group];
    const accessToken = token ?? state.accessToken;

    persistAuthSnapshot({
      accessToken,
      refreshToken: getRefreshToken(),
      user: nextState.user,
      project: nextState.project,
      projects: nextState.projects,
      projectGroups,
      adminContext: nextState.adminContext,
    });

    set({ accessToken, projectGroups });
    return data.group;
  },

  async updateProjectGroup(groupId, updates) {
    const state = get();
    if (!state.accessToken) {
      throw new Error('Not authenticated');
    }

    const { response, token } = await fetchWithAuthRetry(`/api/project-groups/${groupId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: `HTTP ${response.status}` })) as { error?: string };
      throw new Error(data.error || 'Failed to update project group');
    }

    const data = await response.json() as { group: ProjectGroup };
    const nextState = get();
    const projectGroups = nextState.projectGroups.map((group) => (group.id === data.group.id ? data.group : group));
    const accessToken = token ?? state.accessToken;

    persistAuthSnapshot({
      accessToken,
      refreshToken: getRefreshToken(),
      user: nextState.user,
      project: nextState.project,
      projects: nextState.projects,
      projectGroups,
      adminContext: nextState.adminContext,
    });

    set({ accessToken, projectGroups });
    return data.group;
  },

  async deleteProjectGroup(groupId) {
    const state = get();
    if (!state.accessToken) {
      throw new Error('Not authenticated');
    }

    const { response, token } = await fetchWithAuthRetry(`/api/project-groups/${groupId}`, { method: 'DELETE' });
    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: `HTTP ${response.status}` })) as { error?: string };
      throw new Error(data.error || 'Failed to delete project group');
    }

    const nextState = get();
    const projectGroups = nextState.projectGroups.filter((group) => group.id !== groupId);
    const accessToken = token ?? state.accessToken;

    persistAuthSnapshot({
      accessToken,
      refreshToken: getRefreshToken(),
      user: nextState.user,
      project: nextState.project,
      projects: nextState.projects,
      projectGroups,
      adminContext: nextState.adminContext,
    });

    set({ accessToken, projectGroups });
  },

  async fetchProjectGroupMembers(groupId) {
    const state = get();
    if (!state.accessToken) {
      throw new Error('Not authenticated');
    }

    const { response } = await fetchWithAuthRetry(`/api/project-groups/${groupId}/members`);
    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: `HTTP ${response.status}` })) as { error?: string };
      throw new Error(data.error || 'Failed to load project group members');
    }

    return response.json() as Promise<ProjectGroupMembersPayload>;
  },

  async inviteProjectGroupMember(groupId, payload) {
    const state = get();
    if (!state.accessToken) {
      throw new Error('Not authenticated');
    }

    const { response } = await fetchWithAuthRetry(`/api/project-groups/${groupId}/invites`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: `HTTP ${response.status}` })) as { error?: string };
      throw new Error(data.error || 'Failed to invite member');
    }
  },

  async updateProjectGroupMember(groupId, userId, payload) {
    const state = get();
    if (!state.accessToken) {
      throw new Error('Not authenticated');
    }

    const { response } = await fetchWithAuthRetry(`/api/project-groups/${groupId}/members/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: `HTTP ${response.status}` })) as { error?: string };
      throw new Error(data.error || 'Failed to update project group member');
    }
  },

  async transferProjectGroupOwner(groupId, userId) {
    const state = get();
    if (!state.accessToken) {
      throw new Error('Not authenticated');
    }

    const { response } = await fetchWithAuthRetry(`/api/project-groups/${groupId}/transfer-owner`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: `HTTP ${response.status}` })) as { error?: string };
      throw new Error(data.error || 'Failed to transfer project group owner');
    }

    const data = await response.json() as { group: ProjectGroup | null };
    await get().refreshProjects();
    return data.group;
  },

  async removeProjectGroupMember(groupId, userId) {
    const state = get();
    if (!state.accessToken) {
      throw new Error('Not authenticated');
    }

    const { response } = await fetchWithAuthRetry(`/api/project-groups/${groupId}/members/${userId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: `HTTP ${response.status}` })) as { error?: string };
      throw new Error(data.error || 'Failed to remove project group member');
    }
  },

  async updateProjectGroupInvite(groupId, inviteId, payload) {
    const state = get();
    if (!state.accessToken) {
      throw new Error('Not authenticated');
    }

    const { response } = await fetchWithAuthRetry(`/api/project-groups/${groupId}/invites/${inviteId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: `HTTP ${response.status}` })) as { error?: string };
      throw new Error(data.error || 'Failed to update project group invite');
    }
  },

  async removeProjectGroupInvite(groupId, inviteId) {
    const state = get();
    if (!state.accessToken) {
      throw new Error('Not authenticated');
    }

    const { response } = await fetchWithAuthRetry(`/api/project-groups/${groupId}/invites/${inviteId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: `HTTP ${response.status}` })) as { error?: string };
      throw new Error(data.error || 'Failed to remove project group invite');
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
      adminContext: state.adminContext,
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
        adminContext: state.adminContext,
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
      adminContext: nextState.adminContext,
    });

    set({ accessToken, project, projects });
    return data.project;
  },

  async archiveProject(projectId) {
    const state = get();
    if (!state.accessToken) {
      throw new Error('Not authenticated');
    }

    const { response, token } = await fetchWithAuthRetry(`/api/projects/${projectId}/archive`, {
      method: 'POST',
    });

    if (response.status === 403) {
      const denial = await response.json().catch(() => null) as Partial<ConstraintDenialPayload> | null;
      set({ constraintDenial: denial });
      throw new Error('ARCHIVE_FEATURE_LOCKED');
    }

    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: `HTTP ${response.status}` })) as { error?: string };
      throw new Error(data.error || 'Failed to archive project');
    }

    const data = await response.json() as { project: AuthProject };
    const nextState = get();
    const projects = nextState.projects.map((project) => (
      project.id === data.project.id ? { ...project, ...data.project } : project
    ));
    const project = nextState.project?.id === data.project.id
      ? { ...nextState.project, ...data.project }
      : nextState.project;
    const accessToken = token ?? state.accessToken;

    persistAuthSnapshot({
      accessToken,
      refreshToken: getRefreshToken(),
      user: state.user,
      project,
      projects,
      adminContext: nextState.adminContext,
    });

    set({ accessToken, project, projects });
    return data.project;
  },

  async restoreProject(projectId) {
    const state = get();
    if (!state.accessToken) {
      throw new Error('Not authenticated');
    }

    const { response, token } = await fetchWithAuthRetry(`/api/projects/${projectId}/restore`, {
      method: 'POST',
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: `HTTP ${response.status}` })) as { error?: string };
      throw new Error(data.error || 'Failed to restore project');
    }

    const data = await response.json() as { project: AuthProject };
    const nextState = get();
    const projects = nextState.projects.map((project) => (
      project.id === data.project.id ? { ...project, ...data.project } : project
    ));
    const project = nextState.project?.id === data.project.id
      ? { ...nextState.project, ...data.project }
      : nextState.project;
    const accessToken = token ?? state.accessToken;

    persistAuthSnapshot({
      accessToken,
      refreshToken: getRefreshToken(),
      user: state.user,
      project,
      projects,
      adminContext: nextState.adminContext,
    });

    set({ accessToken, project, projects });
    return data.project;
  },

  async deleteProject(projectId) {
    const state = get();
    if (!state.accessToken) {
      throw new Error('Not authenticated');
    }

    const { response, token } = await fetchWithAuthRetry(`/api/projects/${projectId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: `HTTP ${response.status}` })) as { error?: string };
      throw new Error(data.error || 'Failed to delete project');
    }

    const accessToken = token ?? state.accessToken;
    let nextProjects = get().projects.filter((project) => project.id !== projectId);

    try {
      const refreshedProjects = await fetchProjects(accessToken);
      // Keep the client state consistent even if the follow-up list request lags behind the delete mutation.
      nextProjects = refreshedProjects.filter((project) => project.id !== projectId);
    } catch (error) {
      console.error('Failed to refresh projects after delete:', error);
    }

    const currentProject = get().project?.id === projectId ? null : get().project;
    const nextProject = mergeCurrentProject(nextProjects, currentProject, accessToken);

    persistAuthSnapshot({
      accessToken,
      refreshToken: getRefreshToken(),
      user: state.user,
      project: nextProject,
      projects: nextProjects,
      adminContext: state.adminContext,
    });

    set({ accessToken, project: nextProject, projects: nextProjects });
  },

  async refreshProjects() {
    const token = get().accessToken;
    if (!token || get().adminContext?.mode === 'project_override') {
      return;
    }

    try {
      const [projects, projectGroups] = await Promise.all([fetchProjects(token), fetchProjectGroups(token)]);
      const state = get();
      const nextProjects = projects;
      const nextProject = mergeCurrentProject(nextProjects, state.project, state.accessToken);

      persistStoredAuth({
        accessToken: state.accessToken,
        refreshToken: getRefreshToken(),
        user: state.user,
        project: nextProject,
        projects: nextProjects,
        projectGroups,
        adminContext: state.adminContext,
      });

      set({ project: nextProject, projects: nextProjects, projectGroups });
    } catch (error) {
      console.error('Failed to refresh projects:', error);
    }
  },

  syncProjectTaskCount(projectId, taskCount) {
    const state = get();
    const currentProjectCount = state.project?.id === projectId ? state.project.taskCount : undefined;
    const listProjectCount = state.projects.find((project) => project.id === projectId)?.taskCount;

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
      adminContext: state.adminContext,
    });

    set({ project, projects });
  },
}));

initializeStoreListeners();
