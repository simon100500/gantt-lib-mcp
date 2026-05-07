/**
 * CommandService — authoritative command commit path
 *
 * Accepts typed ProjectCommand, executes through gantt-lib/core/scheduling,
 * persists results atomically (version bump + event log + task updates),
 * returns authoritative CommitProjectCommandResponse.
 *
 * Per D-06, D-07, D-09: one authoritative commit path with optimistic concurrency,
 * event log, and atomic transactions. Server-confirmed version is the single
 * truth boundary.
 */

import {
  buildTaskRangeFromEnd,
  buildTaskRangeFromStart,
  getTaskDuration,
  moveTaskWithCascade,
  resizeTaskWithCascade,
  recalculateTaskFromDependencies,
  recalculateProjectSchedule,
  parseDateOnly,
  reflowTasksOnModeSwitch,
  type ScheduleCommandResult as CoreResult,
  type ScheduleCommandOptions as CoreOptions,
  type Task as CoreTask,
} from 'gantt-lib/core/scheduling';
import { getPrisma, Prisma } from '../prisma.js';
import type {
  ProjectCommand,
  CommitProjectCommandRequest,
  CommitProjectCommandResponse,
  ScheduleExecutionResult,
  ProjectSnapshot,
  Patch,
  Conflict,
  ActorType,
  Task,
  TaskDependency,
  DependencyType,
  HistoryGroupContext,
  JsonValue,
  ProjectEventInverseCommand,
} from '../types.js';
import { dateToDomain, domainToDate } from './types.js';
import { randomUUID } from 'node:crypto';
import { getProjectScheduleOptionsForDayMode, getProjectScheduleOptionsForProject } from './projectScheduleOptions.js';
import { normalizeStoredTaskStatus, synchronizeTaskStatus } from './task-status.js';

const CORE_VERSION = '0.70.0';
const INTERACTIVE_TRANSACTION_OPTIONS = {
  maxWait: 10_000,
  timeout: 60_000,
} as const;
const PrismaCompat = Prisma as unknown as {
  PrismaClientKnownRequestError: new (...args: any[]) => { code?: string };
  join: (values: unknown[]) => unknown;
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => unknown;
  DbNull: unknown;
};

function normalizeTaskDatesForType<TTask extends { startDate: string | Date; endDate: string | Date; type?: 'task' | 'milestone' }>(task: TTask): TTask {
  if ((task.type ?? 'task') !== 'milestone') {
    return task;
  }

  return {
    ...task,
    endDate: task.startDate,
  };
}

function shiftDateOnly(value: string | Date, deltaDays: number): string {
  const date = value instanceof Date
    ? new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()))
    : parseDateOnly(value);
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return date.toISOString().split('T')[0];
}

function isVersionBumpRace(error: unknown): boolean {
  return error instanceof PrismaCompat.PrismaClientKnownRequestError && error.code === 'P2025';
}

type CommitTimingKey =
  | 'loadProjectMs'
  | 'loadSnapshotMs'
  | 'executeCommandMs'
  | 'persistDepsMs'
  | 'persistTasksMs'
  | 'bumpVersionMs'
  | 'createEventMs'
  | 'buildSnapshotMs';

type CommitTimings = Partial<Record<CommitTimingKey, number>> & { totalMs?: number };

function shouldReturnSnapshot(command: ProjectCommand, includeSnapshot?: boolean): boolean {
  if (includeSnapshot) {
    return true;
  }

  return command.type === 'create_tasks_batch'
    || command.type === 'create_task'
    || command.type === 'delete_task'
    || command.type === 'delete_tasks'
    || command.type === 'switch_gantt_day_mode';
}

function isSimpleTaskFieldUpdate(command: ProjectCommand): command is Extract<ProjectCommand, { type: 'update_task_fields' }> {
  return command.type === 'update_task_fields'
    && command.fields.parentId === undefined
    && command.fields.type === undefined
    && command.fields.dependencies === undefined;
}

/** Normalize MCP Task[] to gantt-lib-compatible Task[].
 *  Fills lag: 0 where undefined so gantt-lib strict types are satisfied. */
function normalizeSnapshot(tasks: Task[]): CoreTask[] {
  return tasks.map(t => ({
    ...normalizeTaskDatesForType({
      ...t,
      type: t.type ?? 'task',
    }),
    dependencies: t.dependencies?.map(d => ({
      ...d,
      lag: d.lag ?? 0,
    })),
  }));
}

/** Load project's ganttDayMode and build scheduling options */
async function getScheduleOptions(projectId: string, prisma: any): Promise<CoreOptions> {
  return getProjectScheduleOptionsForProject(prisma, projectId);
}

/** Load all tasks + dependencies for a project, return as Task[] */
function taskRowToSnapshotTask(task: any): Task {
  const deps: TaskDependency[] = task.dependencies.map((d: any) => ({
    taskId: d.depTaskId,
    type: d.type as DependencyType,
    lag: d.lag,
  }));
  return {
    id: task.id,
    name: task.name,
    startDate: dateToDomain(task.startDate),
    endDate: dateToDomain(task.endDate),
    type: task.type ?? 'task',
    color: task.color || undefined,
    parentId: task.parentId || undefined,
    status: normalizeStoredTaskStatus(task.status),
    progress: task.progress,
    workVolume: task.workVolume ?? null,
    workUnit: task.workUnit ?? null,
    completedVolume: task.completedVolume ?? 0,
    dependencies: deps,
    sortOrder: task.sortOrder,
  };
}

function applyTaskStatusSync(task: Task, currentTask?: Partial<Task>): Task {
  const synced = synchronizeTaskStatus({
    currentStatus: currentTask?.status ?? task.status,
    currentProgress: currentTask?.progress ?? task.progress,
    currentWorkVolume: currentTask?.workVolume ?? task.workVolume ?? null,
    currentCompletedVolume: currentTask?.completedVolume ?? task.completedVolume ?? 0,
    nextStatus: task.status,
    nextProgress: task.progress,
    nextWorkVolume: task.workVolume ?? null,
    nextCompletedVolume: task.completedVolume ?? 0,
  });

  return {
    ...task,
    status: synced.status,
    progress: synced.progress,
    completedVolume: synced.completedVolume,
  };
}

function todayEntryDate(): Date {
  return new Date(`${new Date().toISOString().split('T')[0]}T00:00:00.000Z`);
}

async function syncTaskProgressEntriesToCompletedVolume(
  prismaClient: any,
  projectId: string,
  taskId: string,
  targetCompletedVolume: number,
): Promise<void> {
  const aggregate = await prismaClient.taskProgressEntry.aggregate({
    where: { projectId, taskId },
    _sum: { amount: true },
  });
  const currentCompletedVolume = aggregate._sum.amount ?? 0;
  const delta = targetCompletedVolume - currentCompletedVolume;
  if (Math.abs(delta) < 0.000001) {
    return;
  }

  const entryDate = todayEntryDate();
  const existingEntry = await prismaClient.taskProgressEntry.findUnique({
    where: {
      taskId_entryDate: {
        taskId,
        entryDate,
      },
    },
  });

  if (existingEntry) {
    await prismaClient.taskProgressEntry.update({
      where: { id: existingEntry.id },
      data: { amount: existingEntry.amount + delta },
    });
    return;
  }

  await prismaClient.taskProgressEntry.create({
    data: {
      id: randomUUID(),
      projectId,
      taskId,
      entryDate,
      amount: delta,
    },
  });
}

async function loadTaskSnapshot(projectId: string, prismaClient: any): Promise<Task[]> {
  const tasks = await prismaClient.task.findMany({
    where: { projectId },
    include: { dependencies: true },
    orderBy: { sortOrder: 'asc' },
  });

  return tasks.map(taskRowToSnapshotTask);
}

/** Load all dependency rows for a project */
async function loadDependencyRows(projectId: string, prismaClient: any): Promise<ProjectSnapshot['dependencies']> {
  const rows = await prismaClient.dependency.findMany({
    where: { task: { projectId } },
    select: { id: true, taskId: true, depTaskId: true, type: true, lag: true },
  });
  return rows.map((r: any) => ({
    id: r.id,
    taskId: r.taskId,
    depTaskId: r.depTaskId,
    type: r.type as DependencyType,
    lag: r.lag,
  }));
}

/** Build a full ProjectSnapshot from DB */
async function buildProjectSnapshot(projectId: string, prismaClient: any): Promise<ProjectSnapshot> {
  const [tasks, dependencies] = await Promise.all([
    loadTaskSnapshot(projectId, prismaClient),
    loadDependencyRows(projectId, prismaClient),
  ]);
  return { tasks, dependencies };
}

