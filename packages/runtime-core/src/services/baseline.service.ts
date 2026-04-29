import { randomUUID } from 'node:crypto';
import { getPrisma } from '../prisma.js';
import type {
  BaselineMetadata,
  BaselineSnapshot,
  CreateBaselineFromCurrentInput,
  CreateBaselineFromHistoryInput,
  DeleteBaselineInput,
  DeleteBaselineResponse,
  DependencyType,
  GetBaselineInput,
  ListBaselinesInput,
  ListBaselinesResponse,
  ProjectSnapshot,
  Task,
  TaskType,
  UpdateBaselineInput,
} from '../types.js';
import { HistoryService, HistoryValidationError, historyService, type GetHistorySnapshotInput } from './history.service.js';
import { dateToDomain, domainToDate } from './types.js';
import type { PrismaClient } from '../prisma.js';

export class BaselineValidationError extends Error {
  readonly code = 'validation_error';

  constructor(message: string) {
    super(message);
    this.name = 'BaselineValidationError';
  }
}

type BaselineSource = 'current' | 'history';

type BaselineTaskRow = {
  id: string;
  baselineId: string;
  taskId: string;
  name: string;
  startDate: Date;
  endDate: Date;
  type: string | null;
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
  type: string;
  lag: number | null;
};

type BaselineRecord = {
  id: string;
  projectId: string;
  name: string;
  source: BaselineSource;
  sourceHistoryGroupId: string | null;
  createdAt: Date;
};

type BaselineWithSnapshotRows = BaselineRecord & {
  tasks: BaselineTaskRow[];
  dependencies: BaselineDependencyRow[];
};

type BaselinePrismaClient = {
  project: {
    findUnique(args: {
      where: { id: string };
      select: { id: true };
    }): Promise<{ id: string } | null>;
  };
  task: {
    findMany(args: {
      where: { projectId: string };
      include: { dependencies: true };
      orderBy: { sortOrder: 'asc' };
    }): Promise<Array<{
      id: string;
      name: string;
      startDate: Date;
      endDate: Date;
      type: string | null;
      color: string | null;
      progress: number;
      parentId: string | null;
      sortOrder: number;
      dependencies: Array<{
        depTaskId: string;
        type: string;
        lag: number | null;
      }>;
    }>>;
  };
  dependency: {
    findMany(args: {
      where: { task: { projectId: string } };
      select: { id: true; taskId: true; depTaskId: true; type: true; lag: true };
    }): Promise<Array<{
      id: string;
      taskId: string;
      depTaskId: string;
      type: string;
      lag: number | null;
    }>>;
  };
  baseline: {
    findMany(args: {
      where: { projectId: string };
      orderBy: { createdAt: 'desc' };
    }): Promise<BaselineRecord[]>;
    findFirst(args: {
      where: { id: string; projectId: string };
      include: { tasks: { orderBy: { sortOrder: 'asc' } }; dependencies: true };
    }): Promise<BaselineWithSnapshotRows | null>;
    count(args: { where: { projectId: string } }): Promise<number>;
    create(args: {
      data: {
        id: string;
        projectId: string;
        name: string;
        source: BaselineSource;
        sourceHistoryGroupId: string | null;
      };
    }): Promise<BaselineRecord>;
    update(args: {
      where: { id: string };
      data: { name: string };
    }): Promise<BaselineRecord>;
    delete(args: {
      where: { id: string };
    }): Promise<BaselineRecord>;
  };
  baselineTask: {
    createMany(args: {
      data: Array<{
        id: string;
        baselineId: string;
        taskId: string;
        name: string;
        startDate: Date;
        endDate: Date;
        type: TaskType;
        color: string | null;
        progress: number;
        parentId: string | null;
        sortOrder: number;
      }>;
    }): Promise<{ count: number }>;
  };
  baselineDependency: {
    createMany(args: {
      data: Array<{
        id: string;
        baselineId: string;
        dependencyId: string;
        taskId: string;
        depTaskId: string;
        type: DependencyType;
        lag: number;
      }>;
    }): Promise<{ count: number }>;
  };
  $transaction?<T>(fn: (tx: BaselinePrismaClient) => Promise<T>): Promise<T>;
};

type HistoryServiceLike = Pick<HistoryService, 'getHistorySnapshot'>;

