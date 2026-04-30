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
      resources?: Array<{ id: string; name: string; items: Array<{ id: string; title: string; subtitle?: string }> }>;
      renderItem?: (item: { id: string; title: string }) => React.ReactNode;
      getItemClassName?: (item: { id: string; title: string }) => string | undefined;
      onResourceItemClick?: (item: { id: string; title: string; subtitle?: string }) => void;
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
                  role={props.onResourceItemClick ? 'button' : undefined}
                  tabIndex={props.onResourceItemClick ? 0 : undefined}
                  onClick={() => props.onResourceItemClick?.(item)}
                  onKeyDown={(event) => {
                    if ((event.key === 'Enter' || event.key === ' ') && props.onResourceItemClick) {
                      event.preventDefault();
                      props.onResourceItemClick(item);
                    }
                  }}
                >
                  {props.renderItem ? props.renderItem(item) : (
                    <>
                      <span>{item.title}</span>
                      {item.subtitle ? <span>{item.subtitle}</span> : null}
                    </>
                  )}
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
import { useProjectUIStore } from '../../../stores/useProjectUIStore.ts';
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

  useProjectUIStore.setState({
    projectStates: {},
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
    expect(container.querySelector('[data-testid="planner-subtitle"]')?.textContent).toBe('Все проекты workspace');
    expect(container.querySelector('[data-testid="planner-empty-state"]')?.textContent).toContain('Нет ресурсов для отображения');

    await act(async () => {
      (container.querySelector('[data-testid="planner-scope-current-project"]') as HTMLButtonElement).click();
      await Promise.resolve();
    });
    await flushPlannerEffects();

    expect(fetchMock).toHaveBeenCalledWith('/api/resources/planner?scope=current-project', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer token' }),
    }));
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
      (container.querySelector('[data-testid="planner-scope-current-project"]') as HTMLButtonElement).click();
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="planner-loading-state"]')?.textContent).toContain('Текущий проект');

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
      (container.querySelector('[data-testid="planner-scope-current-project"]') as HTMLButtonElement).click();
      await Promise.resolve();
    });
    await flushPlannerEffects();

    await act(async () => {
      (container.querySelector('[data-testid="planner-open-catalog"]') as HTMLButtonElement).click();
      await Promise.resolve();
    });

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

  it('does not auto-refresh the planner on plain window focus or quick tab returns', async () => {
    const originalVisibilityState = document.visibilityState;
    let now = 1_000;
    const dateNowSpy = vi.spyOn(Date, 'now').mockImplementation(() => now);
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/resources/planner?scope=current-project')) {
        return {
          ok: true,
          json: async () => ({
            projectId: 'project-1',
            scope: 'current-project',
            workspaceUserId: 'user-1',
            resources: [
              {
                resourceId: 'resource-1',
                resourceName: 'Shared Designer',
                hasConflicts: false,
                conflictCount: 0,
                intervals: [],
              },
            ],
          }),
        } as Response;
      }
      if (url.startsWith('/api/resources?projectId=')) {
        return {
          ok: true,
          json: async () => ({
            resources: [
              {
                id: 'resource-1',
                userId: 'user-1',
                projectId: 'project-1',
                projectGroupId: null,
                scope: 'project',
                name: 'Shared Designer',
                type: 'human',
                isActive: true,
                createdAt: '2026-04-01T00:00:00.000Z',
                updatedAt: '2026-04-01T00:00:00.000Z',
                deactivatedAt: null,
              },
            ],
          }),
        } as Response;
      }
      if (url === '/api/project') {
        return {
          ok: true,
          json: async () => ({
            version: 1,
            snapshot: {
              tasks: [],
              dependencies: [],
              resources: [],
              assignments: [],
            },
          }),
        } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    const { root } = await renderPlannerWorkspace({
      accessToken: 'token',
      projectId: 'project-1',
      onBackToProject: vi.fn(),
      onCorrectConflict: vi.fn(),
    });
    await flushPlannerEffects();

    expect(fetchMock.mock.calls.filter(([input]) => String(input).includes('/api/resources/planner?scope=current-project'))).toHaveLength(1);

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      await Promise.resolve();
    });
    await flushPlannerEffects();

    expect(fetchMock.mock.calls.filter(([input]) => String(input).includes('/api/resources/planner?scope=current-project'))).toHaveLength(1);

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
    });

    now += 5_000;
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
    });
    await flushPlannerEffects();

    expect(fetchMock.mock.calls.filter(([input]) => String(input).includes('/api/resources/planner?scope=current-project'))).toHaveLength(1);

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: originalVisibilityState,
    });
    dateNowSpy.mockRestore();
    await unmountApp(root);
  });

  it('keeps planner data visible during a background refresh', async () => {
    let plannerCalls = 0;
    let resolveRefresh: ((response: Response) => void) | null = null;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/resources/planner?scope=current-project')) {
        plannerCalls += 1;
        if (plannerCalls === 1) {
          return {
            ok: true,
            json: async () => ({
              projectId: 'project-1',
              scope: 'current-project',
              workspaceUserId: 'user-1',
              resources: [
                {
                  resourceId: 'resource-1',
                  resourceName: 'Shared Designer',
                  hasConflicts: false,
                  conflictCount: 0,
                  intervals: [
                    {
                      assignmentId: 'assignment-1',
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
              ],
            }),
          } as Response;
        }

        return new Promise<Response>((resolve) => {
          resolveRefresh = resolve;
        });
      }
      if (url.startsWith('/api/resources?projectId=')) {
        return {
          ok: true,
          json: async () => ({
            resources: [
              {
                id: 'resource-1',
                userId: 'user-1',
                projectId: 'project-1',
                projectGroupId: null,
                scope: 'project',
                name: 'Shared Designer',
                type: 'human',
                isActive: true,
                createdAt: '2026-04-01T00:00:00.000Z',
                updatedAt: '2026-04-01T00:00:00.000Z',
                deactivatedAt: null,
              },
            ],
          }),
        } as Response;
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

    expect(container.querySelector('[data-testid="planner-data-state"]')).not.toBeNull();

    await act(async () => {
      (container.querySelector('[data-testid="planner-refresh-button"]') as HTMLButtonElement).click();
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="planner-loading-state"]')).toBeNull();
    expect(container.querySelector('[data-testid="planner-data-state"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="planner-refreshing-state"]')?.textContent).toContain('Обновляем');

    await act(async () => {
      resolveRefresh?.({
        ok: true,
        json: async () => ({
          projectId: 'project-1',
          scope: 'current-project',
          workspaceUserId: 'user-1',
          resources: [
            {
              resourceId: 'resource-1',
              resourceName: 'Shared Designer',
              hasConflicts: false,
              conflictCount: 0,
              intervals: [
                {
                  assignmentId: 'assignment-1',
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
          ],
        }),
      } as Response);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="planner-refreshing-state"]')).toBeNull();
    expect(container.querySelector('[data-testid="planner-data-state"]')).not.toBeNull();

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

  it('creates resources from the resource screen with the selected scope and type, then refreshes catalog and planner', async () => {
    const existingShared = {
      id: 'resource-existing',
      userId: 'user-1',
      projectId: null,
      scope: 'shared' as const,
      name: 'Shared Crew',
      type: 'equipment' as const,
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

    await act(async () => {
      (container.querySelector('[data-testid="planner-open-catalog"]') as HTMLButtonElement).click();
      await Promise.resolve();
    });

    const input = container.querySelector('[data-testid="resource-create-name-input"]') as HTMLInputElement;
    const targetSelect = container.querySelector('[data-testid="resource-create-target-select"]') as HTMLSelectElement;
    const typeSelect = container.querySelector('[data-testid="resource-create-type-select"]') as HTMLSelectElement;
    const submit = container.querySelector('[data-testid="resource-create-submit"]') as HTMLButtonElement;

    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, 'Local Crane');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(targetSelect, 'project-2');
      targetSelect.dispatchEvent(new Event('change', { bubbles: true }));
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(typeSelect, 'equipment');
      typeSelect.dispatchEvent(new Event('change', { bubbles: true }));
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
      body: JSON.stringify({ name: 'Local Crane', type: 'equipment', scope: 'project', projectId: 'project-2' }),
    }));
    expect(fetchMock).toHaveBeenCalledWith('/api/resources?projectId=project-2', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer token' }),
    }));
    expect(fetchMock.mock.calls.filter(([input]) => String(input).includes('/api/resources/planner?scope=all-projects'))).toHaveLength(2);
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
    expect(plannerWorkspaceSpy.mock.calls[plannerWorkspaceSpy.mock.calls.length - 1]?.[0]).toEqual(expect.objectContaining({ ganttDayMode: 'calendar' }));
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

    expect(container.querySelector('[aria-label="Ресурсный календарь"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="resource-timeline-grid"]')).toBeNull();
    expect(container.querySelector('[data-testid="gantt-lib-resource-planner"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="gantt-resource-row-resource-1"]')?.textContent).toContain('Shared Designer');
    expect(container.querySelector('[data-testid="gantt-resource-row-resource-empty"]')?.textContent).toContain('Empty Crane');
    expect(container.querySelector('[data-testid="gantt-resource-item-assignment-1"]')?.textContent).toContain('Landing');
    expect(container.querySelector('[data-testid="gantt-resource-item-assignment-1"]')?.textContent).toContain('Project 2');
    expect(container.querySelector('[data-testid="gantt-resource-item-assignment-1"]')?.textContent).not.toContain('Конфликт');
    expect(container.querySelector('[data-testid="gantt-resource-item-assignment-1"]')?.textContent).not.toContain('assignment-3');
    expect(container.querySelector('[data-testid="gantt-resource-item-assignment-1"]')?.className).toContain('resource-planner-item--conflict');
    expect(ganttLibChartSpy).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'resource-planner',
      dayWidth: 24,
      laneHeight: 42,
      rowHeaderWidth: 220,
      headerHeight: 40,
      viewMode: 'day',
      readonly: false,
      disableResourceReassignment: true,
      resources: expect.arrayContaining([
        expect.objectContaining({ id: 'resource-empty', name: 'Empty Crane', items: [] }),
      ]),
    }));

    await act(async () => {
      (container.querySelector('[data-testid="gantt-resource-item-assignment-1"]') as HTMLButtonElement).click();
      await Promise.resolve();
    });

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
      (container.querySelector('[data-testid="planner-open-filter"]') as HTMLButtonElement).click();
      await Promise.resolve();
    });

    await act(async () => {
      const input = document.querySelector('input[data-testid="planner-filter-query"]') as HTMLInputElement;
      expect(input).not.toBeNull();
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, 'crane');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="gantt-resource-row-resource-human"]')).toBeNull();
    expect(container.querySelector('[data-testid="gantt-resource-row-resource-equipment"]')?.textContent).toContain('Tower Crane');
    expect(fetchMock.mock.calls.filter(([input]) => String(input).includes('/api/resources/planner'))).toHaveLength(plannerFetchesBeforeFilter);

    await act(async () => {
      (container.querySelector('[data-testid="planner-scope-current-project"]') as HTMLButtonElement).click();
      await Promise.resolve();
    });
    await flushPlannerEffects();

    expect(fetchMock.mock.calls.filter(([input]) => String(input).includes('/api/resources/planner'))).toHaveLength(plannerFetchesBeforeFilter + 1);

    await unmountApp(root);
  });

  it('shows inactive resources in planner by default when they are loaded from the catalog', async () => {
    const catalogResources = [
      {
        id: 'resource-active',
        userId: 'user-1',
        projectId: null,
        scope: 'shared' as const,
        name: 'Active Crew',
        type: 'human' as const,
        isActive: true,
        createdAt: '2026-04-01T00:00:00.000Z',
        updatedAt: '2026-04-01T00:00:00.000Z',
        deactivatedAt: null,
      },
      {
        id: 'resource-inactive',
        userId: 'user-1',
        projectId: null,
        scope: 'shared' as const,
        name: 'Dormant Crew',
        type: 'human' as const,
        isActive: false,
        createdAt: '2026-04-01T00:00:00.000Z',
        updatedAt: '2026-04-01T00:00:00.000Z',
        deactivatedAt: '2026-04-02T00:00:00.000Z',
      },
    ];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/resources/planner')) {
        return {
          ok: true,
          json: async () => ({
            projectId: 'project-1',
            scope: 'current-project',
            workspaceUserId: 'user-1',
            resources: [
              {
                resourceId: 'resource-active',
                resourceName: 'Active Crew',
                hasConflicts: false,
                conflictCount: 0,
                intervals: [],
              },
              {
                resourceId: 'resource-inactive',
                resourceName: 'Dormant Crew',
                hasConflicts: false,
                conflictCount: 0,
                intervals: [],
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

    const { root } = await renderPlannerWorkspace({
      accessToken: 'token',
      projectId: 'project-1',
      onBackToProject: vi.fn(),
      onCorrectConflict: vi.fn(),
    });
    await flushPlannerEffects();

    const props = ganttLibChartSpy.mock.calls[ganttLibChartSpy.mock.calls.length - 1]?.[0] as {
      resources: Array<{ id: string; name: string; status?: string }>;
    };

    expect(props.resources).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'resource-active', name: 'Active Crew', status: 'Active' }),
      expect.objectContaining({ id: 'resource-inactive', name: 'Dormant Crew', status: 'Inactive' }),
    ]));

    await unmountApp(root);
  });

  it('deletes a resource through the row menu command with confirmation', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/resources/planner')) {
        return {
          ok: true,
          json: async () => ({
            projectId: 'project-1',
            scope: 'current-project',
            workspaceUserId: 'user-1',
            resources: [
              {
                resourceId: 'resource-1',
                resourceName: 'Crew',
                hasConflicts: false,
                conflictCount: 0,
                intervals: [],
              },
            ],
          }),
        } as Response;
      }
      if (url.startsWith('/api/resources?projectId=')) {
        return { ok: true, json: async () => ({ resources: [] }) } as Response;
      }
      if (url === '/api/resources/resource-1' && init?.method === 'DELETE') {
        return { ok: true, json: async () => ({ id: 'resource-1' }) } as Response;
      }
      if (url === '/api/project') {
        return {
          ok: true,
          json: async () => ({
            version: 2,
            project: { id: 'project-1', name: 'Demo', status: 'active', ganttDayMode: 'calendar', calendarId: null, calendarDays: [], taskCount: 0, archivedAt: null, deletedAt: null },
            snapshot: { tasks: [], dependencies: [], resources: [], assignments: [] },
          }),
        } as Response;
      }
      return { ok: true, json: async () => ({ resources: [{ id: 'resource-1', userId: 'user-1', projectId: null, scope: 'shared', name: 'Crew', type: 'human', isActive: true, createdAt: '2026-04-01T00:00:00.000Z', updatedAt: '2026-04-01T00:00:00.000Z', deactivatedAt: null }] }) } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    const { root } = await renderPlannerWorkspace({
      accessToken: 'token',
      projectId: 'project-1',
      onBackToProject: vi.fn(),
      onCorrectConflict: vi.fn(),
    });
    await flushPlannerEffects();

    const props = ganttLibChartSpy.mock.calls[ganttLibChartSpy.mock.calls.length - 1]?.[0] as {
      resources: Array<{ id: string; name: string }>;
      resourceMenuCommands?: Array<{
        id: string;
        onSelect: (resource: { id: string; name: string }) => void;
      }>;
    };
    const deleteCommand = props.resourceMenuCommands?.find((command) => command.id === 'delete');
    expect(deleteCommand).toBeDefined();

    await act(async () => {
      deleteCommand?.onSelect({ id: 'resource-1', name: 'Crew' });
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(confirmSpy).toHaveBeenCalledWith('Удалить ресурс "Crew"? Назначения с ним тоже будут удалены.');
    expect(fetchMock).toHaveBeenCalledWith('/api/resources/resource-1', expect.objectContaining({
      method: 'DELETE',
    }));

    await unmountApp(root);
  });

  it('shows catalog resource type, scope, status, assignment count, conflict count, and blocks readonly creation', async () => {
    const catalogResources = [
      {
        id: 'resource-human',
        userId: 'user-1',
        projectId: null,
        scope: 'shared' as const,
        name: 'Shared Crew',
        type: 'human' as const,
        isActive: true,
        createdAt: '2026-04-01T00:00:00.000Z',
        updatedAt: '2026-04-01T00:00:00.000Z',
        deactivatedAt: null,
      },
      {
        id: 'resource-material',
        userId: 'user-1',
        projectId: 'project-1',
        scope: 'project' as const,
        name: 'Concrete',
        type: 'material' as const,
        isActive: false,
        createdAt: '2026-04-01T00:00:00.000Z',
        updatedAt: '2026-04-01T00:00:00.000Z',
        deactivatedAt: '2026-04-02T00:00:00.000Z',
      },
    ];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
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
                resourceId: 'resource-human',
                resourceName: 'Shared Crew',
                hasConflicts: true,
                conflictCount: 1,
                intervals: [
                  {
                    assignmentId: 'assignment-1',
                    resourceId: 'resource-human',
                    resourceName: 'Shared Crew',
                    projectId: 'project-1',
                    projectName: 'Project 1',
                    taskId: 'task-1',
                    taskName: 'Install',
                    startDate: '2026-04-01',
                    endDate: '2026-04-02',
                    assignmentCreatedAt: '2026-04-01T00:00:00.000Z',
                    hasConflict: true,
                    conflictCount: 1,
                    conflictAssignmentIds: ['assignment-2'],
                  },
                  {
                    assignmentId: 'assignment-3',
                    resourceId: 'resource-human',
                    resourceName: 'Shared Crew',
                    projectId: 'project-1',
                    projectName: 'Project 1',
                    taskId: 'task-3',
                    taskName: 'Inspect',
                    startDate: '2026-04-03',
                    endDate: '2026-04-03',
                    assignmentCreatedAt: '2026-04-01T00:00:00.000Z',
                    hasConflict: false,
                    conflictCount: 0,
                    conflictAssignmentIds: [],
                  },
                ],
              },
              {
                resourceId: 'resource-material',
                resourceName: 'Concrete',
                hasConflicts: false,
                conflictCount: 0,
                intervals: [],
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
      accessToken: null,
      projectId: 'project-1',
      onBackToProject: vi.fn(),
      onCorrectConflict: vi.fn(),
    });
    await flushPlannerEffects();

    await act(async () => {
      (container.querySelector('[data-testid="planner-open-catalog"]') as HTMLButtonElement).click();
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="resource-catalog-readonly"]')?.textContent).toContain('Войдите, чтобы изменять ресурсы');
    expect(container.querySelector('[data-testid="resource-create-submit"]')).toHaveProperty('disabled', true);

    await unmountApp(root);

    const rendered = await renderPlannerWorkspace({
      accessToken: 'token',
      projectId: 'project-1',
      onBackToProject: vi.fn(),
      onCorrectConflict: vi.fn(),
    });
    await flushPlannerEffects();

    await act(async () => {
      (rendered.container.querySelector('[data-testid="planner-open-catalog"]') as HTMLButtonElement).click();
      await Promise.resolve();
    });

    expect(rendered.container.querySelector('[data-testid="resource-catalog-row-resource-human"]')?.textContent).toContain('Shared Crew');
    expect(rendered.container.querySelector('[data-testid="resource-catalog-row-resource-human"]')?.textContent).toContain('Люди');
    expect(rendered.container.querySelector('[data-testid="resource-catalog-row-resource-human"]')?.textContent).toContain('shared');
    expect(rendered.container.querySelector('[data-testid="resource-catalog-row-resource-human"]')?.textContent).toContain('Активен');
    expect(rendered.container.querySelector('[data-testid="resource-catalog-row-resource-human"]')?.textContent).toContain('Назначений: 2');
    expect(rendered.container.querySelector('[data-testid="resource-catalog-row-resource-human"]')?.textContent).toContain('Конфликтов: 1');
    expect(rendered.container.querySelector('[data-testid="resource-catalog-row-resource-material"]')?.textContent).toContain('Материалы');
    expect(rendered.container.querySelector('[data-testid="resource-catalog-row-resource-material"]')?.textContent).toContain('Неактивен');

    await unmountApp(rendered.root);
  });

  it('patches catalog rename, type, deactivate, and activate actions with authoritative reloads', async () => {
    const activeResource = {
      id: 'resource-1',
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
    const inactiveResource = {
      ...activeResource,
      isActive: false,
      deactivatedAt: '2026-04-02T00:00:00.000Z',
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/resources/planner')) {
        return {
          ok: true,
          json: async () => ({
            projectId: 'project-1',
            scope: 'all-projects',
            workspaceUserId: 'user-1',
            resources: [{
              resourceId: 'resource-1',
              resourceName: 'Crew',
              hasConflicts: false,
              conflictCount: 0,
              intervals: [{
                assignmentId: 'assignment-locked',
                resourceId: 'resource-1',
                resourceName: 'Crew',
                projectId: 'project-1',
                projectName: 'Project 1',
                taskId: 'task-1',
                taskName: 'Locked',
                startDate: '2026-04-01',
                endDate: '2026-04-03',
                assignmentCreatedAt: '2026-04-01T00:00:00.000Z',
                hasConflict: false,
                conflictCount: 0,
                conflictAssignmentIds: [],
              }],
            }],
          }),
        } as Response;
      }
      if (url === '/api/resources/resource-1' && init?.method === 'PATCH') {
        const body = JSON.parse(String(init.body)) as { name?: string; type?: string; isActive?: boolean };
        return {
          ok: true,
          json: async () => ({
            ...activeResource,
            name: body.name ?? activeResource.name,
            type: body.type ?? activeResource.type,
            isActive: body.isActive ?? activeResource.isActive,
            deactivatedAt: body.isActive === false ? '2026-04-02T00:00:00.000Z' : null,
          }),
        } as Response;
      }
      if (url.startsWith('/api/resources')) {
        const hasDeactivated = fetchMock.mock.calls.some(([, callInit]) => callInit?.method === 'PATCH' && String(callInit.body).includes('"isActive":false'));
        return { ok: true, json: async () => ({ resources: [hasDeactivated ? inactiveResource : activeResource] }) } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    const { container, root } = await renderPlannerWorkspace({
      accessToken: 'token',
      projectId: 'project-1',
      onBackToProject: vi.fn(),
      onCorrectConflict: vi.fn(),
    });
    await flushPlannerEffects();

    await act(async () => {
      (container.querySelector('[data-testid="planner-open-catalog"]') as HTMLButtonElement).click();
      await Promise.resolve();
    });

    await act(async () => {
      const renameInput = container.querySelector('[data-testid="resource-rename-input-resource-1"]') as HTMLInputElement;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(renameInput, ' Renamed Crew ');
      renameInput.dispatchEvent(new Event('input', { bubbles: true }));
      (container.querySelector('[data-testid="resource-rename-save-resource-1"]') as HTMLButtonElement).click();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/resources/resource-1', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ name: 'Renamed Crew' }),
    }));

    await act(async () => {
      const typeSelect = container.querySelector('[data-testid="resource-type-select-resource-1"]') as HTMLSelectElement;
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(typeSelect, 'equipment');
      typeSelect.dispatchEvent(new Event('change', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/resources/resource-1', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ type: 'equipment' }),
    }));

    await act(async () => {
      (container.querySelector('[data-testid="resource-deactivate-resource-1"]') as HTMLButtonElement).click();
      await Promise.resolve();
    });

    expect(confirmSpy).toHaveBeenCalledWith('Ресурс станет недоступен для новых назначений. Продолжить?');
    expect(fetchMock.mock.calls.filter(([input, init]) => String(input) === '/api/resources/resource-1' && init?.method === 'PATCH' && String(init.body).includes('"isActive":false'))).toHaveLength(0);

    confirmSpy.mockReturnValue(true);
    await act(async () => {
      (container.querySelector('[data-testid="resource-deactivate-resource-1"]') as HTMLButtonElement).click();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/resources/resource-1', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ isActive: false }),
    }));
    expect(fetchMock.mock.calls.filter(([input]) => String(input).includes('/api/resources/planner?scope=all-projects')).length).toBeGreaterThanOrEqual(4);
    expect(container.querySelector('[data-testid="resource-catalog-row-resource-1"]')?.textContent).toContain('Неактивен');

    await act(async () => {
      (container.querySelector('[data-testid="resource-activate-resource-1"]') as HTMLButtonElement).click();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/resources/resource-1', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ isActive: true }),
    }));

    await unmountApp(root);
  });

  it('shows inline catalog mutation errors without wiping last successful data', async () => {
    const resource = {
      id: 'resource-1',
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
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
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
                resourceName: 'Shared Crew',
                hasConflicts: false,
                conflictCount: 0,
                intervals: [
                  {
                    assignmentId: 'assignment-1',
                    resourceId: 'resource-1',
                    resourceName: 'Shared Crew',
                    projectId: 'project-1',
                    projectName: 'Project 1',
                    taskId: 'task-1',
                    taskName: 'Install',
                    startDate: '2026-04-01',
                    endDate: '2026-04-02',
                    assignmentCreatedAt: '2026-04-01T00:00:00.000Z',
                    hasConflict: false,
                    conflictCount: 0,
                    conflictAssignmentIds: [],
                  },
                ],
              },
            ],
          }),
        } as Response;
      }
      if (url === '/api/resources/resource-1' && init?.method === 'PATCH') {
        return { ok: false, status: 400, json: async () => ({ error: 'rename rejected' }) } as Response;
      }
      if (url.startsWith('/api/resources')) {
        return { ok: true, json: async () => ({ resources: [resource] }) } as Response;
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
      (container.querySelector('[data-testid="planner-open-catalog"]') as HTMLButtonElement).click();
      await Promise.resolve();
    });

    await act(async () => {
      const renameInput = container.querySelector('[data-testid="resource-rename-input-resource-1"]') as HTMLInputElement;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(renameInput, 'Rejected Name');
      renameInput.dispatchEvent(new Event('input', { bubbles: true }));
      (container.querySelector('[data-testid="resource-rename-save-resource-1"]') as HTMLButtonElement).click();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="resource-catalog-mutation-error"]')?.textContent).toContain('rename rejected');
    expect(container.querySelector('[data-testid="resource-catalog-row-resource-1"]')?.textContent).toContain('Shared Crew');
    expect(container.querySelector('[data-testid="gantt-resource-row-resource-1"]')?.textContent).toContain('Shared Crew');
    expect(container.querySelector('[data-testid="gantt-resource-item-assignment-1"]')?.textContent).toContain('Install');

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
      (container.querySelector('[data-testid="gantt-resource-item-assignment-1"]') as HTMLButtonElement).click();
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
      (container.querySelector('[data-testid="gantt-resource-item-assignment-1"]') as HTMLButtonElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
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

  it('persists a date-only resource planner move through command commit with history title and reloads planner', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/resources/planner')) {
        return {
          ok: true,
          json: async () => ({
            projectId: 'project-1',
            scope: 'all-projects',
            workspaceUserId: 'user-1',
            resources: [{
              resourceId: 'resource-1',
              resourceName: 'Crew',
              hasConflicts: false,
              conflictCount: 0,
              intervals: [{
                assignmentId: 'assignment-1',
                resourceId: 'resource-1',
                resourceName: 'Crew',
                projectId: 'project-1',
                projectName: 'Project 1',
                taskId: 'task-1',
                taskName: 'Install',
                startDate: '2026-04-01',
                endDate: '2026-04-03',
                assignmentCreatedAt: '2026-04-01T00:00:00.000Z',
                hasConflict: false,
                conflictCount: 0,
                conflictAssignmentIds: [],
              }],
            }],
          }),
        } as Response;
      }
      if (url === '/api/resources') {
        return { ok: true, json: async () => ({ resources: [] }) } as Response;
      }
      if (url === '/api/commands/commit' && init?.method === 'POST') {
        return {
          ok: true,
          json: async () => ({
            accepted: true,
            newVersion: 2,
            snapshot: { tasks: [{ id: 'task-1', name: 'Install', startDate: '2026-04-02', endDate: '2026-04-04', dependencies: [] }], dependencies: [] },
            result: { changedTaskIds: ['task-1'], changedDependencyIds: [], conflicts: [] },
          }),
        } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);
    useProjectStore.setState({ confirmed: { version: 1, snapshot: { tasks: [], dependencies: [] } } });

    const { root } = await renderPlannerWorkspace({
      accessToken: 'token',
      projectId: 'project-1',
      onBackToProject: vi.fn(),
      onCorrectConflict: vi.fn(),
    });
    await flushPlannerEffects();

    const props = ganttLibChartSpy.mock.calls[ganttLibChartSpy.mock.calls.length - 1]?.[0] as {
      resources: Array<{ items: Array<Record<string, unknown>> }>;
      onResourceItemMove?: (move: Record<string, unknown>) => void;
    };
    const timelineItem = props.resources[0].items[0];

    await act(async () => {
      props.onResourceItemMove?.({
        item: timelineItem,
        itemId: 'assignment-1',
        taskId: 'task-1',
        fromResourceId: 'resource-1',
        toResourceId: 'resource-1',
        startDate: new Date(Date.UTC(2026, 3, 2)),
        endDate: new Date(Date.UTC(2026, 3, 4)),
        changeType: 'move',
      });
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const commitCall = fetchMock.mock.calls.find(([input]) => String(input) === '/api/commands/commit');
    expect(commitCall?.[1]).toEqual(expect.objectContaining({
      method: 'POST',
      body: expect.any(String),
    }));
    expect(JSON.parse(String(commitCall?.[1]?.body))).toMatchObject({
      baseVersion: 1,
      command: { type: 'move_task', taskId: 'task-1', startDate: '2026-04-02' },
      history: { title: 'Перенос назначения', origin: 'user_ui', finalizeGroup: true },
    });
    expect(fetchMock.mock.calls.filter(([input]) => String(input).includes('/api/resources/planner?scope=all-projects')).length).toBeGreaterThanOrEqual(2);

    await unmountApp(root);
  });

  it('posts full resource replacement for reassignment, preserving other task assignments', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/resources/planner')) {
        return {
          ok: true,
          json: async () => ({
            projectId: 'project-1',
            scope: 'all-projects',
            workspaceUserId: 'user-1',
            resources: [{
              resourceId: 'resource-1',
              resourceName: 'Crew',
              hasConflicts: false,
              conflictCount: 0,
              intervals: [{
                assignmentId: 'assignment-1',
                resourceId: 'resource-1',
                resourceName: 'Crew',
                projectId: 'project-1',
                projectName: 'Project 1',
                taskId: 'task-1',
                taskName: 'Install',
                startDate: '2026-04-01',
                endDate: '2026-04-03',
                assignmentCreatedAt: '2026-04-01T00:00:00.000Z',
                hasConflict: false,
                conflictCount: 0,
                conflictAssignmentIds: [],
              }],
            }, {
              resourceId: 'resource-2',
              resourceName: 'QA',
              hasConflicts: false,
              conflictCount: 0,
              intervals: [],
            }],
          }),
        } as Response;
      }
      if (url === '/api/resources') {
        return { ok: true, json: async () => ({ resources: [] }) } as Response;
      }
      if (url === '/api/tasks/task-1/assignments' && init?.method === 'POST') {
        return {
          ok: true,
          json: async () => ({ assignments: [
            { id: 'assignment-new', projectId: 'project-1', taskId: 'task-1', resourceId: 'resource-2', createdAt: '2026-04-01T00:00:00.000Z' },
            { id: 'assignment-other', projectId: 'project-1', taskId: 'task-1', resourceId: 'resource-3', createdAt: '2026-04-01T00:00:00.000Z' },
          ] }),
        } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);
    useProjectStore.setState({
      assignments: [
        { id: 'assignment-1', projectId: 'project-1', taskId: 'task-1', resourceId: 'resource-1', createdAt: '2026-04-01T00:00:00.000Z' },
        { id: 'assignment-other', projectId: 'project-1', taskId: 'task-1', resourceId: 'resource-3', createdAt: '2026-04-01T00:00:00.000Z' },
      ],
    });

    const { root } = await renderPlannerWorkspace({
      accessToken: 'token',
      projectId: 'project-1',
      onBackToProject: vi.fn(),
      onCorrectConflict: vi.fn(),
    });
    await flushPlannerEffects();

    const props = ganttLibChartSpy.mock.calls[ganttLibChartSpy.mock.calls.length - 1]?.[0] as {
      resources: Array<{ items: Array<Record<string, unknown>> }>;
      onResourceItemMove?: (move: Record<string, unknown>) => void;
    };

    await act(async () => {
      props.onResourceItemMove?.({
        item: props.resources[0].items[0],
        itemId: 'assignment-1',
        taskId: 'task-1',
        fromResourceId: 'resource-1',
        toResourceId: 'resource-2',
        startDate: new Date(Date.UTC(2026, 3, 1)),
        endDate: new Date(Date.UTC(2026, 3, 3)),
        changeType: 'move',
      });
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/tasks/task-1/assignments', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ resourceIds: ['resource-2', 'resource-3'] }),
    }));
    expect(useProjectStore.getState().assignments.filter((assignment) => assignment.taskId === 'task-1').map((assignment) => assignment.resourceId).sort()).toEqual([
      'resource-2',
      'resource-3',
    ]);

    await unmountApp(root);
  });

  it('reports exact partial failure copy for combined moves and reloads planner', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/resources/planner')) {
        return {
          ok: true,
          json: async () => ({
            projectId: 'project-1',
            scope: 'all-projects',
            workspaceUserId: 'user-1',
            resources: [{
              resourceId: 'resource-1',
              resourceName: 'Crew',
              hasConflicts: false,
              conflictCount: 0,
              intervals: [{
                assignmentId: 'assignment-1',
                resourceId: 'resource-1',
                resourceName: 'Crew',
                projectId: 'project-1',
                projectName: 'Project 1',
                taskId: 'task-1',
                taskName: 'Install',
                startDate: '2026-04-01',
                endDate: '2026-04-03',
                assignmentCreatedAt: '2026-04-01T00:00:00.000Z',
                hasConflict: false,
                conflictCount: 0,
                conflictAssignmentIds: [],
              }],
            }, { resourceId: 'resource-2', resourceName: 'QA', hasConflicts: false, conflictCount: 0, intervals: [] }],
          }),
        } as Response;
      }
      if (url === '/api/resources') {
        return { ok: true, json: async () => ({ resources: [] }) } as Response;
      }
      if (url === '/api/commands/commit') {
        return {
          ok: true,
          json: async () => ({
            accepted: true,
            newVersion: 2,
            snapshot: { tasks: [{ id: 'task-1', name: 'Install', startDate: '2026-04-02', endDate: '2026-04-04', dependencies: [] }], dependencies: [] },
            result: { changedTaskIds: ['task-1'], changedDependencyIds: [], conflicts: [] },
          }),
        } as Response;
      }
      if (url === '/api/tasks/task-1/assignments' && init?.method === 'POST') {
        return { ok: false, status: 400, json: async () => ({ error: 'blocked' }) } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);
    useProjectStore.setState({
      confirmed: { version: 1, snapshot: { tasks: [], dependencies: [] } },
      assignments: [{ id: 'assignment-1', projectId: 'project-1', taskId: 'task-1', resourceId: 'resource-1', createdAt: '2026-04-01T00:00:00.000Z' }],
    });

    const { container, root } = await renderPlannerWorkspace({
      accessToken: 'token',
      projectId: 'project-1',
      onBackToProject: vi.fn(),
      onCorrectConflict: vi.fn(),
    });
    await flushPlannerEffects();

    const props = ganttLibChartSpy.mock.calls[ganttLibChartSpy.mock.calls.length - 1]?.[0] as {
      resources: Array<{ items: Array<Record<string, unknown>> }>;
      onResourceItemMove?: (move: Record<string, unknown>) => void;
    };
    await act(async () => {
      props.onResourceItemMove?.({
        item: props.resources[0].items[0],
        itemId: 'assignment-1',
        taskId: 'task-1',
        fromResourceId: 'resource-1',
        toResourceId: 'resource-2',
        startDate: new Date(Date.UTC(2026, 3, 2)),
        endDate: new Date(Date.UTC(2026, 3, 4)),
        changeType: 'move',
      });
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="planner-save-error"]')?.textContent).toBe('Даты назначения сохранены, но ресурс не изменён. Календарь обновлён по данным сервера.');
    expect(fetchMock.mock.calls.filter(([input]) => String(input).includes('/api/resources/planner?scope=all-projects')).length).toBeGreaterThanOrEqual(2);

    await unmountApp(root);
  });

  it('blocks readonly and locked move persistence without network mutation calls', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/resources/planner')) {
        return {
          ok: true,
          json: async () => ({
            projectId: 'project-1',
            scope: 'all-projects',
            workspaceUserId: 'user-1',
            resources: [{
              resourceId: 'resource-1',
              resourceName: 'Crew',
              hasConflicts: false,
              conflictCount: 0,
              intervals: [{
                assignmentId: 'assignment-locked',
                resourceId: 'resource-1',
                resourceName: 'Crew',
                projectId: 'project-1',
                projectName: 'Project 1',
                taskId: 'task-1',
                taskName: 'Locked',
                startDate: '2026-04-01',
                endDate: '2026-04-03',
                assignmentCreatedAt: '2026-04-01T00:00:00.000Z',
                hasConflict: false,
                conflictCount: 0,
                conflictAssignmentIds: [],
              }],
            }],
          }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({ resources: [{
          id: 'resource-1',
          userId: 'user-1',
          projectId: null,
          scope: 'shared',
          name: 'Crew',
          type: 'human',
          isActive: true,
          createdAt: '2026-04-01T00:00:00.000Z',
          updatedAt: '2026-04-01T00:00:00.000Z',
          deactivatedAt: null,
        }] }),
      } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    const readonlyCallCount = ganttLibChartSpy.mock.calls.length;
    const readonlyRender = await renderPlannerWorkspace({
      accessToken: null,
      projectId: 'project-1',
      onBackToProject: vi.fn(),
      onCorrectConflict: vi.fn(),
    });
    await flushPlannerEffects();
    const readonlyCall = ganttLibChartSpy.mock.calls[readonlyCallCount]?.[0] as { onResourceItemMove?: unknown } | undefined;
    expect(readonlyCall?.onResourceItemMove).toBeUndefined();
    await unmountApp(readonlyRender.root);

    const lockedItem = {
      id: 'assignment-locked',
      resourceId: 'resource-1',
      taskId: 'task-1',
      title: 'Locked',
      startDate: '2026-04-01',
      endDate: '2026-04-03',
      locked: true,
      metadata: {
        source: 'resource-planner-result',
        projectId: 'project-1',
        projectName: 'Project 1',
        taskId: 'task-1',
        assignmentId: 'assignment-locked',
        resourceId: 'resource-1',
        resourceName: 'Crew',
        hasConflict: false,
        conflictCount: 0,
        conflictAssignmentIds: [],
        assignmentCreatedAt: '2026-04-01T00:00:00.000Z',
      },
    };
    const lockedRender = await renderPlannerWorkspace({
      accessToken: 'token',
      projectId: 'project-1',
      onBackToProject: vi.fn(),
      onCorrectConflict: vi.fn(),
    });
    await flushPlannerEffects();
    await flushPlannerEffects();
    const props = ganttLibChartSpy.mock.calls[ganttLibChartSpy.mock.calls.length - 1]?.[0] as { onResourceItemMove?: (move: Record<string, unknown>) => void };
    await act(async () => {
      props.onResourceItemMove?.({
        item: lockedItem,
        itemId: 'assignment-locked',
        taskId: 'task-1',
        fromResourceId: 'resource-1',
        toResourceId: 'resource-1',
        startDate: new Date(Date.UTC(2026, 3, 2)),
        endDate: new Date(Date.UTC(2026, 3, 4)),
        changeType: 'move',
      });
      await Promise.resolve();
    });
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes('/api/commands/commit'))).toBe(false);
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes('/api/tasks/task-1/assignments'))).toBe(false);

    await unmountApp(lockedRender.root);
  });

  it('persists assignment details date fallback through the same command path as drag', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/resources/planner')) {
        return {
          ok: true,
          json: async () => ({
            projectId: 'project-1',
            scope: 'all-projects',
            workspaceUserId: 'user-1',
            resources: [{
              resourceId: 'resource-1',
              resourceName: 'Crew',
              hasConflicts: false,
              conflictCount: 0,
              intervals: [{
                assignmentId: 'assignment-1',
                resourceId: 'resource-1',
                resourceName: 'Crew',
                projectId: 'project-1',
                projectName: 'Project 1',
                taskId: 'task-1',
                taskName: 'Install',
                startDate: '2026-04-01',
                endDate: '2026-04-03',
                assignmentCreatedAt: '2026-04-01T00:00:00.000Z',
                hasConflict: false,
                conflictCount: 0,
                conflictAssignmentIds: [],
              }],
            }],
          }),
        } as Response;
      }
      if (url === '/api/resources') {
        return { ok: true, json: async () => ({ resources: [] }) } as Response;
      }
      if (url === '/api/commands/commit' && init?.method === 'POST') {
        return {
          ok: true,
          json: async () => ({
            accepted: true,
            newVersion: 2,
            snapshot: { tasks: [{ id: 'task-1', name: 'Install', startDate: '2026-04-02', endDate: '2026-04-04', dependencies: [] }], dependencies: [] },
            result: { changedTaskIds: ['task-1'], changedDependencyIds: [], conflicts: [] },
          }),
        } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);
    useProjectStore.setState({ confirmed: { version: 1, snapshot: { tasks: [], dependencies: [] } } });

    const { container, root } = await renderPlannerWorkspace({
      accessToken: 'token',
      projectId: 'project-1',
      onBackToProject: vi.fn(),
      onCorrectConflict: vi.fn(),
    });
    await flushPlannerEffects();

    await act(async () => {
      (container.querySelector('[data-testid="gantt-resource-item-assignment-1"]') as HTMLButtonElement).click();
      await Promise.resolve();
    });

    await act(async () => {
      const startInput = container.querySelector('input[name="startDate"]') as HTMLInputElement;
      const endInput = container.querySelector('input[name="endDate"]') as HTMLInputElement;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(startInput, '2026-04-02');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(endInput, '2026-04-04');
      startInput.dispatchEvent(new Event('input', { bubbles: true }));
      endInput.dispatchEvent(new Event('input', { bubbles: true }));
      (startInput.closest('form') as HTMLFormElement).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const commitCall = fetchMock.mock.calls.find(([input]) => String(input) === '/api/commands/commit');
    expect(JSON.parse(String(commitCall?.[1]?.body))).toMatchObject({
      command: { type: 'move_task', taskId: 'task-1', startDate: '2026-04-02' },
      history: { title: 'Перенос назначения' },
    });

    await unmountApp(root);
  });
});
