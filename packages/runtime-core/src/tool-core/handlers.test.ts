import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createToolHandlers, executeToolCall } from './handlers.js';
import type { ToolCallContext } from './types.js';
import type {
  CommitProjectCommandResponse,
  ProjectCommand,
  ProjectSnapshot,
  ScheduleExecutionResult,
  Task,
} from '../types.js';

function createTask(id: string, name: string, startDate: string, endDate: string, parentId?: string): Task {
  return {
    id,
    name,
    startDate,
    endDate,
    parentId,
    dependencies: [],
  };
}

function createSnapshot(tasks: Task[], dependencies: ProjectSnapshot['dependencies'] = []): ProjectSnapshot {
  return { tasks, dependencies };
}

function acceptedResponse(
  newVersion: number,
  snapshot: ProjectSnapshot,
  result: Omit<ScheduleExecutionResult, 'snapshot' | 'patches'>,
): Extract<CommitProjectCommandResponse, { accepted: true }> {
  return {
    clientRequestId: 'test-request',
    accepted: true,
    baseVersion: newVersion - 1,
    newVersion,
    result: {
      ...result,
      snapshot,
      patches: [],
    },
    snapshot,
  };
}

function createContext(overrides: Partial<ToolCallContext> = {}): ToolCallContext {
  return {
    actorType: 'agent',
    defaultProjectId: 'project-1',
    getProjectSummary: async (projectId: string) => ({
      projectId,
      version: 11,
      dayMode: 'calendar',
      effectiveDateRange: { startDate: '2026-04-01', endDate: '2026-04-30' },
      rootTaskCount: 1,
      totalTaskCount: 3,
      healthFlags: [],
    }),
    listAllProjectTasks: async () => [
      createTask('root', 'Root Phase', '2026-04-01', '2026-04-20'),
      createTask('paint-1', 'Paint walls floor 1', '2026-04-02', '2026-04-05', 'root'),
      createTask('paint-2', 'Paint ceiling floor 2', '2026-04-06', '2026-04-08', 'root'),
    ],
    getTask: async (_projectId: string, taskId: string) => {
      const tasks = [
        createTask('shift-1', 'Shift me', '2026-04-04', '2026-04-06'),
      ];
      return tasks.find((task) => task.id === taskId);
    },
    getProjectScheduleOptions: async () => ({
      businessDays: false,
      weekendPredicate: undefined,
    }),
    commitCommand: async () => {
      throw new Error('unexpected commitCommand call');
    },
    resolveProjectId: (projectId?: string | null) => projectId ?? 'project-1',
    ...overrides,
  };
}