type BaselineServiceDeps = {
  prisma?: BaselinePrismaClient;
  historyService?: HistoryServiceLike;
};

function adaptPrismaClient(prisma: PrismaClient): BaselinePrismaClient {
  return prisma as unknown as BaselinePrismaClient;
}

function toTaskType(value: string | null | undefined): TaskType {
  return value === 'milestone' ? 'milestone' : 'task';
}

function toDependencyType(value: string): DependencyType {
  switch (value) {
    case 'FS':
    case 'SS':
    case 'FF':
    case 'SF':
      return value;
    default:
      throw new BaselineValidationError(`Unsupported dependency type \"${value}\" in persisted baseline`);
  }
}

function toBaselineMetadata(record: BaselineRecord): BaselineMetadata {
  return {
    id: record.id,
    projectId: record.projectId,
    name: record.name,
    source: record.source,
    sourceHistoryGroupId: record.sourceHistoryGroupId,
    createdAt: record.createdAt.toISOString(),
  };
}

function assertProjectId(projectId: string): void {
  if (!projectId.trim()) {
    throw new BaselineValidationError('projectId is required');
  }
}

function assertBaselineName(name: string): void {
  if (!name.trim()) {
    throw new BaselineValidationError('Baseline name is required');
  }
}

function assertBaselineId(baselineId: string): void {
  if (!baselineId.trim()) {
    throw new BaselineValidationError('baselineId is required');
  }
}

function assertHistoryGroupId(historyGroupId: string): void {
  if (!historyGroupId.trim()) {
    throw new BaselineValidationError('historyGroupId is required');
  }
}

function validateSnapshot(snapshot: ProjectSnapshot): ProjectSnapshot {
  if (!snapshot || !Array.isArray(snapshot.tasks) || !Array.isArray(snapshot.dependencies)) {
    throw new BaselineValidationError('Snapshot payload is malformed');
  }

  return {
    tasks: snapshot.tasks.map((task) => ({
      ...task,
      type: toTaskType(task.type),
      progress: task.progress ?? 0,
      dependencies: (task.dependencies ?? []).map((dependency) => ({
        taskId: dependency.taskId,
        type: toDependencyType(dependency.type),
        lag: dependency.lag ?? 0,
      })),
      sortOrder: task.sortOrder ?? 0,
    })),
    dependencies: snapshot.dependencies.map((dependency) => ({
      id: dependency.id,
      taskId: dependency.taskId,
      depTaskId: dependency.depTaskId,
      type: toDependencyType(dependency.type),
      lag: dependency.lag ?? 0,
    })),
  };
}

async function buildCurrentProjectSnapshot(
  projectId: string,
  prismaClient: BaselinePrismaClient,
): Promise<ProjectSnapshot> {
  const [tasks, dependencies] = await Promise.all([
    prismaClient.task.findMany({
      where: { projectId },
      include: { dependencies: true },
      orderBy: { sortOrder: 'asc' },
    }),
    prismaClient.dependency.findMany({
      where: { task: { projectId } },
      select: { id: true, taskId: true, depTaskId: true, type: true, lag: true },
    }),
  ]);

  return validateSnapshot({
    tasks: tasks.map((task): Task => ({
      id: task.id,
      name: task.name,
      startDate: dateToDomain(task.startDate),
      endDate: dateToDomain(task.endDate),
      type: toTaskType(task.type),
      color: task.color ?? undefined,
      parentId: task.parentId ?? undefined,
      progress: task.progress,
      dependencies: task.dependencies.map((dependency) => ({
        taskId: dependency.depTaskId,
        type: toDependencyType(dependency.type),
        lag: dependency.lag ?? 0,
      })),
      sortOrder: task.sortOrder,
    })),
    dependencies: dependencies.map((dependency) => ({
      id: dependency.id,
      taskId: dependency.taskId,
      depTaskId: dependency.depTaskId,
      type: toDependencyType(dependency.type),
      lag: dependency.lag ?? 0,
    })),
  });
}

export class BaselineService {
  private _prisma?: BaselinePrismaClient;
  private readonly historyService: HistoryServiceLike;

  constructor(deps: BaselineServiceDeps = {}) {
    this._prisma = deps.prisma;
    this.historyService = deps.historyService ?? historyService;
  }

