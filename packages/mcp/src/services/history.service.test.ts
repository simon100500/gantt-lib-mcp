import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { CommitProjectCommandResponse, ProjectCommand, ProjectSnapshot, Task } from '../types.js';
import { HistoryService } from './history.service.js';

type DbGroup = {
  id: string;
  projectId: string;
  baseVersion: number;
  newVersion: number | null;
  actorType: 'user' | 'agent' | 'system' | 'import_actor';
  actorId: string | null;
  origin: 'user_ui' | 'agent_run' | 'system' | 'undo' | 'redo';
  title: string;
  status: 'applied' | 'undone';
  undoable: boolean;
  undoneByGroupId: string | null;
  redoOfGroupId: string | null;
  createdAt: Date;
};

type DbEvent = {
  id: string;
  projectId: string;
  groupId: string | null;
  ordinal: number | null;
  version: number;
  applied: boolean;
  command: ProjectCommand;
  inverseCommand: ProjectCommand | null;
  createdAt: Date;
};

type HarnessState = {
  version: number;
  snapshot: ProjectSnapshot;
  mutationGroups: DbGroup[];
  projectEvents: DbEvent[];
  commitCalls: Array<{
    baseVersion: number;
    command: ProjectCommand;
    history: CommitRequestHistory;
  }>;
};

type CommitRequestHistory = {
  groupId: string;
  origin: 'undo' | 'redo';
  title: string;
  requestContextId?: string;
  finalizeGroup: boolean;
  redoOfGroupId?: string | null;
  targetGroupId?: string | null;
};

function createTask(id: string, name = id): Task {
  return {
    id,
    name,
    startDate: '2026-04-01',
    endDate: '2026-04-03',
    dependencies: [],
  };
}

function createHarness(): { prisma: any; state: HarnessState } {
  const state: HarnessState = {
    version: 4,
    snapshot: {
      tasks: [createTask('A'), createTask('B')],
      dependencies: [],
    },
    mutationGroups: [],
    projectEvents: [],
    commitCalls: [],
  };

  const prisma = {
    project: {
      findUnique: async ({ where }: any) => {
        if (where.id !== 'project-1') {
          return null;
        }

        return { id: 'project-1', version: state.version };
      },
    },
    task: {
      findMany: async ({ where }: any) => {
        if (where.projectId !== 'project-1') {
          return [];
        }

        return state.snapshot.tasks.map((task) => ({
          ...task,
          type: task.type ?? 'task',
          color: task.color ?? null,
          parentId: task.parentId ?? null,
          progress: task.progress ?? 0,
          sortOrder: task.sortOrder ?? 0,
          startDate: new Date(`${task.startDate}T00:00:00.000Z`),
          endDate: new Date(`${task.endDate}T00:00:00.000Z`),
          dependencies: [],
        }));
      },
    },
    dependency: {
      findMany: async () => [],
    },
    mutationGroup: {
      findUnique: async ({ where }: any) => {
        return state.mutationGroups.find((group) => group.id === where.id) ?? null;
      },
      findFirst: async ({ where, orderBy }: any) => {
        let groups = state.mutationGroups.filter((group) => {
          if (where.projectId && group.projectId !== where.projectId) {
            return false;
          }
          if (where.status && group.status !== where.status) {
            return false;
          }
          if (where.undoable !== undefined && group.undoable !== where.undoable) {
            return false;
          }
          return true;
        });

        if (orderBy?.newVersion === 'desc') {
          groups = groups.sort((left, right) => (right.newVersion ?? -1) - (left.newVersion ?? -1));
        }

        return groups[0] ?? null;
      },
      findMany: async ({ where, orderBy }: any = {}) => {
        let groups = [...state.mutationGroups];
        if (where?.projectId) {
          groups = groups.filter((group) => group.projectId === where.projectId);
        }
        if (where?.id?.in) {
          groups = groups.filter((group) => where.id.in.includes(group.id));
        }
        if (where?.status) {
          groups = groups.filter((group) => group.status === where.status);
        }

        if (orderBy) {
          groups.sort((left, right) => {
            for (const clause of orderBy) {
              if (clause.createdAt) {
                const value = clause.createdAt === 'desc'
                  ? right.createdAt.getTime() - left.createdAt.getTime()
                  : left.createdAt.getTime() - right.createdAt.getTime();
                if (value !== 0) {
                  return value;
                }
              }
              if (clause.id) {
                const value = clause.id === 'desc'
                  ? right.id.localeCompare(left.id)
                  : left.id.localeCompare(right.id);
                if (value !== 0) {
                  return value;
                }
              }
            }
            return 0;
          });
        }

        return groups;
      },
      update: async ({ where, data }: any) => {
        const group = state.mutationGroups.find((candidate) => candidate.id === where.id);
        if (!group) {
          throw new Error(`group ${where.id} not found`);
        }
        Object.assign(group, data);
        return group;
      },
    },
    projectEvent: {
      findMany: async ({ where, orderBy }: any = {}) => {
        let events = [...state.projectEvents];
        if (where?.projectId) {
          events = events.filter((event) => event.projectId === where.projectId);
        }
        if (where?.groupId?.in) {
          events = events.filter((event) => where.groupId.in.includes(event.groupId));
        } else if (where?.groupId) {
          events = events.filter((event) => event.groupId === where.groupId);
        }
        if (where?.applied !== undefined) {
          events = events.filter((event) => event.applied === where.applied);
        }

        if (orderBy?.ordinal) {
          events.sort((left, right) => {
            const leftOrdinal = left.ordinal ?? 0;
            const rightOrdinal = right.ordinal ?? 0;
            return orderBy.ordinal === 'desc' ? rightOrdinal - leftOrdinal : leftOrdinal - rightOrdinal;
          });
        }

        return events;
      },
    },
  };

  return { prisma, state };
}

