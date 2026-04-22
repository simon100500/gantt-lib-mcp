import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, it } from 'node:test';
import type { ProjectSnapshot, Task } from '@gantt/runtime-core/types';
import {
  BaselineService,
  BaselineValidationError,
} from '@gantt/runtime-core/services/baseline.service';
import { HistoryValidationError } from '@gantt/runtime-core/services/history.service';

const compatibilitySource = readFileSync(
  resolve(process.cwd(), 'packages/mcp/src/services/baseline.service.ts'),
  'utf8',
);
const runtimeBaselineSource = readFileSync(
  resolve(process.cwd(), 'packages/runtime-core/src/services/baseline.service.ts'),
  'utf8',
);

function createTask(id: string, name: string, startDate: string, endDate: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    name,
    startDate,
    endDate,
    type: 'task',
    progress: 0,
    sortOrder: 0,
    dependencies: [],
    ...overrides,
  };
}

type BaselineRow = {
  id: string;
  projectId: string;
  name: string;
  source: 'current' | 'history';
  sourceHistoryGroupId: string | null;
  createdAt: Date;
};

type BaselineTaskRow = {
  id: string;
  baselineId: string;
  taskId: string;
  name: string;
  startDate: Date;
  endDate: Date;
  type: 'task' | 'milestone';
  color: string | null;
  progress: number;
  parentId: string | null;
  sortOrder: number;
};

type BaselineDependencyRow = {
  id: string;
  baselineId: string;
  dependencyId: string;
  taskId: string;
  depTaskId: string;
  type: 'FS' | 'SS' | 'FF' | 'SF';
  lag: number;
};

type HarnessState = {
  projectExists: boolean;
  liveSnapshot: ProjectSnapshot;
  historySnapshot: { groupId: string; isCurrent: boolean; currentVersion: number; snapshot: ProjectSnapshot };
  baselines: BaselineRow[];
  baselineTasks: BaselineTaskRow[];
  baselineDependencies: BaselineDependencyRow[];
  historyCalls: Array<{ projectId: string; groupId: string }>;
  txCount: number;
};

function cloneSnapshot(snapshot: ProjectSnapshot): ProjectSnapshot {
  return {
    tasks: snapshot.tasks.map((task) => ({
      ...task,
      dependencies: task.dependencies?.map((dependency) => ({ ...dependency })) ?? [],
    })),
    dependencies: snapshot.dependencies.map((dependency) => ({ ...dependency })),
  };
}

