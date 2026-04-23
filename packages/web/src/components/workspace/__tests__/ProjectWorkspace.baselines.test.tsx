// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const toolbarSpy = vi.fn();
const refreshBaselinesSpy = vi.fn().mockResolvedValue(undefined);
const fetchBaselineSpy = vi.fn();
const showVersionByIdSpy = vi.fn();
const restoreVersionSpy = vi.fn();
const returnToCurrentVersionSpy = vi.fn();
let historyItemsMock: Array<{ id: string; createdAt: string; canRestore: boolean; isCurrent: boolean }> = [];

vi.mock('../../layout/Toolbar.tsx', () => ({
  Toolbar: (props: Record<string, unknown>) => {
    toolbarSpy(props);
    return (
      <div data-testid="toolbar-props">
        <button type="button" data-testid="select-baseline" onClick={() => void (props.onSelectBaseline as ((id: string) => void) | undefined)?.('baseline-1')}>
          select baseline
        </button>
        <button type="button" data-testid="hide-baseline" onClick={() => void (props.onHideBaseline as (() => void) | undefined)?.()}>
          hide baseline
        </button>
        <button type="button" data-testid="refresh-baselines" onClick={() => void (props.onRefreshBaselines as (() => void) | undefined)?.()}>
          refresh baselines
        </button>
      </div>
    );
  },
}));

vi.mock('../../GanttChart.tsx', () => ({
  GanttChart: () => <div data-testid="gantt-chart">gantt</div>,
}));

vi.mock('../../ChatSidebar.tsx', () => ({
  ChatSidebar: () => <div data-testid="chat-sidebar">chat</div>,
}));

vi.mock('../../HistoryPanel.tsx', () => ({
  HistoryPanel: () => <div data-testid="history-panel">history</div>,
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
    loading: false,
    error: null,
    refreshBaselines: refreshBaselinesSpy,
    fetchBaseline: fetchBaselineSpy,
  }),
}));

import { ProjectWorkspace } from '../ProjectWorkspace.tsx';
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
  fetchBaselineSpy.mockResolvedValue({
    id: 'baseline-1',
    projectId: 'project-1',
    name: 'Baseline alpha',
    source: 'current',
    sourceHistoryGroupId: null,
    createdAt: '2026-04-22T00:00:00.000Z',
    snapshot: {
      tasks: [
        { id: 'baseline-task', name: 'Baseline task', startDate: '2026-03-01', endDate: '2026-03-02', dependencies: [] },
      ],
      dependencies: [],
    },
  });
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

  it('refresh action reuses the explicit workspace refresh seam', async () => {
    const { container, root } = renderWorkspace();

    await act(async () => {
      container.querySelector('[data-testid="refresh-baselines"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(refreshBaselinesSpy).toHaveBeenCalledTimes(2);

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
        createdAt: '2026-04-22T10:00:00.000Z',
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
});
