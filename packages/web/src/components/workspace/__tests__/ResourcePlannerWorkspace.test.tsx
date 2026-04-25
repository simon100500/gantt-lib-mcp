// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const plannerWorkspaceSpy = vi.fn();
const projectWorkspaceSpy = vi.fn();
const ganttLibChartSpy = vi.fn();

vi.mock('gantt-lib', async () => {
  const actual = await vi.importActual<typeof import('gantt-lib')>('gantt-lib');
  return {
    ...actual,
    GanttChart: (props: {
      mode?: string;
      resources?: Array<{ id: string; name: string; items: Array<{ id: string; title: string }> }>;
      renderItem?: (item: { id: string; title: string }) => React.ReactNode;
      getItemClassName?: (item: { id: string; title: string }) => string | undefined;
    }) => {
      ganttLibChartSpy(props);
      return (
        <div data-testid="gantt-lib-resource-planner">
          {props.resources?.map((resource) => (
            <div key={resource.id} data-testid={`gantt-resource-row-${resource.id}`}>
              <span>{resource.name}</span>
              {resource.items.map((item) => (
                <div
                  key={item.id}
                  className={props.getItemClassName?.(item)}
                  data-testid={`gantt-resource-item-${item.id}`}
                >
                  {props.renderItem ? props.renderItem(item) : item.title}
                </div>
              ))}
            </div>
          ))}
        </div>
      );
    },
  };
});

vi.mock('../ResourcePlannerWorkspace.tsx', async () => {
  const actual = await vi.importActual<typeof import('../ResourcePlannerWorkspace.tsx')>('../ResourcePlannerWorkspace.tsx');
  return {
    ...actual,
    ResourcePlannerWorkspace: (props: Record<string, unknown>) => {
      plannerWorkspaceSpy(props);
      return actual.ResourcePlannerWorkspace(props as never);
    },
  };
});

vi.mock('../ProjectWorkspace.tsx', () => ({
  ProjectWorkspace: (props: Record<string, unknown>) => {
    projectWorkspaceSpy(props);
    return <div data-testid="project-workspace">project workspace</div>;
  },
}));