/** Compute patches by comparing before/after snapshots for changed task IDs */
function computePatches(
  beforeTasks: Task[],
  afterTasks: Task[],
  changedIds: string[],
  targetTaskId: string | undefined,
): Patch[] {
  const beforeById = new Map(beforeTasks.map(t => [t.id, t]));
  const afterById = new Map(afterTasks.map(t => [t.id, t]));

  const patches: Patch[] = [];

  // Determine parent IDs (tasks that have children)
  const parentIds = new Set<string>();
  for (const t of afterTasks) {
    if (t.parentId) parentIds.add(t.parentId);
  }

  for (const id of changedIds) {
    const before = beforeById.get(id);
    const after = afterById.get(id);
    if (!before || !after) continue;

    // Check if dates actually changed
    if (before.startDate === after.startDate && before.endDate === after.endDate) continue;

    let reason: Patch['reason'];
    if (id === targetTaskId) {
      reason = 'direct_command';
    } else if (parentIds.has(id)) {
      reason = 'parent_rollup';
    } else {
      reason = 'dependency_cascade';
    }

    patches.push({
      entityType: 'task',
      entityId: id,
      before: { startDate: before.startDate, endDate: before.endDate },
      after: { startDate: after.startDate, endDate: after.endDate },
      reason,
    });
  }

  return patches;
}

function cloneTaskForSnapshot(task: Task): Task {
  return {
    ...task,
    dependencies: task.dependencies?.map((dependency) => ({ ...dependency })),
  };
}

function buildAfterTasksSnapshot(
  beforeTasks: Task[],
  executeResult: CommandExecutionResult,
): Task[] {
  const taskMap = new Map(beforeTasks.map((task) => [task.id, cloneTaskForSnapshot(task)]));
  const deletedTaskIds = new Set(
    executeResult.taskChanges
      .filter((taskChange) => taskChange.action === 'delete' && taskChange.taskId)
      .map((taskChange) => taskChange.taskId as string),
  );

  for (const taskId of deletedTaskIds) {
    taskMap.delete(taskId);
  }

  for (const task of executeResult.changedTasks) {
    if (!deletedTaskIds.has(task.id)) {
      taskMap.set(task.id, cloneTaskForSnapshot(task as Task));
    }
  }

  for (const taskChange of executeResult.taskChanges) {
    if (taskChange.action === 'create' && taskChange.task) {
      taskMap.set(taskChange.task.id, cloneTaskForSnapshot(taskChange.task));
    }
  }

  for (const taskChange of executeResult.taskChanges) {
    if (taskChange.action === 'update_parent' && taskChange.taskId) {
      const task = taskMap.get(taskChange.taskId);
      if (task) {
        taskMap.set(taskChange.taskId, {
          ...task,
          parentId: taskChange.newParentId ?? undefined,
        });
      }
    }

    if (taskChange.action === 'update_sort' && taskChange.taskId && taskChange.sortOrder !== undefined) {
      const task = taskMap.get(taskChange.taskId);
      if (task) {
        taskMap.set(taskChange.taskId, {
          ...task,
          sortOrder: taskChange.sortOrder,
        });
      }
    }
  }

  return [...taskMap.values()].sort((left, right) => {
    const leftSort = left.sortOrder ?? Number.MAX_SAFE_INTEGER;
    const rightSort = right.sortOrder ?? Number.MAX_SAFE_INTEGER;
    if (leftSort !== rightSort) {
      return leftSort - rightSort;
    }
    return left.id.localeCompare(right.id);
  });
}

async function syncTaskDependencies(prismaClient: any, taskId: string, dependencies: TaskDependency[] | undefined): Promise<void> {
  await prismaClient.dependency.deleteMany({
    where: { taskId },
  });

  if (!dependencies || dependencies.length === 0) {
    return;
  }

  await prismaClient.dependency.createMany({
    data: dependencies.map((dependency) => ({
      id: randomUUID(),
      taskId,
      depTaskId: dependency.taskId,
      type: dependency.type,
      lag: dependency.lag ?? 0,
    })),
  });
}

function normalizeDependencySet(dependencies: TaskDependency[] | undefined): string[] {
  return (dependencies ?? [])
    .map((dependency) => `${dependency.taskId}|${dependency.type}|${dependency.lag ?? 0}`)
    .sort();
}

function dependenciesChanged(before: TaskDependency[] | undefined, after: TaskDependency[] | undefined): boolean {
  const beforeSet = normalizeDependencySet(before);
  const afterSet = normalizeDependencySet(after);

  if (beforeSet.length !== afterSet.length) {
    return true;
  }

  return beforeSet.some((value, index) => value !== afterSet[index]);
}

async function bulkUpdateTaskSortOrders(
  prismaClient: any,
  projectId: string,
  updates: Array<{ taskId: string; sortOrder: number }>,
): Promise<void> {
  if (updates.length === 0) {
    return;
  }

  const valueRows = PrismaCompat.join(
    updates.map((update) => PrismaCompat.sql`(${update.taskId}, ${update.sortOrder})`),
  );

  await prismaClient.$executeRaw(PrismaCompat.sql`
    UPDATE "tasks" AS t
    SET "sort_order" = v.sort_order
    FROM (VALUES ${valueRows}) AS v(id, sort_order)
    WHERE t."id" = v.id
      AND t."project_id" = ${projectId}
  `);
}

async function bulkUpdateTaskParents(
  prismaClient: any,
  projectId: string,
  updates: Array<{ taskId: string; parentId: string }>,
): Promise<void> {
  if (updates.length === 0) {
    return;
  }

  const valueRows = PrismaCompat.join(
    updates.map((update) => PrismaCompat.sql`(${update.taskId}, ${update.parentId})`),
  );

  await prismaClient.$executeRaw(PrismaCompat.sql`
    UPDATE "tasks" AS t
    SET "parent_id" = v.parent_id
    FROM (VALUES ${valueRows}) AS v(id, parent_id)
    WHERE t."id" = v.id
      AND t."project_id" = ${projectId}
  `);
}

function applyTaskFieldUpdateToSnapshot(
  snapshot: CoreTask[],
  update: Extract<ProjectCommand, { type: 'update_task_fields' }>,
  opts: CoreOptions,
): CoreResult {
  const task = snapshot.find((candidate) => candidate.id === update.taskId);
  if (!task) {
    return { changedTasks: [], changedIds: [] };
  }

  const updatedTask: CoreTask = {
    ...task,
    ...(update.fields.name !== undefined ? { name: update.fields.name } : {}),
    ...(update.fields.type !== undefined ? { type: update.fields.type } : {}),
    ...(update.fields.color !== undefined ? { color: update.fields.color ?? undefined } : {}),
    ...(update.fields.parentId !== undefined ? { parentId: update.fields.parentId ?? undefined } : {}),
    ...(update.fields.status !== undefined ? { status: update.fields.status } : {}),
    ...(update.fields.progress !== undefined ? { progress: update.fields.progress } : {}),
    ...(update.fields.workVolume !== undefined ? { workVolume: update.fields.workVolume } : {}),
    ...(update.fields.workUnit !== undefined ? { workUnit: update.fields.workUnit } : {}),
    ...(update.fields.completedVolume !== undefined ? { completedVolume: update.fields.completedVolume } : {}),
    ...(update.fields.dependencies !== undefined
      ? {
          dependencies: update.fields.dependencies.map((dependency) => ({
            ...dependency,
            lag: dependency.lag ?? 0,
          })),
        }
      : {}),
  };
  const syncedUpdatedTask = applyTaskStatusSync(updatedTask as Task, task as Task) as CoreTask;

  const updatedSnapshot = snapshot.map((candidate) =>
    candidate.id === update.taskId ? normalizeTaskDatesForType(syncedUpdatedTask) : candidate,
  );

  let coreResult: CoreResult;
  if (update.fields.parentId !== undefined || update.fields.type !== undefined) {
    coreResult = recalculateProjectSchedule(updatedSnapshot, opts);
  } else if (update.fields.dependencies !== undefined) {
    coreResult = recalculateTaskFromDependencies(update.taskId, updatedSnapshot, opts);
  } else {
    coreResult = { changedTasks: [syncedUpdatedTask], changedIds: [syncedUpdatedTask.id] };
  }

  if (!coreResult.changedIds.includes(syncedUpdatedTask.id)) {
    return {
      changedTasks: [syncedUpdatedTask, ...coreResult.changedTasks],
      changedIds: [syncedUpdatedTask.id, ...coreResult.changedIds],
    };
  }

  return {
    changedTasks: coreResult.changedTasks.map((candidate) =>
      candidate.id === syncedUpdatedTask.id
        ? {
            ...candidate,
            name: syncedUpdatedTask.name,
            type: syncedUpdatedTask.type,
            color: syncedUpdatedTask.color,
            parentId: syncedUpdatedTask.parentId,
            status: (syncedUpdatedTask as Task).status,
            progress: syncedUpdatedTask.progress,
            workVolume: (syncedUpdatedTask as Task).workVolume,
            workUnit: (syncedUpdatedTask as Task).workUnit,
            completedVolume: (syncedUpdatedTask as Task).completedVolume,
            dependencies: syncedUpdatedTask.dependencies,
          }
        : candidate,
    ),
    changedIds: coreResult.changedIds,
  };
}

