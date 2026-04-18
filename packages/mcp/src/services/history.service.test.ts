import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, it } from 'node:test';
import type { CommitProjectCommandResponse, ProjectCommand, ProjectSnapshot, Task } from '../types.js';
import type { CommandService } from './command.service.js';
import { HistoryService, HistoryValidationError } from './history.service.js';

const historyServiceSource = readFileSync(
  resolve(process.cwd(), 'packages/mcp/src/services/history.service.ts'),
  'utf8',
);
const historyHookSource = readFileSync(
  resolve(process.cwd(), 'packages/web/src/hooks/useProjectHistory.ts'),
  'utf8',
);
const historyApiTypesSource = readFileSync(
  resolve(process.cwd(), 'packages/web/src/lib/apiTypes.ts'),
  'utf8',
);

function shiftInclusiveEndDate(startDate: string, currentStartDate: string, currentEndDate: string): string {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const currentStart = new Date(`${currentStartDate}T00:00:00.000Z`);
  const currentEnd = new Date(`${currentEndDate}T00:00:00.000Z`);
  const durationDays = Math.round((currentEnd.getTime() - currentStart.getTime()) / (24 * 60 * 60 * 1000));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + durationDays);
  return end.toISOString().slice(0, 10);
}

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
    history: {
      groupId: string;
      origin: 'undo';
      title: string;
      requestContextId?: string;
      finalizeGroup: boolean;
      targetGroupId?: string | null;
    };
  }>;
  writes: string[];
};

function createTask(id: string, startDate: string, endDate: string): Task {
  return {
    id,
    name: id,
    startDate,
    endDate,
    dependencies: [],
    sortOrder: id === 'A' ? 0 : 1,
  };
}

