// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const toolbarSpy = vi.fn();
let ganttPropsSpy: Record<string, unknown> | null = null;
const ganttPropsHistory: Array<Record<string, unknown>> = [];

vi.mock('../../layout/Toolbar.tsx', () => ({
  Toolbar: (props: Record<string, unknown>) => {
    toolbarSpy(props);
    return <div data-testid="toolbar-props">toolbar</div>;
  },
}));

vi.mock('../../GanttChart.tsx', () => ({
  GanttChart: React.forwardRef((_props: Record<string, unknown>, _ref) => {
    const props = _props;
    ganttPropsSpy = props;
    ganttPropsHistory.push(props);
    return <div data-testid="gantt-chart">chart</div>;
  }),
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

async function renderWorkspace(): Promise<{ container: HTMLDivElement; root: Root }> {
  const container = document.createElement('div');
  document.body.appendChild(container);

  const root = createRoot(container);
  await act(async () => {
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
    await Promise.resolve();
  });

  return { container, root };
}

async function renderWorkspaceWithTaskStore(): Promise<{ container: HTMLDivElement; root: Root }> {
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

  await act(async () => {
    root.render(<WorkspaceHarness />);
    await Promise.resolve();
  });

  return { container, root };
}

async function unmountWorkspace(root: Root): Promise<void> {
  await act(async () => {
    root.unmount();
    await Promise.resolve();
  });
}

function getAssignCommand(): { id: string; onSelect: (task: Task) => void } {
  const commands = (ganttPropsSpy?.taskListMenuCommands as Array<{ id: string; onSelect: (task: Task) => void }> | undefined) ?? [];
  const assignCommand = commands.find((command) => command.id === 'assign-resource');
  expect(assignCommand).toBeTruthy();
  return assignCommand!;
}

function getCheckbox(container: HTMLElement, resourceId: string): HTMLInputElement | null {
  return container.querySelector(`[data-testid="assignment-resource-checkbox-${resourceId}"]`) as HTMLInputElement | null;
}

function getSubmitButton(container: HTMLElement): HTMLButtonElement | null {
  return container.querySelector('[data-testid="assignment-modal-submit"]') as HTMLButtonElement | null;
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
          userId: 'user-1',
          projectId: null,
          scope: 'shared',
          name: 'Alpha Crew',
          type: 'human',
          isActive: true,
          createdAt: '2026-04-01T00:00:00.000Z',
          updatedAt: '2026-04-01T00:00:00.000Z',
          deactivatedAt: null,
        },
        {
          id: 'resource-2',
          userId: 'user-1',
          projectId: 'project-1',
          scope: 'project',
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
  ganttPropsHistory.length = 0;
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
        userId: 'user-1',
        projectId: null,
        scope: 'shared',
        name: 'Alpha Crew',
        type: 'human',
        isActive: true,
        createdAt: '2026-04-01T00:00:00.000Z',
        updatedAt: '2026-04-01T00:00:00.000Z',
        deactivatedAt: null,
      },
      {
        id: 'resource-2',
        userId: 'user-1',
        projectId: 'project-1',
        scope: 'project',
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
  it('passes the assigned-resources additional column seam into GanttChart', async () => {
    const { root } = await renderWorkspace();

    const columns = (ganttPropsSpy?.additionalColumns as Array<{ id: string; header: unknown; renderCell: (ctx: Record<string, unknown>) => React.ReactNode }> | undefined) ?? [];
    const assignedResourcesColumn = columns.find((column) => column.id === 'assigned-resources');

    expect(assignedResourcesColumn).toBeTruthy();
    expect(assignedResourcesColumn?.header).toBe('Ресурсы');

    await unmountWorkspace(root);
  });

  it('shows shared resources plus current-project local resources, while excluding foreign local resources from the selector', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      useProjectStore.setState((state) => ({
        ...state,
        resources: [
          {
            id: 'resource-shared',
            userId: 'user-1',
            projectId: null,
            scope: 'shared',
            name: 'Shared Crew',
            type: 'human',
            isActive: true,
            createdAt: '2026-04-01T00:00:00.000Z',
            updatedAt: '2026-04-01T00:00:00.000Z',
            deactivatedAt: null,
          },
          {
            id: 'resource-local-current',
            userId: 'user-1',
            projectId: 'project-1',
            scope: 'project',
            name: 'Current Project Crew',
            type: 'human',
            isActive: true,
            createdAt: '2026-04-01T00:00:00.000Z',
            updatedAt: '2026-04-01T00:00:00.000Z',
            deactivatedAt: null,
          },
          {
            id: 'resource-local-foreign',
            userId: 'user-1',
            projectId: 'project-2',
            scope: 'project',
            name: 'Foreign Project Crew',
            type: 'human',
            isActive: true,
            createdAt: '2026-04-01T00:00:00.000Z',
            updatedAt: '2026-04-01T00:00:00.000Z',
            deactivatedAt: null,
          },
        ],
        assignments: [],
        assignmentError: null,
      }));
    });

    const { container, root } = await renderWorkspace();
    const assignCommand = getAssignCommand();

    await act(async () => {
      assignCommand.onSelect(tasks[1]!);
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="resource-assignment-modal"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="assignment-resource-option-resource-shared"]')?.textContent).toContain('Shared Crew');
    expect(container.querySelector('[data-testid="assignment-resource-option-resource-local-current"]')?.textContent).toContain('Current Project Crew');
    expect(container.querySelector('[data-testid="assignment-resource-option-resource-local-foreign"]')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();

    await unmountWorkspace(root);
  });

  it('drops foreign local resources and orphaned assignments from authoritative reload state', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => buildProjectLoadResponse({
        snapshot: {
          tasks,
          dependencies: [],
          resources: [
            {
              id: 'resource-shared',
              userId: 'user-1',
              projectId: null,
              scope: 'shared',
              name: 'Shared Crew',
              type: 'human',
              isActive: true,
              createdAt: '2026-04-01T00:00:00.000Z',
              updatedAt: '2026-04-01T00:00:00.000Z',
              deactivatedAt: null,
            },
            {
              id: 'resource-local-current',
              userId: 'user-1',
              projectId: 'project-1',
              scope: 'project',
              name: 'Current Project Crew',
              type: 'human',
              isActive: true,
              createdAt: '2026-04-01T00:00:00.000Z',
              updatedAt: '2026-04-01T00:00:00.000Z',
              deactivatedAt: null,
            },
            {
              id: 'resource-local-foreign',
              userId: 'user-1',
              projectId: 'project-2',
              scope: 'project',
              name: 'Foreign Project Crew',
              type: 'human',
              isActive: true,
              createdAt: '2026-04-01T00:00:00.000Z',
              updatedAt: '2026-04-01T00:00:00.000Z',
              deactivatedAt: null,
            },
          ] as ProjectLoadResponse['snapshot']['resources'],
          assignments: [
            {
              id: 'assignment-shared',
              projectId: 'project-1',
              taskId: 'leaf-1',
              resourceId: 'resource-shared',
              createdAt: '2026-04-01T00:00:00.000Z',
            },
            {
              id: 'assignment-current-local',
              projectId: 'project-1',
              taskId: 'leaf-2',
              resourceId: 'resource-local-current',
              createdAt: '2026-04-01T00:00:00.000Z',
            },
            {
              id: 'assignment-foreign-local',
              projectId: 'project-1',
              taskId: 'parent-1',
              resourceId: 'resource-local-foreign',
              createdAt: '2026-04-01T00:00:00.000Z',
            },
          ],
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      await useTaskStore.getState().fetchTasks('token', useAuthStore.getState().refreshAccessToken);
    });

    expect(useProjectStore.getState().resources.map((resource) => resource.name)).toEqual([
      'Shared Crew',
      'Current Project Crew',
      'Foreign Project Crew',
    ]);
    expect(useProjectStore.getState().assignments.map((assignment) => assignment.resourceId).sort()).toEqual([
      'resource-local-current',
      'resource-shared',
    ]);
    expect(useProjectStore.getState().assignments.some((assignment) => assignment.resourceId === 'resource-local-foreign')).toBe(false);

    const { container, root } = await renderWorkspaceWithTaskStore();
    expect(container.querySelector('[data-testid="assignment-summary"]')?.textContent).toContain('Leaf A: Shared Crew');
    expect(container.querySelector('[data-testid="assignment-summary"]')?.textContent).toContain('Leaf B: Current Project Crew');
    expect(container.querySelector('[data-testid="assignment-summary"]')?.textContent).not.toContain('Foreign Project Crew');

    await unmountWorkspace(root);
  });

  it('reopens through the authoritative /api/project snapshot and keeps inactive assignments visible while excluding them from new writes', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
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
                  resourceId: 'resource-2',
                  createdAt: '2026-04-01T00:00:00.000Z',
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
                  resourceId: 'resource-2',
                  createdAt: '2026-04-01T00:00:00.000Z',
                },
              ],
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => buildProjectLoadResponse({
          snapshot: {
            tasks,
            dependencies: [],
            resources: [
              {
                id: 'resource-1',
                userId: 'user-1',
                projectId: 'project-1',
                scope: 'project',
                name: 'Alpha Crew',
                type: 'human',
                isActive: true,
                createdAt: '2026-04-01T00:00:00.000Z',
                updatedAt: '2026-04-01T00:00:00.000Z',
                deactivatedAt: null,
              },
              {
                id: 'resource-2',
                userId: 'user-1',
                projectId: 'project-1',
                scope: 'project',
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
                id: 'new-leaf-1',
                projectId: 'project-1',
                taskId: 'leaf-1',
                resourceId: 'resource-2',
                createdAt: '2026-04-01T00:00:00.000Z',
              },
              {
                id: 'new-leaf-2',
                projectId: 'project-1',
                taskId: 'leaf-2',
                resourceId: 'resource-2',
                createdAt: '2026-04-01T00:00:00.000Z',
              },
            ],
          },
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const { container, root } = await renderWorkspace();
    const assignCommand = getAssignCommand();

    await act(async () => {
      await useProjectStore.getState().setAssignments([]);
      await useProjectStore.getState().setResources([
        {
          id: 'resource-1',
          userId: 'user-1',
          projectId: null,
          scope: 'shared',
          name: 'Alpha Crew',
          type: 'human',
          isActive: true,
          createdAt: '2026-04-01T00:00:00.000Z',
          updatedAt: '2026-04-01T00:00:00.000Z',
          deactivatedAt: null,
        },
        {
          id: 'resource-2',
          userId: 'user-1',
          projectId: 'project-1',
          scope: 'project',
          name: 'Dormant Crew',
          type: 'human',
          isActive: true,
          createdAt: '2026-04-01T00:00:00.000Z',
          updatedAt: '2026-04-01T00:00:00.000Z',
          deactivatedAt: null,
        },
      ]);
      await useProjectStore.getState().setAssignmentError(null);
    });

    await act(async () => {
      assignCommand.onSelect(tasks[0]!);
      await Promise.resolve();
    });

    let alphaCheckbox = getCheckbox(container, 'resource-1');
    let dormantCheckbox = getCheckbox(container, 'resource-2');
    let submitButton = getSubmitButton(container);

    expect(container.querySelector('[data-testid="resource-assignment-modal"]')).not.toBeNull();
    expect(alphaCheckbox).not.toBeNull();
    expect(dormantCheckbox).not.toBeNull();

    await act(async () => {
      dormantCheckbox!.click();
    });

    await act(async () => {
      submitButton!.click();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/tasks/parent-1/assignments/materialize', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ resourceIds: ['resource-2'] }),
    }));
    expect(container.querySelector('[data-testid="assignment-summary"]')?.textContent).toContain('Leaf A: Dormant Crew');
    expect(container.querySelector('[data-testid="assignment-summary"]')?.textContent).toContain('Leaf B: Dormant Crew');

    await act(async () => {
      await useTaskStore.getState().fetchTasks('token', useAuthStore.getState().refreshAccessToken);
    });

    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/project', {
      headers: { Authorization: 'Bearer token' },
    });
    expect(container.querySelector('[data-testid="assignment-summary"]')?.textContent).toContain('Leaf B: Dormant Crew');

    await act(async () => {
      assignCommand.onSelect(tasks[0]!);
      await Promise.resolve();
    });

    alphaCheckbox = getCheckbox(container, 'resource-1');
    dormantCheckbox = getCheckbox(container, 'resource-2');
    submitButton = getSubmitButton(container);

    expect(alphaCheckbox).not.toBeNull();
    expect(dormantCheckbox).toBeNull();
    expect(submitButton?.disabled).toBe(false);
    expect(container.querySelector('[data-testid="assignment-summary"]')?.textContent).toContain('Leaf B: Dormant Crew');

    await unmountWorkspace(root);
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

  it('hydrates authoritative resource and assignment state into the visible workspace summary, including inactive existing assignments', async () => {
    const { container, root } = await renderWorkspace();

    expect(container.textContent).toContain('Leaf B: Dormant Crew');
    expect(container.textContent).toContain('Parent: —');
    expect(container.textContent).not.toContain('Parent: Dormant Crew');

    await unmountWorkspace(root);
  });

  it('opens explicit active-only selection instead of auto-submitting the first active resource', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { container, root } = await renderWorkspace();
    const assignCommand = getAssignCommand();

    await act(async () => {
      assignCommand.onSelect(tasks[0]!);
      await Promise.resolve();
    });

    const modal = container.querySelector('[data-testid="resource-assignment-modal"]');
    const alphaCheckbox = getCheckbox(container, 'resource-1');
    const dormantCheckbox = getCheckbox(container, 'resource-2');
    const submitButton = getSubmitButton(container);

    expect(modal).not.toBeNull();
    expect(modal?.textContent).toContain('Parent');
    expect(alphaCheckbox).not.toBeNull();
    expect(dormantCheckbox).toBeNull();
    expect(submitButton?.disabled).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();

    await unmountWorkspace(root);
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

    const { container, root } = await renderWorkspace();
    const assignCommand = getAssignCommand();

    await act(async () => {
      assignCommand.onSelect(tasks[0]!);
      await Promise.resolve();
    });

    const alphaCheckbox = getCheckbox(container, 'resource-1');
    const submitButton = getSubmitButton(container)!;

    await act(async () => {
      alphaCheckbox!.click();
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
    expect(container.querySelector('[data-testid="resource-assignment-modal"]')).toBeNull();

    await unmountWorkspace(root);
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

    const { container, root } = await renderWorkspace();
    const assignCommand = getAssignCommand();

    await act(async () => {
      assignCommand.onSelect(tasks[3]!);
      await Promise.resolve();
    });

    const alphaCheckbox = getCheckbox(container, 'resource-1');
    const submitButton = getSubmitButton(container)!;

    await act(async () => {
      alphaCheckbox!.click();
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
    expect(container.querySelector('[data-testid="assignment-modal-error"]')?.textContent).toContain('task_has_no_leaf_descendants');
    expect(container.querySelector('[data-testid="resource-assignment-modal"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="assignment-modal-task-name"]')?.textContent).toContain('Solo Parent');

    await unmountWorkspace(root);
  });

  it('disables submit and shows the loading label while an assignment mutation is pending', async () => {
    let resolveFetch: ((value: { ok: boolean; json: () => Promise<{ assignments: [] }> }) => void) | null = null;
    const fetchMock = vi.fn().mockReturnValue(new Promise((resolve) => {
      resolveFetch = resolve;
    }));
    vi.stubGlobal('fetch', fetchMock);

    const { container, root } = await renderWorkspace();
    const assignCommand = getAssignCommand();

    await act(async () => {
      assignCommand.onSelect(tasks[1]!);
      await Promise.resolve();
    });

    await act(async () => {
      getCheckbox(container, 'resource-1')!.click();
    });

    await act(async () => {
      getSubmitButton(container)!.click();
      await Promise.resolve();
    });

    expect(getSubmitButton(container)?.disabled).toBe(true);
    expect(getSubmitButton(container)?.textContent).toContain('Сохраняем назначение');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFetch!({ ok: true, json: async () => ({ assignments: [] }) });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="resource-assignment-modal"]')).toBeNull();

    await unmountWorkspace(root);
  });

  it('submits an empty resourceIds array to unassign a leaf task without losing modal context before success', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ assignments: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { container, root } = await renderWorkspace();
    const assignCommand = getAssignCommand();

    await act(async () => {
      assignCommand.onSelect(tasks[1]!);
      await Promise.resolve();
    });

    const submitButton = getSubmitButton(container)!;

    await act(async () => {
      submitButton.click();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/tasks/leaf-1/assignments', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ resourceIds: [] }),
    }));
    expect(useProjectStore.getState().assignments.some((assignment) => assignment.taskId === 'leaf-1')).toBe(false);
    expect(useProjectStore.getState().assignmentError).toBeNull();
    expect(container.querySelector('[data-testid="resource-assignment-modal"]')).toBeNull();

    await unmountWorkspace(root);
  });

  it('submits a multi-resource leaf replacement payload and stores returned assignments', async () => {
    useProjectStore.setState((state) => ({
      ...state,
      resources: state.resources.map((resource) => resource.id === 'resource-2'
        ? { ...resource, isActive: true, deactivatedAt: null }
        : resource),
    }));
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        assignments: [
          {
            id: 'leaf-1-alpha',
            projectId: 'project-1',
            taskId: 'leaf-1',
            resourceId: 'resource-1',
            createdAt: '2026-04-02T00:00:00.000Z',
          },
          {
            id: 'leaf-1-dormant',
            projectId: 'project-1',
            taskId: 'leaf-1',
            resourceId: 'resource-2',
            createdAt: '2026-04-02T00:00:00.000Z',
          },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { container, root } = await renderWorkspace();
    const assignCommand = getAssignCommand();

    await act(async () => {
      assignCommand.onSelect(tasks[1]!);
      await Promise.resolve();
    });

    await act(async () => {
      getCheckbox(container, 'resource-1')!.click();
      getCheckbox(container, 'resource-2')!.click();
    });

    await act(async () => {
      getSubmitButton(container)!.click();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/tasks/leaf-1/assignments', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ resourceIds: ['resource-1', 'resource-2'] }),
    }));
    expect(useProjectStore.getState().assignments.filter((assignment) => assignment.taskId === 'leaf-1').map((assignment) => assignment.resourceId).sort()).toEqual([
      'resource-1',
      'resource-2',
    ]);
    expect(useProjectStore.getState().assignmentError).toBeNull();
    expect(container.querySelector('[data-testid="resource-assignment-modal"]')).toBeNull();

    await unmountWorkspace(root);
  });

  it('keeps the same task modal open and preserves assignments when a success response is malformed', async () => {
    const beforeAssignments = useProjectStore.getState().assignments;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { container, root } = await renderWorkspace();
    const assignCommand = getAssignCommand();

    await act(async () => {
      assignCommand.onSelect(tasks[1]!);
      await Promise.resolve();
    });

    await act(async () => {
      getCheckbox(container, 'resource-1')!.click();
    });

    await act(async () => {
      getSubmitButton(container)!.click();
      await Promise.resolve();
    });

    expect(useProjectStore.getState().assignmentError).toBe('malformed_assignment_response: Сервер вернул назначения в неизвестном формате.');
    expect(useProjectStore.getState().assignments).toEqual(beforeAssignments);
    expect(container.querySelector('[data-testid="resource-assignment-modal"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="assignment-modal-task-name"]')?.textContent).toContain('Leaf A');
    expect(container.querySelector('[data-testid="assignment-modal-error"]')?.textContent).toContain('malformed_assignment_response');

    await unmountWorkspace(root);
  });

  it('keeps the selected task modal open and exposes a deterministic network failure', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('offline'));
    vi.stubGlobal('fetch', fetchMock);

    const { container, root } = await renderWorkspace();
    const assignCommand = getAssignCommand();

    await act(async () => {
      assignCommand.onSelect(tasks[1]!);
      await Promise.resolve();
    });

    await act(async () => {
      getCheckbox(container, 'resource-1')!.click();
    });

    await act(async () => {
      getSubmitButton(container)!.click();
      await Promise.resolve();
    });

    expect(useProjectStore.getState().assignmentError).toBe('network_failure: Не удалось сохранить назначения ресурсов.');
    expect(container.querySelector('[data-testid="resource-assignment-modal"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="assignment-modal-task-name"]')?.textContent).toContain('Leaf A');
    expect(container.querySelector('[data-testid="assignment-modal-error"]')?.textContent).toContain('network_failure');

    await unmountWorkspace(root);
  });

  it('shows a deterministic local error when no active resources are available', async () => {
    useProjectStore.setState((state) => ({
      ...state,
      resources: state.resources.map((resource) => ({ ...resource, isActive: false, deactivatedAt: resource.deactivatedAt ?? '2026-04-03T00:00:00.000Z' })),
      assignmentError: null,
    }));
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { container, root } = await renderWorkspace();
    const assignCommand = getAssignCommand();

    await act(async () => {
      assignCommand.onSelect(tasks[1]!);
      await Promise.resolve();
    });

    const submitButton = getSubmitButton(container);

    expect(container.querySelector('[data-testid="assignment-modal-no-assignable-resources"]')?.textContent).toContain('Нет активных ресурсов');
    expect(container.querySelector('[data-testid="assignment-modal-resource-options"]')).toBeNull();
    expect(submitButton?.disabled).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();

    await unmountWorkspace(root);
  });
});