function normalizeCreatedTask(task: Task, opts: CoreOptions): Task {
  if ((task.type ?? 'task') === 'milestone') {
    return normalizeTaskDatesForType({
      ...task,
      type: task.type ?? 'task',
    });
  }

  const duration = getTaskDuration(
    task.startDate as string,
    task.endDate as string,
    opts.businessDays ?? false,
    opts.weekendPredicate,
  );
  const normalizedRange = buildTaskRangeFromStart(
    parseDateOnly(task.startDate as string),
    duration,
    opts.businessDays ?? false,
    opts.weekendPredicate,
  );

  return {
    ...task,
    startDate: normalizedRange.start.toISOString().split('T')[0],
    endDate: normalizedRange.end.toISOString().split('T')[0],
  };
}

function scheduleCreatedTasks(
  snapshot: CoreTask[],
  newTasks: Task[],
  opts: CoreOptions,
): CoreResult {
  const normalizedNewTasks = newTasks.map((task) => normalizeCreatedTask(task, opts)) as CoreTask[];
  const updatedSnapshot = [...snapshot, ...normalizedNewTasks];
  const recalculated = recalculateProjectSchedule(updatedSnapshot, opts);
  const newTaskIds = new Set(normalizedNewTasks.map((task) => task.id));
  const finalNewTasksById = new Map(normalizedNewTasks.map((task) => [task.id, task]));

  for (const changedTask of recalculated.changedTasks) {
    if (newTaskIds.has(changedTask.id)) {
      finalNewTasksById.set(changedTask.id, changedTask);
    }
  }

  const existingChangedTasks = recalculated.changedTasks.filter((task) => !newTaskIds.has(task.id));
  const changedTasks = [
    ...newTasks.map((task) => finalNewTasksById.get(task.id) ?? (task as CoreTask)),
    ...existingChangedTasks,
  ];

  return {
    changedTasks,
    changedIds: changedTasks.map((task) => task.id),
  };
}

async function bulkDeleteTasks(prismaClient: any, taskIds: string[]): Promise<void> {
  if (taskIds.length === 0) {
    return;
  }

  await prismaClient.dependency.deleteMany({
    where: {
      OR: [
        { taskId: { in: taskIds } },
        { depTaskId: { in: taskIds } },
      ],
    },
  });

  await prismaClient.task.deleteMany({
    where: {
      id: { in: taskIds },
    },
  });
}

type PersistedDependencyRow = ProjectSnapshot['dependencies'][number];
type CommandExecutionResult = {
  changedTasks: CoreTask[];
  changedDependencyIds: string[];
  conflicts: Conflict[];
  dependencyChanges: Array<{
    action: 'create' | 'delete' | 'update';
    taskId: string;
    depTaskId: string;
    type?: DependencyType;
    lag?: number;
    id?: string;
  }>;
  taskChanges: Array<{
    action: 'create' | 'delete' | 'update_parent' | 'update_sort';
    taskId?: string;
    task?: Task;
    newParentId?: string | null;
    sortOrder?: number;
  }>;
};
type DeleteHistoryMetadata = {
  deletedTasks: Task[];
  deletedDependencies: PersistedDependencyRow[];
};

function toDbActorType(actorType: ActorType): 'user' | 'agent' | 'system' | 'import_actor' {
  return actorType === 'import' ? 'import_actor' : actorType;
}

function buildHistoryContext(
  request: CommitProjectCommandRequest,
): HistoryGroupContext {
  if (request.history) {
    return request.history;
  }

  return {
    groupId: randomUUID(),
    origin: 'system',
    title: request.command.type,
    finalizeGroup: true,
  };
}

function dependencyKey(taskId: string, depTaskId: string): string {
  return `${taskId}::${depTaskId}`;
}

function cloneDependencies(dependencies: TaskDependency[] | undefined): TaskDependency[] | undefined {
  return dependencies?.map((dependency) => ({ ...dependency }));
}

function buildDeleteHistoryMetadata(
  deletedIds: string[],
  beforeTasks: Task[],
  beforeDependencyRows: PersistedDependencyRow[],
): DeleteHistoryMetadata {
  const deletedIdSet = new Set(deletedIds);
  return {
    deletedTasks: beforeTasks
      .filter((task) => deletedIdSet.has(task.id))
      .map((task) => ({
        ...task,
        dependencies: cloneDependencies(task.dependencies),
      })),
    deletedDependencies: beforeDependencyRows
      .filter((dependency) => deletedIdSet.has(dependency.taskId) || deletedIdSet.has(dependency.depTaskId))
      .map((dependency) => ({ ...dependency })),
  };
}

function buildDeleteInverseCommand(
  deletedIds: string[],
  beforeTasks: Task[],
): ProjectEventInverseCommand {
  const deletedTasks = deletedIds
    .map((taskId) => beforeTasks.find((task) => task.id === taskId))
    .filter((task): task is Task => Boolean(task))
    .map((task) => ({
      id: task.id,
      name: task.name,
      startDate: task.startDate,
      endDate: task.endDate,
      type: task.type,
      color: task.color,
      parentId: task.parentId,
      status: task.status,
      progress: task.progress,
      workVolume: task.workVolume ?? null,
      workUnit: task.workUnit ?? null,
      completedVolume: task.completedVolume ?? 0,
      dependencies: cloneDependencies(task.dependencies),
      sortOrder: task.sortOrder,
    }));

  if (deletedTasks.length === 0) {
    return null;
  }

  if (deletedTasks.length === 1) {
    return {
      type: 'create_task',
      task: deletedTasks[0],
    };
  }

  return {
    type: 'create_tasks_batch',
    tasks: deletedTasks,
  };
}

export class CommandService {
  private _prisma: ReturnType<typeof getPrisma> | undefined;

  private get prisma() {
    if (!this._prisma) {
      this._prisma = getPrisma();
    }
    return this._prisma;
  }

  private async getScheduleOptions(projectId: string, prismaClient: any): Promise<CoreOptions> {
    return getScheduleOptions(projectId, prismaClient);
  }

  private async ensureMutationGroup(
    tx: any,
    projectId: string,
    baseVersion: number,
    history: HistoryGroupContext,
    actorType: ActorType,
    actorId?: string,
  ): Promise<void> {
    const existingGroup = await tx.mutationGroup.findUnique({
      where: { id: history.groupId },
      select: { id: true, projectId: true },
    });

    if (existingGroup) {
      if (existingGroup.projectId !== projectId) {
        throw new Error(`Mutation group ${history.groupId} belongs to a different project`);
      }
      return;
    }

    await tx.mutationGroup.create({
      data: {
        id: history.groupId,
        projectId,
        baseVersion,
        newVersion: null,
        actorType: toDbActorType(actorType),
        actorId: actorId ?? null,
        origin: history.origin,
        title: history.title,
        status: 'applied',
        undoable: false,
        redoOfGroupId: history.redoOfGroupId ?? null,
        undoneByGroupId: null,
      },
    });
  }

  private async allocateGroupOrdinal(
    tx: any,
    groupId: string,
  ): Promise<number> {
    const aggregate = await tx.projectEvent.aggregate({
      where: { groupId },
      _max: { ordinal: true },
    });

    return (aggregate._max.ordinal ?? 0) + 1;
  }

  private async finalizeMutationGroup(
    tx: any,
    groupId: string,
    newVersion: number,
    requestedUndoable?: boolean,
  ): Promise<void> {
    const groupEvents = await tx.projectEvent.findMany({
      where: { groupId, applied: true },
      select: { inverseCommand: true },
    });
    const inferredUndoable = groupEvents.length > 0
      && groupEvents.every((event: { inverseCommand: JsonValue | null }) => event.inverseCommand !== null);
    const undoable = requestedUndoable === false ? false : inferredUndoable;

    await tx.mutationGroup.update({
      where: { id: groupId },
      data: {
        newVersion,
        status: 'applied',
        undoable,
      },
    });
  }