describe('tool-core handlers', () => {
  it('get_project_summary returns plain typed data', async () => {
    const result = await executeToolCall('get_project_summary', { projectId: 'project-7' }, createContext());

    assert.equal(result.ok, true);
    if (!result.ok) {
      return;
    }

    assert.equal(result.data.projectId, 'project-7');
    assert.equal(result.data.version, 11);
    assert.ok(!('content' in (result.data as unknown as Record<string, unknown>)));
  });

  it('find_tasks returns deterministic compact ranked matches', async () => {
    const result = await executeToolCall('find_tasks', { projectId: 'project-1', query: 'paint floor', limit: 2 }, createContext());

    assert.equal(result.ok, true);
    if (!result.ok) {
      return;
    }

    assert.equal(result.data.query, 'paint floor');
    assert.deepEqual(result.data.matches.map((match) => match.taskId), ['paint-1', 'paint-2']);
    assert.deepEqual(result.data.matches[0]?.parentPath, ['Root Phase']);
    assert.ok(result.data.matches[0]!.score >= result.data.matches[1]!.score);
  });

  it('createToolHandlers exposes transport-neutral execution functions', async () => {
    const handlers = createToolHandlers(createContext({
      commitCommand: async (_projectId: string, command: ProjectCommand) => ({
        baseVersion: 4,
        response: acceptedResponse(5, createSnapshot([createTask('new-1', 'New task', '2026-04-01', '2026-04-02')]), {
          changedTaskIds: ['new-1'],
          changedDependencyIds: [],
          conflicts: [],
        }),
      }),
    }));

    const result = await handlers.create_tasks({
      projectId: 'project-1',
      tasks: [{ name: 'New task', startDate: '2026-04-01', endDate: '2026-04-02' }],
      includeSnapshot: true,
    });

    assert.equal(result.status, 'accepted');
    assert.equal(result.newVersion, 5);
    assert.ok(!('content' in (result as unknown as Record<string, unknown>)));
  });

  it('create_tasks preserves accepted normalized mutation semantics', async () => {
    const result = await executeToolCall(
      'create_tasks',
      {
        projectId: 'project-1',
        includeSnapshot: true,
        tasks: [{ name: 'New task', startDate: '2026-04-01', endDate: '2026-04-02' }],
      },
      createContext({
        commitCommand: async () => ({
          baseVersion: 8,
          response: acceptedResponse(9, createSnapshot([createTask('new-1', 'New task', '2026-04-01', '2026-04-02')]), {
            changedTaskIds: ['new-1'],
            changedDependencyIds: [],
            conflicts: [],
          }),
        }),
      }),
    );

    assert.equal(result.ok, true);
    if (!result.ok) {
      return;
    }

    assert.equal(result.data.status, 'accepted');
    assert.equal(result.data.baseVersion, 8);
    assert.equal(result.data.newVersion, 9);
    assert.deepEqual(result.data.changedTaskIds, ['new-1']);
    assert.deepEqual(result.data.changedTasks.map((task) => task.id), ['new-1']);
    assert.deepEqual(result.data.snapshot?.tasks.map((task) => task.id), ['new-1']);
  });

  it('shift_tasks preserves rejected normalized mutation semantics with partial aggregate', async () => {
    const responses: Array<{ baseVersion: number; response: CommitProjectCommandResponse }> = [
      {
        baseVersion: 10,
        response: acceptedResponse(
          11,
          createSnapshot([createTask('shift-1', 'Shift me', '2026-04-05', '2026-04-07')]),
          {
            changedTaskIds: ['shift-1'],
            changedDependencyIds: [],
            conflicts: [],
          },
        ),
      },
      {
        baseVersion: 11,
        response: {
          clientRequestId: 'test-request',
          accepted: false,
          reason: 'conflict',
          currentVersion: 11,
          snapshot: createSnapshot([createTask('shift-1', 'Shift me', '2026-04-05', '2026-04-07')]),
        },
      },
    ];

    const result = await executeToolCall(
      'shift_tasks',
      {
        projectId: 'project-1',
        includeSnapshot: true,
        shifts: [
          { taskId: 'shift-1', delta: 1 },
          { taskId: 'shift-1', delta: 2 },
        ],
      },
      createContext({
        commitCommand: async () => {
          const next = responses.shift();
          assert.ok(next);
          return next;
        },
      }),
    );

    assert.equal(result.ok, true);
    if (!result.ok) {
      return;
    }

    assert.equal(result.data.status, 'rejected');
    assert.equal(result.data.reason, 'conflict');
    assert.equal(result.data.baseVersion, 10);
    assert.deepEqual(result.data.changedTaskIds, ['shift-1']);
    assert.deepEqual(result.data.changedTasks.map((task) => task.id), ['shift-1']);
  });

  it('validate_schedule returns plain typed validation data', async () => {
    const invalidTask: Task = {
      ...createTask('broken', 'Broken', '2026-04-03', '2026-04-05'),
      dependencies: [{ taskId: 'missing', type: 'FS', lag: 0 }],
    };

    const result = await executeToolCall(
      'validate_schedule',
      { projectId: 'project-1' },
      createContext({
        listAllProjectTasks: async () => [invalidTask],
      }),
    );

    assert.equal(result.ok, true);
    if (!result.ok) {
      return;
    }

    assert.equal(result.data.version, 11);
    assert.equal(result.data.isValid, false);
    assert.equal(result.data.errors[0]?.type, 'missing-task');
  });
});
