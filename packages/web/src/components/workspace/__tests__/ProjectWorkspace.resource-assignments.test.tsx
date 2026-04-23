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

beforeEach(() => {
  toolbarSpy.mockClear();
  ganttPropsSpy = null;
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
    ],
    assignments: [
      {
        id: 'existing-leaf-2',
        projectId: 'project-1',
        taskId: 'leaf-2',
        resourceId: 'resource-1',
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
  it('hydrates authoritative resource and assignment state into the visible workspace summary', () => {
    const { container, root } = renderWorkspace();

    expect(container.textContent).toContain('Leaf B: Alpha Crew');
    expect(container.textContent).toContain('Parent: —');
    expect(container.textContent).not.toContain('Parent: Alpha Crew');

    root.unmount();
  });

  it('wires a parent assignment command through the materialize route and stores only descendant leaf assignments', async () => {
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

    const { root } = renderWorkspace();
    const commands = (ganttPropsSpy?.taskListMenuCommands as Array<{ id: string; onSelect: (task: Task) => void }> | undefined) ?? [];
    const assignCommand = commands.find((command) => command.id === 'assign-resource');

    expect(assignCommand).toBeTruthy();

    await act(async () => {
      assignCommand!.onSelect(tasks[0]!);
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/tasks/parent-1/assignments/materialize', expect.objectContaining({ method: 'POST' }));
    const state = useProjectStore.getState();
    expect(state.assignments.map((assignment) => assignment.taskId).sort()).toEqual(['leaf-1', 'leaf-2']);
    expect(state.assignments.some((assignment) => assignment.taskId === 'parent-1')).toBe(false);
    expect(state.assignmentError).toBeNull();

    root.unmount();
  });

  it('surfaces the no-leaf validation error deterministically to the user', async () => {
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

    expect(fetchMock).toHaveBeenCalledWith('/api/tasks/solo-parent/assignments', expect.objectContaining({ method: 'POST' }));
    expect(useProjectStore.getState().assignmentError).toBe('task_has_no_leaf_descendants: Task solo-parent has no descendant leaf tasks');
    expect(container.querySelector('[data-testid="assignment-error-banner"]')?.textContent).toContain('task_has_no_leaf_descendants');

    root.unmount();
  });
});