function createHarness(): { prisma: any; state: HarnessState } {
  const liveSnapshot: ProjectSnapshot = {
    tasks: [
      createTask('root', 'Root', '2026-05-01', '2026-05-10', { sortOrder: 0 }),
      createTask('child', 'Child', '2026-05-02', '2026-05-04', { parentId: 'root', sortOrder: 1 }),
      createTask('solo', 'Solo', '2026-05-06', '2026-05-06', { type: 'milestone', sortOrder: 2 }),
    ],
    dependencies: [
      { id: 'dep-1', taskId: 'child', depTaskId: 'root', type: 'FS', lag: 0 },
    ],
  };

  const historySnapshot: ProjectSnapshot = {
    tasks: [
      createTask('root', 'Root', '2026-04-28', '2026-05-07', { sortOrder: 0 }),
      createTask('child', 'Child', '2026-04-29', '2026-05-01', { parentId: 'root', sortOrder: 1 }),
    ],
    dependencies: [],
  };

  const state: HarnessState = {
    projectExists: true,
    liveSnapshot,
    historySnapshot: {
      groupId: 'group-1',
      isCurrent: false,
      currentVersion: 9,
      snapshot: historySnapshot,
    },
    baselines: [],
    baselineTasks: [],
    baselineDependencies: [],
    historyCalls: [],
    txCount: 0,
  };

  const prisma = {
    project: {
      findUnique: async ({ where }: any) => (state.projectExists && where.id === 'project-1' ? { id: 'project-1' } : null),
    },
    task: {
      findMany: async ({ where }: any) => {
        if (where.projectId !== 'project-1') {
          return [];
        }

        return cloneSnapshot(state.liveSnapshot).tasks.map((task) => ({
          id: task.id,
          name: task.name,
          startDate: new Date(`${task.startDate}T00:00:00.000Z`),
          endDate: new Date(`${task.endDate}T00:00:00.000Z`),
          type: task.type ?? 'task',
          color: task.color ?? null,
          progress: task.progress ?? 0,
          parentId: task.parentId ?? null,
          sortOrder: task.sortOrder ?? 0,
          dependencies: (task.dependencies ?? []).map((dependency) => ({
            depTaskId: dependency.taskId,
            type: dependency.type,
            lag: dependency.lag ?? 0,
          })),
        }));
      },
    },
    dependency: {
      findMany: async ({ where }: any) => {
        if (where.task.projectId !== 'project-1') {
          return [];
        }

        return cloneSnapshot(state.liveSnapshot).dependencies.map((dependency) => ({
          id: dependency.id,
          taskId: dependency.taskId,
          depTaskId: dependency.depTaskId,
          type: dependency.type,
          lag: dependency.lag,
        }));
      },
    },
    baseline: {
      findMany: async ({ where }: any) => state.baselines
        .filter((baseline) => baseline.projectId === where.projectId)
        .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime()),
      findFirst: async ({ where }: any) => {
        const baseline = state.baselines.find((candidate) => candidate.id === where.id && candidate.projectId === where.projectId);
        if (!baseline) {
          return null;
        }

        return {
          ...baseline,
          tasks: state.baselineTasks
            .filter((task) => task.baselineId === baseline.id)
            .sort((left, right) => left.sortOrder - right.sortOrder),
          dependencies: state.baselineDependencies
            .filter((dependency) => dependency.baselineId === baseline.id),
        };
      },
      count: async ({ where }: any) => state.baselines.filter((baseline) => baseline.projectId === where.projectId).length,
      create: async ({ data }: any) => {
        const record: BaselineRow = {
          ...data,
          createdAt: new Date(`2026-05-15T12:00:0${state.baselines.length}.000Z`),
        };
        state.baselines.push(record);
        return record;
      },
    },
    baselineTask: {
      createMany: async ({ data }: any) => {
        state.baselineTasks.push(...data);
        return { count: data.length };
      },
    },
    baselineDependency: {
      createMany: async ({ data }: any) => {
        state.baselineDependencies.push(...data);
        return { count: data.length };
      },
    },
    $transaction: async (fn: (tx: any) => Promise<unknown>) => {
      state.txCount += 1;
      const baselineCountBefore = state.baselines.length;
      const taskCountBefore = state.baselineTasks.length;
      const dependencyCountBefore = state.baselineDependencies.length;

      try {
        return await fn(prisma);
      } catch (error) {
        state.baselines.splice(baselineCountBefore);
        state.baselineTasks.splice(taskCountBefore);
        state.baselineDependencies.splice(dependencyCountBefore);
        throw error;
      }
    },
  };

  return { prisma, state };
}