describe('HistoryService', () => {
  let harness: { prisma: any; state: HarnessState };
  let service: HistoryService;

  beforeEach(() => {
    harness = createHarness();
    service = new HistoryService({
      prisma: harness.prisma,
      commandService: {
        commitCommand: async (request: any): Promise<CommitProjectCommandResponse> => {
          harness.state.commitCalls.push({
            baseVersion: request.baseVersion,
            command: request.command,
            history: request.history,
          });

          harness.state.version += 1;
          return {
            clientRequestId: 'commit',
            accepted: true,
            baseVersion: request.baseVersion,
            newVersion: harness.state.version,
            result: {
              snapshot: harness.state.snapshot,
              changedTaskIds: [],
              changedDependencyIds: [],
              conflicts: [],
              patches: [],
            },
            snapshot: harness.state.snapshot,
          };
        },
      } as any,
    });
  });

  it('undo latest replays inverse commands in reverse order for ordinals 2 then 1', async () => {
    harness.state.mutationGroups.push({
      id: 'group-apply',
      projectId: 'project-1',
      baseVersion: 1,
      newVersion: 3,
      actorType: 'user',
      actorId: 'user-1',
      origin: 'user_ui',
      title: 'Manual edit',
      status: 'applied',
      undoable: true,
      undoneByGroupId: null,
      redoOfGroupId: null,
      createdAt: new Date('2026-04-18T10:00:00.000Z'),
    });
    harness.state.projectEvents.push(
      {
        id: 'event-1',
        projectId: 'project-1',
        groupId: 'group-apply',
        ordinal: 1,
        version: 2,
        applied: true,
        command: { type: 'move_task', taskId: 'A', startDate: '2026-04-02' },
        inverseCommand: { type: 'move_task', taskId: 'A', startDate: '2026-04-01' },
        createdAt: new Date('2026-04-18T10:00:00.000Z'),
      },
      {
        id: 'event-2',
        projectId: 'project-1',
        groupId: 'group-apply',
        ordinal: 2,
        version: 3,
        applied: true,
        command: { type: 'move_task', taskId: 'B', startDate: '2026-04-04' },
        inverseCommand: { type: 'move_task', taskId: 'B', startDate: '2026-04-03' },
        createdAt: new Date('2026-04-18T10:00:02.000Z'),
      },
    );

    const response = await service.undoLatestGroup({
      projectId: 'project-1',
      actorType: 'user',
      actorId: 'user-1',
      requestContextId: 'undo latest',
    });

    assert.equal(response.accepted, true);
    assert.deepEqual(
      harness.state.commitCalls.map((call) => call.command),
      [
        { type: 'move_task', taskId: 'B', startDate: '2026-04-03' },
        { type: 'move_task', taskId: 'A', startDate: '2026-04-01' },
      ],
      'undo latest should replay inverse commands in reverse order',
    );
    assert.equal(harness.state.commitCalls[1]?.history.finalizeGroup, true);
    assert.equal(harness.state.mutationGroups[0]?.status, 'undone');
    assert.equal(harness.state.mutationGroups[0]?.undoneByGroupId, harness.state.commitCalls[0]?.history.groupId);
  });

  it('redo specific replays original commands in forward order for ordinals 1 then 2', async () => {
    harness.state.mutationGroups.push(
      {
        id: 'group-apply',
        projectId: 'project-1',
        baseVersion: 1,
        newVersion: 3,
        actorType: 'user',
        actorId: 'user-1',
        origin: 'user_ui',
        title: 'Manual edit',
        status: 'undone',
        undoable: true,
        undoneByGroupId: 'group-undo',
        redoOfGroupId: null,
        createdAt: new Date('2026-04-18T10:00:00.000Z'),
      },
      {
        id: 'group-undo',
        projectId: 'project-1',
        baseVersion: 3,
        newVersion: 5,
        actorType: 'user',
        actorId: 'user-1',
        origin: 'undo',
        title: 'Undo — Manual edit',
        status: 'applied',
        undoable: true,
        undoneByGroupId: null,
        redoOfGroupId: null,
        createdAt: new Date('2026-04-18T10:01:00.000Z'),
      },
    );
    harness.state.projectEvents.push(
      {
        id: 'event-1',
        projectId: 'project-1',
        groupId: 'group-apply',
        ordinal: 1,
        version: 2,
        applied: true,
        command: { type: 'move_task', taskId: 'A', startDate: '2026-04-02' },
        inverseCommand: { type: 'move_task', taskId: 'A', startDate: '2026-04-01' },
        createdAt: new Date('2026-04-18T10:00:00.000Z'),
      },
      {
        id: 'event-2',
        projectId: 'project-1',
        groupId: 'group-apply',
        ordinal: 2,
        version: 3,
        applied: true,
        command: { type: 'move_task', taskId: 'B', startDate: '2026-04-04' },
        inverseCommand: { type: 'move_task', taskId: 'B', startDate: '2026-04-03' },
        createdAt: new Date('2026-04-18T10:00:02.000Z'),
      },
    );

    const response = await service.redoGroup({
      projectId: 'project-1',
      groupId: 'group-apply',
      actorType: 'user',
      actorId: 'user-1',
      requestContextId: 'redo specific',
    });

    assert.equal(response.accepted, true);
    assert.deepEqual(
      harness.state.commitCalls.map((call) => call.command),
      [
        { type: 'move_task', taskId: 'A', startDate: '2026-04-02' },
        { type: 'move_task', taskId: 'B', startDate: '2026-04-04' },
      ],
      'redo specific should replay commands in forward order',
    );
    assert.equal(harness.state.commitCalls[1]?.history.finalizeGroup, true);
    assert.equal(harness.state.mutationGroups[0]?.status, 'applied');
    assert.equal(harness.state.mutationGroups[0]?.undoneByGroupId, null);
  });

  it('returns history_diverged when a post-undo normal edit exists after the undo group', async () => {
    harness.state.mutationGroups.push(
      {
        id: 'group-apply',
        projectId: 'project-1',
        baseVersion: 1,
        newVersion: 3,
        actorType: 'user',
        actorId: 'user-1',
        origin: 'user_ui',
        title: 'Manual edit',
        status: 'undone',
        undoable: true,
        undoneByGroupId: 'group-undo',
        redoOfGroupId: null,
        createdAt: new Date('2026-04-18T10:00:00.000Z'),
      },
      {
        id: 'group-undo',
        projectId: 'project-1',
        baseVersion: 3,
        newVersion: 5,
        actorType: 'user',
        actorId: 'user-1',
        origin: 'undo',
        title: 'Undo — Manual edit',
        status: 'applied',
        undoable: true,
        undoneByGroupId: null,
        redoOfGroupId: null,
        createdAt: new Date('2026-04-18T10:01:00.000Z'),
      },
      {
        id: 'group-diverged',
        projectId: 'project-1',
        baseVersion: 5,
        newVersion: 6,
        actorType: 'user',
        actorId: 'user-1',
        origin: 'user_ui',
        title: 'New edit',
        status: 'applied',
        undoable: true,
        undoneByGroupId: null,
        redoOfGroupId: null,
        createdAt: new Date('2026-04-18T10:02:00.000Z'),
      },
    );

    const response = await service.redoGroup({
      projectId: 'project-1',
      groupId: 'group-apply',
      actorType: 'user',
      actorId: 'user-1',
      requestContextId: 'redo diverged',
    });

    assert.equal(response.accepted, false);
    assert.equal(response.reason, 'history_diverged');
    assert.equal(harness.state.commitCalls.length, 0);
  });

  it('returns target_not_undone when redo is requested for an already-applied target', async () => {
    harness.state.mutationGroups.push({
      id: 'group-apply',
      projectId: 'project-1',
      baseVersion: 1,
      newVersion: 3,
      actorType: 'user',
      actorId: 'user-1',
      origin: 'user_ui',
      title: 'Manual edit',
      status: 'applied',
      undoable: true,
      undoneByGroupId: null,
      redoOfGroupId: null,
      createdAt: new Date('2026-04-18T10:00:00.000Z'),
    });

    const response = await service.redoGroup({
      projectId: 'project-1',
      groupId: 'group-apply',
      actorType: 'user',
      actorId: 'user-1',
      requestContextId: 'redo specific',
    });

    assert.equal(response.accepted, false);
    assert.equal(response.reason, 'target_not_undone');
  });

  it('list pagination returns grouped rows with commandCount, undoable, redoable, status, and createdAt', async () => {
    harness.state.mutationGroups.push(
      {
        id: 'group-1',
        projectId: 'project-1',
        baseVersion: 0,
        newVersion: 1,
        actorType: 'user',
        actorId: 'user-1',
        origin: 'user_ui',
        title: 'Group one',
        status: 'applied',
        undoable: true,
        undoneByGroupId: null,
        redoOfGroupId: null,
        createdAt: new Date('2026-04-18T10:00:00.000Z'),
      },
      {
        id: 'group-2',
        projectId: 'project-1',
        baseVersion: 1,
        newVersion: 2,
        actorType: 'user',
        actorId: 'user-1',
        origin: 'user_ui',
        title: 'Group two',
        status: 'undone',
        undoable: true,
        undoneByGroupId: 'group-undo',
        redoOfGroupId: null,
        createdAt: new Date('2026-04-18T10:01:00.000Z'),
      },
      {
        id: 'group-undo',
        projectId: 'project-1',
        baseVersion: 2,
        newVersion: 3,
        actorType: 'user',
        actorId: 'user-1',
        origin: 'undo',
        title: 'Undo — Group two',
        status: 'applied',
        undoable: true,
        undoneByGroupId: null,
        redoOfGroupId: null,
        createdAt: new Date('2026-04-18T10:02:00.000Z'),
      },
    );
    harness.state.projectEvents.push(
      {
        id: 'event-1',
        projectId: 'project-1',
        groupId: 'group-1',
        ordinal: 1,
        version: 1,
        applied: true,
        command: { type: 'move_task', taskId: 'A', startDate: '2026-04-02' },
        inverseCommand: { type: 'move_task', taskId: 'A', startDate: '2026-04-01' },
        createdAt: new Date('2026-04-18T10:00:00.000Z'),
      },
      {
        id: 'event-2',
        projectId: 'project-1',
        groupId: 'group-2',
        ordinal: 1,
        version: 2,
        applied: true,
        command: { type: 'move_task', taskId: 'B', startDate: '2026-04-04' },
        inverseCommand: { type: 'move_task', taskId: 'B', startDate: '2026-04-03' },
        createdAt: new Date('2026-04-18T10:01:00.000Z'),
      },
      {
        id: 'event-3',
        projectId: 'project-1',
        groupId: 'group-2',
        ordinal: 2,
        version: 2,
        applied: true,
        command: { type: 'move_task', taskId: 'A', startDate: '2026-04-04' },
        inverseCommand: { type: 'move_task', taskId: 'A', startDate: '2026-04-02' },
        createdAt: new Date('2026-04-18T10:01:01.000Z'),
      },
    );

    const firstPage = await service.listHistoryGroups({
      projectId: 'project-1',
      limit: 2,
    });

    assert.equal(firstPage.items.length, 2);
    assert.equal(firstPage.items[0]?.id, 'group-undo');
    assert.equal(firstPage.items[1]?.id, 'group-2');
    assert.equal(firstPage.items[1]?.commandCount, 2);
    assert.equal(firstPage.items[1]?.undoable, false);
    assert.equal(firstPage.items[1]?.redoable, true);
    assert.equal(typeof firstPage.items[1]?.createdAt, 'string');
    assert.equal(firstPage.nextCursor, 'group-2');

    const secondPage = await service.listHistoryGroups({
      projectId: 'project-1',
      cursor: firstPage.nextCursor,
      limit: 2,
    });

    assert.equal(secondPage.items.length, 1);
    assert.equal(secondPage.items[0]?.id, 'group-1');
    assert.equal(secondPage.items[0]?.status, 'applied');
    assert.equal(secondPage.items[0]?.commandCount, 1);
  });
});
