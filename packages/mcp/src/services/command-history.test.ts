import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CommandService } from './command.service.js';
import type { CommitProjectCommandRequest, ProjectSnapshot, Task } from '../types.js';

type DbTask = {
  id: string;
  projectId: string;
  name: string;
  startDate: Date;
  endDate: Date;
  type: 'task' | 'milestone';
  color: string | null;
  parentId: string | null;
  progress: number;
  sortOrder: number;
};

type DbDependency = ProjectSnapshot['dependencies'][number];
type HarnessState = {
  project: { id: string; version: number; ganttDayMode: 'business' | 'calendar' };
  tasks: DbTask[];
  dependencies: DbDependency[];
  mutationGroups: any[];
  projectEvents: any[];
};

function toDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function createDbTask(task: Task, projectId = 'project-1'): DbTask {
  return {
    id: task.id,
    projectId,
    name: task.name,
    startDate: toDate(task.startDate),
    endDate: toDate(task.endDate),
    type: task.type ?? 'task',
    color: task.color ?? null,
    parentId: task.parentId ?? null,
    progress: task.progress ?? 0,
    sortOrder: task.sortOrder ?? 0,
  };
}

function createHarness(tasks: Task[], dependencies: DbDependency[] = [], version = 0) {
  const state: HarnessState = {
    project: { id: 'project-1', version, ganttDayMode: 'business' },
    tasks: tasks.map((task) => createDbTask(task)),
    dependencies: dependencies.map((dependency) => ({ ...dependency })),
    mutationGroups: [],
    projectEvents: [],
  };

  const prisma = {
    $transaction: async (fn: (tx: any) => Promise<unknown>) => fn(prisma),
    $executeRaw: async () => 0,
    project: {
      findUnique: async ({ where }: any) => {
        if (where.id !== state.project.id) {
          return null;
        }

        return { version: state.project.version, ganttDayMode: state.project.ganttDayMode };
      },
      update: async ({ where, data }: any) => {
        if (where.id !== state.project.id) {
          throw new Error('project not found');
        }
        if (where.version !== undefined && where.version !== state.project.version) {
          const error: any = new Error('version mismatch');
          error.code = 'P2025';
          throw error;
        }

        if (data.version?.increment) {
          state.project.version += data.version.increment;
        }

        return { id: state.project.id, version: state.project.version };
      },
    },
    task: {
      findMany: async ({ where, include, orderBy }: any) => {
        const items = state.tasks
          .filter((task) => task.projectId === where.projectId)
          .sort((left, right) => left.sortOrder - right.sortOrder)
          .map((task) => ({
            ...task,
            dependencies: include?.dependencies
              ? state.dependencies.filter((dependency) => dependency.taskId === task.id)
              : undefined,
          }));

        if (orderBy?.sortOrder === 'asc') {
          return items;
        }

        return items;
      },
      aggregate: async ({ where }: any) => {
        const projectTasks = state.tasks.filter((task) => task.projectId === where.projectId);
        return { _max: { sortOrder: projectTasks.length > 0 ? Math.max(...projectTasks.map((task) => task.sortOrder)) : null } };
      },
      create: async ({ data }: any) => {
        state.tasks.push({
          id: data.id,
          projectId: data.projectId,
          name: data.name,
          startDate: data.startDate,
          endDate: data.endDate,
          type: data.type,
          color: data.color,
          parentId: data.parentId,
          progress: data.progress,
          sortOrder: data.sortOrder,
        });
      },
      createMany: async ({ data }: any) => {
        for (const row of data) {
          state.tasks.push({
            id: row.id,
            projectId: row.projectId,
            name: row.name,
            startDate: row.startDate,
            endDate: row.endDate,
            type: row.type,
            color: row.color,
            parentId: row.parentId,
            progress: row.progress,
            sortOrder: row.sortOrder,
          });
        }
      },
      updateMany: async ({ where, data }: any) => {
        for (const task of state.tasks) {
          if (task.projectId !== where.projectId) {
            continue;
          }
          if (where.sortOrder?.gte !== undefined && task.sortOrder >= where.sortOrder.gte) {
            task.sortOrder += data.sortOrder.increment;
          }
        }
      },
      update: async ({ where, data }: any) => {
        const task = state.tasks.find((candidate) => candidate.id === where.id);
        if (!task) {
          throw new Error(`task ${where.id} not found`);
        }

        if (data.name !== undefined) task.name = data.name;
        if (data.startDate !== undefined) task.startDate = data.startDate;
        if (data.endDate !== undefined) task.endDate = data.endDate;
        if (data.type !== undefined) task.type = data.type;
        if (data.color !== undefined) task.color = data.color;
        if (data.parentId !== undefined) task.parentId = data.parentId;
        if (data.progress !== undefined) task.progress = data.progress;
        if (data.sortOrder !== undefined) task.sortOrder = data.sortOrder;
      },
      deleteMany: async ({ where }: any) => {
        state.tasks = state.tasks.filter((task) => !where.id.in.includes(task.id));
      },
    },
    dependency: {
      findMany: async ({ where, select }: any) => {
        if (where?.task?.projectId) {
          return state.dependencies
            .filter((dependency) => state.tasks.some((task) => task.projectId === where.task.projectId && task.id === dependency.taskId))
            .map((dependency) => select ? { ...dependency } : { ...dependency });
        }

        return state.dependencies.map((dependency) => ({ ...dependency }));
      },
      create: async ({ data }: any) => {
        state.dependencies.push({ ...data });
      },
      createMany: async ({ data }: any) => {
        for (const row of data) {
          state.dependencies.push({ ...row });
        }
      },
      delete: async ({ where }: any) => {
        state.dependencies = state.dependencies.filter((dependency) => dependency.id !== where.id);
      },
      deleteMany: async ({ where }: any) => {
        state.dependencies = state.dependencies.filter((dependency) => {
          if (where.taskId && where.depTaskId) {
            return !(dependency.taskId === where.taskId && dependency.depTaskId === where.depTaskId);
          }
          if (where.taskId) {
            return dependency.taskId !== where.taskId;
          }

          if (where.OR) {
            return !where.OR.some((condition: any) => {
              if (condition.taskId?.in) {
                return condition.taskId.in.includes(dependency.taskId);
              }
              if (condition.depTaskId?.in) {
                return condition.depTaskId.in.includes(dependency.depTaskId);
              }
              return false;
            });
          }

          return true;
        });
      },
      updateMany: async ({ where, data }: any) => {
        for (const dependency of state.dependencies) {
          if (dependency.taskId === where.taskId && dependency.depTaskId === where.depTaskId) {
            dependency.lag = data.lag;
          }
        }
      },
    },
    mutationGroup: {
      findUnique: async ({ where }: any) => {
        const group = state.mutationGroups.find((candidate) => candidate.id === where.id);
        return group ? { id: group.id, projectId: group.projectId } : null;
      },
      create: async ({ data }: any) => {
        state.mutationGroups.push({ ...data });
      },
      update: async ({ where, data }: any) => {
        const group = state.mutationGroups.find((candidate) => candidate.id === where.id);
        if (!group) {
          throw new Error(`group ${where.id} not found`);
        }
        Object.assign(group, data);
      },
    },
    projectEvent: {
      aggregate: async ({ where }: any) => {
        const ordinals = state.projectEvents
          .filter((event) => event.groupId === where.groupId)
          .map((event) => event.ordinal)
          .filter((ordinal): ordinal is number => typeof ordinal === 'number');
        return { _max: { ordinal: ordinals.length > 0 ? Math.max(...ordinals) : null } };
      },
      create: async ({ data }: any) => {
        state.projectEvents.push({
          ...data,
          inverseCommand: data.inverseCommand?.constructor?.name === 'DbNull' ? null : data.inverseCommand,
          metadata: data.metadata?.constructor?.name === 'DbNull' ? null : data.metadata,
        });
      },
      findMany: async ({ where, select }: any) => {
        const events = state.projectEvents.filter((event) => event.groupId === where.groupId && event.applied === where.applied);
        return events.map((event) => (select ? { inverseCommand: event.inverseCommand } : { ...event }));
      },
    },
  };

  return { prisma, state };
}

