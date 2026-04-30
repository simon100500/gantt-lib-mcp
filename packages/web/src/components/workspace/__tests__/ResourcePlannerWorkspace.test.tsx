// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type MockTimelineItem = {
  id: string;
  taskId: string;
  resourceId: string;
  title: string;
  startDate: string;
  endDate: string;
  locked?: boolean;
  metadata: Record<string, unknown>;
};

type MockTimelineResource = {
  id: string;
  name: string;
  items: MockTimelineItem[];
};

type MockGanttProps = {
  mode?: string;
  resources?: MockTimelineResource[];
  onResourceItemMove?: (move: {
    item: MockTimelineItem;
    itemId: string;
    fromResourceId: string;
    toResourceId: string;
    startDate: Date;
    endDate: Date;
  }) => void;
};

const ganttPropsHistory: MockGanttProps[] = [];

vi.mock('gantt-lib', async () => {
  const actual = await vi.importActual<typeof import('gantt-lib')>('gantt-lib');
  return {
    ...actual,
    GanttChart: (props: MockGanttProps) => {
      ganttPropsHistory.push(props);
      return (
        <div data-testid="gantt-lib-resource-planner">
          {props.resources?.map((resource) => (
            <div key={resource.id} data-testid={`gantt-resource-row-${resource.id}`}>
              <span>{resource.name}</span>
              {resource.items.map((item) => (
                <div key={item.id} data-testid={`gantt-resource-item-${item.id}`}>
                  {item.title}
                </div>
              ))}
            </div>
          ))}
        </div>
      );
    },
  };
});

vi.mock('../ResourceAssignmentDetailsPanel.tsx', () => ({
  ResourceAssignmentDetailsPanel: () => null,
}));

import { ResourcePlannerWorkspace } from '../ResourcePlannerWorkspace.tsx';
import { useAuthStore } from '../../../stores/useAuthStore.ts';
import { useProjectStore } from '../../../stores/useProjectStore.ts';
import { useProjectUIStore } from '../../../stores/useProjectUIStore.ts';
import { useUIStore } from '../../../stores/useUIStore.ts';

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

  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: {
      randomUUID: () => 'req-1',
    },
  });
}

installDomPolyfills();

function buildPlannerPayload(overrides?: Partial<{
  resources: Array<{
    resourceId: string;
    resourceName: string;
    hasConflicts?: boolean;
    conflictCount?: number;
    intervals: Array<{
      assignmentId: string;
      resourceId: string;
      resourceName: string;
      projectId: string;
      projectName: string;
      taskId: string;
      taskName: string;
      startDate: string;
      endDate: string;
      assignmentCreatedAt: string;
      hasConflict: boolean;
      conflictCount: number;
      conflictAssignmentIds: string[];
    }>;
  }>;
}>) {
  return {
    projectId: 'project-1',
    scope: 'current-project',
    workspaceUserId: 'user-1',
    resources: (overrides?.resources ?? [{
      resourceId: 'resource-1',
      resourceName: 'Crew A',
      hasConflicts: false,
      conflictCount: 0,
      intervals: [{
        assignmentId: 'assignment-1',
        resourceId: 'resource-1',
        resourceName: 'Crew A',
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
    }]).map((resource) => ({
      hasConflicts: false,
      conflictCount: 0,
      ...resource,
    })),
  };
}

function buildResource(id: string, name: string, type: 'human' | 'equipment' | 'material' | 'other' = 'human') {
  return {
    id,
    userId: 'user-1',
    projectId: 'project-1',
    projectGroupId: null,
    scope: 'project' as const,
    name,
    type,
    isActive: true,
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
    deactivatedAt: null,
  };
}

function latestGanttProps(): MockGanttProps {
  const props = ganttPropsHistory[ganttPropsHistory.length - 1];
  expect(props).toBeTruthy();
  return props;
}

async function renderPlannerWorkspace(): Promise<{ container: HTMLDivElement; root: Root }> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      <ResourcePlannerWorkspace
        accessToken="token"
        projectId="project-1"
        onBackToProject={vi.fn()}
        onCorrectConflict={vi.fn()}
      />,
    );
    await Promise.resolve();
  });

  return { container, root };
}