  private buildInverseCommand(
    command: ProjectCommand,
    beforeTasks: Task[],
    beforeDependencyRows: PersistedDependencyRow[],
    executeResult: CommandExecutionResult,
    opts: CoreOptions,
  ): ProjectEventInverseCommand {
    const beforeTaskById = new Map(beforeTasks.map((task) => [task.id, task]));
    const beforeDependencyByKey = new Map(
      beforeDependencyRows.map((dependency) => [dependencyKey(dependency.taskId, dependency.depTaskId), dependency]),
    );

    switch (command.type) {
      case 'switch_gantt_day_mode':
        return null;

      case 'shift_project':
        return { type: 'shift_project', deltaDays: -command.deltaDays };

      case 'move_task': {
        const task = beforeTaskById.get(command.taskId);
        return task ? { type: 'move_task', taskId: command.taskId, startDate: task.startDate } : null;
      }

      case 'resize_task': {
        const task = beforeTaskById.get(command.taskId);
        if (!task) {
          return null;
        }

        return {
          type: 'resize_task',
          taskId: command.taskId,
          anchor: command.anchor,
          date: command.anchor === 'start' ? task.startDate : task.endDate,
        };
      }

      case 'set_task_start': {
        const task = beforeTaskById.get(command.taskId);
        return task ? { type: 'set_task_start', taskId: command.taskId, startDate: task.startDate } : null;
      }

      case 'set_task_end': {
        const task = beforeTaskById.get(command.taskId);
        return task ? { type: 'set_task_end', taskId: command.taskId, endDate: task.endDate } : null;
      }

      case 'change_duration': {
        const task = beforeTaskById.get(command.taskId);
        if (!task) {
          return null;
        }

        return {
          type: 'change_duration',
          taskId: command.taskId,
          duration: getTaskDuration(
            task.startDate,
            task.endDate,
            opts.businessDays ?? false,
            opts.weekendPredicate,
          ),
          anchor: command.anchor ?? 'end',
        };
      }

      case 'update_task_fields': {
        const task = beforeTaskById.get(command.taskId);
        if (!task) {
          return null;
        }

        return {
          type: 'update_task_fields',
          taskId: command.taskId,
          fields: {
            ...('name' in command.fields ? { name: task.name } : {}),
            ...('type' in command.fields ? { type: task.type ?? 'task' } : {}),
            ...('color' in command.fields ? { color: task.color ?? null } : {}),
            ...('parentId' in command.fields ? { parentId: task.parentId ?? null } : {}),
            ...('status' in command.fields ? { status: task.status ?? 'not_started' } : {}),
            ...('progress' in command.fields ? { progress: task.progress ?? 0 } : {}),
            ...('workVolume' in command.fields ? { workVolume: task.workVolume ?? null } : {}),
            ...('workUnit' in command.fields ? { workUnit: task.workUnit ?? null } : {}),
            ...('completedVolume' in command.fields ? { completedVolume: task.completedVolume ?? 0 } : {}),
            ...('dependencies' in command.fields ? { dependencies: cloneDependencies(task.dependencies) ?? [] } : {}),
          },
        };
      }

      case 'update_tasks_fields_batch': {
        const updates = command.updates.map((update) => {
          const task = beforeTaskById.get(update.taskId);
          if (!task) {
            return null;
          }

          return {
            taskId: update.taskId,
            fields: {
              ...('name' in update.fields ? { name: task.name } : {}),
              ...('type' in update.fields ? { type: task.type ?? 'task' } : {}),
              ...('color' in update.fields ? { color: task.color ?? null } : {}),
              ...('parentId' in update.fields ? { parentId: task.parentId ?? null } : {}),
              ...('status' in update.fields ? { status: task.status ?? 'not_started' } : {}),
              ...('progress' in update.fields ? { progress: task.progress ?? 0 } : {}),
              ...('workVolume' in update.fields ? { workVolume: task.workVolume ?? null } : {}),
              ...('workUnit' in update.fields ? { workUnit: task.workUnit ?? null } : {}),
              ...('completedVolume' in update.fields ? { completedVolume: task.completedVolume ?? 0 } : {}),
              ...('dependencies' in update.fields ? { dependencies: cloneDependencies(task.dependencies) ?? [] } : {}),
            },
          };
        });

        if (updates.some((update) => update === null)) {
          return null;
        }

        return {
          type: 'update_tasks_fields_batch',
          updates: updates as Array<{
            taskId: string;
            fields: {
              name?: string;
              type?: Task['type'];
              color?: string | null;
              parentId?: string | null;
              progress?: number;
              workVolume?: number | null;
              workUnit?: string | null;
              completedVolume?: number;
              dependencies?: TaskDependency[];
            };
          }>,
        };
      }

      case 'create_task': {
        const createdTask = executeResult.taskChanges.find((taskChange) => taskChange.action === 'create')?.task;
        return createdTask ? { type: 'delete_task', taskId: createdTask.id } : null;
      }

      case 'create_tasks_batch': {
        const createdTaskIds = executeResult.taskChanges
          .filter((taskChange) => taskChange.action === 'create' && taskChange.task)
          .map((taskChange) => taskChange.task!.id);

        return createdTaskIds.length > 0 ? { type: 'delete_tasks', taskIds: createdTaskIds } : null;
      }

      case 'delete_task':
        return buildDeleteInverseCommand([command.taskId], beforeTasks);

      case 'delete_tasks':
        return buildDeleteInverseCommand(command.taskIds, beforeTasks);

      case 'create_dependency':
        return { type: 'remove_dependency', taskId: command.taskId, depTaskId: command.dependency.taskId };

      case 'remove_dependency': {
        const dependency = beforeDependencyByKey.get(dependencyKey(command.taskId, command.depTaskId));
        return dependency
          ? {
              type: 'create_dependency',
              taskId: command.taskId,
              dependency: {
                taskId: dependency.depTaskId,
                type: dependency.type,
                lag: dependency.lag,
              },
            }
          : null;
      }

      case 'change_dependency_lag': {
        const dependency = beforeDependencyByKey.get(dependencyKey(command.taskId, command.depTaskId));
        return dependency
          ? {
              type: 'change_dependency_lag',
              taskId: command.taskId,
              depTaskId: command.depTaskId,
              lag: dependency.lag,
            }
          : null;
      }

      case 'reparent_task': {
        const task = beforeTaskById.get(command.taskId);
        return task ? { type: 'reparent_task', taskId: command.taskId, newParentId: task.parentId ?? null } : null;
      }

      case 'reorder_tasks': {
        const updates = command.updates.map((update) => {
          const task = beforeTaskById.get(update.taskId);
          return task ? { taskId: update.taskId, sortOrder: task.sortOrder ?? 0 } : null;
        });

        if (updates.some((update) => update === null)) {
          return null;
        }

        return {
          type: 'reorder_tasks',
          updates: updates as Array<{ taskId: string; sortOrder: number }>,
        };
      }

      default:
        return null;
    }
  }

  private buildEventMetadata(
    command: ProjectCommand,
    beforeTasks: Task[],
    beforeDependencyRows: PersistedDependencyRow[],
  ): JsonValue | undefined {
    switch (command.type) {
      case 'delete_task':
        return buildDeleteHistoryMetadata([command.taskId], beforeTasks, beforeDependencyRows) as unknown as JsonValue;
      case 'delete_tasks':
        return buildDeleteHistoryMetadata(command.taskIds, beforeTasks, beforeDependencyRows) as unknown as JsonValue;
      default:
        return undefined;
    }
  }