describe('CommandService history persistence', () => {
  let service: CommandService;

  beforeEach(() => {
    service = new CommandService();
    (service as any).getScheduleOptions = async () => ({ businessDays: false });
  });

  it('finalized groups keep first baseVersion, last newVersion, and sequential ordinals', async () => {
    const harness = createHarness([
      { id: 'A', name: 'A', startDate: '2026-04-01', endDate: '2026-04-03', sortOrder: 0, dependencies: [] },
      { id: 'B', name: 'B', startDate: '2026-04-04', endDate: '2026-04-06', sortOrder: 1, dependencies: [] },
    ]);

    const executeQueue = [
      {
        changedTasks: [{ id: 'A', name: 'A', startDate: '2026-04-02', endDate: '2026-04-04', sortOrder: 0, dependencies: [] }],
        changedDependencyIds: [],
        conflicts: [],
        dependencyChanges: [],
        taskChanges: [],
      },
      {
        changedTasks: [{ id: 'B', name: 'B', startDate: '2026-04-05', endDate: '2026-04-07', sortOrder: 1, dependencies: [] }],
        changedDependencyIds: [],
        conflicts: [],
        dependencyChanges: [],
        taskChanges: [],
      },
    ];

    (service as any)._prisma = harness.prisma;
    (service as any).executeCommand = async () => executeQueue.shift();

    const sharedHistory = {
      groupId: 'group-1',
      origin: 'agent_run' as const,
      title: 'Agent run',
      requestContextId: 'run-123',
      finalizeGroup: false,
    };

    const firstRequest: CommitProjectCommandRequest = {
      projectId: 'project-1',
      clientRequestId: 'req-1',
      baseVersion: 0,
      command: { type: 'move_task', taskId: 'A', startDate: '2026-04-02' },
      history: sharedHistory,
    };

    const secondRequest: CommitProjectCommandRequest = {
      projectId: 'project-1',
      clientRequestId: 'req-2',
      baseVersion: 1,
      command: { type: 'move_task', taskId: 'B', startDate: '2026-04-05' },
      history: { ...sharedHistory, finalizeGroup: true },
    };

    const firstResponse = await service.commitCommand(firstRequest, 'agent');
    const secondResponse = await service.commitCommand(secondRequest, 'agent');

    assert.equal(firstResponse.accepted, true);
    assert.equal(secondResponse.accepted, true);
    assert.equal(harness.state.mutationGroups.length, 1);
    assert.equal(harness.state.mutationGroups[0].baseVersion, 0);
    assert.equal(harness.state.mutationGroups[0].newVersion, 2);
    assert.equal(harness.state.mutationGroups[0].undoable, true);
    assert.deepEqual(harness.state.projectEvents.map((event) => event.ordinal), [1, 2]);
    assert.deepEqual(harness.state.projectEvents.map((event) => event.requestContextId), ['run-123', 'run-123']);
  });

  it('delete_task persists delete metadata and a recreate inverse command', async () => {
    const harness = createHarness(
      [
        {
          id: 'A',
          name: 'Delete me',
          startDate: '2026-04-01',
          endDate: '2026-04-03',
          parentId: 'P',
          sortOrder: 3,
          dependencies: [{ taskId: 'C', type: 'FS', lag: 1 }],
        },
        { id: 'B', name: 'Depends on A', startDate: '2026-04-04', endDate: '2026-04-06', sortOrder: 4, dependencies: [{ taskId: 'A', type: 'FS', lag: 0 }] },
        { id: 'C', name: 'Pred', startDate: '2026-03-28', endDate: '2026-03-30', sortOrder: 2, dependencies: [] },
      ],
      [
        { id: 'dep-out', taskId: 'A', depTaskId: 'C', type: 'FS', lag: 1 },
        { id: 'dep-in', taskId: 'B', depTaskId: 'A', type: 'FS', lag: 0 },
      ],
    );

    (service as any)._prisma = harness.prisma;
    (service as any).executeCommand = async () => ({
      changedTasks: [],
      changedDependencyIds: [],
      conflicts: [],
      dependencyChanges: [],
      taskChanges: [{ action: 'delete', taskId: 'A' }],
    });

    const response = await service.commitCommand(
      {
        projectId: 'project-1',
        clientRequestId: 'req-delete-one',
        baseVersion: 0,
        command: { type: 'delete_task', taskId: 'A' },
      },
      'user',
    );

    assert.equal(response.accepted, true);
    assert.equal(harness.state.projectEvents.length, 1);
    assert.equal(harness.state.projectEvents[0].inverseCommand.type, 'create_task');
    assert.equal(harness.state.projectEvents[0].inverseCommand.task.id, 'A');
    assert.equal(harness.state.projectEvents[0].metadata.deletedTasks[0].parentId, 'P');
    assert.equal(harness.state.projectEvents[0].metadata.deletedTasks[0].sortOrder, 3);
    assert.equal(harness.state.projectEvents[0].metadata.deletedDependencies.length, 2);
  });

  it('delete_tasks persists batch recreate inverse and grouped delete metadata', async () => {
    const harness = createHarness(
      [
        { id: 'A', name: 'A', startDate: '2026-04-01', endDate: '2026-04-03', sortOrder: 0, dependencies: [] },
        { id: 'B', name: 'B', startDate: '2026-04-04', endDate: '2026-04-06', parentId: 'A', sortOrder: 1, dependencies: [{ taskId: 'A', type: 'FS', lag: 0 }] },
        { id: 'C', name: 'C', startDate: '2026-04-07', endDate: '2026-04-09', sortOrder: 2, dependencies: [{ taskId: 'B', type: 'FS', lag: 0 }] },
      ],
      [
        { id: 'dep-1', taskId: 'B', depTaskId: 'A', type: 'FS', lag: 0 },
        { id: 'dep-2', taskId: 'C', depTaskId: 'B', type: 'FS', lag: 0 },
      ],
    );

    (service as any)._prisma = harness.prisma;
    (service as any).executeCommand = async () => ({
      changedTasks: [],
      changedDependencyIds: [],
      conflicts: [],
      dependencyChanges: [],
      taskChanges: [
        { action: 'delete', taskId: 'A' },
        { action: 'delete', taskId: 'B' },
      ],
    });

    const response = await service.commitCommand(
      {
        projectId: 'project-1',
        clientRequestId: 'req-delete-many',
        baseVersion: 0,
        command: { type: 'delete_tasks', taskIds: ['A', 'B'] },
      },
      'user',
    );

    assert.equal(response.accepted, true);
    assert.equal(harness.state.projectEvents[0].inverseCommand.type, 'create_tasks_batch');
    assert.deepEqual(
      harness.state.projectEvents[0].inverseCommand.tasks.map((task: Task) => task.id),
      ['A', 'B'],
    );
    assert.equal(harness.state.projectEvents[0].metadata.deletedTasks.length, 2);
    assert.equal(harness.state.projectEvents[0].metadata.deletedDependencies.length, 2);
  });

  it('a finalized group with a null inverse command is marked undoable false', async () => {
    const harness = createHarness([
      { id: 'A', name: 'A', startDate: '2026-04-01', endDate: '2026-04-03', sortOrder: 0, dependencies: [] },
    ]);

    (service as any)._prisma = harness.prisma;
    (service as any).executeCommand = async () => ({
      changedTasks: [],
      changedDependencyIds: [],
      conflicts: [],
      dependencyChanges: [],
      taskChanges: [],
    });

    const response = await service.commitCommand(
      {
        projectId: 'project-1',
        clientRequestId: 'req-recalc',
        baseVersion: 0,
        command: { type: 'recalculate_schedule' },
        history: {
          groupId: 'group-recalc',
          origin: 'system',
          title: 'Recalculate',
          finalizeGroup: true,
        },
      },
      'system',
    );

    assert.equal(response.accepted, true);
    assert.equal(harness.state.projectEvents[0].inverseCommand, null);
    assert.equal(harness.state.mutationGroups[0].undoable, false);
  });

  it('inverse generation covers create_dependency, remove_dependency, change_dependency_lag, reparent_task, and reorder_tasks', () => {
    const beforeTasks: Task[] = [
      { id: 'A', name: 'A', startDate: '2026-04-01', endDate: '2026-04-03', sortOrder: 2, dependencies: [] },
      { id: 'B', name: 'B', startDate: '2026-04-04', endDate: '2026-04-06', parentId: 'A', sortOrder: 5, dependencies: [{ taskId: 'A', type: 'FS', lag: 2 }] },
    ];
    const beforeDependencies: DbDependency[] = [
      { id: 'dep-1', taskId: 'B', depTaskId: 'A', type: 'FS', lag: 2 },
    ];
    const executeResult = {
      changedTasks: [],
      changedDependencyIds: [],
      conflicts: [],
      dependencyChanges: [],
      taskChanges: [],
    };
    const opts = { businessDays: false };

    const createDependencyInverse = (service as any).buildInverseCommand(
      { type: 'create_dependency', taskId: 'B', dependency: { taskId: 'A', type: 'FS', lag: 4 } },
      beforeTasks,
      beforeDependencies,
      executeResult,
      opts,
    );
    const removeDependencyInverse = (service as any).buildInverseCommand(
      { type: 'remove_dependency', taskId: 'B', depTaskId: 'A' },
      beforeTasks,
      beforeDependencies,
      executeResult,
      opts,
    );
    const changeLagInverse = (service as any).buildInverseCommand(
      { type: 'change_dependency_lag', taskId: 'B', depTaskId: 'A', lag: 9 },
      beforeTasks,
      beforeDependencies,
      executeResult,
      opts,
    );
    const reparentInverse = (service as any).buildInverseCommand(
      { type: 'reparent_task', taskId: 'B', newParentId: null },
      beforeTasks,
      beforeDependencies,
      executeResult,
      opts,
    );
    const reorderInverse = (service as any).buildInverseCommand(
      { type: 'reorder_tasks', updates: [{ taskId: 'A', sortOrder: 0 }, { taskId: 'B', sortOrder: 1 }] },
      beforeTasks,
      beforeDependencies,
      executeResult,
      opts,
    );

    assert.deepEqual(createDependencyInverse, { type: 'remove_dependency', taskId: 'B', depTaskId: 'A' });
    assert.deepEqual(removeDependencyInverse, {
      type: 'create_dependency',
      taskId: 'B',
      dependency: { taskId: 'A', type: 'FS', lag: 2 },
    });
    assert.deepEqual(changeLagInverse, {
      type: 'change_dependency_lag',
      taskId: 'B',
      depTaskId: 'A',
      lag: 2,
    });
    assert.deepEqual(reparentInverse, {
      type: 'reparent_task',
      taskId: 'B',
      newParentId: 'A',
    });
    assert.deepEqual(reorderInverse, {
      type: 'reorder_tasks',
      updates: [
        { taskId: 'A', sortOrder: 2 },
        { taskId: 'B', sortOrder: 5 },
      ],
    });
  });
});
