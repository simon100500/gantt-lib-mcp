// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const toolbarSpy = vi.fn();
let ganttPropsSpy: Record<string, unknown> | null = null;

vi.mock('../../layout/Toolbar.tsx', () => ({
  Toolbar: (props: Record<string, unknown>) => {
    toolbarSpy(props);
    return <div data-testid="toolbar-props">toolbar</div>;
  },
}));

vi.mock('../../GanttChart.tsx', () => ({
  GanttChart: (props: Record<string, unknown>) => {
    ganttPropsSpy = props;
    return <div data-testid="gantt-chart">chart</div>;
  },
}));

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

import { ProjectWorkspace } from '../ProjectWorkspace.tsx';
import { useProjectStore } from '../../../stores/useProjectStore.ts';
import { useProjectUIStore } from '../../../stores/useProjectUIStore.ts';
import { useUIStore } from '../../../stores/useUIStore.ts';
import { useHistoryViewerStore } from '../../../stores/useHistoryViewerStore.ts';
import { useTaskStore } from '../../../stores/useTaskStore.ts';
import { useAuthStore } from '../../../stores/useAuthStore.ts';
import type { ProjectLoadResponse } from '../../../lib/apiTypes.ts';
import type { Task, ValidationResult } from '../../../types.ts';

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

const ganttRef = { current: null };
const tasks: Task[] = [
  { id: 'parent-1', name: 'Parent', startDate: '2026-04-01', endDate: '2026-04-02', dependencies: [] },
  { id: 'leaf-1', name: 'Leaf A', startDate: '2026-04-01', endDate: '2026-04-02', parentId: 'parent-1', dependencies: [] },
  { id: 'leaf-2', name: 'Leaf B', startDate: '2026-04-02', endDate: '2026-04-03', parentId: 'parent-1', dependencies: [] },
  { id: 'solo-parent', name: 'Solo Parent', startDate: '2026-04-03', endDate: '2026-04-04', dependencies: [] },
];

function renderWorkspace(): { container: HTMLDivElement; root: Root } {
  const container = document.createElement('div');
  document.body.appendChild(container);

  const root = createRoot(container);
  act(() => {
    root.render(
      <ProjectWorkspace
        ganttRef={ganttRef}
        tasks={tasks}
        setTasks={() => {}}
        loading={false}
        accessToken="token"
        sharedProject={null}
        shareToken={null}
        hasShareToken={false}
        displayConnected={true}
        isAuthenticated={true}
        onSend={async () => ({ accepted: true })}
        onLoginRequired={() => {}}
        onScrollToToday={() => {}}
        onCollapseAll={() => {}}
        onExpandAll={() => {}}
        onValidation={(_result: ValidationResult) => {}}
        readOnly={false}
        showChat={true}
        shareStatus="idle"
        ganttDayMode="calendar"
      />,
    );
  });

  return { container, root };
}

function renderWorkspaceWithTaskStore(): { container: HTMLDivElement; root: Root } {
  const container = document.createElement('div');
  document.body.appendChild(container);

  const root = createRoot(container);

  function WorkspaceHarness() {
    const storeTasks = useTaskStore((state) => state.tasks);
    const storeLoading = useTaskStore((state) => state.loading);
    const setStoreTasks = useTaskStore((state) => state.setTasks);

    return (
      <ProjectWorkspace
        ganttRef={ganttRef}
        tasks={storeTasks}
        setTasks={setStoreTasks}
        loading={storeLoading}
        accessToken="token"
        sharedProject={null}
        shareToken={null}
        hasShareToken={false}
        displayConnected={true}
        isAuthenticated={true}
        onSend={async () => ({ accepted: true })}
        onLoginRequired={() => {}}
        onScrollToToday={() => {}}
        onCollapseAll={() => {}}
        onExpandAll={() => {}}
        onValidation={(_result: ValidationResult) => {}}
        readOnly={false}
        showChat={true}
        shareStatus="idle"
        ganttDayMode="calendar"
      />
    );
  }

  act(() => {
    root.render(<WorkspaceHarness />);
  });

  return { container, root };
}

