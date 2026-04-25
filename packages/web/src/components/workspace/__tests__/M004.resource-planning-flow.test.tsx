// @vitest-environment jsdom

import React, { useImperativeHandle } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { TaskListColumn } from 'gantt-lib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ResourcePlannerResult } from '../../../lib/apiTypes.ts';
import type { Task, ValidationResult } from '../../../types.ts';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const scrollToRowSpy = vi.fn();
let ganttPropsSpy: Record<string, unknown> | null = null;
const ganttPropsHistory: Array<Record<string, unknown>> = [];
const resourcePlannerChartSpy = vi.fn();

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
      resourcePlannerChartSpy(props);
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

vi.mock('../../layout/Toolbar.tsx', () => ({
  Toolbar: () => <div data-testid="toolbar-props">toolbar</div>,
}));

vi.mock('../../GanttChart.tsx', () => ({
  GanttChart: React.forwardRef((_props: Record<string, unknown>, ref) => {
    ganttPropsSpy = _props;
    ganttPropsHistory.push(_props);
    useImperativeHandle(ref, () => ({ scrollToRow: scrollToRowSpy }));
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
import { ResourcePlannerWorkspace } from '../ResourcePlannerWorkspace.tsx';
import { useAuthStore } from '../../../stores/useAuthStore.ts';
import { useHistoryViewerStore } from '../../../stores/useHistoryViewerStore.ts';
import { useProjectStore } from '../../../stores/useProjectStore.ts';
import { useProjectUIStore } from '../../../stores/useProjectUIStore.ts';
import { useUIStore, type PlannerCorrectionTarget } from '../../../stores/useUIStore.ts';

const fixture = {
  projectId: 'project-m004',
  projectName: 'M004 Buildout',
  taskId: 'task-m004-install',
  taskName: 'Install shared crane',
  resourceId: 'resource-m004-crane',
  resourceName: 'Shared Crane Crew',
  assignmentId: 'assignment-m004-crane-install',
  peerAssignmentId: 'assignment-m004-peer',
  workspaceUserId: 'user-m004',
} as const;

const tasks: Task[] = [
  {
    id: fixture.taskId,
    name: fixture.taskName,
    startDate: '2026-04-01',
    endDate: '2026-04-03',
    dependencies: [],
  },
  {
    id: 'task-m004-peer',
    name: 'Parallel crane booking',
    startDate: '2026-04-02',
    endDate: '2026-04-04',
    dependencies: [],
  },
];

const plannerPayload: ResourcePlannerResult = {
  projectId: fixture.projectId,
  scope: 'all-projects',
  workspaceUserId: fixture.workspaceUserId,
  resources: [
    {
      resourceId: fixture.resourceId,
      resourceName: fixture.resourceName,
      hasConflicts: true,
      conflictCount: 1,
      intervals: [
        {
          assignmentId: fixture.assignmentId,
          resourceId: fixture.resourceId,
          resourceName: fixture.resourceName,
          projectId: fixture.projectId,
          projectName: fixture.projectName,
          taskId: fixture.taskId,
          taskName: fixture.taskName,
          startDate: '2026-04-01',
          endDate: '2026-04-03',
          assignmentCreatedAt: '2026-04-01T00:00:00.000Z',
          hasConflict: true,
          conflictCount: 1,
          conflictAssignmentIds: [fixture.peerAssignmentId],
        },
      ],
    },
  ],
};

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

function resetStores(): void {
  useAuthStore.setState({
    isAuthenticated: true,
    user: { id: fixture.workspaceUserId, email: 'm004@example.com' },
    project: {
      id: fixture.projectId,
      name: fixture.projectName,
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
        id: fixture.projectId,
        name: fixture.projectName,
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
        id: fixture.resourceId,
        userId: fixture.workspaceUserId,
        projectId: null,
        scope: 'shared',
        name: fixture.resourceName,
        type: 'human',
        isActive: true,
        createdAt: '2026-04-01T00:00:00.000Z',
        updatedAt: '2026-04-01T00:00:00.000Z',
        deactivatedAt: null,
      },
    ],
    assignments: [
      {
        id: fixture.assignmentId,
        projectId: fixture.projectId,
        taskId: fixture.taskId,
        resourceId: fixture.resourceId,
        createdAt: '2026-04-01T00:00:00.000Z',
      },
    ],
    assignmentError: null,
    pending: [],
    dragPreview: undefined,
    scheduleOptions: useProjectStore.getState().scheduleOptions,
  });

  useUIStore.setState({
    workspace: { kind: 'project', projectId: fixture.projectId, chatOpen: false },
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
}

async function renderProjectWorkspace(): Promise<{ container: HTMLDivElement; root: Root }> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      <ProjectWorkspace
        accessToken="token"
        displayConnected={true}
        ganttDayMode="calendar"
        ganttRef={{ current: null }}
        hasShareToken={false}
        isAuthenticated={true}
        loading={false}
        onCollapseAll={() => {}}
        onExpandAll={() => {}}
        onLoginRequired={() => {}}
        onScrollToToday={() => {}}
        onSend={async () => ({ accepted: true })}
        onValidation={(_result: ValidationResult) => {}}
        readOnly={false}
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

async function renderPlannerWorkspace(onCorrectConflict: (target: PlannerCorrectionTarget) => void): Promise<{ container: HTMLDivElement; root: Root }> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      <ResourcePlannerWorkspace
        accessToken="token"
        projectId={fixture.projectId}
        onBackToProject={() => {}}
        onCorrectConflict={onCorrectConflict}
      />,
    );
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });

  return { container, root };
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

async function unmount(root: Root): Promise<void> {
  await act(async () => {
    root.unmount();
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.unstubAllGlobals();
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/resources/planner')) {
      return { ok: true, json: async () => plannerPayload } as Response;
    }
    if (url.startsWith('/api/resources')) {
      return { ok: true, json: async () => ({ resources: useProjectStore.getState().resources }) } as Response;
    }
    return { ok: true, json: async () => ({}) } as Response;
  }));
  scrollToRowSpy.mockClear();
  resourcePlannerChartSpy.mockClear();
  ganttPropsSpy = null;
  ganttPropsHistory.length = 0;
  resetStores();
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('M004 integrated resource-planning loop', () => {
  it('preserves assignment identity from Gantt correction entry through planner conflict action and source-task focus', async () => {
    const project = await renderProjectWorkspace();
    const assignedColumn = getAssignedResourcesColumn();
    const assignedCell = renderColumnCell(assignedColumn, tasks[0]!);

    expect(assignedCell.cellContainer.querySelector(`[data-testid="assigned-resources-cell-${fixture.taskId}"]`)?.getAttribute('data-assigned-resource-count')).toBe('1');
    expect(assignedCell.cellContainer.querySelector(`[data-testid="assigned-resources-active-${fixture.taskId}-${fixture.resourceId}"]`)?.textContent).toContain(fixture.resourceName);

    await act(async () => {
      (assignedCell.cellContainer.querySelector(`[data-testid="assigned-resources-edit-${fixture.taskId}"]`) as HTMLButtonElement).click();
      await Promise.resolve();
    });

    expect(project.container.querySelector('[data-testid="resource-assignment-modal"]')).not.toBeNull();
    expect(project.container.querySelector('[data-testid="assignment-modal-task-name"]')?.textContent).toContain(fixture.taskName);
    expect(project.container.querySelector(`[data-testid="assignment-resource-checkbox-${fixture.resourceId}"]`)).not.toBeNull();
    expect(fetch).not.toHaveBeenCalledWith(expect.stringContaining(`/api/tasks/${fixture.taskId}/assignments`), expect.anything());

    const emittedTargets: PlannerCorrectionTarget[] = [];
    const planner = await renderPlannerWorkspace((target) => {
      emittedTargets.push(target);
      useUIStore.getState().setPlannerCorrectionTarget(target);
    });

    expect(planner.container.querySelector('[data-testid="planner-data-state"]')).not.toBeNull();
    expect(planner.container.querySelector('[data-testid="planner-resource-count"]')?.textContent).toBe('1');
    expect(planner.container.querySelector('[data-testid="planner-conflict-resource-count"]')?.textContent).toBe('1');
    expect(planner.container.querySelector('[data-testid="planner-conflict-interval-count"]')?.textContent).toBe('1');
    expect(planner.container.querySelector('[data-testid="gantt-lib-resource-planner"]')).not.toBeNull();
    expect(planner.container.querySelector(`[data-testid="gantt-resource-row-${fixture.resourceId}"]`)?.textContent).toContain(fixture.resourceName);
    expect(planner.container.querySelector(`[data-testid="gantt-resource-item-${fixture.assignmentId}"]`)?.textContent).toContain(fixture.taskName);
    expect(planner.container.querySelector(`[data-testid="gantt-resource-item-${fixture.assignmentId}"]`)?.textContent).toContain(fixture.projectName);
    expect(planner.container.querySelector(`[data-testid="gantt-resource-item-${fixture.assignmentId}"]`)?.textContent).not.toContain('Конфликт');
    expect(planner.container.querySelector(`[data-testid="gantt-resource-item-${fixture.assignmentId}"]`)?.textContent).not.toContain(fixture.peerAssignmentId);
    expect(resourcePlannerChartSpy).toHaveBeenLastCalledWith(expect.objectContaining({
      mode: 'resource-planner',
      resources: [expect.objectContaining({
        id: fixture.resourceId,
        items: [expect.objectContaining({ id: fixture.assignmentId })],
      })],
    }));

    await act(async () => {
      (planner.container.querySelector(`[data-testid="resource-planner-open-${fixture.assignmentId}"]`) as HTMLButtonElement).click();
      await Promise.resolve();
    });

    await act(async () => {
      (planner.container.querySelector('[data-testid="assignment-details-correct"]') as HTMLButtonElement).click();
      await Promise.resolve();
    });

    const expectedTarget = {
      projectId: fixture.projectId,
      taskId: fixture.taskId,
      assignmentId: fixture.assignmentId,
      resourceId: fixture.resourceId,
    };
    expect(emittedTargets).toEqual([expectedTarget]);
    expect(useUIStore.getState().plannerCorrectionTarget).toEqual(expectedTarget);

    await act(async () => {
      project.root.render(
        <ProjectWorkspace
          accessToken="token"
          displayConnected={true}
          ganttDayMode="calendar"
          ganttRef={{ current: null }}
          hasShareToken={false}
          isAuthenticated={true}
          loading={false}
          onCollapseAll={() => {}}
          onExpandAll={() => {}}
          onLoginRequired={() => {}}
          onScrollToToday={() => {}}
          onSend={async () => ({ accepted: true })}
          onValidation={(_result: ValidationResult) => {}}
          readOnly={false}
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

    expect(scrollToRowSpy).toHaveBeenCalledWith(fixture.taskId);
    expect(useUIStore.getState().plannerCorrectionTarget).toBeNull();
    expect(useUIStore.getState().tempHighlightedTaskId).toBe(fixture.taskId);
    const highlightedTaskIds = (ganttPropsSpy?.highlightedTaskIds as Set<string> | undefined) ?? new Set<string>();
    expect(highlightedTaskIds.has(fixture.taskId)).toBe(true);

    act(() => {
      assignedCell.cellRoot.unmount();
    });
    await unmount(planner.root);
    await unmount(project.root);
  });
});