vi.mock('../SharedWorkspace.tsx', () => ({ SharedWorkspace: () => <div data-testid="shared-workspace">shared workspace</div> }));
vi.mock('../GuestWorkspace.tsx', () => ({ GuestWorkspace: () => <div data-testid="guest-workspace">guest workspace</div> }));
vi.mock('../DraftWorkspace.tsx', () => ({ DraftWorkspace: () => <div data-testid="draft-workspace">draft workspace</div> }));
vi.mock('../../layout/Toolbar.tsx', () => ({ Toolbar: () => <div /> }));
vi.mock('../../GanttChart.tsx', () => ({ GanttChart: React.forwardRef(() => <div />) }));
vi.mock('../../ChatSidebar.tsx', () => ({ ChatSidebar: () => <div /> }));
vi.mock('../../HistoryPanel.tsx', () => ({ HistoryPanel: () => <div /> }));
vi.mock('../../SplitTaskModal.tsx', () => ({ SplitTaskModal: () => null }));
vi.mock('../../TaskChatModal.tsx', () => ({ TaskChatModal: () => null }));
vi.mock('../../../hooks/useProjectHistory.ts', () => ({
  useProjectHistory: () => ({
    items: [],
    loading: false,
    error: null,
    previewingGroupId: null,
    restoringGroupId: null,
    showVersion: vi.fn(),
    showVersionById: vi.fn(),
    refreshHistory: vi.fn(),
    refreshHistorySilently: vi.fn(),
    restoreVersion: vi.fn(),
    returnToCurrentVersion: vi.fn(),
  }),
}));
vi.mock('../../../hooks/useProjectBaselines.ts', () => ({
  useProjectBaselines: () => ({
    items: [],
    loading: false,
    error: null,
    creatingFromCurrent: false,
    creatingFromHistoryGroupId: null,
    deletingBaselineId: null,
    refreshBaselines: vi.fn().mockResolvedValue(undefined),
    fetchBaseline: vi.fn(),
    createFromCurrent: vi.fn(),
    createFromHistory: vi.fn(),
    deleteBaseline: vi.fn(),
  }),
}));
vi.mock('../../DeleteProjectModal.tsx', () => ({ DeleteProjectModal: () => null }));
vi.mock('../../CreateProjectModal.tsx', () => ({ CreateProjectModal: () => null }));
vi.mock('../../EditProjectModal.tsx', () => ({ EditProjectModal: () => null }));
vi.mock('../../LimitReachedModal.tsx', () => ({ LimitReachedModal: () => null }));
vi.mock('../../OtpModal.tsx', () => ({ OtpModal: () => null }));
vi.mock('../../PdfHelperModal.tsx', () => ({ PdfHelperModal: () => null, isPdfHelperDismissed: () => true }));
vi.mock('../../ShareLinkModal.tsx', () => ({ ShareLinkModal: () => null }));
vi.mock('../../layout/ProjectMenu.tsx', () => ({
  ProjectMenu: ({ children, onOpenResourcePool }: { children: React.ReactNode; onOpenResourcePool?: () => void | Promise<void> }) => (
    <div>
      <button data-testid="menu-open-planner" onClick={() => { void onOpenResourcePool?.(); }}>Open planner</button>
      {children}
    </div>
  ),
}));
vi.mock('../../AccountPage.tsx', () => ({ AccountPage: () => <div /> }));
vi.mock('../../AdminPage.tsx', () => ({ AdminPage: () => <div /> }));
vi.mock('../../PurchasePage.tsx', () => ({ PurchasePage: () => <div /> }));
vi.mock('../../YandexCallbackPage.tsx', () => ({ YandexCallbackPage: () => <div /> }));
vi.mock('../../ProjectSwitcher.tsx', () => ({ ProjectSwitcher: () => <div /> }));
vi.mock('../../../hooks/useAppUpdateCheck.ts', () => ({ useAppUpdateCheck: () => ({ updateAvailable: false, reloadApp: vi.fn() }) }));
vi.mock('../../../hooks/useBatchTaskUpdate.ts', () => ({ useBatchTaskUpdate: () => ({}) }));
vi.mock('../../../hooks/useLocalTasks.ts', () => ({
  useLocalTasks: () => ({
    tasks: [],
    loading: false,
    error: null,
    projectName: 'Мой проект',
    setProjectName: vi.fn(),
  }),
}));
vi.mock('../../../hooks/useSharedProject.ts', () => ({
  useSharedProject: () => ({
    project: null,
    shareToken: null,
    loading: false,
    error: null,
  }),
}));
vi.mock('../../../hooks/useTasks.ts', () => ({
  useTasks: () => ({
    tasks: [
      { id: 'task-1', name: 'Task 1', startDate: '2026-04-01', endDate: '2026-04-02', dependencies: [] },
    ],
    setTasks: vi.fn(),
    loading: false,
    error: null,
  }),
}));
vi.mock('../../../hooks/useWebSocket.ts', () => ({ useWebSocket: () => ({ connected: true, connectedToken: 'token' }) }));
vi.mock('../../../hooks/useAuth.ts', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    user: { id: 'user-1', email: 'user@example.com' },
    project: {
      id: 'project-1',
      name: 'Project 1',
      status: 'active',
      ganttDayMode: 'calendar',
      calendarId: null,
      calendarDays: [],
      taskCount: 1,
      archivedAt: null,
      deletedAt: null,
    },
    projects: [
      {
        id: 'project-1',
        name: 'Project 1',
        status: 'active',
        ganttDayMode: 'calendar',
        calendarId: null,
        calendarDays: [],
        taskCount: 1,
        archivedAt: null,
        deletedAt: null,
      },
      {
        id: 'project-2',
        name: 'Project 2',
        status: 'active',
        ganttDayMode: 'calendar',
        calendarId: null,
        calendarDays: [],
        taskCount: 0,
        archivedAt: null,
        deletedAt: null,
      },
      {
        id: 'project-2',
        name: 'Project 2',
        status: 'active',
        ganttDayMode: 'calendar',
        calendarId: null,
        calendarDays: [],
        taskCount: 0,
        archivedAt: null,
        deletedAt: null,
      },
      {
        id: 'project-2',
        name: 'Project 2',
        status: 'active',
        ganttDayMode: 'calendar',
        calendarId: null,
        calendarDays: [],
        taskCount: 0,
        archivedAt: null,
        deletedAt: null,
      },
      {
        id: 'project-2',
        name: 'Project 2',
        status: 'active',
        ganttDayMode: 'calendar',
        calendarId: null,
        calendarDays: [],
        taskCount: 0,
        archivedAt: null,
        deletedAt: null,
      },
    ],
    accessToken: 'token',
    refreshAccessToken: vi.fn().mockResolvedValue('token'),
    login: vi.fn(),
    logout: vi.fn(),
    createProject: vi.fn(),
    switchProject: vi.fn(),
    updateProject: vi.fn(),
    archiveProject: vi.fn(),
    restoreProject: vi.fn(),
    deleteProject: vi.fn(),
    refreshProjects: vi.fn(),
    syncProjectTaskCount: vi.fn(),
  }),
}));

import App from '../../../App.tsx';
import { useUIStore } from '../../../stores/useUIStore.ts';
import { useAuthStore } from '../../../stores/useAuthStore.ts';
import { useBillingStore } from '../../../stores/useBillingStore.ts';
import { useProjectStore } from '../../../stores/useProjectStore.ts';
import { ResourcePlannerWorkspace } from '../ResourcePlannerWorkspace.tsx';

function installDomPolyfills(): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });

  Object.defineProperty(window, 'requestAnimationFrame', {
    configurable: true,
    writable: true,
    value: (callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 0),
  });

  Object.defineProperty(window, 'cancelAnimationFrame', {
    configurable: true,
    writable: true,
    value: (handle: number) => window.clearTimeout(handle),
  });
}