function buildProjectLoadResponse(overrides?: Partial<ProjectLoadResponse>): ProjectLoadResponse {
  return {
    version: 2,
    project: {
      id: 'project-1',
      name: 'Project 1',
      status: 'active',
      ganttDayMode: 'calendar',
      calendarId: null,
      calendarDays: [],
      taskCount: tasks.length,
      archivedAt: null,
      deletedAt: null,
    },
    snapshot: {
      tasks,
      dependencies: [],
      resources: [
        {
          id: 'resource-1',
          projectId: 'project-1',
          name: 'Alpha Crew',
          type: 'human',
          isActive: true,
          createdAt: '2026-04-01T00:00:00.000Z',
          updatedAt: '2026-04-01T00:00:00.000Z',
          deactivatedAt: null,
        },
        {
          id: 'resource-2',
          projectId: 'project-1',
          name: 'Dormant Crew',
          type: 'human',
          isActive: false,
          createdAt: '2026-04-01T00:00:00.000Z',
          updatedAt: '2026-04-02T00:00:00.000Z',
          deactivatedAt: '2026-04-02T00:00:00.000Z',
        },
      ],
      assignments: [
        {
          id: 'existing-leaf-2',
          projectId: 'project-1',
          taskId: 'leaf-2',
          resourceId: 'resource-2',
          createdAt: '2026-04-01T00:00:00.000Z',
        },
      ],
    },
    ...overrides,
  };
}

