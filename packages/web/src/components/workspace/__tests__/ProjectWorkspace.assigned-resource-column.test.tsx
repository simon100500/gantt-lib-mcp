// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TaskListColumn } from 'gantt-lib';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let ganttPropsSpy: Record<string, unknown> | null = null;

vi.mock('../../layout/Toolbar.tsx', () => ({
  Toolbar: () => <div data-testid="toolbar-props">toolbar</div>,
}));

vi.mock('../../GanttChart.tsx', () => ({
  GanttChart: React.forwardRef((_props: Record<string, unknown>, _ref) => {
    ganttPropsSpy = _props;
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
];

async function renderWorkspace({ readOnly = false }: { readOnly?: boolean } = {}): Promise<{ container: HTMLDivElement; root: Root }> {
  const container = document.createElement('div');
  document.body.appendChild(container);

  const root = createRoot(container);
  await act(async () => {
    root.render(
      <ProjectWorkspace
        accessToken="token"
        displayConnected={true}
        ganttDayMode="calendar"
        ganttRef={ganttRef}
        hasShareToken={false}
        isAuthenticated={true}
        loading={false}
        onCollapseAll={() => {}}
        onExpandAll={() => {}}
        onLoginRequired={() => {}}
        onScrollToToday={() => {}}
        onSend={async () => ({ accepted: true })}
        onValidation={(_result: ValidationResult) => {}}
        readOnly={readOnly}
        setTasks={() => {}}
        shareStatus="idle"
        shareToken={null}
        sharedProject={null}
        showChat={true}
        tasks={tasks}
      />,
    );
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

function getAssignedResourcesColumn(): TaskListColumn<Task> {
  const columns = (ganttPropsSpy?.additionalColumns as TaskListColumn<Task>[] | undefined) ?? [];
  const assignedResourcesColumn = columns.find((column) => column.id === 'assigned-resources');

  expect(columns.length).toBeGreaterThan(0);
  expect(assignedResourcesColumn).toBeTruthy();

  return assignedResourcesColumn!;
}

function renderColumnCell(column: TaskListColumn<Task>, task: Task): { cellContainer: HTMLDivElement; cellRoot: Root } {
  const cellContainer = document.createElement('div');
  document.body.appendChild(cellContainer);
  const cellRoot = createRoot(cellContainer);

  act(() => {
    cellRoot.render(<>{column.renderCell({
      task,
      rowIndex: 0,
      isEditing: false,
      openEditor: vi.fn(),
      closeEditor: vi.fn(),
      updateTask: vi.fn(),
    })}</>);
  });

  return { cellContainer, cellRoot };
}

beforeEach(() => {
  ganttPropsSpy = null;
  vi.unstubAllGlobals();
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
        id: 'existing-leaf-1',
        projectId: 'project-1',
        taskId: 'leaf-1',
        resourceId: 'resource-1',
        createdAt: '2026-04-01T00:00:00.000Z',
      },
      {
        id: 'inactive-leaf-1',
        projectId: 'project-1',
        taskId: 'leaf-1',
        resourceId: 'resource-2',
        createdAt: '2026-04-01T00:00:00.000Z',
      },
      {
        id: 'stale-leaf-1',
        projectId: 'project-1',
        taskId: 'leaf-1',
        resourceId: 'resource-missing',
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

describe('ProjectWorkspace assigned-resources Gantt column', () => {
  it('passes a non-empty assigned-resources additional column into GanttChart with the supported placement metadata', async () => {
    const { root } = await renderWorkspace();
    const column = getAssignedResourcesColumn();

    expect(column.header).toBe('Ресурсы');
    expect(column.width).toBeLessThan(180);
    expect('after' in column ? column.after : undefined).toBe('progress');
    expect(ganttPropsSpy?.taskListWidth).toBeGreaterThanOrEqual(650);

    await unmountWorkspace(root);
  });

  it('renders assigned, inactive, stale, and empty task states from ProjectWorkspace store inputs', async () => {
    const { root } = await renderWorkspace();
    const column = getAssignedResourcesColumn();

    const assignedCell = renderColumnCell(column, tasks[1]!);
    expect(assignedCell.cellContainer.querySelector('[data-testid="assigned-resources-cell-leaf-1"]')?.getAttribute('data-assigned-resource-count')).toBe('3');
    expect(assignedCell.cellContainer.querySelector('[data-testid="assigned-resources-active-leaf-1-resource-1"]')?.textContent).toContain('Alpha Crew');
    expect(assignedCell.cellContainer.querySelector('[data-testid="assigned-resources-inactive-leaf-1-resource-2"]')?.textContent).toContain('Dormant Crew');
    expect(assignedCell.cellContainer.querySelector('[data-testid="assigned-resources-unknown-leaf-1-resource-missing"]')?.textContent).toContain('Неизвестный ресурс');

    const emptyCell = renderColumnCell(column, tasks[2]!);
    expect(emptyCell.cellContainer.querySelector('[data-testid="assigned-resources-cell-leaf-2"]')?.getAttribute('data-assigned-resource-count')).toBe('0');
    expect(emptyCell.cellContainer.querySelector('[data-testid="assigned-resources-empty-leaf-2"]')).toBeNull();
    expect(emptyCell.cellContainer.textContent).not.toContain('Ресурсы не назначены');

    act(() => {
      assignedCell.cellRoot.unmount();
      emptyCell.cellRoot.unmount();
    });
    await unmountWorkspace(root);
  });

  it('opens the existing ResourceAssignmentModal for the clicked task when the column correction action is used', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { container, root } = await renderWorkspace();
    const column = getAssignedResourcesColumn();
    const { cellContainer, cellRoot } = renderColumnCell(column, tasks[1]!);

    await act(async () => {
      (cellContainer.querySelector('[data-testid="assigned-resources-edit-leaf-1"]') as HTMLButtonElement).click();
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="resource-assignment-modal"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="assignment-modal-task-name"]')?.textContent).toContain('Leaf A');
    expect(container.querySelector('[data-testid="assignment-resource-checkbox-resource-1"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="assignment-resource-checkbox-resource-2"]')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();

    act(() => {
      cellRoot.unmount();
    });
    await unmountWorkspace(root);
  });

  it('keeps read-only workspaces display-only by omitting the column correction action', async () => {
    const { root } = await renderWorkspace({ readOnly: true });
    const column = getAssignedResourcesColumn();
    const { cellContainer, cellRoot } = renderColumnCell(column, tasks[1]!);

    expect(cellContainer.querySelector('[data-testid="assigned-resources-active-leaf-1-resource-1"]')?.textContent).toContain('Alpha Crew');
    expect(cellContainer.querySelector('[data-testid="assigned-resources-edit-leaf-1"]')).toBeNull();

    act(() => {
      cellRoot.unmount();
    });
    await unmountWorkspace(root);
  });
});
