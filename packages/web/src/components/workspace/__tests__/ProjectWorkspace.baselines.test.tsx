// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const toolbarSpy = vi.fn();
const refreshBaselinesSpy = vi.fn().mockResolvedValue(undefined);
const fetchBaselineSpy = vi.fn();
const createFromCurrentSpy = vi.fn();
const createFromHistorySpy = vi.fn();
const deleteBaselineSpy = vi.fn();
const showVersionByIdSpy = vi.fn();
const restoreVersionSpy = vi.fn();
const returnToCurrentVersionSpy = vi.fn();
let historyItemsMock: HistoryItem[] = [];
let baselinesHookState = {
  loading: false,
  error: null as string | null,
  creatingFromCurrent: false,
  creatingFromHistoryGroupId: null as string | null,
  deletingBaselineId: null as string | null,
};

vi.mock('../../layout/Toolbar.tsx', () => ({
  Toolbar: (props: Record<string, unknown>) => {
    toolbarSpy(props);
    return (
      <div data-testid="toolbar-props">
        <button type="button" data-testid="create-baseline" onClick={() => void (props.onCreateBaselineFromCurrent as (() => void) | undefined)?.()}>
          create baseline
        </button>
        <button type="button" data-testid="select-baseline" onClick={() => void (props.onSelectBaseline as ((id: string) => void) | undefined)?.('baseline-1')}>
          select baseline
        </button>
        <button type="button" data-testid="hide-baseline" onClick={() => void (props.onHideBaseline as (() => void) | undefined)?.()}>
          hide baseline
        </button>
        <button type="button" data-testid="delete-baseline" onClick={() => void (props.onDeleteBaseline as ((id: string) => void) | undefined)?.('baseline-1')}>
          delete baseline
        </button>
        <button type="button" data-testid="refresh-baselines" onClick={() => void (props.onRefreshBaselines as (() => void) | undefined)?.()}>
          refresh baselines
        </button>
      </div>
    );
  },
}));

vi.mock('../../GanttChart.tsx', () => ({
  GanttChart: (props: Record<string, unknown>) => <div data-testid="gantt-chart">{JSON.stringify(props)}</div>,
}));

vi.mock('../../ChatSidebar.tsx', () => ({
  ChatSidebar: () => <div data-testid="chat-sidebar">chat</div>,
}));

const historyPanelSpy = vi.fn();

vi.mock('../../HistoryPanel.tsx', () => ({
  HistoryPanel: (props: Record<string, unknown>) => {
    historyPanelSpy(props);
    return <div data-testid="history-panel">history</div>;
  },
}));

vi.mock('../../SplitTaskModal.tsx', () => ({
  SplitTaskModal: () => null,
}));

vi.mock('../../TaskChatModal.tsx', () => ({
  TaskChatModal: () => null,
}));

vi.mock('../../../hooks/useProjectHistory.ts', () => ({
  useProjectHistory: () => ({
    items: historyItemsMock,
    loading: false,
    error: null,
    previewingGroupId: null,
    restoringGroupId: null,
    showVersion: vi.fn(),
    showVersionById: showVersionByIdSpy,
    refreshHistory: vi.fn(),
    refreshHistorySilently: vi.fn(),
    restoreVersion: restoreVersionSpy,
    returnToCurrentVersion: returnToCurrentVersionSpy,
  }),
}));

vi.mock('../../../hooks/useProjectBaselines.ts', () => ({
  useProjectBaselines: () => ({
    items: [
      {
        id: 'baseline-1',
        projectId: 'project-1',
        name: 'Baseline alpha',
        source: 'current',
        sourceHistoryGroupId: null,
        createdAt: '2026-04-22T00:00:00.000Z',
      },
    ],
    loading: baselinesHookState.loading,
    error: baselinesHookState.error,
    creatingFromCurrent: baselinesHookState.creatingFromCurrent,
    creatingFromHistoryGroupId: baselinesHookState.creatingFromHistoryGroupId,
    deletingBaselineId: baselinesHookState.deletingBaselineId,
    refreshBaselines: refreshBaselinesSpy,
    fetchBaseline: fetchBaselineSpy,
    createFromCurrent: createFromCurrentSpy,
    createFromHistory: createFromHistorySpy,
    deleteBaseline: deleteBaselineSpy,
  }),
}));

