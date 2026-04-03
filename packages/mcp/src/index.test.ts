import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { LEGACY_SCHEDULING_TOOL_NAMES } from './public-tools.js';
import { handleCallToolRequest, handleListToolsRequest } from './index.js';
import type { CommitProjectCommandResponse, ProjectCommand, ProjectSnapshot, ScheduleExecutionResult, Task } from './types.js';

function createTask(id: string, startDate: string, endDate: string): Task {
  return {
    id,
    name: id,
    startDate,
    endDate,
    dependencies: [],
  };
}

function createSnapshot(tasks: Task[], dependencies: ProjectSnapshot['dependencies'] = []): ProjectSnapshot {
  return {
    tasks,
    dependencies,
  };
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

function parseJsonContent(response: Awaited<ReturnType<typeof handleCallToolRequest>>) {
  assert.equal(response.content.length, 1);
  assert.equal(response.content[0]?.type, 'text');
  return JSON.parse(response.content[0]!.text);
}

function createDeps(overrides: Partial<Parameters<typeof handleCallToolRequest>[1]> = {}) {
  return {
    writeMcpDebugLog: async () => {},
    commitNormalizedCommand: async () => {
      throw new Error('unexpected commitNormalizedCommand call');
    },
    getProjectSnapshotSummary: async (projectId: string) => ({
      projectId,
      version: 11,
      dayMode: 'calendar' as const,
      effectiveDateRange: { startDate: '2026-04-01', endDate: '2026-04-30' },
      rootTaskCount: 1,
      totalTaskCount: 1,
      healthFlags: [],
    }),
    listAllProjectTasks: async () => [],
    resolveProjectId: (projectId: unknown) => typeof projectId === 'string' ? projectId : 'project-1',
    taskService: {
      get: async () => undefined,
    },
    getPrisma: () => ({}) as never,
    getProjectScheduleOptionsForProject: async () => ({
      businessDays: false,
      weekendPredicate: undefined,
    }),
    enforcementService: {
      evaluateMutationAccess: async () => ({ allowed: true as const }),
    },
    ...overrides,
  };
}

describe('MCP normalized runtime surface', () => {
  it('list handler exposes only normalized tool names at runtime', async () => {
    const result = await handleListToolsRequest();
    const toolNames = result.tools.map((tool) => tool.name as string);

    assert.ok(toolNames.includes('move_tasks'));
    assert.ok(toolNames.includes('link_tasks'));
    assert.ok(toolNames.includes('shift_tasks'));

    for (const legacyName of LEGACY_SCHEDULING_TOOL_NAMES) {
      assert.ok(!toolNames.includes(legacyName), `legacy tool leaked into runtime list handler: ${legacyName}`);
    }
  });

  it('rejects legacy scheduling tool calls on the runtime-visible path', async () => {
    for (const legacyName of LEGACY_SCHEDULING_TOOL_NAMES) {
      const payload = parseJsonContent(await handleCallToolRequest(
        { params: { name: legacyName, arguments: {} } },
        createDeps(),
      ));

      assert.deepEqual(payload, {
        status: 'rejected',
        reason: 'unsupported_operation',
        baseVersion: 0,
        changedTaskIds: [],
        changedTasks: [],
        changedDependencyIds: [],
        conflicts: [],
      });
    }
  });

  it('move_tasks returns normalized accepted aggregation shape', async () => {
    const firstSnapshot = createSnapshot([
      createTask('A', '2026-04-01', '2026-04-03'),
      createTask('B', '2026-04-04', '2026-04-06'),
    ]);
    const secondSnapshot = createSnapshot([
      createTask('A', '2026-04-01', '2026-04-03'),
      createTask('B', '2026-04-04', '2026-04-06'),
      { ...createTask('C', '2026-04-07', '2026-04-09'), parentId: 'A' },
    ]);
    const committedCommands: ProjectCommand[] = [];
    const responses = [
      acceptedResponse(8, firstSnapshot, {
        changedTaskIds: ['A'],
        changedDependencyIds: [],
        conflicts: [],
      }),
      acceptedResponse(9, secondSnapshot, {
        changedTaskIds: ['C'],
        changedDependencyIds: [],
        conflicts: [],
      }),
    ];

    const payload = parseJsonContent(await handleCallToolRequest(
      {
        params: {
          name: 'move_tasks',
          arguments: {
            projectId: 'project-1',
            includeSnapshot: true,
            moves: [
              { taskId: 'A', sortOrder: 1 },
              { taskId: 'C', parentId: 'A' },
            ],
          },
        },
      },
      createDeps({
        commitNormalizedCommand: async (_projectId, command) => {
          committedCommands.push(command);
          const response = responses.shift();
          assert.ok(response, 'missing stubbed response');
          return { baseVersion: response.newVersion - 1, response };
        },
      }),
    ));

    assert.deepEqual(committedCommands, [
      { type: 'reorder_tasks', updates: [{ taskId: 'A', sortOrder: 1 }] },
      { type: 'reparent_task', taskId: 'C', newParentId: 'A' },
    ]);
    assert.equal(payload.status, 'accepted');
    assert.equal(payload.baseVersion, 7);
    assert.equal(payload.newVersion, 9);
    assert.deepEqual(payload.changedTaskIds, ['A', 'C']);
    assert.deepEqual(payload.changedTasks.map((task: Task) => task.id), ['A', 'C']);
    assert.deepEqual(payload.changedDependencyIds, []);
    assert.deepEqual(payload.conflicts, []);
    assert.deepEqual(payload.snapshot.tasks.map((task: Task) => task.id), ['A', 'B', 'C']);
  });

  it('link_tasks preserves normalized rejection shape with partial aggregate', async () => {
    const firstSnapshot = createSnapshot(
      [
        createTask('P', '2026-04-01', '2026-04-03'),
        createTask('Q', '2026-04-04', '2026-04-06'),
        createTask('R', '2026-04-07', '2026-04-09'),
      ],
      [{ id: 'dep-1', taskId: 'Q', depTaskId: 'P', type: 'FS', lag: 0 }],
    );
    const rejectedSnapshot = createSnapshot(firstSnapshot.tasks, firstSnapshot.dependencies);

    const payload = parseJsonContent(await handleCallToolRequest(
      {
        params: {
          name: 'link_tasks',
          arguments: {
            projectId: 'project-1',
            includeSnapshot: true,
            links: [
              { predecessorTaskId: 'P', successorTaskId: 'Q', type: 'FS', lag: 0 },
              { predecessorTaskId: 'Q', successorTaskId: 'R', type: 'FS', lag: 0 },
            ],
          },
        },
      },
      createDeps({
        commitNormalizedCommand: async (_projectId, command) => {
          if (command.type === 'create_dependency' && command.taskId === 'Q') {
            return {
              baseVersion: 3,
              response: acceptedResponse(4, firstSnapshot, {
                changedTaskIds: ['Q'],
                changedDependencyIds: ['dep-1'],
                conflicts: [],
              }),
            };
          }

          return {
            baseVersion: 4,
            response: {
              clientRequestId: 'test-request',
              accepted: false,
              reason: 'conflict',
              currentVersion: 4,
              snapshot: rejectedSnapshot,
            },
          };
        },
      }),
    ));

    assert.equal(payload.status, 'rejected');
    assert.equal(payload.reason, 'conflict');
    assert.equal(payload.baseVersion, 3);
    assert.deepEqual(payload.changedTaskIds, ['Q']);
    assert.deepEqual(payload.changedTasks.map((task: Task) => task.id), ['Q']);
    assert.deepEqual(payload.changedDependencyIds, ['dep-1']);
    assert.deepEqual(payload.conflicts, []);
    assert.deepEqual(payload.snapshot.dependencies.map((dependency: { id: string }) => dependency.id), ['dep-1']);
  });

  it('shift_tasks computes working-day move and returns normalized accepted result', async () => {
    const shiftedTask = createTask('A', '2026-04-06', '2026-04-08');
    let committedCommand: ProjectCommand | undefined;

    const payload = parseJsonContent(await handleCallToolRequest(
      {
        params: {
          name: 'shift_tasks',
          arguments: {
            projectId: 'project-1',
            includeSnapshot: true,
            shifts: [{ taskId: 'A', delta: 1, mode: 'working' }],
          },
        },
      },
      createDeps({
        taskService: {
          get: async () => createTask('A', '2026-04-04', '2026-04-06'),
        },
        getProjectScheduleOptionsForProject: async () => ({
          businessDays: true,
          weekendPredicate: (date: Date) => {
            const day = date.getUTCDay();
            return day === 0 || day === 6;
          },
        }),
        commitNormalizedCommand: async (_projectId, command) => {
          committedCommand = command;
          return {
            baseVersion: 12,
            response: acceptedResponse(13, createSnapshot([shiftedTask]), {
              changedTaskIds: ['A'],
              changedDependencyIds: [],
              conflicts: [],
            }),
          };
        },
      }),
    ));

    assert.deepEqual(committedCommand, {
      type: 'move_task',
      taskId: 'A',
      startDate: '2026-04-06',
    });
    assert.equal(payload.status, 'accepted');
    assert.equal(payload.baseVersion, 12);
    assert.equal(payload.newVersion, 13);
    assert.deepEqual(payload.changedTaskIds, ['A']);
    assert.deepEqual(payload.changedTasks.map((task: Task) => task.id), ['A']);
    assert.deepEqual(payload.snapshot.tasks.map((task: Task) => task.startDate), ['2026-04-06']);
  });

  it('shift_tasks returns normalized not_found rejection without committing', async () => {
    let commitCalls = 0;

    const payload = parseJsonContent(await handleCallToolRequest(
      {
        params: {
          name: 'shift_tasks',
          arguments: {
            projectId: 'project-1',
            shifts: [{ taskId: 'missing', delta: 2 }],
          },
        },
      },
      createDeps({
        commitNormalizedCommand: async () => {
          commitCalls += 1;
          throw new Error('commit should not run for missing task');
        },
      }),
    ));

    assert.equal(commitCalls, 0);
    assert.deepEqual(payload, {
      status: 'rejected',
      reason: 'not_found',
      baseVersion: 11,
      changedTaskIds: [],
      changedTasks: [],
      changedDependencyIds: [],
      conflicts: [],
    });
  });

  it('rejects mutating tools with structured limit metadata before command commit', async () => {
    let commitCalls = 0;

    const payload = parseJsonContent(await handleCallToolRequest(
      {
        params: {
          name: 'create_tasks',
          arguments: {
            projectId: 'project-1',
            tasks: [{ name: 'Blocked', startDate: '2026-04-01', endDate: '2026-04-02' }],
          },
        },
      },
      createDeps({
        commitNormalizedCommand: async () => {
          commitCalls += 1;
          throw new Error('commitNormalizedCommand should not run when enforcement denies');
        },
        enforcementService: {
          evaluateMutationAccess: async () => ({
            allowed: false,
            enforcement: {
              code: 'SUBSCRIPTION_EXPIRED',
              limitKey: null,
              remaining: null,
              plan: 'team',
              planLabel: 'Team',
              upgradeHint: 'Renew to resume mutations.',
            },
          }),
        },
      }),
    ));

    assert.equal(commitCalls, 0);
    assert.equal(payload.status, 'rejected');
    assert.equal(payload.reason, 'limit_reached');
    assert.deepEqual(payload.changedTaskIds, []);
    assert.deepEqual(payload.changedTasks, []);
    assert.deepEqual(payload.changedDependencyIds, []);
    assert.deepEqual(payload.conflicts, []);
    assert.deepEqual(payload.enforcement, {
      code: 'SUBSCRIPTION_EXPIRED',
      limitKey: null,
      remaining: null,
      plan: 'team',
      planLabel: 'Team',
      upgradeHint: 'Renew to resume mutations.',
    });
  });

  it('keeps read tools available when mutation enforcement is configured', async () => {
    let enforcementCalls = 0;

    const payload = parseJsonContent(await handleCallToolRequest(
      {
        params: {
          name: 'get_project_summary',
          arguments: {
            projectId: 'project-1',
          },
        },
      },
      createDeps({
        enforcementService: {
          evaluateMutationAccess: async () => {
            enforcementCalls += 1;
            return {
              allowed: false,
              enforcement: {
                code: 'SUBSCRIPTION_EXPIRED',
                limitKey: null,
                remaining: null,
                plan: 'team',
                planLabel: 'Team',
                upgradeHint: 'Renew to resume mutations.',
              },
            };
          },
        },
      }),
    ));

    assert.equal(enforcementCalls, 0);
    assert.equal(payload.projectId, 'project-1');
    assert.equal(payload.version, 11);
  });
});