async function flushEffects(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function unmount(root: Root): Promise<void> {
  await act(async () => {
    root.unmount();
    await Promise.resolve();
  });
}

beforeEach(() => {
  ganttPropsHistory.length = 0;
  window.localStorage.clear();
  vi.restoreAllMocks();

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
    projects: [],
    projectGroups: [],
    adminContext: null,
    constraintDenial: null,
  });

  useUIStore.setState({
    workspace: { kind: 'planner', projectId: 'project-1' },
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
    filterWithoutParents: false,
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
    confirmed: {
      version: 1,
      snapshot: {
        tasks: [{ id: 'task-1', name: 'Install', startDate: '2026-04-01', endDate: '2026-04-03', dependencies: [] }],
        dependencies: [],
      },
    },
    resources: [buildResource('resource-1', 'Crew A'), buildResource('resource-2', 'Crew B'), buildResource('resource-3', 'Crew C')],
    assignments: [{ id: 'assignment-1', projectId: 'project-1', taskId: 'task-1', resourceId: 'resource-1', createdAt: '2026-04-01T00:00:00.000Z' }],
    assignmentError: null,
    resourcePlannerCache: {},
    pending: [],
    dragPreview: undefined,
    scheduleOptions: useProjectStore.getState().scheduleOptions,
  });

  useProjectUIStore.setState({ projectStates: {} });
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.useRealTimers();
});