  private get prisma(): BaselinePrismaClient {
    if (!this._prisma) {
      this._prisma = adaptPrismaClient(getPrisma());
    }

    return this._prisma;
  }

  private async assertProjectExists(projectId: string, prismaClient: BaselinePrismaClient): Promise<void> {
    const project = await prismaClient.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });

    if (!project) {
      throw new BaselineValidationError(`Project ${projectId} was not found`);
    }
  }

  private toSnapshot(record: BaselineWithSnapshotRows): BaselineSnapshot {
    return {
      ...toBaselineMetadata(record),
      snapshot: validateSnapshot({
        tasks: record.tasks.map((task) => ({
          id: task.taskId,
          name: task.name,
          startDate: dateToDomain(task.startDate),
          endDate: dateToDomain(task.endDate),
          type: toTaskType(task.type),
          color: task.color ?? undefined,
          parentId: task.parentId ?? undefined,
          progress: task.progress,
          sortOrder: task.sortOrder,
          dependencies: [],
        })),
        dependencies: record.dependencies.map((dependency) => ({
          id: dependency.dependencyId,
          taskId: dependency.taskId,
          depTaskId: dependency.depTaskId,
          type: toDependencyType(dependency.type),
          lag: dependency.lag ?? 0,
        })),
      }),
    };
  }

  private async persistBaseline(
    prismaClient: BaselinePrismaClient,
    params: {
      projectId: string;
      name: string;
      source: BaselineSource;
      sourceHistoryGroupId: string | null;
      snapshot: ProjectSnapshot;
    },
  ): Promise<BaselineSnapshot> {
    const snapshot = validateSnapshot(params.snapshot);
    const baseline = await prismaClient.baseline.create({
      data: {
        id: randomUUID(),
        projectId: params.projectId,
        name: params.name.trim(),
        source: params.source,
        sourceHistoryGroupId: params.sourceHistoryGroupId,
      },
    });

    if (snapshot.tasks.length > 0) {
      await prismaClient.baselineTask.createMany({
        data: snapshot.tasks.map((task) => ({
          id: randomUUID(),
          baselineId: baseline.id,
          taskId: task.id,
          name: task.name,
          startDate: domainToDate(task.startDate),
          endDate: domainToDate(task.endDate),
          type: toTaskType(task.type),
          color: task.color ?? null,
          progress: task.progress ?? 0,
          parentId: task.parentId ?? null,
          sortOrder: task.sortOrder ?? 0,
        })),
      });
    }

    if (snapshot.dependencies.length > 0) {
      await prismaClient.baselineDependency.createMany({
        data: snapshot.dependencies.map((dependency) => ({
          id: randomUUID(),
          baselineId: baseline.id,
          dependencyId: dependency.id,
          taskId: dependency.taskId,
          depTaskId: dependency.depTaskId,
          type: toDependencyType(dependency.type),
          lag: dependency.lag ?? 0,
        })),
      });
    }

    const persisted = await prismaClient.baseline.findFirst({
      where: { id: baseline.id, projectId: params.projectId },
      include: {
        tasks: { orderBy: { sortOrder: 'asc' } },
        dependencies: true,
      },
    });

    if (!persisted) {
      throw new Error(`Baseline ${baseline.id} was not persisted`);
    }

    return this.toSnapshot(persisted);
  }

  async listBaselines({ projectId }: ListBaselinesInput): Promise<ListBaselinesResponse> {
    assertProjectId(projectId);
    await this.assertProjectExists(projectId, this.prisma);

    const baselines = await this.prisma.baseline.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });

    return {
      baselines: baselines.map((baseline) => toBaselineMetadata(baseline)),
    };
  }

  async getBaseline({ projectId, baselineId }: GetBaselineInput): Promise<BaselineSnapshot> {
    assertProjectId(projectId);
    assertBaselineId(baselineId);

    const baseline = await this.prisma.baseline.findFirst({
      where: { id: baselineId, projectId },
      include: {
        tasks: { orderBy: { sortOrder: 'asc' } },
        dependencies: true,
      },
    });

    if (!baseline) {
      throw new BaselineValidationError(`Baseline ${baselineId} was not found`);
    }

    return this.toSnapshot(baseline);
  }

  async createFromCurrent({ projectId, name }: CreateBaselineFromCurrentInput): Promise<BaselineSnapshot> {
    assertProjectId(projectId);
    assertBaselineName(name);

    const run = async (prismaClient: BaselinePrismaClient): Promise<BaselineSnapshot> => {
      await this.assertProjectExists(projectId, prismaClient);
      const snapshot = await buildCurrentProjectSnapshot(projectId, prismaClient);
      return this.persistBaseline(prismaClient, {
        projectId,
        name,
        source: 'current',
        sourceHistoryGroupId: null,
        snapshot,
      });
    };

    return this.prisma.$transaction ? this.prisma.$transaction((tx) => run(tx)) : run(this.prisma);
  }

  async createFromHistory({ projectId, historyGroupId, name }: CreateBaselineFromHistoryInput): Promise<BaselineSnapshot> {
    assertProjectId(projectId);
    assertHistoryGroupId(historyGroupId);
    assertBaselineName(name);

    const historyInput: GetHistorySnapshotInput = { projectId, groupId: historyGroupId };
    let historySnapshot: Awaited<ReturnType<HistoryServiceLike['getHistorySnapshot']>>;

    try {
      historySnapshot = await this.historyService.getHistorySnapshot(historyInput);
    } catch (error) {
      if (error instanceof HistoryValidationError) {
        throw error;
      }
      throw error;
    }

    const run = async (prismaClient: BaselinePrismaClient): Promise<BaselineSnapshot> => {
      await this.assertProjectExists(projectId, prismaClient);
      return this.persistBaseline(prismaClient, {
        projectId,
        name,
        source: 'history',
        sourceHistoryGroupId: historySnapshot.groupId,
        snapshot: validateSnapshot(historySnapshot.snapshot),
      });
    };

    return this.prisma.$transaction ? this.prisma.$transaction((tx) => run(tx)) : run(this.prisma);
  }

  async deleteBaseline({ projectId, baselineId }: DeleteBaselineInput): Promise<DeleteBaselineResponse> {
    assertProjectId(projectId);
    assertBaselineId(baselineId);

    const run = async (prismaClient: BaselinePrismaClient): Promise<DeleteBaselineResponse> => {
      await this.assertProjectExists(projectId, prismaClient);

      const baseline = await prismaClient.baseline.findFirst({
        where: { id: baselineId, projectId },
        include: {
          tasks: { orderBy: { sortOrder: 'asc' } },
          dependencies: true,
        },
      });

      if (!baseline) {
        throw new BaselineValidationError(`Baseline ${baselineId} was not found`);
      }

      const deleted = await prismaClient.baseline.delete({
        where: { id: baseline.id },
      });

      return { id: deleted.id };
    };

    return this.prisma.$transaction ? this.prisma.$transaction((tx) => run(tx)) : run(this.prisma);
  }

  async updateBaseline({ projectId, baselineId, name }: UpdateBaselineInput): Promise<BaselineSnapshot> {
    assertProjectId(projectId);
    assertBaselineId(baselineId);
    assertBaselineName(name);

    const run = async (prismaClient: BaselinePrismaClient): Promise<BaselineSnapshot> => {
      await this.assertProjectExists(projectId, prismaClient);

      const baseline = await prismaClient.baseline.findFirst({
        where: { id: baselineId, projectId },
        include: {
          tasks: { orderBy: { sortOrder: 'asc' } },
          dependencies: true,
        },
      });

      if (!baseline) {
        throw new BaselineValidationError(`Baseline ${baselineId} was not found`);
      }

      await prismaClient.baseline.update({
        where: { id: baseline.id },
        data: { name: name.trim() },
      });

      const updated = await prismaClient.baseline.findFirst({
        where: { id: baseline.id, projectId },
        include: {
          tasks: { orderBy: { sortOrder: 'asc' } },
          dependencies: true,
        },
      });

      if (!updated) {
        throw new BaselineValidationError(`Baseline ${baselineId} was not found after update`);
      }

      return this.toSnapshot(updated);
    };

    return this.prisma.$transaction ? this.prisma.$transaction((tx) => run(tx)) : run(this.prisma);
  }
}

export const baselineService = new BaselineService();
