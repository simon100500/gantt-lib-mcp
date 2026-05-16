// @vitest-environment jsdom

import React, { useImperativeHandle } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const scrollToRowSpy = vi.fn();
const scrollToTaskSpy = vi.fn();
let exposeGanttRef = true;
let ganttPropsSpy: Record<string, unknown> | null = null;
const ganttPropsHistory: Array<Record<string, unknown>> = [];

vi.mock('../../layout/Toolbar.tsx', () => ({
  Toolbar: () => <div data-testid="toolbar-props">toolbar</div>,
}));

vi.mock('../../GanttChart.tsx', () => ({
  GanttChart: React.forwardRef((_props: Record<string, unknown>, ref) => {
    ganttPropsSpy = _props;
    ganttPropsHistory.push(_props);
    useImperativeHandle(ref, () => exposeGanttRef ? { scrollToRow: scrollToRowSpy, scrollToTask: scrollToTaskSpy } : null);
    return (
      <div data-testid="gantt-chart">
        <div className="gantt-scrollContainer">chart</div>
      </div>
    );
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

const tasks: Task[] = [
  { id: 'task-1', name: 'Spec', startDate: '2026-04-01', endDate: '2026-04-02', dependencies: [] },
  { id: 'task-2', name: 'Build', startDate: '2026-04-02', endDate: '2026-04-03', dependencies: [] },
];

function createGanttRef() {
  return { current: null };
}

interface RenderWorkspaceOptions {
  ganttRef?: { current: unknown };
  projectId?: string;
  tasksOverride?: Task[];
  ganttDayMode?: 'business' | 'calendar';
  readOnly?: boolean;
  setTasks?: (tasks: Task[] | ((prev: Task[]) => Task[])) => void;
}

async function renderWorkspace({
  ganttRef = createGanttRef(),
  projectId = 'project-1',
  tasksOverride = tasks,
  ganttDayMode = 'calendar',
  readOnly = false,
  setTasks = () => {},
}: RenderWorkspaceOptions = {}): Promise<{ container: HTMLDivElement; root: Root }> {
  const container = document.createElement('div');
  document.body.appendChild(container);

  const root = createRoot(container);
  await act(async () => {
    root.render(
        <ProjectWorkspace
          accessToken="token"
          displayConnected={true}
          ganttDayMode={ganttDayMode}
          ganttRef={ganttRef as never}
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
          setTasks={setTasks}
          shareStatus="idle"
          shareToken={null}
          sharedProject={null}
          showChat={true}
          tasks={tasksOverride}
      />,
    );
    await Promise.resolve();
  });

  expect(useUIStore.getState().workspace).toEqual({ kind: 'project', projectId, chatOpen: false });
  return { container, root };
}

async function rerenderWorkspace(root: Root, {
  ganttRef = createGanttRef(),
  ganttDayMode = 'calendar',
  readOnly = false,
  setTasks = () => {},
}: Omit<RenderWorkspaceOptions, 'projectId'> = {}): Promise<void> {
  await act(async () => {
    root.render(
      <ProjectWorkspace
        accessToken="token"
        displayConnected={true}
        ganttDayMode={ganttDayMode}
        ganttRef={ganttRef as never}
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
        setTasks={setTasks}
        shareStatus="idle"
        shareToken={null}
        sharedProject={null}
        showChat={true}
        tasks={tasks}
      />,
    );
    await Promise.resolve();
  });
}

async function unmountWorkspace(root: Root): Promise<void> {
  await act(async () => {
    root.unmount();
    await Promise.resolve();
  });
}

function latestHighlightedTaskIds(): Set<string> {
  return (ganttPropsSpy?.highlightedTaskIds as Set<string> | undefined) ?? new Set<string>();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.unstubAllGlobals();
  exposeGanttRef = true;
  scrollToRowSpy.mockClear();
  scrollToTaskSpy.mockClear();
  ganttPropsSpy = null;
  ganttPropsHistory.length = 0;

  useProjectStore.setState({
    confirmed: { version: 1, snapshot: { tasks, dependencies: [] } },
    resources: [],
    assignments: [],
    assignmentError: null,
    pending: [],
    dragPreview: undefined,
    scheduleOptions: useProjectStore.getState().scheduleOptions,
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
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('ProjectWorkspace planner correction focus', () => {
  it('consumes a same-project planner correction once, scrolls the source task, and clears the temporary highlight', async () => {
    useUIStore.getState().setPlannerCorrectionTarget({
      projectId: 'project-1',
      taskId: 'task-2',
      assignmentId: 'assignment-1',
      resourceId: 'resource-1',
    });

    const { root } = await renderWorkspace();
    await act(async () => {
      vi.runOnlyPendingTimers();
      await Promise.resolve();
    });

    expect(scrollToTaskSpy).toHaveBeenCalledWith('task-2');
    expect(useUIStore.getState().plannerCorrectionTarget).toBeNull();
    expect(scrollToRowSpy).toHaveBeenCalledWith('task-2', { behavior: 'auto' });
    expect(useUIStore.getState().tempHighlightedTaskId).toBeNull();
    expect(latestHighlightedTaskIds().has('task-2')).toBe(false);

    await rerenderWorkspace(root);

    const scrollToTaskCallCount = scrollToTaskSpy.mock.calls.length;
    await rerenderWorkspace(root);
    expect(scrollToTaskSpy).toHaveBeenCalledTimes(scrollToTaskCallCount);

    await unmountWorkspace(root);
  });

  it('opens only the target task ancestor chain before scrolling from planner correction', async () => {
    const nestedTasks: Task[] = [
      { id: 'phase-1', name: 'Phase 1', startDate: '2026-04-01', endDate: '2026-04-10', dependencies: [] },
      { id: 'task-1', parentId: 'phase-1', name: 'Spec', startDate: '2026-04-01', endDate: '2026-04-02', dependencies: [] },
      { id: 'phase-2', name: 'Phase 2', startDate: '2026-04-11', endDate: '2026-04-20', dependencies: [] },
      { id: 'task-2', parentId: 'phase-2', name: 'Build', startDate: '2026-04-12', endDate: '2026-04-13', dependencies: [] },
    ];
    useProjectUIStore.getState().setProjectState('project-1', {
      collapsedParentIds: ['phase-1', 'phase-2'],
    });
    useUIStore.getState().setPlannerCorrectionTarget({
      projectId: 'project-1',
      taskId: 'task-2',
      assignmentId: 'assignment-1',
      resourceId: 'resource-1',
    });

    const { root } = await renderWorkspace({ tasksOverride: nestedTasks });
    await act(async () => {
      vi.runOnlyPendingTimers();
      await Promise.resolve();
    });

    expect(useProjectUIStore.getState().getProjectState('project-1')?.collapsedParentIds).toEqual(['phase-1']);
    expect(scrollToRowSpy).toHaveBeenCalledWith('task-2', { behavior: 'auto' });

    await unmountWorkspace(root);
  });

  it('preserves a wrong-project planner correction target for App-level project switching', async () => {
    const target = {
      projectId: 'project-2',
      taskId: 'foreign-task',
      assignmentId: 'assignment-2',
      resourceId: 'resource-1',
    };
    useUIStore.getState().setPlannerCorrectionTarget(target);

    const { root } = await renderWorkspace();

    expect(scrollToTaskSpy).not.toHaveBeenCalled();
    expect(useUIStore.getState().plannerCorrectionTarget).toEqual(target);
    expect(useUIStore.getState().tempHighlightedTaskId).toBeNull();
    expect(latestHighlightedTaskIds().size).toBe(0);

    await unmountWorkspace(root);
  });

  it('ignores an empty planner correction target without scrolling', async () => {
    const { root } = await renderWorkspace();

    expect(scrollToTaskSpy).not.toHaveBeenCalled();
    expect(useUIStore.getState().plannerCorrectionTarget).toBeNull();
    expect(useUIStore.getState().tempHighlightedTaskId).toBeNull();
    expect(latestHighlightedTaskIds().size).toBe(0);

    await unmountWorkspace(root);
  });

  it('does not crash or consume the target when the Gantt ref is absent on the first render', async () => {
    const target = {
      projectId: 'project-1',
      taskId: 'task-1',
      assignmentId: 'assignment-1',
      resourceId: 'resource-1',
    };
    useUIStore.getState().setPlannerCorrectionTarget(target);

    exposeGanttRef = false;

    const { root } = await renderWorkspace();

    expect(scrollToTaskSpy).not.toHaveBeenCalled();
    expect(useUIStore.getState().plannerCorrectionTarget).toBeNull();
    expect(scrollToRowSpy).not.toHaveBeenCalled();
    expect(useUIStore.getState().tempHighlightedTaskId).toBe('task-1');
    expect(latestHighlightedTaskIds().has('task-1')).toBe(true);

    await unmountWorkspace(root);
  });

  it('persists gantt scroll position and restores it on the next mount', async () => {
    const firstRender = await renderWorkspace();
    const firstScrollContainer = firstRender.container.querySelector('.gantt-scrollContainer') as HTMLDivElement | null;

    expect(firstScrollContainer).not.toBeNull();

    firstScrollContainer!.scrollLeft = 240;
    firstScrollContainer!.scrollTop = 96;
    firstScrollContainer!.dispatchEvent(new Event('scroll'));
    await act(async () => {
      vi.advanceTimersByTime(160);
      await Promise.resolve();
    });

    expect(useProjectUIStore.getState().getProjectState('project-1')?.ganttScrollLeft).toBe(240);
    expect(useProjectUIStore.getState().getProjectState('project-1')?.ganttScrollTop).toBe(96);

    await unmountWorkspace(firstRender.root);

    const secondRender = await renderWorkspace();
    const secondScrollContainer = secondRender.container.querySelector('.gantt-scrollContainer') as HTMLDivElement | null;

    expect(secondScrollContainer).not.toBeNull();
    expect(secondScrollContainer!.scrollLeft).toBe(240);
    expect(secondScrollContainer!.scrollTop).toBe(96);

    await unmountWorkspace(secondRender.root);
  });

  it('does not reflow shared read-only tasks when the loaded share mode switches to business', async () => {
    const setTasks = vi.fn();
    const { root } = await renderWorkspace({ ganttDayMode: 'calendar', readOnly: true, setTasks });

    await rerenderWorkspace(root, { ganttDayMode: 'business', readOnly: true, setTasks });

    expect(setTasks).not.toHaveBeenCalled();

    await unmountWorkspace(root);
  });
});