  /**
   * Commit a project command atomically.
   *
   * Flow:
   * 1. Start Prisma $transaction
   * 2. Load project with version inside transaction
   * 3. Optimistic concurrency check: baseVersion must match
   * 4. Load snapshot, execute command through gantt-lib/core/scheduling
   * 5. Persist changed tasks, bump version, create ProjectEvent
   * 6. Return authoritative result
   */
  async commitCommand(
    request: CommitProjectCommandRequest,
    actorType: ActorType,
    actorId?: string,
  ): Promise<CommitProjectCommandResponse> {
    const startTime = Date.now();
    const { projectId, clientRequestId, baseVersion, command, includeSnapshot } = request;
    const history = buildHistoryContext(request);
    const timings: CommitTimings = {};
    const time = async <T>(key: CommitTimingKey, fn: () => Promise<T>): Promise<T> => {
      const segmentStart = Date.now();
      try {
        return await fn();
      } finally {
        timings[key] = (timings[key] ?? 0) + Date.now() - segmentStart;
      }
    };

    try {
      const result = await this.prisma.$transaction(async (tx: any) => {
        // Step 1: Load project with version
        const project = await time<any | null>('loadProjectMs', () => tx.project.findUnique({
            where: { id: projectId },
            select: { version: true, ganttDayMode: true },
          }));

        if (!project) {
          return {
            clientRequestId,
            accepted: false as const,
            reason: 'validation_error' as const,
            currentVersion: -1,
          };
        }

        const existingEvent = await time<any | null>('loadProjectMs', () => tx.projectEvent.findFirst({
          where: {
            projectId,
            clientRequestId,
            applied: true,
          },
          select: {
            baseVersion: true,
            version: true,
            result: true,
            patches: true,
          },
        }));

        if (existingEvent) {
          const returnSnapshot = shouldReturnSnapshot(command, includeSnapshot);
          const snapshot = returnSnapshot ? await time('buildSnapshotMs', () => buildProjectSnapshot(projectId, tx)) : undefined;
          const eventResult = existingEvent.result as Partial<ScheduleExecutionResult> | null;
          const changedTaskIds = eventResult?.changedTaskIds ?? [];
          const changedTasks = eventResult?.changedTasks ?? (snapshot
            ? changedTaskIds
                .map((taskId) => snapshot.tasks.find((task) => task.id === taskId))
                .filter((task): task is Task => Boolean(task))
            : []);
          const changedDependencyIds = eventResult?.changedDependencyIds ?? [];
          const conflicts = eventResult?.conflicts ?? [];
          return {
            clientRequestId,
            accepted: true as const,
            baseVersion: existingEvent.baseVersion,
            newVersion: Math.max(existingEvent.version, project.version),
            result: {
              snapshot,
              changedTaskIds,
              changedTasks,
              changedDependencyIds,
              conflicts,
              patches: Array.isArray(existingEvent.patches) ? existingEvent.patches as Patch[] : [],
            },
            changedTaskIds,
            changedTasks,
            changedDependencyIds,
            conflicts,
            historyGroupId: history.groupId,
            snapshot,
          };
        }

        // Step 2: Optimistic concurrency check
        if (project.version !== baseVersion) {
          const snapshot = await time('buildSnapshotMs', () => buildProjectSnapshot(projectId, tx));
          return {
            clientRequestId,
            accepted: false as const,
            reason: 'version_conflict' as const,
            currentVersion: project.version,
            snapshot,
          };
        }

        if (isSimpleTaskFieldUpdate(command)) {
          const taskBeforeRow = await time<any | null>('loadSnapshotMs', () => tx.task.findFirst({
            where: { id: command.taskId, projectId },
            include: { dependencies: true },
          }));

          if (!taskBeforeRow) {
            return {
              clientRequestId,
              accepted: false as const,
              reason: 'validation_error' as const,
              currentVersion: project.version,
              error: `Task ${command.taskId} not found`,
            };
          }

          const beforeTask = taskRowToSnapshotTask(taskBeforeRow);
          const nextTask = applyTaskStatusSync({
            ...beforeTask,
            ...(command.fields.name !== undefined ? { name: command.fields.name } : {}),
            ...(command.fields.color !== undefined ? { color: command.fields.color ?? undefined } : {}),
            ...(command.fields.status !== undefined ? { status: command.fields.status } : {}),
            ...(command.fields.progress !== undefined ? { progress: command.fields.progress } : {}),
            ...(command.fields.workVolume !== undefined ? { workVolume: command.fields.workVolume } : {}),
            ...(command.fields.workUnit !== undefined ? { workUnit: command.fields.workUnit } : {}),
            ...(command.fields.completedVolume !== undefined ? { completedVolume: command.fields.completedVolume } : {}),
          }, beforeTask);
          const changedTaskIds = [nextTask.id];
          const changedTasks = [nextTask];
          const changedDependencyIds: string[] = [];
          const conflicts: Conflict[] = [];
          const patches: Patch[] = [];
          const newVersion = baseVersion + 1;

          await this.ensureMutationGroup(tx, projectId, baseVersion, history, actorType, actorId);
          const ordinal = await this.allocateGroupOrdinal(tx, history.groupId);

          const updateData = {
            ...(command.fields.name !== undefined ? { name: command.fields.name } : {}),
            ...(command.fields.color !== undefined ? { color: command.fields.color ?? null } : {}),
            status: nextTask.status ?? 'not_started',
            progress: nextTask.progress ?? 0,
            ...(command.fields.workVolume !== undefined ? { workVolume: command.fields.workVolume } : {}),
            ...(command.fields.workUnit !== undefined ? { workUnit: command.fields.workUnit ?? null } : {}),
            completedVolume: nextTask.completedVolume ?? 0,
          };
          await time('persistTasksMs', async () => {
            if (Object.keys(updateData).length > 0) {
              await tx.task.update({
                where: { id: command.taskId },
                data: updateData,
              });
              if (command.fields.status === 'done' && nextTask.workVolume && nextTask.workVolume > 0) {
                await syncTaskProgressEntriesToCompletedVolume(tx, projectId, command.taskId, nextTask.completedVolume ?? 0);
              }
            }
          });

          await time('bumpVersionMs', () => tx.project.update({
            where: { id: projectId, version: baseVersion },
            data: { version: { increment: 1 } },
          }));

          const executionTimeMs = Date.now() - startTime;
          await time('createEventMs', () => tx.projectEvent.create({
            data: {
              id: randomUUID(),
              projectId,
              clientRequestId,
              groupId: history.groupId,
              baseVersion,
              version: newVersion,
              ordinal,
              applied: true,
              actorType: toDbActorType(actorType),
              actorId: actorId ?? null,
              coreVersion: CORE_VERSION,
              command: command as any,
              inverseCommand: {
                type: 'update_task_fields',
                taskId: command.taskId,
                fields: {
                  ...('name' in command.fields ? { name: beforeTask.name } : {}),
                  ...('color' in command.fields ? { color: beforeTask.color ?? null } : {}),
                  ...('status' in command.fields || 'progress' in command.fields || 'workVolume' in command.fields || 'completedVolume' in command.fields
                    ? { status: beforeTask.status ?? 'not_started' }
                    : {}),
                  ...('progress' in command.fields ? { progress: beforeTask.progress ?? 0 } : {}),
                  ...('workVolume' in command.fields ? { workVolume: beforeTask.workVolume ?? null } : {}),
                  ...('workUnit' in command.fields ? { workUnit: beforeTask.workUnit ?? null } : {}),
                  ...('completedVolume' in command.fields ? { completedVolume: beforeTask.completedVolume ?? 0 } : {}),
                },
              } as any,
              result: {
                changedTaskIds,
                changedTasks,
                changedDependencyIds,
                conflicts,
              },
              patches: patches as any,
              metadata: PrismaCompat.DbNull,
              requestContextId: history.requestContextId ?? null,
              executionTimeMs,
            },
          }));

          if (history.finalizeGroup) {
            await time('createEventMs', () => this.finalizeMutationGroup(tx, history.groupId, newVersion, history.undoable));
          }

          const snapshot = shouldReturnSnapshot(command, includeSnapshot)
            ? await time('buildSnapshotMs', () => buildProjectSnapshot(projectId, tx))
            : undefined;

          return {
            clientRequestId,
            accepted: true as const,
            baseVersion,
            newVersion,
            result: {
              snapshot,
              changedTaskIds,
              changedTasks,
              changedDependencyIds,
              conflicts,
              patches,
            },
            changedTaskIds,
            changedTasks,
            changedDependencyIds,
            conflicts,
            historyGroupId: history.groupId,
            snapshot,
          };
        }

        // Step 3: Load current snapshot
        const [beforeTasks, beforeDependencyRows] = await time('loadSnapshotMs', () => Promise.all([
          loadTaskSnapshot(projectId, tx),
          loadDependencyRows(projectId, tx),
        ]));
        const coreSnapshot = normalizeSnapshot(beforeTasks);
        const opts: CoreOptions = command.type === 'switch_gantt_day_mode'
          ? await getProjectScheduleOptionsForDayMode(tx, projectId, command.ganttDayMode)
          : await this.getScheduleOptions(projectId, tx);

        await this.ensureMutationGroup(tx, projectId, baseVersion, history, actorType, actorId);
        const ordinal = await this.allocateGroupOrdinal(tx, history.groupId);

        // Step 4: Execute command through gantt-lib
        const newVersion = baseVersion + 1;
        const executeResult = await time('executeCommandMs', () => this.executeCommand(command, coreSnapshot, opts, projectId, tx));
        const inverseCommand = command.type === 'switch_gantt_day_mode'
          ? { type: 'switch_gantt_day_mode', ganttDayMode: project.ganttDayMode as 'business' | 'calendar' }
          : this.buildInverseCommand(
              command,
              beforeTasks,
              beforeDependencyRows,
              executeResult,
              opts,
            );
        const eventMetadata = this.buildEventMetadata(command, beforeTasks, beforeDependencyRows);

        // Step 5: Persist dependency changes if any
        await time('persistDepsMs', async () => {
        for (const depChange of executeResult.dependencyChanges) {
          if (depChange.action === 'create') {
            await tx.dependency.create({
              data: {
                id: randomUUID(),
                taskId: depChange.taskId,
                depTaskId: depChange.depTaskId,
                type: depChange.type,
                lag: depChange.lag ?? 0,
              },
            });
          } else if (depChange.action === 'delete') {
            if (depChange.id) {
              await tx.dependency.delete({ where: { id: depChange.id } });
            } else {
              await tx.dependency.deleteMany({
                where: { taskId: depChange.taskId, depTaskId: depChange.depTaskId },
              });
            }
          } else if (depChange.action === 'update') {
            await tx.dependency.updateMany({
              where: {
                taskId: depChange.taskId,
                depTaskId: depChange.depTaskId,
              },
              data: { lag: depChange.lag ?? 0 },
            });
          }
        }
        });

        // Step 6: Handle task creates/deletes
        const createdTasks = executeResult.taskChanges.filter((taskChange) => taskChange.action === 'create' && taskChange.task);
        const createdTaskIds = new Set(
          createdTasks
            .map((taskChange) => taskChange.task?.id)
            .filter((taskId): taskId is string => Boolean(taskId)),
        );
        const isBatchCreateCommand = command.type === 'create_tasks_batch';
        const isBatchDeleteCommand = command.type === 'delete_tasks';

        await time('persistTasksMs', async () => {
        if (isBatchCreateCommand && createdTasks.length > 0) {
          const maxSort = await tx.task.aggregate({
            where: { projectId },
            _max: { sortOrder: true },
          });
          const appendBaseSort = (maxSort._max.sortOrder ?? -1) + 1;

          await tx.task.createMany({
            data: createdTasks.map((taskChange, index) => ({
              id: taskChange.task!.id,
              projectId,
              name: taskChange.task!.name,
              startDate: domainToDate(taskChange.task!.startDate),
              endDate: domainToDate(taskChange.task!.endDate),
              type: taskChange.task!.type ?? 'task',
              color: taskChange.task!.color ?? null,
              parentId: taskChange.task!.parentId && !createdTaskIds.has(taskChange.task!.parentId)
                ? taskChange.task!.parentId
                : null,
              status: taskChange.task!.status ?? 'not_started',
              progress: taskChange.task!.progress ?? 0,
              workVolume: taskChange.task!.workVolume ?? null,
              workUnit: taskChange.task!.workUnit ?? null,
              completedVolume: taskChange.task!.completedVolume ?? 0,
              sortOrder: appendBaseSort + index,
            })),
          });

          await bulkUpdateTaskParents(
            tx,
            projectId,
            createdTasks
              .filter((taskChange): taskChange is typeof taskChange & { task: Task } => Boolean(
                taskChange.task?.id
                && taskChange.task.parentId
                && createdTaskIds.has(taskChange.task.parentId),
              ))
              .map((taskChange) => ({
                taskId: taskChange.task.id,
                parentId: taskChange.task.parentId!,
              })),
          );

          const dependencyRows = createdTasks.flatMap((taskChange) => (
            (taskChange.task?.dependencies ?? []).map((dep) => ({
              id: randomUUID(),
              taskId: taskChange.task!.id,
              depTaskId: dep.taskId,
              type: dep.type,
              lag: dep.lag ?? 0,
            }))
          ));

          if (dependencyRows.length > 0) {
            await tx.dependency.createMany({ data: dependencyRows });
          }
        } else {
          for (const taskChange of createdTasks) {
            if (taskChange.action === 'create' && taskChange.task) {
              const maxSort = await tx.task.aggregate({
                where: { projectId },
                _max: { sortOrder: true },
              });
              let sortOrder = 'sortOrder' in taskChange.task ? taskChange.task.sortOrder : undefined;
              if (sortOrder === undefined) {
                sortOrder = (maxSort._max.sortOrder ?? -1) + 1;
              } else {
                await tx.task.updateMany({
                  where: {
                    projectId,
                    sortOrder: { gte: sortOrder },
                  },
                  data: {
                    sortOrder: { increment: 1 },
                  },
                });
              }
              await tx.task.create({
                data: {
                  id: taskChange.task.id,
                  projectId,
                  name: taskChange.task.name,
                  startDate: domainToDate(taskChange.task.startDate),
                  endDate: domainToDate(taskChange.task.endDate),
                  type: taskChange.task.type ?? 'task',
                  color: taskChange.task.color ?? null,
                  parentId: taskChange.task.parentId && !createdTaskIds.has(taskChange.task.parentId)
                    ? taskChange.task.parentId
                    : null,
                  status: taskChange.task.status ?? 'not_started',
                  progress: taskChange.task.progress ?? 0,
                  workVolume: taskChange.task.workVolume ?? null,
                  workUnit: taskChange.task.workUnit ?? null,
                  completedVolume: taskChange.task.completedVolume ?? 0,
                  sortOrder,
                },
              });
            }
          }

          await bulkUpdateTaskParents(
            tx,
            projectId,
            createdTasks
              .filter((taskChange): taskChange is typeof taskChange & { task: Task } => Boolean(
                taskChange.task?.id
                && taskChange.task.parentId
                && createdTaskIds.has(taskChange.task.parentId),
              ))
              .map((taskChange) => ({
                taskId: taskChange.task.id,
                parentId: taskChange.task.parentId!,
              })),
          );

          for (const taskChange of createdTasks) {
            if (taskChange.task?.dependencies?.length) {
              const taskDef = taskChange.task;
              await tx.dependency.createMany({
                data: (taskDef.dependencies ?? []).map(dep => ({
                  id: randomUUID(),
                  taskId: taskDef.id,
                  depTaskId: dep.taskId,
                  type: dep.type,
                  lag: dep.lag ?? 0,
                })),
              });
            }
          }
        }

        const deletedTaskIds = executeResult.taskChanges
          .filter((taskChange) => taskChange.action === 'delete')
          .map((taskChange) => taskChange.taskId)
          .filter((taskId): taskId is string => Boolean(taskId));

        if (deletedTaskIds.length > 0) {
          await bulkDeleteTasks(tx, deletedTaskIds);
        }

        const sortUpdates = executeResult.taskChanges
          .filter((taskChange) => taskChange.action === 'update_sort')
          .map((taskChange) => ({
            taskId: taskChange.taskId,
            sortOrder: taskChange.sortOrder,
          }))
          .filter((update): update is { taskId: string; sortOrder: number } => (
            Boolean(update.taskId) && update.sortOrder !== undefined
          ));

        if (sortUpdates.length > 0) {
          await bulkUpdateTaskSortOrders(tx, projectId, sortUpdates);
        }

        for (const taskChange of executeResult.taskChanges) {
          if (taskChange.action === 'update_parent') {
            await tx.task.update({
              where: { id: taskChange.taskId },
              data: { parentId: taskChange.newParentId ?? null },
            });
          }
        }

        if (command.type === 'switch_gantt_day_mode') {
          await tx.project.update({
            where: { id: projectId },
            data: { ganttDayMode: command.ganttDayMode },
          });
        }

        // Step 7: Persist full semantic state for every changed task that still exists.
        const deletedTaskIdSet = new Set(deletedTaskIds);
        const beforeTaskById = new Map(beforeTasks.map((task) => [task.id, task]));

        for (const task of executeResult.changedTasks) {
          if (deletedTaskIdSet.has(task.id)) {
            continue;
          }

          if (isBatchCreateCommand && createdTaskIds.has(task.id)) {
            continue;
          }

          if (isBatchDeleteCommand) {
            continue;
          }

          await tx.task.update({
            where: { id: task.id },
            data: {
              name: task.name,
              startDate: domainToDate(task.startDate as string),
              endDate: domainToDate(task.endDate as string),
              type: task.type ?? 'task',
              color: task.color ?? null,
              parentId: task.parentId ?? null,
              status: (task as Task).status ?? 'not_started',
              progress: task.progress ?? 0,
              workVolume: (task as Task).workVolume ?? null,
              workUnit: (task as Task).workUnit ?? null,
              completedVolume: (task as Task).completedVolume ?? 0,
              sortOrder: 'sortOrder' in task ? (task as Task & { sortOrder?: number }).sortOrder : undefined,
            },
          });

          const beforeTask = beforeTaskById.get(task.id);
          if (dependenciesChanged(beforeTask?.dependencies, task.dependencies)) {
            await syncTaskDependencies(tx, task.id, task.dependencies);
          }
        }
        });

        // Step 8: Build after-snapshot tasks in memory for patch computation
        const afterTasks = buildAfterTasksSnapshot(beforeTasks, executeResult);

        // Step 9: Compute patches
        const patches = computePatches(
          beforeTasks,
          afterTasks,
          executeResult.changedTasks.map(t => t.id),
          this.getTargetTaskId(command),
        );

        // Step 10: Bump version atomically
        await time('bumpVersionMs', () => tx.project.update({
          where: { id: projectId, version: baseVersion },
          data: { version: { increment: 1 } },
        }));

        // Step 11: Create ProjectEvent record
        const executionTimeMs = Date.now() - startTime;
        await time('createEventMs', () => tx.projectEvent.create({
          data: {
            id: randomUUID(),
            projectId,
            clientRequestId,
            groupId: history.groupId,
            baseVersion,
            version: newVersion,
            ordinal,
            applied: true,
            actorType: toDbActorType(actorType),
            actorId: actorId ?? null,
            coreVersion: CORE_VERSION,
            command: command as any,
            inverseCommand: inverseCommand === null ? PrismaCompat.DbNull : inverseCommand as any,
            result: {
              changedTaskIds: executeResult.changedTasks.map(t => t.id),
              changedTasks: executeResult.changedTasks,
              changedDependencyIds: executeResult.changedDependencyIds,
              conflicts: executeResult.conflicts,
            },
            patches: patches as any,
            metadata: eventMetadata ?? PrismaCompat.DbNull,
            requestContextId: history.requestContextId ?? null,
            executionTimeMs,
          },
        }));

        if (history.finalizeGroup) {
          await time('createEventMs', () => this.finalizeMutationGroup(tx, history.groupId, newVersion, history.undoable));
        }

        // Step 12: Build final snapshot only when callers explicitly need it.
        const returnSnapshot = shouldReturnSnapshot(command, includeSnapshot);
        const snapshot = returnSnapshot
          ? await time('buildSnapshotMs', async () => ({
              tasks: afterTasks,
              dependencies: await loadDependencyRows(projectId, tx),
            }))
          : undefined;
        const changedTaskIds = executeResult.changedTasks.map(t => t.id);
        const changedTasks = executeResult.changedTasks as Task[];
        const changedDependencyIds = executeResult.changedDependencyIds;
        const conflicts = executeResult.conflicts;

        return {
          clientRequestId,
          accepted: true as const,
          baseVersion,
          newVersion,
          result: {
            snapshot,
            changedTaskIds,
            changedTasks,
            changedDependencyIds,
            conflicts,
            patches,
          },
          changedTaskIds,
          changedTasks,
          changedDependencyIds,
          conflicts,
          historyGroupId: history.groupId,
          snapshot,
        };
      }, INTERACTIVE_TRANSACTION_OPTIONS);

      timings.totalMs = Date.now() - startTime;
      // console.debug('[CommandService.commitCommand] timings', {
      //   clientRequestId,
      //   projectId,
      //   baseVersion,
      //   commandType: command.type,
      //   ...timings,
      // });
      return result;
    } catch (error: any) {
      console.error('[CommandService.commitCommand] failed', {
        clientRequestId,
        projectId,
        baseVersion,
        commandType: command.type,
        command: command.type === 'create_tasks_batch'
          ? { ...command, taskCount: command.tasks.length, tasks: command.tasks }
          : command.type === 'delete_tasks'
            ? { ...command, taskCount: command.taskIds.length }
            : command,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorCode: error?.code,
        errorMeta: error?.meta,
        stack: error instanceof Error ? error.stack : undefined,
      }, INTERACTIVE_TRANSACTION_OPTIONS);

      if (isVersionBumpRace(error)) {
        const project = await this.prisma.project.findUnique({
          where: { id: projectId },
          select: { version: true },
        });
        const snapshot = await buildProjectSnapshot(projectId, this.prisma);
        return {
          clientRequestId,
          accepted: false as const,
          reason: 'version_conflict' as const,
          currentVersion: project?.version ?? baseVersion,
          snapshot,
          error: error instanceof Error ? error.message : String(error),
        };
      }

      return {
        clientRequestId,
        accepted: false as const,
        reason: 'validation_error' as const,
        currentVersion: -1,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /** Extract the target task ID from a command for patch reason attribution */
  private getTargetTaskId(command: ProjectCommand): string | undefined {
    switch (command.type) {
      case 'switch_gantt_day_mode':
      case 'shift_project':
        return undefined;
      case 'move_task':
      case 'resize_task':
      case 'set_task_start':
      case 'set_task_end':
      case 'change_duration':
      case 'delete_task':
      case 'update_task_fields':
      case 'reparent_task':
        return command.taskId;
      case 'delete_tasks':
        return command.taskIds[0];
      case 'update_tasks_fields_batch':
        return command.updates[0]?.taskId;
      case 'reorder_tasks':
        return command.updates[0]?.taskId;
      case 'recalculate_schedule':
        return command.taskId;
      case 'create_task':
      case 'create_tasks_batch':
        return undefined; // New task — no existing target
      case 'create_dependency':
      case 'remove_dependency':
      case 'change_dependency_lag':
        return command.taskId;
      default:
        return undefined;
    }
  }

  /**
   * Execute a ProjectCommand through gantt-lib/core/scheduling.
   * Returns changed tasks plus any structural changes (dependency/task creates/deletes).
   */
  private async executeCommand(
    command: ProjectCommand,
    coreSnapshot: CoreTask[],
    opts: CoreOptions,
    projectId: string,
    tx: any,
  ): Promise<{
    changedTasks: CoreTask[];
    changedDependencyIds: string[];
    conflicts: Conflict[];
    dependencyChanges: Array<{
      action: 'create' | 'delete' | 'update';
      taskId: string;
      depTaskId: string;
      type?: DependencyType;
      lag?: number;
      id?: string;
    }>;
    taskChanges: Array<{
      action: 'create' | 'delete' | 'update_parent' | 'update_sort';
      taskId?: string;
      task?: Task;
      newParentId?: string | null;
      sortOrder?: number;
    }>;
  }> {
    const dependencyChanges: Array<{
      action: 'create' | 'delete' | 'update';
      taskId: string;
      depTaskId: string;
      type?: DependencyType;
      lag?: number;
      id?: string;
    }> = [];
    const taskChanges: Array<{
      action: 'create' | 'delete' | 'update_parent' | 'update_sort';
      taskId?: string;
      task?: Task;
      newParentId?: string | null;
      sortOrder?: number;
    }> = [];

    let coreResult: CoreResult;
    let changedDependencyIds: string[] = [];
    const conflicts: Conflict[] = [];

    switch (command.type) {
      case 'switch_gantt_day_mode': {
        const weekendPredicate = opts.weekendPredicate ?? (() => false);
        const reflowedTasks = reflowTasksOnModeSwitch(
          coreSnapshot,
          command.ganttDayMode === 'business',
          weekendPredicate,
        ) as CoreTask[];
        const changedTasks = reflowedTasks.filter((task) => {
          const before = coreSnapshot.find((candidate) => candidate.id === task.id);
          return JSON.stringify(before) !== JSON.stringify(task);
        });
        coreResult = {
          changedTasks,
          changedIds: changedTasks.map((task) => task.id),
        };
        break;
      }

      case 'shift_project': {
        coreResult = {
          changedTasks: coreSnapshot.map((task) => ({
            ...task,
            startDate: shiftDateOnly(task.startDate as string | Date, command.deltaDays),
            endDate: shiftDateOnly(task.endDate as string | Date, command.deltaDays),
          })),
          changedIds: coreSnapshot.map((task) => task.id),
        };
        break;
      }

      case 'move_task': {
        coreResult = moveTaskWithCascade(
          command.taskId,
          parseDateOnly(command.startDate),
          coreSnapshot,
          opts,
        );
        break;
      }

      case 'resize_task': {
        coreResult = resizeTaskWithCascade(
          command.taskId,
          command.anchor,
          parseDateOnly(command.date),
          coreSnapshot,
          opts,
        );
        break;
      }

      case 'set_task_start': {
        // Compute new end date preserving duration
        const task = coreSnapshot.find(t => t.id === command.taskId);
        if (!task) {
          return { changedTasks: [], changedDependencyIds: [], conflicts: [], dependencyChanges: [], taskChanges };
        }
        const newStart = parseDateOnly(command.startDate);
        coreResult = moveTaskWithCascade(command.taskId, newStart, coreSnapshot, opts);
        break;
      }

      case 'set_task_end': {
        coreResult = resizeTaskWithCascade(
          command.taskId,
          'end',
          parseDateOnly(command.endDate),
          coreSnapshot,
          opts,
        );
        break;
      }

      case 'change_duration': {
        // Compute new range preserving business/calendar semantics
        const task = coreSnapshot.find(t => t.id === command.taskId);
        if (!task) {
          return { changedTasks: [], changedDependencyIds: [], conflicts: [], dependencyChanges: [], taskChanges };
        }
        const anchor = command.anchor ?? 'end';
        if (anchor === 'end') {
          const startDate = parseDateOnly(task.startDate as string);
          const { end: newEnd } = buildTaskRangeFromStart(
            startDate,
            command.duration,
            opts.businessDays ?? false,
            opts.weekendPredicate,
          );
          coreResult = resizeTaskWithCascade(command.taskId, 'end', newEnd, coreSnapshot, opts);
        } else {
          const endDate = parseDateOnly(task.endDate as string);
          const { start: newStart } = buildTaskRangeFromEnd(
            endDate,
            command.duration,
            opts.businessDays ?? false,
            opts.weekendPredicate,
          );
          coreResult = resizeTaskWithCascade(command.taskId, 'start', newStart, coreSnapshot, opts);
        }
        break;
      }

      case 'update_task_fields': {
        coreResult = applyTaskFieldUpdateToSnapshot(coreSnapshot, command, opts);
        break;
      }

      case 'update_tasks_fields_batch': {
        let workingSnapshot = [...coreSnapshot];
        const changedTaskMap = new Map<string, CoreTask>();
        const changedIds: string[] = [];

        for (const update of command.updates) {
          const singleResult = applyTaskFieldUpdateToSnapshot(
            workingSnapshot,
            {
              type: 'update_task_fields',
              taskId: update.taskId,
              fields: update.fields,
            },
            opts,
          );

          for (const changedTask of singleResult.changedTasks) {
            changedTaskMap.set(changedTask.id, changedTask);
          }

          for (const changedId of singleResult.changedIds) {
            if (!changedIds.includes(changedId)) {
              changedIds.push(changedId);
            }
          }

          if (singleResult.changedTasks.length > 0) {
            const changedById = new Map(singleResult.changedTasks.map((task) => [task.id, task]));
            workingSnapshot = workingSnapshot.map((task) => changedById.get(task.id) ?? task);
          }
        }

        coreResult = {
          changedTasks: changedIds
            .map((changedId) => changedTaskMap.get(changedId))
            .filter((task): task is CoreTask => Boolean(task)),
          changedIds,
        };
        break;
      }

      case 'recalculate_schedule': {
        if (command.taskId) {
          coreResult = recalculateTaskFromDependencies(command.taskId, coreSnapshot, opts);
        } else {
          coreResult = recalculateProjectSchedule(coreSnapshot, opts);
        }
        break;
      }

      case 'create_task': {
        const taskId = command.task.id ?? randomUUID();
        const newTask = applyTaskStatusSync({
          id: taskId,
          name: command.task.name,
          startDate: command.task.startDate,
          endDate: command.task.endDate,
          type: command.task.type ?? 'task',
          color: command.task.color,
          parentId: command.task.parentId,
          status: command.task.status,
          progress: command.task.progress,
          workVolume: command.task.workVolume ?? null,
          workUnit: command.task.workUnit ?? null,
          completedVolume: command.task.completedVolume ?? 0,
          dependencies: command.task.dependencies,
          sortOrder: command.task.sortOrder,
        });
        taskChanges.push({ action: 'create', task: { ...newTask, id: taskId } });
        coreResult = scheduleCreatedTasks(coreSnapshot, [newTask], opts);
        break;
      }

      case 'create_tasks_batch': {
        const newTasks: Task[] = command.tasks.map((task) => applyTaskStatusSync({
          id: task.id ?? randomUUID(),
          name: task.name,
          startDate: task.startDate,
          endDate: task.endDate,
          type: task.type ?? 'task',
          color: task.color,
          parentId: task.parentId,
          status: task.status,
          progress: task.progress,
          workVolume: task.workVolume ?? null,
          workUnit: task.workUnit ?? null,
          completedVolume: task.completedVolume ?? 0,
          dependencies: task.dependencies,
          sortOrder: task.sortOrder,
        }));

        for (const task of newTasks) {
          taskChanges.push({ action: 'create', task });
        }
        coreResult = scheduleCreatedTasks(coreSnapshot, newTasks, opts);
        break;
      }

      case 'delete_task': {
        taskChanges.push({ action: 'delete', taskId: command.taskId });

        // Remove from snapshot and recalculate successors
        const remainingSnapshot = coreSnapshot.filter(t => t.id !== command.taskId);
        // Find tasks that depended on the deleted task
        const successors = coreSnapshot.filter(t =>
          t.dependencies?.some(d => d.taskId === command.taskId),
        );
        if (successors.length > 0) {
          // Re-run scheduling on the remaining tasks
          const recalcResult = recalculateProjectSchedule(remainingSnapshot, opts);
          coreResult = {
            changedTasks: recalcResult.changedTasks,
            changedIds: recalcResult.changedIds,
          };
        } else {
          coreResult = { changedTasks: [], changedIds: [] };
        }
        break;
      }

      case 'delete_tasks': {
        const deletedIds = new Set(command.taskIds);
        for (const taskId of command.taskIds) {
          taskChanges.push({ action: 'delete', taskId });
        }

        const remainingSnapshot = coreSnapshot.filter((task) => !deletedIds.has(task.id)).map((task) => ({
          ...task,
          dependencies: (task.dependencies ?? []).filter((dependency) => !deletedIds.has(dependency.taskId)),
        }));
        const recalcResult = recalculateProjectSchedule(remainingSnapshot, opts);
        coreResult = {
          changedTasks: recalcResult.changedTasks,
          changedIds: recalcResult.changedIds,
        };
        break;
      }

      case 'create_dependency': {
        dependencyChanges.push({
          action: 'create',
          taskId: command.taskId,
          depTaskId: command.dependency.taskId,
          type: command.dependency.type,
          lag: command.dependency.lag,
        });

        // Add dependency to snapshot and recalculate
        const updatedSnapshot = coreSnapshot.map(t => {
          if (t.id === command.taskId) {
            return {
              ...t,
              dependencies: [...(t.dependencies ?? []), {
                taskId: command.dependency.taskId,
                type: command.dependency.type,
                lag: command.dependency.lag ?? 0,
              }],
            };
          }
          return t;
        });
        coreResult = recalculateTaskFromDependencies(command.taskId, updatedSnapshot, opts);
        break;
      }

      case 'remove_dependency': {
        dependencyChanges.push({
          action: 'delete',
          taskId: command.taskId,
          depTaskId: command.depTaskId,
        });

        // Remove dependency from snapshot
        const updatedSnapshot = coreSnapshot.map(t => {
          if (t.id === command.taskId) {
            return {
              ...t,
              dependencies: (t.dependencies ?? []).filter(d => d.taskId !== command.depTaskId),
            };
          }
          return t;
        });
        // Recalculate the task — it may now be free of constraints
        coreResult = recalculateTaskFromDependencies(command.taskId, updatedSnapshot, opts);
        if (coreResult.changedTasks.length === 0) {
          // Task has no other deps, return it unchanged
          const task = updatedSnapshot.find(t => t.id === command.taskId);
          coreResult = task
            ? { changedTasks: [task], changedIds: [task.id] }
            : { changedTasks: [], changedIds: [] };
        }
        break;
      }

      case 'change_dependency_lag': {
        dependencyChanges.push({
          action: 'update',
          taskId: command.taskId,
          depTaskId: command.depTaskId,
          lag: command.lag,
        });

        // Update lag in snapshot
        const updatedSnapshot = coreSnapshot.map(t => {
          if (t.id === command.taskId) {
            return {
              ...t,
              dependencies: (t.dependencies ?? []).map(d =>
                d.taskId === command.depTaskId ? { ...d, lag: command.lag } : d,
              ),
            };
          }
          return t;
        });
        coreResult = recalculateTaskFromDependencies(command.taskId, updatedSnapshot, opts);
        break;
      }

      case 'reparent_task': {
        taskChanges.push({
          action: 'update_parent',
          taskId: command.taskId,
          newParentId: command.newParentId,
        });

        // Reparenting doesn't change scheduling directly, but parent rollup
        // may change. Recalculate project to update parent date ranges.
        const updatedSnapshot = coreSnapshot.map(t => {
          if (t.id === command.taskId) {
            return { ...t, parentId: command.newParentId ?? undefined };
          }
          return t;
        });
        coreResult = recalculateProjectSchedule(updatedSnapshot, opts);
        break;
      }

      case 'reorder_tasks': {
        for (const update of command.updates) {
          taskChanges.push({
            action: 'update_sort',
            taskId: update.taskId,
            sortOrder: update.sortOrder,
          });
        }

        coreResult = { changedTasks: [], changedIds: [] };
        break;
      }

      default: {
        const _exhaustive: never = command;
        return { changedTasks: [], changedDependencyIds: [], conflicts: [], dependencyChanges: [], taskChanges };
      }
    }

    return {
      changedTasks: coreResult.changedTasks,
      changedDependencyIds,
      conflicts,
      dependencyChanges,
      taskChanges,
    };
  }
}

export const commandService = new CommandService();