describe('ResourcePlannerWorkspace current-project pipeline', () => {
  it('loads planner only in current-project scope', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/resources/planner?scope=current-project') {
        return { ok: true, json: async () => buildPlannerPayload() } as Response;
      }
      if (url === '/api/resources?projectId=project-1') {
        return { ok: true, json: async () => ({ resources: [buildResource('resource-1', 'Crew A')] }) } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    const { container, root } = await renderPlannerWorkspace();
    await flushEffects();

    expect(fetchMock).toHaveBeenCalledWith('/api/resources/planner?scope=current-project', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer token' }),
    }));
    expect(container.querySelector('[data-testid="resource-planner-statusbar"]')?.textContent).toContain('Текущий проект');

    await unmount(root);
  });

  it('projects visible task dates instead of stale planner payload dates', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/resources/planner?scope=current-project') {
        return { ok: true, json: async () => buildPlannerPayload() } as Response;
      }
      if (url === '/api/resources?projectId=project-1') {
        return { ok: true, json: async () => ({ resources: [buildResource('resource-1', 'Crew A')] }) } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    const { root } = await renderPlannerWorkspace();
    await flushEffects();

    await act(async () => {
      useProjectStore.setState({
        dragPreview: {
          commands: [],
          snapshot: {
            tasks: [{ id: 'task-1', name: 'Install', startDate: '2026-04-05', endDate: '2026-04-07', dependencies: [] }],
            dependencies: [],
          },
        },
      });
      await Promise.resolve();
    });

    const item = latestGanttProps().resources?.[0]?.items[0];
    expect(item?.startDate).toBe('2026-04-05');
    expect(item?.endDate).toBe('2026-04-07');

    await unmount(root);
  });

  it('persists date-only moves through the shared command pipeline', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/resources/planner?scope=current-project') {
        return { ok: true, json: async () => buildPlannerPayload() } as Response;
      }
      if (url === '/api/resources?projectId=project-1') {
        return { ok: true, json: async () => ({ resources: [buildResource('resource-1', 'Crew A')] }) } as Response;
      }
      if (url === '/api/commands/commit' && init?.method === 'POST') {
        return {
          ok: true,
          json: async () => ({
            clientRequestId: 'req-1',
            accepted: true,
            baseVersion: 1,
            newVersion: 2,
            snapshot: {
              tasks: [{ id: 'task-1', name: 'Install', startDate: '2026-04-02', endDate: '2026-04-04', dependencies: [] }],
              dependencies: [],
            },
            result: {
              changedTaskIds: ['task-1'],
              changedTasks: [{ id: 'task-1', name: 'Install', startDate: '2026-04-02', endDate: '2026-04-04', dependencies: [] }],
              changedDependencyIds: [],
              conflicts: [],
              patches: [],
            },
            changedTaskIds: ['task-1'],
            changedTasks: [{ id: 'task-1', name: 'Install', startDate: '2026-04-02', endDate: '2026-04-04', dependencies: [] }],
            changedDependencyIds: [],
            conflicts: [],
            historyGroupId: 'history-1',
          }),
        } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    const { root } = await renderPlannerWorkspace();
    await flushEffects();

    const props = latestGanttProps();
    const item = props.resources?.[0]?.items[0];
    expect(item).toBeTruthy();

    await act(async () => {
      props.onResourceItemMove?.({
        item: item!,
        itemId: item!.id,
        fromResourceId: 'resource-1',
        toResourceId: 'resource-1',
        startDate: new Date(Date.UTC(2026, 3, 2)),
        endDate: new Date(Date.UTC(2026, 3, 4)),
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
      command: { type: 'move_task', taskId: 'task-1', startDate: '2026-04-02' },
      history: { title: 'Перенос назначения' },
    });

    await unmount(root);
  });

  it('moves reassignment preview through the assignments store before the server responds', async () => {
    let resolveAssignments: ((response: Response) => void) | null = null;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/resources/planner?scope=current-project') {
        return {
          ok: true,
          json: async () => buildPlannerPayload({
            resources: [
              {
                resourceId: 'resource-1',
                resourceName: 'Crew A',
                intervals: [{
                  assignmentId: 'assignment-1',
                  resourceId: 'resource-1',
                  resourceName: 'Crew A',
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
              },
              { resourceId: 'resource-2', resourceName: 'Crew B', intervals: [] },
              { resourceId: 'resource-3', resourceName: 'Crew C', intervals: [] },
            ],
          }),
        } as Response;
      }
      if (url === '/api/resources?projectId=project-1') {
        return { ok: true, json: async () => ({ resources: [buildResource('resource-1', 'Crew A'), buildResource('resource-2', 'Crew B'), buildResource('resource-3', 'Crew C')] }) } as Response;
      }
      if (url === '/api/tasks/task-1/assignments' && init?.method === 'POST') {
        return await new Promise<Response>((resolve) => {
          resolveAssignments = resolve;
        });
      }
      return { ok: true, json: async () => ({}) } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);
    useProjectStore.setState({
      assignments: [
        { id: 'assignment-1', projectId: 'project-1', taskId: 'task-1', resourceId: 'resource-1', createdAt: '2026-04-01T00:00:00.000Z' },
        { id: 'assignment-3', projectId: 'project-1', taskId: 'task-1', resourceId: 'resource-3', createdAt: '2026-04-01T00:00:00.000Z' },
      ],
    });

    const { root } = await renderPlannerWorkspace();
    await flushEffects();

    const props = latestGanttProps();
    const item = props.resources?.find((resource) => resource.id === 'resource-1')?.items[0];
    expect(item).toBeTruthy();

    await act(async () => {
      props.onResourceItemMove?.({
        item: item!,
        itemId: item!.id,
        fromResourceId: 'resource-1',
        toResourceId: 'resource-2',
        startDate: new Date(Date.UTC(2026, 3, 1)),
        endDate: new Date(Date.UTC(2026, 3, 3)),
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    const optimisticProps = latestGanttProps();
    expect(optimisticProps.resources?.find((resource) => resource.id === 'resource-1')?.items).toHaveLength(0);
    expect(optimisticProps.resources?.find((resource) => resource.id === 'resource-2')?.items.map((entry) => entry.id)).toContain('assignment-1');
    expect(useProjectStore.getState().assignments.map((assignment) => assignment.resourceId).sort()).toEqual(['resource-2', 'resource-3']);

    const replacementCall = fetchMock.mock.calls.find(([input]) => String(input) === '/api/tasks/task-1/assignments');
    expect(replacementCall?.[1]).toEqual(expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ resourceIds: ['resource-2', 'resource-3'] }),
    }));

    await act(async () => {
      resolveAssignments?.({
        ok: true,
        json: async () => ({
          assignments: [
            { id: 'assignment-2', projectId: 'project-1', taskId: 'task-1', resourceId: 'resource-2', createdAt: '2026-04-01T00:00:00.000Z' },
            { id: 'assignment-3', projectId: 'project-1', taskId: 'task-1', resourceId: 'resource-3', createdAt: '2026-04-01T00:00:00.000Z' },
          ],
        }),
      } as Response);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(useProjectStore.getState().assignments.map((assignment) => assignment.resourceId).sort()).toEqual(['resource-2', 'resource-3']);

    await unmount(root);
  });

  it('shows authoritative partial-failure copy for combined moves', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/resources/planner?scope=current-project') {
        return {
          ok: true,
          json: async () => buildPlannerPayload({
            resources: [
              {
                resourceId: 'resource-1',
                resourceName: 'Crew A',
                intervals: [{
                  assignmentId: 'assignment-1',
                  resourceId: 'resource-1',
                  resourceName: 'Crew A',
                  projectId: 'project-1',
                  projectName: 'Project 1',
                  taskId: 'task-1',
                  taskName: 'Install',
                  startDate: '2026-04-02',
                  endDate: '2026-04-04',
                  assignmentCreatedAt: '2026-04-01T00:00:00.000Z',
                  hasConflict: false,
                  conflictCount: 0,
                  conflictAssignmentIds: [],
                }],
              },
              { resourceId: 'resource-2', resourceName: 'Crew B', intervals: [] },
            ],
          }),
        } as Response;
      }
      if (url === '/api/resources?projectId=project-1') {
        return { ok: true, json: async () => ({ resources: [buildResource('resource-1', 'Crew A'), buildResource('resource-2', 'Crew B')] }) } as Response;
      }
      if (url === '/api/commands/commit' && init?.method === 'POST') {
        return {
          ok: true,
          json: async () => ({
            clientRequestId: 'req-1',
            accepted: true,
            baseVersion: 1,
            newVersion: 2,
            snapshot: {
              tasks: [{ id: 'task-1', name: 'Install', startDate: '2026-04-02', endDate: '2026-04-04', dependencies: [] }],
              dependencies: [],
            },
            result: {
              changedTaskIds: ['task-1'],
              changedTasks: [{ id: 'task-1', name: 'Install', startDate: '2026-04-02', endDate: '2026-04-04', dependencies: [] }],
              changedDependencyIds: [],
              conflicts: [],
              patches: [],
            },
            changedTaskIds: ['task-1'],
            changedTasks: [{ id: 'task-1', name: 'Install', startDate: '2026-04-02', endDate: '2026-04-04', dependencies: [] }],
            changedDependencyIds: [],
            conflicts: [],
            historyGroupId: 'history-1',
          }),
        } as Response;
      }
      if (url === '/api/tasks/task-1/assignments' && init?.method === 'POST') {
        return { ok: false, status: 400, json: async () => ({ issue: { code: 'assignment_failed' }, error: 'blocked' }) } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    const { container, root } = await renderPlannerWorkspace();
    await flushEffects();

    const props = latestGanttProps();
    const item = props.resources?.[0]?.items[0];
    expect(item).toBeTruthy();

    await act(async () => {
      props.onResourceItemMove?.({
        item: item!,
        itemId: item!.id,
        fromResourceId: 'resource-1',
        toResourceId: 'resource-2',
        startDate: new Date(Date.UTC(2026, 3, 2)),
        endDate: new Date(Date.UTC(2026, 3, 4)),
      });
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    await flushEffects();

    expect(container.querySelector('[data-testid="planner-save-error"]')?.textContent).toBe('Даты назначения сохранены, но ресурс не изменён. Календарь обновлён по данным сервера.');
    expect(fetchMock.mock.calls.filter(([input]) => String(input) === '/api/resources/planner?scope=current-project').length).toBeGreaterThanOrEqual(2);

    await unmount(root);
  });

  it('shows delayed sync status from shared pending command state', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/resources/planner?scope=current-project') {
        return { ok: true, json: async () => buildPlannerPayload() } as Response;
      }
      if (url === '/api/resources?projectId=project-1') {
        return { ok: true, json: async () => ({ resources: [buildResource('resource-1', 'Crew A')] }) } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    const { container, root } = await renderPlannerWorkspace();
    await flushEffects();

    await act(async () => {
      useProjectStore.setState({
        pending: [{
          requestId: 'req-1',
          baseVersion: 1,
          command: { type: 'move_task', taskId: 'task-1', startDate: '2026-04-02' },
          status: 'pending',
        }],
      });
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="planner-sync-status"]')).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(3000);
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="planner-sync-status"]')?.textContent).toContain('Синхронизация...');

    await unmount(root);
  });
});
