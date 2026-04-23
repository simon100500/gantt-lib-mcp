// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const plannerWorkspaceSpy = vi.fn();
const projectWorkspaceSpy = vi.fn();

vi.mock('../ResourcePlannerWorkspace.tsx', () => ({
  ResourcePlannerWorkspace: (props: Record<string, unknown>) => {
    plannerWorkspaceSpy(props);
    return <div data-testid="planner-workspace">planner workspace</div>;
  },
}));

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

async function unmountApp(root: Root): Promise<void> {
  await act(async () => {
    root.unmount();
    await Promise.resolve();
  });
}

beforeEach(() => {
  plannerWorkspaceSpy.mockClear();
  projectWorkspaceSpy.mockClear();

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
  vi.restoreAllMocks();
});

describe('ResourcePlanner workspace integration', () => {
  it('opens a dedicated planner workspace from the resource-pool entry and renders outside ProjectWorkspace', async () => {
    const { container, root } = await renderApp();

    expect(container.querySelector('[data-testid="project-workspace"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="planner-workspace"]')).toBeNull();

    await act(async () => {
      (container.querySelector('[data-testid="menu-open-planner"]') as HTMLButtonElement).click();
      await Promise.resolve();
    });

    expect(useUIStore.getState().workspace).toEqual({ kind: 'planner', projectId: 'project-1' });
    expect(container.querySelector('[data-testid="planner-workspace"]')).not.toBeNull();
    expect(plannerWorkspaceSpy).toHaveBeenCalled();
    expect(projectWorkspaceSpy.mock.calls.length).toBe(1);

    await unmountApp(root);
  });

  it('keeps planner mode stable across the auth-sync workspace effect for the same project', async () => {
    const { container, root } = await renderApp();

    await act(async () => {
      useUIStore.setState({ workspace: { kind: 'planner', projectId: 'project-1' } });
      await Promise.resolve();
    });

    expect(useUIStore.getState().workspace).toEqual({ kind: 'planner', projectId: 'project-1' });
    expect(container.querySelector('[data-testid="planner-workspace"]')).not.toBeNull();

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
    expect(container.querySelector('[data-testid="planner-workspace"]')).not.toBeNull();

    await unmountApp(root);
  });
});