installDomPolyfills();

async function renderApp(): Promise<{ container: HTMLDivElement; root: Root }> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<App />);
    await Promise.resolve();
  });

  return { container, root };
}

async function renderPlannerWorkspace(props: React.ComponentProps<typeof ResourcePlannerWorkspace>): Promise<{ container: HTMLDivElement; root: Root }> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<ResourcePlannerWorkspace {...props} />);
    await Promise.resolve();
  });

  return { container, root };
}

async function unmountApp(root: Root): Promise<void> {
  await act(async () => {
    root.unmount();
    await Promise.resolve();
  });
}

async function flushPlannerEffects(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  plannerWorkspaceSpy.mockClear();
  projectWorkspaceSpy.mockClear();
  ganttLibChartSpy.mockClear();
  vi.restoreAllMocks();

  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/billing/subscription')) {
      return { ok: true, json: async () => ({ plan: 'start', isActive: true, planMeta: { label: 'Старт' }, usage: { projects: { usageState: 'tracked', used: 1, limit: 5 }, ai_queries: { usageState: 'tracked', used: 0, limit: 100 } }, remaining: { projects: { remainingState: 'tracked', remaining: 4, limit: 5 }, ai_queries: { remainingState: 'tracked', remaining: 100, limit: 100 } }, limits: { archive: true, resource_pool: true, export: 'pdf' } }) } as Response;
    }
    if (url.includes('/api/usage')) {
      return { ok: true, json: async () => ({ plan: 'start', isActive: true, planMeta: { label: 'Старт' }, usage: { projects: { usageState: 'tracked', used: 1, limit: 5 }, ai_queries: { usageState: 'tracked', used: 0, limit: 100 } }, remaining: { projects: { remainingState: 'tracked', remaining: 4, limit: 5 }, ai_queries: { remainingState: 'tracked', remaining: 100, limit: 100 } }, limits: { archive: true, resource_pool: true, export: 'pdf' } }) } as Response;
    }
    if (url.includes('/api/resources/planner')) {
      return { ok: true, json: async () => ({ projectId: 'project-1', scope: 'all-projects', workspaceUserId: 'user-1', resources: [] }) } as Response;
    }
    return { ok: true, json: async () => ({}) } as Response;
  }));

  useAuthStore.setState({
    isAuthenticated: true,
    user: { id: 'user-1', email: 'user@example.com' },
    project: {
      id: 'project-1',
      name: 'Project 1',
      status: 'active',
      ganttDayMode: 'calendar',
      calendarId: null,
      calendarDays: [],
      taskCount: 1,
      archivedAt: null,
      deletedAt: null,
    },
    accessToken: 'token',
    projects: [
      {
        id: 'project-1',
        name: 'Project 1',
        status: 'active',
        ganttDayMode: 'calendar',
        calendarId: null,
        calendarDays: [],
        taskCount: 1,
        archivedAt: null,
        deletedAt: null,
      },
    ],
    adminContext: null,
    constraintDenial: null,
  });

  useUIStore.setState({
    workspace: { kind: 'project', projectId: 'project-1', chatOpen: false },
    pendingPostAuthAction: null,
    plannerCorrectionTarget: null,
    showOtpModal: false,
    showEditProjectModal: false,
    showBillingPage: false,
    sidebarState: 'closed',
    viewMode: 'day',
    showTaskList: true,
    showChart: true,
    autoSchedule: true,
    highlightExpiredTasks: true,
    disableTaskDrag: false,
    validationErrors: [],
    shareStatus: 'idle',
    shareLinkUrl: null,
    savingState: 'idle',
    chatComposerDraft: '',
    aiMutationLock: { active: false, stage: 'thinking', message: null },
    showHistoryPanel: false,
    historyRefreshRevision: 0,
    filterWithoutDeps: false,
    filterExpired: false,
    filterSearchText: '',
    filterDateFrom: '',
    filterDateTo: '',
    filterMode: 'highlight',
    searchQuery: '',
    searchResults: [],
    searchIndex: -1,
    tempHighlightedTaskId: null,
  });

  useProjectStore.setState({
    confirmed: { version: 0, snapshot: { tasks: [], dependencies: [] } },
    resources: [],
    assignments: [],
    assignmentError: null,
    pending: [],
    dragPreview: undefined,
  });

  useBillingStore.setState({
    subscription: {
      plan: 'start',
      isActive: true,
      planMeta: { label: 'Старт' },
      usage: { projects: { usageState: 'tracked', used: 1, limit: 5 }, ai_queries: { usageState: 'tracked', used: 0, limit: 100 } },
      remaining: { projects: { remainingState: 'tracked', remaining: 4, limit: 5 }, ai_queries: { remainingState: 'tracked', remaining: 100, limit: 100 } },
      limits: { archive: true, resource_pool: true, export: 'pdf' },
    },
    usage: {
      plan: 'start',
      isActive: true,
      planMeta: { label: 'Старт' },
      usage: { projects: { usageState: 'tracked', used: 1, limit: 5 }, ai_queries: { usageState: 'tracked', used: 0, limit: 100 } },
      remaining: { projects: { remainingState: 'tracked', remaining: 4, limit: 5 }, ai_queries: { remainingState: 'tracked', remaining: 100, limit: 100 } },
      limits: { archive: true, resource_pool: true, export: 'pdf' },
    },
    loading: false,
    error: null,
  } as never);
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('ResourcePlanner workspace integration', () => {
  it('fetches the planner with an explicit default scope and switches scopes deterministically', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/resources/planner')) {
        const scope = url.includes('scope=current-project') ? 'current-project' : 'all-projects';
        return { ok: true, json: async () => ({ projectId: 'project-1', scope, workspaceUserId: 'user-1', resources: [] }) } as Response;
      }
      if (url.startsWith('/api/resources')) {
        return { ok: true, json: async () => ({ resources: [] }) } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    const { container, root } = await renderPlannerWorkspace({
      accessToken: 'token',
      projectId: 'project-1',
      onBackToProject: vi.fn(),
      onCorrectConflict: vi.fn(),
    });

    await flushPlannerEffects();

    expect(fetchMock).toHaveBeenCalledWith('/api/resources/planner?scope=all-projects', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer token' }),
    }));
    expect(container.querySelector('[data-testid="planner-title"]')?.textContent).toBe('Ресурсы');
    expect(container.querySelector('[data-testid="planner-subtitle"]')?.textContent).toBe('Все проекты workspace');
    expect(container.querySelector('[data-testid="planner-empty-state"]')?.textContent).toContain('Нет ресурсов для отображения');

    await act(async () => {
      (container.querySelector('[data-testid="planner-scope-current-project"]') as HTMLInputElement).click();
      await Promise.resolve();
    });
    await flushPlannerEffects();

    expect(fetchMock).toHaveBeenCalledWith('/api/resources/planner?scope=current-project', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer token' }),
    }));
    expect(container.querySelector('[data-testid="planner-title"]')?.textContent).toBe('Ресурсы');
    expect(container.querySelector('[data-testid="planner-subtitle"]')?.textContent).toBe('Текущий проект');
    expect(container.querySelector('[data-testid="planner-empty-state"]')?.textContent).toContain('Нет ресурсов для отображения');

    await unmountApp(root);
  });

  it('shows a scoped loading state while a scope switch is in flight', async () => {
    let resolveCurrentProject: ((response: Response) => void) | null = null;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/resources/planner?scope=current-project')) {
        return new Promise<Response>((resolve) => {
          resolveCurrentProject = resolve;
        });
      }
      if (url.includes('/api/resources/planner')) {
        return { ok: true, json: async () => ({ projectId: 'project-1', scope: 'all-projects', workspaceUserId: 'user-1', resources: [] }) } as Response;
      }
      if (url.startsWith('/api/resources')) {
        return { ok: true, json: async () => ({ resources: [] }) } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    const { container, root } = await renderPlannerWorkspace({
      accessToken: 'token',
      projectId: 'project-1',
      onBackToProject: vi.fn(),
      onCorrectConflict: vi.fn(),
    });
    await flushPlannerEffects();

    await act(async () => {
      (container.querySelector('[data-testid="planner-scope-current-project"]') as HTMLInputElement).click();
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="planner-loading-state"]')?.textContent).toContain('Текущий проект');
    expect(container.querySelector('[data-testid="resource-management-panel"]')).not.toBeNull();

    await act(async () => {
      resolveCurrentProject?.({ ok: true, json: async () => ({ projectId: 'project-1', scope: 'current-project', workspaceUserId: 'user-1', resources: [] }) } as Response);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="planner-empty-state"]')?.textContent).toContain('Нет ресурсов для отображения');

    await unmountApp(root);
  });

  it('retries failed planner fetches with the selected scope while preserving catalog state', async () => {
    let currentProjectAttempts = 0;
    let resolveRetry: ((response: Response) => void) | null = null;
    const existingShared = {
      id: 'resource-existing',
      userId: 'user-1',
      projectId: null,
      scope: 'shared' as const,
      name: 'Shared Crew',
      type: 'human' as const,
      isActive: true,
      createdAt: '2026-04-01T00:00:00.000Z',
      updatedAt: '2026-04-01T00:00:00.000Z',
      deactivatedAt: null,
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/resources/planner?scope=current-project')) {
        currentProjectAttempts += 1;
        if (currentProjectAttempts === 1) {
          return { ok: false, status: 503, json: async () => ({ error: 'planner temporarily unavailable' }) } as Response;
        }
        return new Promise<Response>((resolve) => {
          resolveRetry = resolve;
        });
      }
      if (url.includes('/api/resources/planner')) {
        return { ok: true, json: async () => ({ projectId: 'project-1', scope: 'all-projects', workspaceUserId: 'user-1', resources: [] }) } as Response;
      }
      if (url.startsWith('/api/resources')) {
        return { ok: true, json: async () => ({ resources: [existingShared] }) } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    const { container, root } = await renderPlannerWorkspace({
      accessToken: 'token',
      projectId: 'project-1',
      onBackToProject: vi.fn(),
      onCorrectConflict: vi.fn(),
    });
    await flushPlannerEffects();

    await act(async () => {
      (container.querySelector('[data-testid="planner-scope-current-project"]') as HTMLInputElement).click();
      await Promise.resolve();
    });
    await flushPlannerEffects();

    expect(container.querySelector('[data-testid="planner-error-state"]')?.textContent).toContain('planner temporarily unavailable');
    expect(container.querySelector('[data-testid="resource-catalog-list"]')?.textContent).toContain('Shared Crew');

    await act(async () => {
      (container.querySelector('[data-testid="planner-retry-button"]') as HTMLButtonElement).click();
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="planner-loading-state"]')?.textContent).toContain('Текущий проект');
    expect(container.querySelector('[data-testid="resource-catalog-list"]')?.textContent).toContain('Shared Crew');

    await act(async () => {
      resolveRetry?.({ ok: true, json: async () => ({ projectId: 'project-1', scope: 'current-project', workspaceUserId: 'user-1', resources: [] }) } as Response);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/resources/planner?scope=current-project', expect.any(Object));
    expect(currentProjectAttempts).toBe(2);
    expect(container.querySelector('[data-testid="planner-empty-state"]')?.textContent).toContain('Нет ресурсов для отображения');
    expect(container.querySelector('[data-testid="resource-catalog-list"]')?.textContent).toContain('Shared Crew');

    await unmountApp(root);
  });

  it('surfaces mismatched planner scopes as malformed payload errors', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/resources/planner')) {
        return { ok: true, json: async () => ({ projectId: 'project-1', scope: 'current-project', workspaceUserId: 'user-1', resources: [] }) } as Response;
      }
      if (url.startsWith('/api/resources')) {
        return { ok: true, json: async () => ({ resources: [] }) } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    const { container, root } = await renderPlannerWorkspace({
      accessToken: 'token',
      projectId: 'project-1',
      onBackToProject: vi.fn(),
      onCorrectConflict: vi.fn(),
    });

    await flushPlannerEffects();

    expect(container.querySelector('[data-testid="planner-error-state"]')?.textContent ?? '').toContain('Planner payload was malformed for the selected scope.');

    await unmountApp(root);
  });

  it('creates resources from the resource screen with the selected scope and refreshes the catalog', async () => {
    const existingShared = {
      id: 'resource-existing',
      userId: 'user-1',
      projectId: null,
      scope: 'shared' as const,
      name: 'Shared Crew',
      type: 'human' as const,
      isActive: true,
      createdAt: '2026-04-01T00:00:00.000Z',
      updatedAt: '2026-04-01T00:00:00.000Z',
      deactivatedAt: null,
    };
    const createdProjectResource = {
      id: 'resource-new',
      userId: 'user-1',
      projectId: 'project-2',
      scope: 'project' as const,
      name: 'Local Crane',
      type: 'human' as const,
      isActive: true,
      createdAt: '2026-04-03T00:00:00.000Z',
      updatedAt: '2026-04-03T00:00:00.000Z',
      deactivatedAt: null,
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/resources/planner')) {
        return { ok: true, json: async () => ({ projectId: 'project-1', scope: 'all-projects', workspaceUserId: 'user-1', resources: [] }) } as Response;
      }
      if (url === '/api/resources' && init?.method === 'POST') {
        return { ok: true, status: 201, json: async () => createdProjectResource } as Response;
      }
      if (url.startsWith('/api/resources')) {
        const hasCreated = fetchMock.mock.calls.some(([, callInit]) => callInit?.method === 'POST');
        return {
          ok: true,
          status: 200,
          json: async () => ({ resources: hasCreated ? [existingShared, createdProjectResource] : [existingShared] }),
        } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);
    useAuthStore.setState((state) => ({
      projects: [
        ...state.projects,
        {
          id: 'project-2',
          name: 'Project 2',
          status: 'active',
          ganttDayMode: 'calendar',
          calendarId: null,
          calendarDays: [],
          taskCount: 0,
          archivedAt: null,
          deletedAt: null,
        },
      ],
    }));

    const { container, root } = await renderPlannerWorkspace({
      accessToken: 'token',
      projectId: 'project-1',
      onBackToProject: vi.fn(),
      onCorrectConflict: vi.fn(),
    });

    const input = container.querySelector('[data-testid="resource-create-name-input"]') as HTMLInputElement;
    const targetSelect = container.querySelector('[data-testid="resource-create-target-select"]') as HTMLSelectElement;
    const submit = container.querySelector('[data-testid="resource-create-submit"]') as HTMLButtonElement;

    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, 'Local Crane');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(targetSelect, 'project-2');
      targetSelect.dispatchEvent(new Event('change', { bubbles: true }));
      await Promise.resolve();
    });

    await act(async () => {
      submit.click();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/resources', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ name: 'Local Crane', type: 'human', scope: 'project', projectId: 'project-2' }),
    }));
    expect(fetchMock).toHaveBeenCalledWith('/api/resources?projectId=project-2', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer token' }),
    }));
    expect(useProjectStore.getState().resources.map((resource) => resource.id).sort()).toEqual(['resource-existing', 'resource-new']);
    expect(container.querySelector('[data-testid="resource-catalog-summary"]')?.textContent).toContain('Project: 1');
    expect(input.value).toBe('');

    await unmountApp(root);
  });

  it('opens a dedicated planner workspace from the resource-pool entry and renders outside ProjectWorkspace', async () => {
    const { container, root } = await renderApp();

    expect(container.querySelector('[data-testid="project-workspace"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="planner-loading-state"]')).toBeNull();

    await act(async () => {
      (container.querySelector('[data-testid="menu-open-planner"]') as HTMLButtonElement).click();
      await Promise.resolve();
    });

    expect(useUIStore.getState().workspace).toEqual({ kind: 'planner', projectId: 'project-1' });
    expect(plannerWorkspaceSpy).toHaveBeenCalled();
    expect(projectWorkspaceSpy).toHaveBeenCalled();

    await unmountApp(root);
  });

  it('keeps planner mode stable across the auth-sync workspace effect for the same project', async () => {
    const { container, root } = await renderApp();

    await act(async () => {
      useUIStore.setState({ workspace: { kind: 'planner', projectId: 'project-1' } });
      await Promise.resolve();
    });

    expect(useUIStore.getState().workspace).toEqual({ kind: 'planner', projectId: 'project-1' });

    await act(async () => {
      useAuthStore.setState({
        project: {
          id: 'project-1',
          name: 'Project 1 renamed',
          status: 'active',
          ganttDayMode: 'calendar',
          calendarId: null,
          calendarDays: [],
          taskCount: 1,
          archivedAt: null,
          deletedAt: null,
        },
      });
      await Promise.resolve();
    });

    expect(useUIStore.getState().workspace).toEqual({ kind: 'planner', projectId: 'project-1' });
    expect(plannerWorkspaceSpy).toHaveBeenCalled();

    await unmountApp(root);
  });

  it('renders planner payloads through gantt-lib resource planner rows, conflict metadata, and correction actions', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        projectId: 'project-1',
        scope: 'all-projects',
        workspaceUserId: 'user-1',
        resources: [
          {
            resourceId: 'resource-1',
            resourceName: 'Shared Designer',
            hasConflicts: true,
            conflictCount: 2,
            intervals: [
              {
                assignmentId: 'assignment-1',
                resourceId: 'resource-1',
                resourceName: 'Shared Designer',
                projectId: 'project-2',
                projectName: 'Project 2',
                taskId: 'task-2',
                taskName: 'Landing',
                startDate: '2026-04-01',
                endDate: '2026-04-03',
                assignmentCreatedAt: '2026-04-01T00:00:00.000Z',
                hasConflict: true,
                conflictCount: 1,
                conflictAssignmentIds: ['assignment-3'],
              },
              {
                assignmentId: 'assignment-2',
                resourceId: 'resource-1',
                resourceName: 'Shared Designer',
                projectId: 'project-1',
                projectName: 'Project 1',
                taskId: 'task-1',
                taskName: 'Spec',
                startDate: '2026-04-04',
                endDate: '2026-04-04',
                assignmentCreatedAt: '2026-04-02T00:00:00.000Z',
                hasConflict: false,
                conflictCount: 0,
                conflictAssignmentIds: [],
              },
            ],
          },
          {
            resourceId: 'resource-empty',
            resourceName: 'Empty Crane',
            hasConflicts: false,
            conflictCount: 0,
            intervals: [],
          },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const onCorrectConflict = vi.fn();

    const { container, root } = await renderPlannerWorkspace({
      accessToken: 'token',
      projectId: 'project-1',
      onBackToProject: vi.fn(),
      onCorrectConflict,
    });

    expect(container.querySelector('[data-testid="planner-conflict-resource-count"]')?.textContent).toBe('1');
    expect(container.querySelector('[data-testid="planner-conflict-interval-count"]')?.textContent).toBe('1');
    expect(container.querySelector('[aria-label="Ресурсный календарь"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="resource-timeline-grid"]')).toBeNull();
    expect(container.querySelector('[data-testid="gantt-lib-resource-planner"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="gantt-resource-row-resource-1"]')?.textContent).toContain('Shared Designer');
    expect(container.querySelector('[data-testid="gantt-resource-row-resource-empty"]')?.textContent).toContain('Empty Crane');
    expect(container.querySelector('[data-testid="gantt-resource-item-assignment-1"]')?.textContent).toContain('Landing');
    expect(container.querySelector('[data-testid="gantt-resource-item-assignment-1"]')?.textContent).toContain('Project 2');
    expect(container.querySelector('[data-testid="gantt-resource-item-assignment-1"]')?.textContent).toContain('Конфликт');
    expect(container.querySelector('[data-testid="gantt-resource-item-assignment-1"]')?.textContent).toContain('assignment-3');
    expect(container.querySelector('[data-testid="gantt-resource-item-assignment-1"]')?.className).toContain('resource-planner-item--conflict');
    expect(ganttLibChartSpy).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'resource-planner',
      dayWidth: 36,
      laneHeight: 40,
      rowHeaderWidth: 220,
      headerHeight: 40,
      readonly: false,
      disableResourceReassignment: false,
      resources: expect.arrayContaining([
        expect.objectContaining({ id: 'resource-empty', name: 'Empty Crane', items: [] }),
      ]),
    }));

    await act(async () => {
      (container.querySelector('[data-testid="resource-planner-correct-assignment-1"]') as HTMLButtonElement).click();
      await Promise.resolve();
    });

    expect(onCorrectConflict).toHaveBeenCalledWith({
      projectId: 'project-2',
      taskId: 'task-2',
      assignmentId: 'assignment-1',
      resourceId: 'resource-1',
    });

    await unmountApp(root);
  });

  it('filters planner rows client-side without refetching until scope changes', async () => {
    const catalogResources = [
      {
        id: 'resource-human',
        userId: 'user-1',
        projectId: null,
        scope: 'shared' as const,
        name: 'Design Team',
        type: 'human' as const,
        isActive: true,
        createdAt: '2026-04-01T00:00:00.000Z',
        updatedAt: '2026-04-01T00:00:00.000Z',
        deactivatedAt: null,
      },
      {
        id: 'resource-equipment',
        userId: 'user-1',
        projectId: null,
        scope: 'shared' as const,
        name: 'Tower Crane',
        type: 'equipment' as const,
        isActive: true,
        createdAt: '2026-04-01T00:00:00.000Z',
        updatedAt: '2026-04-01T00:00:00.000Z',
        deactivatedAt: null,
      },
    ];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/resources/planner')) {
        const scope = url.includes('scope=current-project') ? 'current-project' : 'all-projects';
        return {
          ok: true,
          json: async () => ({
            projectId: 'project-1',
            scope,
            workspaceUserId: 'user-1',
            resources: [
              {
                resourceId: 'resource-human',
                resourceName: 'Design Team',
                hasConflicts: false,
                conflictCount: 0,
                intervals: [
                  {
                    assignmentId: 'assignment-spec',
                    resourceId: 'resource-human',
                    resourceName: 'Design Team',
                    projectId: 'project-1',
                    projectName: 'Project 1',
                    taskId: 'task-spec',
                    taskName: 'Spec Package',
                    startDate: '2026-04-01',
                    endDate: '2026-04-02',
                    assignmentCreatedAt: '2026-04-01T00:00:00.000Z',
                    hasConflict: false,
                    conflictCount: 0,
                    conflictAssignmentIds: [],
                  },
                ],
              },
              {
                resourceId: 'resource-equipment',
                resourceName: 'Tower Crane',
                hasConflicts: true,
                conflictCount: 1,
                intervals: [
                  {
                    assignmentId: 'assignment-crane',
                    resourceId: 'resource-equipment',
                    resourceName: 'Tower Crane',
                    projectId: 'project-1',
                    projectName: 'Project 1',
                    taskId: 'task-crane',
                    taskName: 'Lift Panels',
                    startDate: '2026-04-03',
                    endDate: '2026-04-04',
                    assignmentCreatedAt: '2026-04-01T00:00:00.000Z',
                    hasConflict: true,
                    conflictCount: 1,
                    conflictAssignmentIds: ['assignment-peer'],
                  },
                ],
              },
            ],
          }),
        } as Response;
      }
      if (url.startsWith('/api/resources')) {
        return { ok: true, json: async () => ({ resources: catalogResources }) } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    const { container, root } = await renderPlannerWorkspace({
      accessToken: 'token',
      projectId: 'project-1',
      onBackToProject: vi.fn(),
      onCorrectConflict: vi.fn(),
    });
    await flushPlannerEffects();

    const plannerFetchesBeforeFilter = fetchMock.mock.calls.filter(([input]) => String(input).includes('/api/resources/planner')).length;

    await act(async () => {
      const input = container.querySelector('[data-testid="planner-filter-query"]') as HTMLInputElement;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, 'crane');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="gantt-resource-row-resource-human"]')).toBeNull();
    expect(container.querySelector('[data-testid="gantt-resource-row-resource-equipment"]')?.textContent).toContain('Tower Crane');
    expect(fetchMock.mock.calls.filter(([input]) => String(input).includes('/api/resources/planner'))).toHaveLength(plannerFetchesBeforeFilter);

    await act(async () => {
      (container.querySelector('[data-testid="planner-scope-current-project"]') as HTMLInputElement).click();
      await Promise.resolve();
    });
    await flushPlannerEffects();

    expect(fetchMock.mock.calls.filter(([input]) => String(input).includes('/api/resources/planner'))).toHaveLength(plannerFetchesBeforeFilter + 1);

    await unmountApp(root);
  });

  it('opens and closes assignment details accessibly while preserving conflict correction metadata', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/resources/planner')) {
        return {
          ok: true,
          json: async () => ({
            projectId: 'project-1',
            scope: 'all-projects',
            workspaceUserId: 'user-1',
            resources: [
              {
                resourceId: 'resource-1',
                resourceName: 'Shared Designer',
                hasConflicts: true,
                conflictCount: 1,
                intervals: [
                  {
                    assignmentId: 'assignment-1',
                    resourceId: 'resource-1',
                    resourceName: 'Shared Designer',
                    projectId: 'project-2',
                    projectName: 'Project 2',
                    taskId: 'task-2',
                    taskName: 'Landing',
                    startDate: '2026-04-01',
                    endDate: '2026-04-03',
                    assignmentCreatedAt: '2026-04-01T00:00:00.000Z',
                    hasConflict: true,
                    conflictCount: 1,
                    conflictAssignmentIds: ['assignment-3'],
                  },
                ],
              },
            ],
          }),
        } as Response;
      }
      if (url.startsWith('/api/resources')) {
        return { ok: true, json: async () => ({ resources: [] }) } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);
    const onCorrectConflict = vi.fn();

    const { container, root } = await renderPlannerWorkspace({
      accessToken: 'token',
      projectId: 'project-1',
      onBackToProject: vi.fn(),
      onCorrectConflict,
    });
    await flushPlannerEffects();

    await act(async () => {
      (container.querySelector('[data-testid="resource-planner-open-assignment-1"]') as HTMLButtonElement).click();
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="assignment-details-panel"]')?.textContent).toContain('Детали назначения');
    expect(container.querySelector('[data-testid="assignment-details-panel"]')?.textContent).toContain('Landing');
    expect(container.querySelector('[data-testid="assignment-details-panel"]')?.textContent).toContain('Project 2');
    expect(container.querySelector('[data-testid="assignment-details-panel"]')?.textContent).toContain('Сменить ресурс');
    expect(container.querySelector('[data-testid="assignment-details-panel"]')?.textContent).toContain('Убрать ресурс с задачи');

    await act(async () => {
      (container.querySelector('[data-testid="assignment-details-correct"]') as HTMLButtonElement).click();
      await Promise.resolve();
    });

    expect(onCorrectConflict).toHaveBeenCalledWith({
      projectId: 'project-2',
      taskId: 'task-2',
      assignmentId: 'assignment-1',
      resourceId: 'resource-1',
    });

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="assignment-details-panel"]')).toBeNull();

    await act(async () => {
      (container.querySelector('[data-testid="resource-planner-open-assignment-1"]') as HTMLButtonElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="assignment-details-panel"]')).not.toBeNull();

    await unmountApp(root);
  });

  it('surfaces malformed planner payloads as an explicit error state', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        projectId: 'project-1',
        scope: 'all-projects',
        workspaceUserId: 'user-1',
        resources: [
          {
            resourceId: 'resource-1',
            resourceName: 'Broken Resource',
            intervals: [],
          },
        ],
      }),
    }));

    const { container, root } = await renderPlannerWorkspace({
      accessToken: 'token',
      projectId: 'project-1',
      onBackToProject: vi.fn(),
      onCorrectConflict: vi.fn(),
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="planner-error-state"]')?.textContent ?? '').toContain('Planner payload was malformed');

    await unmountApp(root);
  });

  it('stores a one-shot correction target and switches back to project workspace on planner correction', async () => {
    const { container, root } = await renderApp();

    await act(async () => {
      useUIStore.setState({ workspace: { kind: 'planner', projectId: 'project-1' } });
      await Promise.resolve();
    });

    const plannerProps = plannerWorkspaceSpy.mock.calls[plannerWorkspaceSpy.mock.calls.length - 1]?.[0] as {
      onCorrectConflict: (target: { projectId: string; taskId: string; assignmentId: string; resourceId: string }) => void;
    };

    await act(async () => {
      plannerProps.onCorrectConflict({
        projectId: 'project-1',
        taskId: 'task-1',
        assignmentId: 'assignment-1',
        resourceId: 'resource-1',
      });
      await Promise.resolve();
    });

    expect(useUIStore.getState().workspace).toEqual({ kind: 'project', projectId: 'project-1', chatOpen: false });
    expect(useUIStore.getState().plannerCorrectionTarget).toEqual({
      projectId: 'project-1',
      taskId: 'task-1',
      assignmentId: 'assignment-1',
      resourceId: 'resource-1',
    });
    expect(projectWorkspaceSpy.mock.calls.length).toBeGreaterThan(1);

    await unmountApp(root);
  });
});