function createHarness(): { prisma: any; state: HarnessState } {
  const state: HarnessState = {
    version: 5,
    snapshot: {
      tasks: [
        createTask('A', '2026-04-05', '2026-04-07'),
        createTask('B', '2026-04-08', '2026-04-10'),
      ],
      dependencies: [],
    },
    mutationGroups: [],
    projectEvents: [],
    commitCalls: [],
    writes: [],
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
      findUnique: async ({ where }: any) => state.mutationGroups.find((group) => group.id === where.id) ?? null,
      findMany: async ({ where, orderBy }: any = {}) => {
        let groups = [...state.mutationGroups];
        if (where?.projectId) {
          groups = groups.filter((group) => group.projectId === where.projectId);
        }
        if (where?.status) {
          groups = groups.filter((group) => group.status === where.status);
        }
        if (where?.id?.in) {
          groups = groups.filter((group) => where.id.in.includes(group.id));
        }
        if (orderBy) {
          groups.sort((left, right) => {
            for (const clause of orderBy) {
              if (clause.newVersion) {
                const value = clause.newVersion === 'desc'
                  ? (right.newVersion ?? -1) - (left.newVersion ?? -1)
                  : (left.newVersion ?? -1) - (right.newVersion ?? -1);
                if (value !== 0) {
                  return value;
                }
              }
              if (clause.createdAt) {
                const value = clause.createdAt === 'desc'
                  ? right.createdAt.getTime() - left.createdAt.getTime()
                  : left.createdAt.getTime() - right.createdAt.getTime();
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
        state.writes.push(`mutationGroup.update:${where.id}`);
        const group = state.mutationGroups.find((candidate) => candidate.id === where.id);
        if (!group) {
          throw new Error(`group ${where.id} not found`);
        }
        Object.assign(group, data);
        return group;
      },
      create: async ({ data }: any) => {
        state.writes.push(`mutationGroup.create:${data.id}`);
        state.mutationGroups.push(data);
        return data;
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
      create: async ({ data }: any) => {
        state.writes.push(`projectEvent.create:${data.id}`);
        state.projectEvents.push(data);
        return data;
      },
    },
  };

  return { prisma, state };
}

describe('HistoryService version snapshots', () => {
  let harness: { prisma: any; state: HarnessState };
  let service: HistoryService;

  beforeEach(() => {
    harness = createHarness();
    service = new HistoryService({
      prisma: harness.prisma,
      getScheduleOptions: async () => ({ businessDays: false }),
      commandService: {
        commitCommand: async (request: any): Promise<CommitProjectCommandResponse> => {
          harness.state.commitCalls.push({
            baseVersion: request.baseVersion,
            command: request.command,
            history: request.history,
          });

          harness.state.version += 1;
          if (request.command.type === 'move_task') {
            harness.state.snapshot = {
              ...harness.state.snapshot,
              tasks: harness.state.snapshot.tasks.map((task) =>
                task.id === request.command.taskId
                  ? {
                      ...task,
                      startDate: request.command.startDate,
                      endDate: shiftInclusiveEndDate(request.command.startDate, task.startDate, task.endDate),
                    }
                  : task,
              ),
            };
          }

          return {
            clientRequestId: 'commit',
            accepted: true,
            baseVersion: request.baseVersion,
            newVersion: harness.state.version,
            result: {
              snapshot: harness.state.snapshot,
              changedTaskIds: request.command.type === 'move_task' ? [request.command.taskId] : [],
              changedDependencyIds: [],
              conflicts: [],
              patches: [],
            },
            snapshot: harness.state.snapshot,
          };
        },
      } satisfies Pick<CommandService, 'commitCommand'>,
    });
  });

  function seedVisibleHistory() {
    harness.state.mutationGroups.push(
      {
        id: 'group-1',
        projectId: 'project-1',
        baseVersion: 0,
        newVersion: 2,
        actorType: 'user',
        actorId: 'user-1',
        origin: 'user_ui',
        title: 'Initial move',
        status: 'applied',
        undoable: true,
        undoneByGroupId: null,
        redoOfGroupId: null,
        createdAt: new Date('2026-04-18T10:00:00.000Z'),
      },
      {
        id: 'group-2',
        projectId: 'project-1',
        baseVersion: 2,
        newVersion: 4,
        actorType: 'user',
        actorId: 'user-1',
        origin: 'user_ui',
        title: 'Second move',
        status: 'applied',
        undoable: true,
        undoneByGroupId: null,
        redoOfGroupId: null,
        createdAt: new Date('2026-04-18T10:10:00.000Z'),
      },
      {
        id: 'group-3',
        projectId: 'project-1',
        baseVersion: 4,
        newVersion: 5,
        actorType: 'agent',
        actorId: 'agent-1',
        origin: 'agent_run',
        title: 'Latest move',
        status: 'applied',
        undoable: true,
        undoneByGroupId: null,
        redoOfGroupId: null,
        createdAt: new Date('2026-04-18T10:20:00.000Z'),
      },
    );

    harness.state.projectEvents.push(
      {
        id: 'event-2a',
        projectId: 'project-1',
        groupId: 'group-2',
        ordinal: 1,
        version: 3,
        applied: true,
        command: { type: 'move_task', taskId: 'A', startDate: '2026-04-03' },
        inverseCommand: { type: 'move_task', taskId: 'A', startDate: '2026-04-02' },
        createdAt: new Date('2026-04-18T10:10:00.000Z'),
      },
      {
        id: 'event-2b',
        projectId: 'project-1',
        groupId: 'group-2',
        ordinal: 2,
        version: 4,
        applied: true,
        command: { type: 'move_task', taskId: 'B', startDate: '2026-04-07' },
        inverseCommand: { type: 'move_task', taskId: 'B', startDate: '2026-04-06' },
        createdAt: new Date('2026-04-18T10:10:01.000Z'),
      },
      {
        id: 'event-3a',
        projectId: 'project-1',
        groupId: 'group-3',
        ordinal: 1,
        version: 5,
        applied: true,
        command: { type: 'move_task', taskId: 'A', startDate: '2026-04-05' },
        inverseCommand: { type: 'move_task', taskId: 'A', startDate: '2026-04-04' },
        createdAt: new Date('2026-04-18T10:20:00.000Z'),
      },
    );
  }

  it('listHistoryGroups returns visible version rows with current version and restore flags', async () => {
    seedVisibleHistory();

    const response = await service.listHistoryGroups({ projectId: 'project-1', limit: 10 });

    assert.equal(response.items.length, 3);
    assert.equal(response.items[0]?.id, 'group-3');
    assert.equal(response.items[0]?.isCurrent, true);
    assert.equal(response.items[0]?.canRestore, false);
    assert.equal(response.items[1]?.baseVersion, 2);
    assert.equal(response.items[1]?.newVersion, 4);
    assert.equal(response.items[1]?.commandCount, 2);
    assert.equal(response.items[1]?.canRestore, true);
  });

  it('getHistorySnapshot returns the current version unchanged for the active row', async () => {
    seedVisibleHistory();

    const response = await service.getHistorySnapshot({ projectId: 'project-1', groupId: 'group-3' });

    assert.equal(response.isCurrent, true);
    assert.equal(response.currentVersion, 5);
    assert.equal(response.snapshot.tasks.find((task) => task.id === 'A')?.startDate, '2026-04-05');
    assert.equal(response.snapshot.tasks.find((task) => task.id === 'B')?.startDate, '2026-04-08');
    assert.equal(harness.state.commitCalls.length, 0);
    assert.deepEqual(harness.state.writes, []);
  });

  it('getHistorySnapshot applies the active tail in memory-only reverse ordinal order without Prisma writes', async () => {
    seedVisibleHistory();

    const response = await service.getHistorySnapshot({ projectId: 'project-1', groupId: 'group-1' });

    assert.equal(response.groupId, 'group-1');
    assert.equal(response.isCurrent, false);
    assert.equal(response.currentVersion, 5);
    assert.equal(response.snapshot.tasks.find((task) => task.id === 'A')?.startDate, '2026-04-02');
    assert.equal(response.snapshot.tasks.find((task) => task.id === 'B')?.startDate, '2026-04-06');
    assert.equal(harness.state.commitCalls.length, 0);
    assert.deepEqual(harness.state.writes, []);
  });

  it('restoreToGroup replays the same tail through commitCommand and returns the authoritative snapshot/version', async () => {
    seedVisibleHistory();

    const response = await service.restoreToGroup({
      projectId: 'project-1',
      groupId: 'group-1',
      actorType: 'user',
      actorId: 'user-1',
      requestContextId: 'restore group-1',
    });

    assert.equal(response.targetGroupId, 'group-1');
    assert.equal(response.version, 8);
    assert.deepEqual(
      harness.state.commitCalls.map((call) => call.command),
      [
        { type: 'move_task', taskId: 'A', startDate: '2026-04-04' },
        { type: 'move_task', taskId: 'B', startDate: '2026-04-06' },
        { type: 'move_task', taskId: 'A', startDate: '2026-04-02' },
      ],
    );
    assert.equal(harness.state.commitCalls[2]?.history.finalizeGroup, true);
    assert.equal(response.snapshot.tasks.find((task) => task.id === 'A')?.startDate, '2026-04-02');
  });

  it('preview and restore resolve the same active tail and land on the same target snapshot', async () => {
    seedVisibleHistory();

    const preview = await service.getHistorySnapshot({ projectId: 'project-1', groupId: 'group-1' });
    const restore = await service.restoreToGroup({
      projectId: 'project-1',
      groupId: 'group-1',
      actorType: 'user',
      actorId: 'user-1',
      requestContextId: 'parity',
    });

    assert.deepEqual(
      restore.snapshot.tasks.map((task) => ({ id: task.id, startDate: task.startDate, endDate: task.endDate })),
      preview.snapshot.tasks.map((task) => ({ id: task.id, startDate: task.startDate, endDate: task.endDate })),
    );
  });

  it('fails with a typed validation error when the active tail contains a missing inverseCommand', async () => {
    seedVisibleHistory();
    harness.state.projectEvents[1] = {
      ...harness.state.projectEvents[1]!,
      inverseCommand: null,
    };

    await assert.rejects(
      () => service.getHistorySnapshot({ projectId: 'project-1', groupId: 'group-1' }),
      (error: unknown) =>
        error instanceof HistoryValidationError
        && error.code === 'validation_error'
        && /inverseCommand/.test(error.message),
    );

    await assert.rejects(
      () => service.restoreToGroup({
        projectId: 'project-1',
        groupId: 'group-1',
        actorType: 'user',
        actorId: 'user-1',
      }),
      (error: unknown) =>
        error instanceof HistoryValidationError
        && error.code === 'validation_error'
        && /inverseCommand/.test(error.message),
    );
  });
});

describe('history contract cleanup', () => {
  it('avoids type shortcuts on the history path', () => {
    assert.doesNotMatch(historyServiceSource, /\bas any\b/);
    assert.doesNotMatch(historyHookSource, /\bas any\b/);
    assert.doesNotMatch(historyApiTypesSource, /\bas any\b/);
  });

  it('keeps legacy undo and redo names out of the public web contract', () => {
    assert.doesNotMatch(historyHookSource, /\bundoGroup\b/);
    assert.doesNotMatch(historyHookSource, /\bredoGroup\b/);
    assert.doesNotMatch(historyHookSource, /\bundoLatest\b/);
    assert.doesNotMatch(historyHookSource, /\bredoable\b/);
    assert.doesNotMatch(historyApiTypesSource, /\bundoGroup\b/);
    assert.doesNotMatch(historyApiTypesSource, /\bredoGroup\b/);
    assert.doesNotMatch(historyApiTypesSource, /\bundoLatest\b/);
    assert.doesNotMatch(historyApiTypesSource, /\bredoable\b/);
  });
});