describe('BaselineService', () => {
  let harness: { prisma: any; state: HarnessState };
  let service: BaselineService;

  beforeEach(() => {
    harness = createHarness();
    service = new BaselineService({
      prisma: harness.prisma,
      historyService: {
        getHistorySnapshot: async ({ projectId, groupId }) => {
          harness.state.historyCalls.push({ projectId, groupId });
          if (groupId === 'missing-group') {
            throw new HistoryValidationError('Visible history group missing-group was not found');
          }
          if (groupId === 'malformed-group') {
            return {
              groupId,
              isCurrent: false,
              currentVersion: 1,
              snapshot: { tasks: undefined as unknown as Task[], dependencies: [] },
            };
          }
          return {
            groupId: harness.state.historySnapshot.groupId,
            isCurrent: harness.state.historySnapshot.isCurrent,
            currentVersion: harness.state.historySnapshot.currentVersion,
            snapshot: cloneSnapshot(harness.state.historySnapshot.snapshot),
          };
        },
      },
    });
  });

  it('creates, lists, and reads baselines copied from the current live snapshot', async () => {
    const created = await service.createFromCurrent({ projectId: 'project-1', name: 'Current baseline' });
    const listed = await service.listBaselines({ projectId: 'project-1' });
    const loaded = await service.getBaseline({ projectId: 'project-1', baselineId: created.id });

    assert.equal(harness.state.txCount, 1);
    assert.equal(created.name, 'Current baseline');
    assert.equal(created.source, 'current');
    assert.equal(created.sourceHistoryGroupId, null);
    assert.equal(created.snapshot.tasks.length, 3);
    assert.equal(created.snapshot.tasks[1]?.parentId, 'root');
    assert.equal(created.snapshot.dependencies.length, 1);
    assert.equal(listed.baselines.length, 1);
    assert.equal(listed.baselines[0]?.id, created.id);
    assert.deepEqual(loaded.snapshot, created.snapshot);
  });

  it('creates baselines from history via HistoryService.getHistorySnapshot and persists source metadata', async () => {
    const created = await service.createFromHistory({
      projectId: 'project-1',
      historyGroupId: 'group-1',
      name: 'Historical baseline',
    });

    assert.deepEqual(harness.state.historyCalls, [{ projectId: 'project-1', groupId: 'group-1' }]);
    assert.equal(created.source, 'history');
    assert.equal(created.sourceHistoryGroupId, 'group-1');
    assert.equal(created.snapshot.tasks.length, 2);
    assert.equal(created.snapshot.dependencies.length, 0);
    assert.match(runtimeBaselineSource, /getHistorySnapshot\(historyInput\)/);
    assert.doesNotMatch(runtimeBaselineSource, /projectEvent\.findMany\(/);
    assert.doesNotMatch(runtimeBaselineSource, /mutationGroup\.findMany\(/);
  });

  it('keeps persisted baselines immutable after later live mutations', async () => {
    const created = await service.createFromCurrent({ projectId: 'project-1', name: 'Frozen baseline' });

    harness.state.liveSnapshot.tasks[0] = {
      ...harness.state.liveSnapshot.tasks[0]!,
      startDate: '2026-06-01',
      endDate: '2026-06-10',
      name: 'Root moved',
    };
    harness.state.liveSnapshot.dependencies.push({
      id: 'dep-2',
      taskId: 'solo',
      depTaskId: 'child',
      type: 'SS',
      lag: 1,
    });

    const loaded = await service.getBaseline({ projectId: 'project-1', baselineId: created.id });

    assert.equal(loaded.snapshot.tasks[0]?.startDate, '2026-05-01');
    assert.equal(loaded.snapshot.tasks[0]?.name, 'Root');
    assert.equal(loaded.snapshot.dependencies.length, 1);
  });

  it('supports multiple baselines per project and returns newest first', async () => {
    const current = await service.createFromCurrent({ projectId: 'project-1', name: 'Current' });
    const historical = await service.createFromHistory({ projectId: 'project-1', historyGroupId: 'group-1', name: 'Historical' });

    const listed = await service.listBaselines({ projectId: 'project-1' });

    assert.equal(listed.baselines.length, 2);
    assert.equal(listed.baselines[0]?.id, historical.id);
    assert.equal(listed.baselines[1]?.id, current.id);
  });

  it('rejects malformed inputs and unknown ids with typed validation errors', async () => {
    await assert.rejects(
      () => service.createFromCurrent({ projectId: 'project-1', name: '   ' }),
      (error: unknown) => error instanceof BaselineValidationError && error.code === 'validation_error',
    );

    await assert.rejects(
      () => service.getBaseline({ projectId: 'project-1', baselineId: 'missing-baseline' }),
      (error: unknown) => error instanceof BaselineValidationError && /missing-baseline/.test((error as Error).message),
    );

    await assert.rejects(
      () => service.createFromHistory({ projectId: 'project-1', historyGroupId: 'missing-group', name: 'Invalid history' }),
      (error: unknown) => error instanceof HistoryValidationError && error.code === 'validation_error',
    );
  });

  it('rolls back partial writes when baseline snapshot persistence fails', async () => {
    harness.prisma.baselineTask.createMany = async () => {
      throw new BaselineValidationError('task snapshot insert failed');
    };

    await assert.rejects(
      () => service.createFromCurrent({ projectId: 'project-1', name: 'Broken baseline' }),
      (error: unknown) => error instanceof BaselineValidationError && /insert failed/.test((error as Error).message),
    );

    assert.equal(harness.state.baselines.length, 0);
    assert.equal(harness.state.baselineTasks.length, 0);
    assert.equal(harness.state.baselineDependencies.length, 0);
  });

  it('rejects malformed history snapshots instead of persisting partial baseline rows', async () => {
    await assert.rejects(
      () => service.createFromHistory({ projectId: 'project-1', historyGroupId: 'malformed-group', name: 'Broken history' }),
      (error: unknown) => error instanceof BaselineValidationError && /malformed/.test((error as Error).message),
    );

    assert.equal(harness.state.baselines.length, 0);
    assert.equal(harness.state.baselineTasks.length, 0);
    assert.equal(harness.state.baselineDependencies.length, 0);
  });
});

describe('baseline compatibility contract', () => {
  it('keeps the mcp compatibility export pointed at runtime-core', () => {
    assert.match(compatibilitySource, /@gantt\/runtime-core\/services\/baseline.service/);
  });
});