import { ProjectWorkspace } from '../ProjectWorkspace.tsx';
import { useProjectUIStore } from '../../../stores/useProjectUIStore.ts';
import { useUIStore } from '../../../stores/useUIStore.ts';
import { useHistoryViewerStore } from '../../../stores/useHistoryViewerStore.ts';
import { buildDefaultBaselineName } from '../../../lib/baselineNaming.ts';
import type { HistoryItem } from '../../../lib/apiTypes.ts';
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
  { id: 'task-1', name: 'Task 1', startDate: '2026-04-01', endDate: '2026-04-02', dependencies: [] },
];

function lastCallArg<T>(mock: { mock: { calls: T[][] } }): T | undefined {
  const calls = mock.mock.calls;
  return calls.length > 0 ? calls[calls.length - 1]?.[0] : undefined;
}

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
        showChat={false}
        shareStatus="idle"
        ganttDayMode="calendar"
      />,
    );
  });

  return { container, root };
}

beforeEach(() => {
  toolbarSpy.mockClear();
  refreshBaselinesSpy.mockClear();
  fetchBaselineSpy.mockReset();
  createFromCurrentSpy.mockReset();
  createFromHistorySpy.mockReset();
  deleteBaselineSpy.mockReset();
  historyPanelSpy.mockClear();
  baselinesHookState = {
    loading: false,
    error: null,
    creatingFromCurrent: false,
    creatingFromHistoryGroupId: null,
    deletingBaselineId: null,
  };
  fetchBaselineSpy.mockResolvedValue({
    id: 'baseline-1',
    projectId: 'project-1',
    name: 'Baseline alpha',
    source: 'current',
    sourceHistoryGroupId: null,
    createdAt: '2026-04-22T00:00:00.000Z',
    snapshot: {
      tasks: [
        { id: 'task-1', name: 'Baseline task', startDate: '2026-03-01', endDate: '2026-03-02', dependencies: [] },
      ],
      dependencies: [],
    },
  });
  createFromCurrentSpy.mockResolvedValue({
    id: 'baseline-created',
    projectId: 'project-1',
    name: 'Базовый 23.04.2026 03:41',
    source: 'current',
    sourceHistoryGroupId: null,
    createdAt: '2026-04-23T00:41:00.000Z',
    snapshot: {
      tasks: [
        { id: 'created-task', name: 'Created baseline task', startDate: '2026-04-03', endDate: '2026-04-04', dependencies: [] },
      ],
      dependencies: [],
    },
  });
  deleteBaselineSpy.mockResolvedValue({ id: 'baseline-1' });
  historyItemsMock = [];
  useUIStore.setState({
    workspace: { kind: 'project', projectId: 'project-1', chatOpen: false },
    viewMode: 'day',
    showTaskList: true,
    showChart: true,
    autoSchedule: true,
    highlightExpiredTasks: false,
    disableTaskDrag: false,
    showHistoryPanel: false,
    historyRefreshRevision: 0,
    aiMutationLock: { active: false, stage: 'thinking', message: null },
    filterWithoutDeps: false,
    filterExpired: false,
    filterSearchText: '',
    filterDateFrom: '',
    filterDateTo: '',
    filterMode: 'highlight',
    searchResults: [],
    tempHighlightedTaskId: null,
    savingState: 'idle',
  });
  useProjectUIStore.setState({ projectStates: {} });
  useHistoryViewerStore.setState({ historyViewer: { mode: 'inactive' } });
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('ProjectWorkspace baseline wiring', () => {
  it('loads baselines on mount and passes toolbar presentation props', async () => {
    const { root } = renderWorkspace();

    expect(refreshBaselinesSpy).toHaveBeenCalledTimes(1);
    const latestProps = lastCallArg<Record<string, unknown>>(toolbarSpy)!;
    expect(latestProps.baselineRows).toEqual([
      { id: 'baseline-1', label: 'Baseline alpha', selected: false },
    ]);
    expect(latestProps.baselineActiveLabel).toBeNull();
    expect(latestProps.baselineLoading).toBe(false);
    expect(latestProps.baselineError).toBeNull();
    expect(latestProps.creatingBaselineFromCurrent).toBe(false);

    root.unmount();
  });

  it('stores selected baseline in project-local UI state and exposes it back to the toolbar', async () => {
    const { container, root } = renderWorkspace();

    await act(async () => {
      container.querySelector('[data-testid="select-baseline"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(fetchBaselineSpy).toHaveBeenCalledWith('baseline-1');
    const projectState = useProjectUIStore.getState().projectStates['project-1'];
    expect(projectState?.selectedBaseline).toMatchObject({
      id: 'baseline-1',
      label: 'Baseline alpha',
    });

    const latestProps = lastCallArg<Record<string, unknown>>(toolbarSpy)!;
    expect(latestProps.baselineActiveLabel).toBe('Baseline alpha');
    expect(latestProps.baselineRows).toEqual([
      { id: 'baseline-1', label: 'Baseline alpha', selected: true },
    ]);
    expect(container.textContent).toContain('Baseline: Baseline alpha');
    expect(container.textContent).toContain('(1 задач)');

    root.unmount();
  });

  it('maps selected baseline snapshot into gantt baseline props instead of only showing the footer badge', async () => {
    const { container, root } = renderWorkspace();

    await act(async () => {
      container.querySelector('[data-testid="select-baseline"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    const ganttPayload = container.querySelector('[data-testid="gantt-chart"]')?.textContent ?? '';
    expect(ganttPayload).toContain('"showBaseline":true');
    expect(ganttPayload).toContain('"baselineStartDate":"2026-03-01"');
    expect(ganttPayload).toContain('"baselineEndDate":"2026-03-02"');

    root.unmount();
  });

  it('creates a baseline with a generated russian default name and immediately activates the returned payload', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-23T03:41:00.000+03:00'));

    const { container, root } = renderWorkspace();

    await act(async () => {
      container.querySelector('[data-testid="create-baseline"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(createFromCurrentSpy).toHaveBeenCalledTimes(1);
    expect(createFromCurrentSpy).toHaveBeenCalledWith('Базовый 23.04.2026 03:41');

    const projectState = useProjectUIStore.getState().projectStates['project-1'];
    expect(projectState?.selectedBaseline).toMatchObject({
      id: 'baseline-created',
      label: 'Базовый 23.04.2026 03:41',
      snapshot: {
        tasks: [
          expect.objectContaining({ id: 'created-task' }),
        ],
        dependencies: [],
      },
    });

    const latestProps = lastCallArg<Record<string, unknown>>(toolbarSpy)!;
    expect(latestProps.baselineActiveLabel).toBe('Базовый 23.04.2026 03:41');
    expect(container.textContent).toContain('Baseline: Базовый 23.04.2026 03:41');
    expect(container.textContent).toContain('(1 задач)');

    root.unmount();
    vi.useRealTimers();
  });

  it('does not emit duplicate create requests while hook loading state marks create as in flight', async () => {
    baselinesHookState.creatingFromCurrent = true;
    const { container, root } = renderWorkspace();

    const latestProps = lastCallArg<Record<string, unknown>>(toolbarSpy)!;
    expect(latestProps.creatingBaselineFromCurrent).toBe(true);

    await act(async () => {
      container.querySelector('[data-testid="create-baseline"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(createFromCurrentSpy).not.toHaveBeenCalled();
    expect(useProjectUIStore.getState().projectStates['project-1']?.selectedBaseline).toBeUndefined();

    root.unmount();
  });

  it('failed create keeps previous selection intact and preserves hook error visibility', async () => {
    useProjectUIStore.getState().setProjectState('project-1', {
      selectedBaseline: {
        id: 'baseline-existing',
        label: 'Existing baseline',
        snapshot: { tasks: [{ id: 'existing-task' }], dependencies: [] },
      },
    });
    baselinesHookState.error = 'Не удалось создать baseline';
    createFromCurrentSpy.mockRejectedValueOnce(new Error('Не удалось создать baseline'));

    const { container, root } = renderWorkspace();

    await act(async () => {
      container.querySelector('[data-testid="create-baseline"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    const projectState = useProjectUIStore.getState().projectStates['project-1'];
    expect(projectState?.selectedBaseline).toMatchObject({
      id: 'baseline-existing',
      label: 'Existing baseline',
    });

    const latestProps = lastCallArg<Record<string, unknown>>(toolbarSpy)!;
    expect(latestProps.baselineActiveLabel).toBe('Existing baseline');
    expect(latestProps.baselineError).toBe('Не удалось создать baseline');
    expect(container.textContent).toContain('Baseline: Existing baseline');

    root.unmount();
  });

  it('hide clears stored baseline state without entering preview mode', async () => {
    useProjectUIStore.getState().setProjectState('project-1', {
      selectedBaseline: {
        id: 'baseline-1',
        label: 'Baseline alpha',
        snapshot: { tasks: [{ id: 'x' }], dependencies: [] },
      },
    });

    const { container, root } = renderWorkspace();

    await act(async () => {
      container.querySelector('[data-testid="hide-baseline"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    const projectState = useProjectUIStore.getState().projectStates['project-1'];
    expect(projectState?.selectedBaseline).toBeNull();
    expect(useHistoryViewerStore.getState().historyViewer.mode).toBe('inactive');

    const latestProps = lastCallArg<Record<string, unknown>>(toolbarSpy)!;
    expect(latestProps.baselineActiveLabel).toBeNull();

    root.unmount();
  });

  it('deletes the active baseline and clears project-local compare state', async () => {
    useProjectUIStore.getState().setProjectState('project-1', {
      selectedBaseline: {
        id: 'baseline-1',
        label: 'Baseline alpha',
        snapshot: { tasks: [{ id: 'task-1' }], dependencies: [] },
      },
    });

    const { container, root } = renderWorkspace();

    await act(async () => {
      container.querySelector('[data-testid="delete-baseline"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(deleteBaselineSpy).toHaveBeenCalledWith('baseline-1');
    const projectState = useProjectUIStore.getState().projectStates['project-1'];
    expect(projectState?.selectedBaseline).toBeNull();

    const latestProps = lastCallArg<Record<string, unknown>>(toolbarSpy)!;
    expect(latestProps.baselineActiveLabel).toBeNull();
    expect(container.textContent).not.toContain('Baseline: Baseline alpha');

    root.unmount();
  });

  it('deleting a non-active baseline preserves the current compare selection', async () => {
    deleteBaselineSpy.mockResolvedValueOnce({ id: 'baseline-2' });
    useProjectUIStore.getState().setProjectState('project-1', {
      selectedBaseline: {
        id: 'baseline-1',
        label: 'Baseline alpha',
        snapshot: { tasks: [{ id: 'task-1' }], dependencies: [] },
      },
    });

    const { container, root } = renderWorkspace();

    await act(async () => {
      await (lastCallArg<Record<string, unknown>>(toolbarSpy)!.onDeleteBaseline as ((id: string) => void))('baseline-2');
      await Promise.resolve();
    });

    expect(deleteBaselineSpy).toHaveBeenCalledWith('baseline-2');
    const projectState = useProjectUIStore.getState().projectStates['project-1'];
    expect(projectState?.selectedBaseline).toMatchObject({
      id: 'baseline-1',
      label: 'Baseline alpha',
    });
    expect(container.textContent).toContain('Baseline: Baseline alpha');

    root.unmount();
  });

  it('does not emit duplicate delete requests while the same baseline row is in flight', async () => {
    baselinesHookState.deletingBaselineId = 'baseline-1';
    useProjectUIStore.getState().setProjectState('project-1', {
      selectedBaseline: {
        id: 'baseline-1',
        label: 'Baseline alpha',
        snapshot: { tasks: [{ id: 'task-1' }], dependencies: [] },
      },
    });

    const { container, root } = renderWorkspace();
    const latestProps = lastCallArg<Record<string, unknown>>(toolbarSpy)!;
    expect(latestProps.deletingBaselineId).toBe('baseline-1');

    await act(async () => {
      container.querySelector('[data-testid="delete-baseline"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(deleteBaselineSpy).not.toHaveBeenCalled();
    expect(useProjectUIStore.getState().projectStates['project-1']?.selectedBaseline).toMatchObject({
      id: 'baseline-1',
      label: 'Baseline alpha',
    });

    root.unmount();
  });

  it('keeps history preview authoritative over baseline badge rendering', () => {
    useProjectUIStore.getState().setProjectState('project-1', {
      selectedBaseline: {
        id: 'baseline-1',
        label: 'Baseline alpha',
        snapshot: { tasks: [{ id: 'x' }], dependencies: [] },
      },
    });
    historyItemsMock = [
      {
        id: 'history-1',
        actorType: 'user',
        title: 'move_task',
        createdAt: '2026-04-22T10:00:00.000Z',
        baseVersion: 1,
        newVersion: 2,
        commandCount: 1,
        canRestore: true,
        isCurrent: false,
      },
    ];
    useHistoryViewerStore.setState({
      historyViewer: {
        mode: 'preview',
        groupId: 'history-1',
        snapshot: { tasks, dependencies: [] },
        isCurrent: false,
      },
    });

    const { container, root } = renderWorkspace();

    expect(useHistoryViewerStore.getState().historyViewer.mode).toBe('preview');
    expect(container.textContent).not.toContain('Baseline: Baseline alpha');

    root.unmount();
  });

  it('creates a baseline from history, activates it immediately, and preserves preview precedence in the footer', async () => {
    historyItemsMock = [
      {
        id: 'history-1',
        actorType: 'user',
        title: 'move_task',
        createdAt: '2026-04-22T10:00:00.000Z',
        baseVersion: 1,
        newVersion: 2,
        commandCount: 1,
        canRestore: true,
        isCurrent: false,
      },
    ];
    useUIStore.setState({ showHistoryPanel: true });
    createFromHistorySpy.mockResolvedValueOnce({
      id: 'baseline-history-1',
      projectId: 'project-1',
      name: buildDefaultBaselineName('2026-04-22T10:00:00.000Z'),
      source: 'history',
      sourceHistoryGroupId: 'history-1',
      createdAt: '2026-04-23T00:45:00.000Z',
      snapshot: {
        tasks: [
          { id: 'history-task', name: 'History baseline task', startDate: '2026-04-05', endDate: '2026-04-06', dependencies: [] },
        ],
        dependencies: [],
      },
    });

    const { container, root } = renderWorkspace();

    const historyPanelProps = lastCallArg<Record<string, unknown>>(historyPanelSpy)!;
    await act(async () => {
      await (historyPanelProps.onCreateBaselineFromHistory as ((item: HistoryItem) => Promise<unknown> | unknown))(historyItemsMock[0]!);
    });

    expect(createFromHistorySpy).toHaveBeenCalledTimes(1);
    expect(createFromHistorySpy).toHaveBeenCalledWith('history-1', 'Базовый 22.04.2026 10:00');

    const projectState = useProjectUIStore.getState().projectStates['project-1'];
    expect(projectState?.selectedBaseline).toMatchObject({
      id: 'baseline-history-1',
      label: 'Базовый 22.04.2026 10:00',
      snapshot: {
        tasks: [
          expect.objectContaining({ id: 'history-task' }),
        ],
        dependencies: [],
      },
    });

    let latestProps = lastCallArg<Record<string, unknown>>(toolbarSpy)!;
    expect(latestProps.baselineActiveLabel).toBe('Базовый 22.04.2026 10:00');
    expect(latestProps.baselineRows).toEqual([
      { id: 'baseline-history-1', label: 'Базовый 22.04.2026 10:00', selected: true },
      { id: 'baseline-1', label: 'Baseline alpha', selected: false },
    ]);
    expect(container.textContent).toContain('Baseline: Базовый 22.04.2026 10:00');

    act(() => {
      useHistoryViewerStore.setState({
        historyViewer: {
          mode: 'preview',
          groupId: 'history-1',
          snapshot: { tasks, dependencies: [] },
          isCurrent: false,
        },
      });
    });

    latestProps = lastCallArg<Record<string, unknown>>(toolbarSpy)!;
    expect(latestProps.baselineActiveLabel).toBe('Базовый 22.04.2026 10:00');
    expect(container.textContent).not.toContain('Baseline: Базовый 22.04.2026 10:00');
    expect(container.textContent).toContain('Версия от');

    root.unmount();
  });

  it('blocks duplicate create-from-history clicks while the same row is marked in flight', async () => {
    baselinesHookState.creatingFromHistoryGroupId = 'history-1';
    historyItemsMock = [
      {
        id: 'history-1',
        actorType: 'user',
        title: 'move_task',
        createdAt: '2026-04-22T10:00:00.000Z',
        baseVersion: 1,
        newVersion: 2,
        commandCount: 1,
        canRestore: true,
        isCurrent: false,
      },
    ];
    useUIStore.setState({ showHistoryPanel: true });

    const { root } = renderWorkspace();

    const historyPanelProps = lastCallArg<Record<string, unknown>>(historyPanelSpy)!;
    expect(historyPanelProps.creatingBaselineFromHistoryGroupId).toBe('history-1');

    await act(async () => {
      await (historyPanelProps.onCreateBaselineFromHistory as ((item: HistoryItem) => Promise<unknown> | unknown))(historyItemsMock[0]!);
    });

    expect(createFromHistorySpy).not.toHaveBeenCalled();
    expect(useProjectUIStore.getState().projectStates['project-1']?.selectedBaseline).toBeUndefined();

    root.unmount();
  });

  it('failed create-from-history keeps the previous baseline selection and surfaces the existing error state', async () => {
    historyItemsMock = [
      {
        id: 'history-1',
        actorType: 'user',
        title: 'move_task',
        createdAt: '2026-04-22T10:00:00.000Z',
        baseVersion: 1,
        newVersion: 2,
        commandCount: 1,
        canRestore: true,
        isCurrent: false,
      },
    ];
    useUIStore.setState({ showHistoryPanel: true });
    useProjectUIStore.getState().setProjectState('project-1', {
      selectedBaseline: {
        id: 'baseline-existing',
        label: 'Existing baseline',
        snapshot: { tasks: [{ id: 'existing-task' }], dependencies: [] },
      },
    });
    baselinesHookState.error = 'Не удалось создать baseline из истории';
    createFromHistorySpy.mockRejectedValueOnce(new Error('Не удалось создать baseline из истории'));

    const { container, root } = renderWorkspace();

    const historyPanelProps = lastCallArg<Record<string, unknown>>(historyPanelSpy)!;
    await act(async () => {
      await (historyPanelProps.onCreateBaselineFromHistory as ((item: HistoryItem) => Promise<unknown> | unknown))(historyItemsMock[0]!);
    });

    expect(createFromHistorySpy).toHaveBeenCalledWith('history-1', 'Базовый 22.04.2026 10:00');
    const projectState = useProjectUIStore.getState().projectStates['project-1'];
    expect(projectState?.selectedBaseline).toMatchObject({
      id: 'baseline-existing',
      label: 'Existing baseline',
    });

    const latestProps = lastCallArg<Record<string, unknown>>(toolbarSpy)!;
    expect(latestProps.baselineActiveLabel).toBe('Existing baseline');
    expect(latestProps.baselineError).toBe('Не удалось создать baseline из истории');
    expect(container.textContent).toContain('Baseline: Existing baseline');

    root.unmount();
  });

  it('passes create-from-history props into HistoryPanel without disturbing preview priority', () => {
    baselinesHookState.creatingFromHistoryGroupId = 'history-1';
    historyItemsMock = [
      {
        id: 'history-1',
        actorType: 'user',
        title: 'move_task',
        createdAt: '2026-04-22T10:00:00.000Z',
        baseVersion: 1,
        newVersion: 2,
        commandCount: 1,
        canRestore: true,
        isCurrent: false,
      },
    ];
    useUIStore.setState({ showHistoryPanel: true });
    useProjectUIStore.getState().setProjectState('project-1', {
      selectedBaseline: {
        id: 'baseline-1',
        label: 'Baseline alpha',
        snapshot: { tasks: [{ id: 'x' }], dependencies: [] },
      },
    });
    useHistoryViewerStore.setState({
      historyViewer: {
        mode: 'preview',
        groupId: 'history-1',
        snapshot: { tasks, dependencies: [] },
        isCurrent: false,
      },
    });

    const { container, root } = renderWorkspace();

    const historyPanelProps = lastCallArg<Record<string, unknown>>(historyPanelSpy)!;
    expect(historyPanelProps.creatingBaselineFromHistoryGroupId).toBe('history-1');
    expect(typeof historyPanelProps.onCreateBaselineFromHistory).toBe('function');
    expect(useHistoryViewerStore.getState().historyViewer.mode).toBe('preview');
    expect(container.textContent).not.toContain('Baseline: Baseline alpha');

    root.unmount();
  });

  it('reuses the same formatter for current and history-derived baseline names', () => {
    expect(buildDefaultBaselineName(new Date('2026-04-23T03:41:00.000+03:00'))).toBe('Базовый 23.04.2026 03:41');
    expect(buildDefaultBaselineName('2026-04-22T10:00:00.000Z')).toBe('Базовый 22.04.2026 10:00');
    expect(buildDefaultBaselineName('invalid')).toBe('Базовый');
  });
});