beforeEach(() => {
  toolbarSpy.mockClear();
  ganttPropsSpy = null;
  vi.unstubAllGlobals();
  useTaskStore.setState({
    tasks,
    loading: false,
    error: null,
    activeSource: 'auth',
    shareToken: null,
    project: null,
    isSharedReadOnly: false,
    isDemoMode: false,
    projectName: 'Мой проект',
    authToken: 'token',
    currentRequestId: 0,
  });
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
      taskCount: tasks.length,
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
        taskCount: tasks.length,
        archivedAt: null,
        deletedAt: null,
      },
    ],
    adminContext: null,
    constraintDenial: null,
  });
  useProjectStore.setState({
    confirmed: { version: 1, snapshot: { tasks, dependencies: [] } },
    resources: [
      {
        id: 'resource-1',
        projectId: 'project-1',
        name: 'Alpha Crew',
        type: 'human',
        isActive: true,
        createdAt: '2026-04-01T00:00:00.000Z',
        updatedAt: '2026-04-01T00:00:00.000Z',
        deactivatedAt: null,
      },
      {
        id: 'resource-2',
        projectId: 'project-1',
        name: 'Dormant Crew',
        type: 'human',
        isActive: false,
        createdAt: '2026-04-01T00:00:00.000Z',
        updatedAt: '2026-04-02T00:00:00.000Z',
        deactivatedAt: '2026-04-02T00:00:00.000Z',
      },
    ],
    assignments: [
      {
        id: 'existing-leaf-2',
        projectId: 'project-1',
        taskId: 'leaf-2',
        resourceId: 'resource-2',
        createdAt: '2026-04-01T00:00:00.000Z',
      },
    ],
    assignmentError: null,
    pending: [],
    dragPreview: undefined,
    scheduleOptions: useProjectStore.getState().scheduleOptions,
  });
  useUIStore.setState({
    workspace: { kind: 'project', projectId: 'project-1', chatOpen: false },
    viewMode: 'day',
    showTaskList: true,
    showChart: true,
    autoSchedule: true,
    highlightExpiredTasks: false,
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
  useProjectUIStore.setState({ projectStates: {} });
  useHistoryViewerStore.setState({ historyViewer: { mode: 'inactive' } });
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('ProjectWorkspace resource assignments', () => {
  it('reopens through the authoritative /api/project snapshot and keeps inactive assignments visible while excluding them from new writes', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          assignments: [
            {
              id: 'assigned-leaf-2',
              projectId: 'project-1',
              taskId: 'leaf-2',
              resourceId: 'resource-2',
              createdAt: '2026-04-01T00:00:00.000Z',
            },
          ],
          resources: [
            {
              id: 'resource-1',
              projectId: 'project-1',
              name: 'Alpha Crew',
              type: 'human',
              isActive: true,
              createdAt: '2026-04-01T00:00:00.000Z',
              updatedAt: '2026-04-01T00:00:00.000Z',
              deactivatedAt: null,
            },
            {
              id: 'resource-2',
              projectId: 'project-1',
              name: 'Dormant Crew',
              type: 'human',
              isActive: true,
              createdAt: '2026-04-01T00:00:00.000Z',
              updatedAt: '2026-04-01T00:00:00.000Z',
              deactivatedAt: null,
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => buildProjectLoadResponse(),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          reason: 'validation_error',
          error: 'Resource resource-2 is inactive',
          issue: { code: 'resource_inactive', field: 'resourceId', detail: 'resource-2' },
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const { container, root } = renderWorkspaceWithTaskStore();
    const commands = (ganttPropsSpy?.taskListMenuCommands as Array<{ id: string; onSelect: (task: Task) => void }> | undefined) ?? [];
    const assignCommand = commands.find((command) => command.id === 'assign-resource');

    expect(assignCommand).toBeTruthy();

    await act(async () => {
      await useProjectStore.getState().setAssignments([
        {
          id: 'assigned-leaf-2',
          projectId: 'project-1',
          taskId: 'leaf-2',
          resourceId: 'resource-2',
          createdAt: '2026-04-01T00:00:00.000Z',
        },
      ]);
      await useProjectStore.getState().setResources([
        {
          id: 'resource-1',
          projectId: 'project-1',
          name: 'Alpha Crew',
          type: 'human',
          isActive: true,
          createdAt: '2026-04-01T00:00:00.000Z',
          updatedAt: '2026-04-01T00:00:00.000Z',
          deactivatedAt: null,
        },
        {
          id: 'resource-2',
          projectId: 'project-1',
          name: 'Dormant Crew',
          type: 'human',
          isActive: true,
          createdAt: '2026-04-01T00:00:00.000Z',
          updatedAt: '2026-04-01T00:00:00.000Z',
          deactivatedAt: null,
        },
      ]);
      await useTaskStore.getState().fetchTasks('token', useAuthStore.getState().refreshAccessToken);
    });

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/project', {
      headers: { Authorization: 'Bearer token' },
    });
    expect(container.querySelector('[data-testid="assignment-summary"]')?.textContent).toContain('Leaf B: Dormant Crew');

    await act(async () => {
      assignCommand!.onSelect(tasks[0]!);
      await Promise.resolve();
    });

    const select = container.querySelector('[data-testid="assignment-resource-select"]') as HTMLSelectElement | null;
    const submitButton = container.querySelector('[data-testid="assignment-submit-button"]') as HTMLButtonElement | null;

    expect(select).not.toBeNull();
    expect(Array.from(select?.options ?? []).map((option) => option.textContent)).toEqual([
      'Выберите активный ресурс',
      'Alpha Crew',
    ]);
    expect(Array.from(select?.options ?? []).some((option) => option.textContent === 'Dormant Crew')).toBe(false);
    expect(submitButton?.disabled).toBe(true);

    await act(async () => {
      await useProjectStore.getState().setAssignmentError(null);
      await (useProjectStore.getState().setResources as (resources: ProjectLoadResponse['snapshot']['resources']) => void)([
        {
          id: 'resource-1',
          projectId: 'project-1',
          name: 'Alpha Crew',
          type: 'human',
          isActive: true,
          createdAt: '2026-04-01T00:00:00.000Z',
          updatedAt: '2026-04-01T00:00:00.000Z',
          deactivatedAt: null,
        },
        {
          id: 'resource-2',
          projectId: 'project-1',
          name: 'Dormant Crew',
          type: 'human',
          isActive: false,
          createdAt: '2026-04-01T00:00:00.000Z',
          updatedAt: '2026-04-02T00:00:00.000Z',
          deactivatedAt: '2026-04-02T00:00:00.000Z',
        },
      ]);
    });

    await act(async () => {
      select!.value = 'resource-2';
      select!.dispatchEvent(new Event('change', { bubbles: true }));
    });

    await act(async () => {
      submitButton!.click();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/tasks/parent-1/assignments/materialize', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ resourceIds: ['resource-2'] }),
    }));
    expect(useProjectStore.getState().assignmentError).toBe('resource_inactive: Resource resource-2 is inactive');
    expect(container.querySelector('[data-testid="assignment-error-banner"]')?.textContent).toContain('resource_inactive');
    expect(container.querySelector('[data-testid="assignment-summary"]')?.textContent).toContain('Leaf B: Dormant Crew');

    root.unmount();
  });

  it('fails the reopen proof when the authoritative payload omits resources or assignments', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ...buildProjectLoadResponse(),
        snapshot: {
          ...buildProjectLoadResponse().snapshot,
          resources: undefined,
          assignments: undefined,
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      await useTaskStore.getState().fetchTasks('token', useAuthStore.getState().refreshAccessToken);
    });

    expect(useProjectStore.getState().resources).toEqual([]);
    expect(useProjectStore.getState().assignments).toEqual([]);
    expect(useProjectStore.getState().confirmed.version).toBe(2);
    expect(useProjectStore.getState().assignmentError).toBeNull();
    expect(useProjectStore.getState().resources.some((resource) => resource.name === 'Dormant Crew')).toBe(false);
    expect(useProjectStore.getState().assignments.some((assignment) => assignment.resourceId === 'resource-2')).toBe(false);
  });

  it('hydrates authoritative resource and assignment state into the visible workspace summary, including inactive existing assignments', () => {
    const { container, root } = renderWorkspace();

    expect(container.textContent).toContain('Leaf B: Dormant Crew');
    expect(container.textContent).toContain('Parent: —');
    expect(container.textContent).not.toContain('Parent: Dormant Crew');

    root.unmount();
  });

  it('opens explicit active-only selection instead of auto-submitting the first active resource', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { container, root } = renderWorkspace();
    const commands = (ganttPropsSpy?.taskListMenuCommands as Array<{ id: string; onSelect: (task: Task) => void }> | undefined) ?? [];
    const assignCommand = commands.find((command) => command.id === 'assign-resource');

    expect(assignCommand).toBeTruthy();

    await act(async () => {
      assignCommand!.onSelect(tasks[0]!);
      await Promise.resolve();
    });

    const panel = container.querySelector('[data-testid="assignment-selection-panel"]');
    const select = container.querySelector('[data-testid="assignment-resource-select"]') as HTMLSelectElement | null;
    const submitButton = container.querySelector('[data-testid="assignment-submit-button"]') as HTMLButtonElement | null;

    expect(panel).not.toBeNull();
    expect(panel?.textContent).toContain('Назначить ресурс: Parent');
    expect(select).not.toBeNull();
    expect(Array.from(select?.options ?? []).map((option) => option.textContent)).toEqual([
      'Выберите активный ресурс',
      'Alpha Crew',
    ]);
    expect(Array.from(select?.options ?? []).some((option) => option.textContent === 'Dormant Crew')).toBe(false);
    expect(submitButton?.disabled).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();

    root.unmount();
  });

  it('wires a parent assignment submit through the materialize route and stores only descendant leaf assignments', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        requestedTaskId: 'parent-1',
        leafTaskIds: ['leaf-1', 'leaf-2'],
        taskAssignments: [
          {
            taskId: 'leaf-1',
            assignments: [
              {
                id: 'new-leaf-1',
                projectId: 'project-1',
                taskId: 'leaf-1',
                resourceId: 'resource-1',
                createdAt: '2026-04-02T00:00:00.000Z',
              },
            ],
          },
          {
            taskId: 'leaf-2',
            assignments: [
              {
                id: 'new-leaf-2',
                projectId: 'project-1',
                taskId: 'leaf-2',
                resourceId: 'resource-1',
                createdAt: '2026-04-02T00:00:00.000Z',
              },
            ],
          },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { container, root } = renderWorkspace();
    const commands = (ganttPropsSpy?.taskListMenuCommands as Array<{ id: string; onSelect: (task: Task) => void }> | undefined) ?? [];
    const assignCommand = commands.find((command) => command.id === 'assign-resource');

    expect(assignCommand).toBeTruthy();

    await act(async () => {
      assignCommand!.onSelect(tasks[0]!);
      await Promise.resolve();
    });

    const select = container.querySelector('[data-testid="assignment-resource-select"]') as HTMLSelectElement;
    const submitButton = container.querySelector('[data-testid="assignment-submit-button"]') as HTMLButtonElement;

    await act(async () => {
      select.value = 'resource-1';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(submitButton.disabled).toBe(false);

    await act(async () => {
      submitButton.click();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/tasks/parent-1/assignments/materialize', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ resourceIds: ['resource-1'] }),
    }));
    const state = useProjectStore.getState();
    expect(state.assignments.map((assignment) => assignment.taskId).sort()).toEqual(['leaf-1', 'leaf-2']);
    expect(state.assignments.some((assignment) => assignment.taskId === 'parent-1')).toBe(false);
    expect(state.assignmentError).toBeNull();
    expect(container.querySelector('[data-testid="assignment-selection-panel"]')).toBeNull();

    root.unmount();
  });

  it('surfaces the no-leaf validation error deterministically to the user after explicit submit', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        reason: 'validation_error',
        error: 'Task solo-parent has no descendant leaf tasks',
        issue: { code: 'task_has_no_leaf_descendants', field: 'taskId' },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { container, root } = renderWorkspace();
    const commands = (ganttPropsSpy?.taskListMenuCommands as Array<{ id: string; onSelect: (task: Task) => void }> | undefined) ?? [];
    const assignCommand = commands.find((command) => command.id === 'assign-resource');

    await act(async () => {
      assignCommand!.onSelect(tasks[3]!);
      await Promise.resolve();
    });

    const select = container.querySelector('[data-testid="assignment-resource-select"]') as HTMLSelectElement;
    const submitButton = container.querySelector('[data-testid="assignment-submit-button"]') as HTMLButtonElement;

    await act(async () => {
      select.value = 'resource-1';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });

    await act(async () => {
      submitButton.click();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/tasks/solo-parent/assignments', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ resourceIds: ['resource-1'] }),
    }));
    expect(useProjectStore.getState().assignmentError).toBe('task_has_no_leaf_descendants: Task solo-parent has no descendant leaf tasks');
    expect(container.querySelector('[data-testid="assignment-error-banner"]')?.textContent).toContain('task_has_no_leaf_descendants');
    expect(container.querySelector('[data-testid="assignment-selection-panel"]')).not.toBeNull();

    root.unmount();
  });

  it('shows a deterministic local error when no active resources are available', async () => {
    useProjectStore.setState((state) => ({
      ...state,
      resources: state.resources.map((resource) => ({ ...resource, isActive: false, deactivatedAt: resource.deactivatedAt ?? '2026-04-03T00:00:00.000Z' })),
      assignmentError: null,
    }));
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { container, root } = renderWorkspace();
    const commands = (ganttPropsSpy?.taskListMenuCommands as Array<{ id: string; onSelect: (task: Task) => void }> | undefined) ?? [];
    const assignCommand = commands.find((command) => command.id === 'assign-resource');

    await act(async () => {
      assignCommand!.onSelect(tasks[1]!);
      await Promise.resolve();
    });

    const select = container.querySelector('[data-testid="assignment-resource-select"]') as HTMLSelectElement | null;
    const submitButton = container.querySelector('[data-testid="assignment-submit-button"]') as HTMLButtonElement | null;

    expect(container.querySelector('[data-testid="assignment-selection-empty"]')?.textContent).toContain('Нет активных ресурсов');
    expect(Array.from(select?.options ?? []).map((option) => option.textContent)).toEqual(['Выберите активный ресурс']);
    expect(submitButton?.disabled).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();

    root.unmount();
  });
});
