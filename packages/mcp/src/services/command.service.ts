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
  moveTaskWithCascade,
  resizeTaskWithCascade,
  recalculateTaskFromDependencies,
  recalculateProjectSchedule,
  parseDateOnly,
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
} from '../types.js';
import { dateToDomain, domainToDate } from './types.js';
import { randomUUID } from 'node:crypto';
import { getProjectScheduleOptionsForProject } from './projectScheduleOptions.js';

const CORE_VERSION = '0.62.0';
const INTERACTIVE_TRANSACTION_OPTIONS = {
  maxWait: 10_000,
  timeout: 60_000,
} as const;

function isVersionBumpRace(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025';
}

/** Normalize MCP Task[] to gantt-lib-compatible Task[].
 *  Fills lag: 0 where undefined so gantt-lib strict types are satisfied. */
function normalizeSnapshot(tasks: Task[]): CoreTask[] {
  return tasks.map(t => ({
    ...t,
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
async function loadTaskSnapshot(projectId: string, prismaClient: any): Promise<Task[]> {
  const tasks = await prismaClient.task.findMany({
    where: { projectId },
    include: { dependencies: true },
    orderBy: { sortOrder: 'asc' },
  });

  return tasks.map((task: any) => {
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
      color: task.color || undefined,
      parentId: task.parentId || undefined,
      progress: task.progress,
      dependencies: deps,
      sortOrder: task.sortOrder,
    };
  });
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

async function bulkUpdateTaskSortOrders(
  prismaClient: any,
  projectId: string,
  updates: Array<{ taskId: string; sortOrder: number }>,
): Promise<void> {
  if (updates.length === 0) {
    return;
  }

  const valueRows = Prisma.join(
    updates.map((update) => Prisma.sql`(${update.taskId}, ${update.sortOrder})`),
  );

  await prismaClient.$executeRaw(Prisma.sql`
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

  const valueRows = Prisma.join(
    updates.map((update) => Prisma.sql`(${update.taskId}, ${update.parentId})`),
  );

  await prismaClient.$executeRaw(Prisma.sql`
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
    ...(update.fields.color !== undefined ? { color: update.fields.color ?? undefined } : {}),
    ...(update.fields.parentId !== undefined ? { parentId: update.fields.parentId ?? undefined } : {}),
    ...(update.fields.progress !== undefined ? { progress: update.fields.progress } : {}),
    ...(update.fields.dependencies !== undefined
      ? {
          dependencies: update.fields.dependencies.map((dependency) => ({
            ...dependency,
            lag: dependency.lag ?? 0,
          })),
        }
      : {}),
  };

  const updatedSnapshot = snapshot.map((candidate) =>
    candidate.id === update.taskId ? updatedTask : candidate,
  );

  let coreResult: CoreResult;
  if (update.fields.parentId !== undefined) {
    coreResult = recalculateProjectSchedule(updatedSnapshot, opts);
  } else if (update.fields.dependencies !== undefined) {
    coreResult = recalculateTaskFromDependencies(update.taskId, updatedSnapshot, opts);
  } else {
    coreResult = { changedTasks: [updatedTask], changedIds: [updatedTask.id] };
  }

  if (!coreResult.changedIds.includes(updatedTask.id)) {
    return {
      changedTasks: [updatedTask, ...coreResult.changedTasks],
      changedIds: [updatedTask.id, ...coreResult.changedIds],
    };
  }

  return {
    changedTasks: coreResult.changedTasks.map((candidate) =>
      candidate.id === updatedTask.id ? updatedTask : candidate,
    ),
    changedIds: coreResult.changedIds,
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

export class CommandService {
  private _prisma: ReturnType<typeof getPrisma> | undefined;

  private get prisma() {
    if (!this._prisma) {
      this._prisma = getPrisma();
    }
    return this._prisma;
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
    const { projectId, clientRequestId, baseVersion, command } = request;

    try {
      const result = await this.prisma.$transaction(async (tx: any) => {
        // Step 1: Load project with version
        const project = await tx.project.findUnique({
          where: { id: projectId },
          select: { version: true, ganttDayMode: true },
        });

        if (!project) {
          return {
            clientRequestId,
            accepted: false as const,
            reason: 'validation_error' as const,
            currentVersion: -1,
          };
        }

        // Step 2: Optimistic concurrency check
        if (project.version !== baseVersion) {
          const snapshot = await buildProjectSnapshot(projectId, tx);
          return {
            clientRequestId,
            accepted: false as const,
            reason: 'version_conflict' as const,
            currentVersion: project.version,
            snapshot,
          };
        }

        // Step 3: Load current snapshot
        const beforeTasks = await loadTaskSnapshot(projectId, tx);
        const coreSnapshot = normalizeSnapshot(beforeTasks);
          const opts: CoreOptions = await getScheduleOptions(projectId, tx);

        // Step 4: Execute command through gantt-lib
        const newVersion = baseVersion + 1;
        const executeResult = await this.executeCommand(command, coreSnapshot, opts, projectId, tx);

        // Step 5: Persist dependency changes if any
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

        // Step 6: Handle task creates/deletes
        const createdTasks = executeResult.taskChanges.filter((taskChange) => taskChange.action === 'create' && taskChange.task);
        const createdTaskIds = new Set(
          createdTasks
            .map((taskChange) => taskChange.task?.id)
            .filter((taskId): taskId is string => Boolean(taskId)),
        );
        const isBatchCreateCommand = command.type === 'create_tasks_batch';
        const isBatchDeleteCommand = command.type === 'delete_tasks';

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
              color: taskChange.task!.color ?? null,
              parentId: taskChange.task!.parentId && !createdTaskIds.has(taskChange.task!.parentId)
                ? taskChange.task!.parentId
                : null,
              progress: taskChange.task!.progress ?? 0,
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
                  color: taskChange.task.color ?? null,
                  parentId: taskChange.task.parentId && !createdTaskIds.has(taskChange.task.parentId)
                    ? taskChange.task.parentId
                    : null,
                  progress: taskChange.task.progress ?? 0,
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

        // Step 7: Persist full semantic state for every changed task that still exists.
        const deletedTaskIdSet = new Set(deletedTaskIds);

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
              color: task.color ?? null,
              parentId: task.parentId ?? null,
              progress: task.progress ?? 0,
              sortOrder: 'sortOrder' in task ? (task as Task & { sortOrder?: number }).sortOrder : undefined,
            },
          });

          await syncTaskDependencies(tx, task.id, task.dependencies);
        }

        // Step 8: Load after-snapshot for patch computation
        const afterTasks = await loadTaskSnapshot(projectId, tx);

        // Step 9: Compute patches
        const patches = computePatches(
          beforeTasks,
          afterTasks,
          executeResult.changedTasks.map(t => t.id),
          this.getTargetTaskId(command),
        );

        // Step 10: Bump version atomically
        await tx.project.update({
          where: { id: projectId, version: baseVersion },
          data: { version: { increment: 1 } },
        });

        // Step 11: Create ProjectEvent record
        const executionTimeMs = Date.now() - startTime;
        await tx.projectEvent.create({
          data: {
            id: randomUUID(),
            projectId,
            baseVersion,
            version: newVersion,
            applied: true,
            actorType: actorType === 'import' ? 'import_actor' : actorType,
            actorId: actorId ?? null,
            coreVersion: CORE_VERSION,
            command: command as any,
            result: {
              changedTaskIds: executeResult.changedTasks.map(t => t.id),
              changedDependencyIds: executeResult.changedDependencyIds,
              conflicts: executeResult.conflicts,
            },
            patches: patches as any,
            executionTimeMs,
          },
        });

        // Step 12: Build final snapshot
        const snapshot = await buildProjectSnapshot(projectId, tx);

        return {
          clientRequestId,
          accepted: true as const,
          baseVersion,
          newVersion,
          result: {
            snapshot,
            changedTaskIds: executeResult.changedTasks.map(t => t.id),
            changedDependencyIds: executeResult.changedDependencyIds,
            conflicts: executeResult.conflicts,
            patches,
          },
          snapshot,
        };
      }, INTERACTIVE_TRANSACTION_OPTIONS);

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
        const newTask: Task = {
          id: taskId,
          name: command.task.name,
          startDate: command.task.startDate,
          endDate: command.task.endDate,
          color: command.task.color,
          parentId: command.task.parentId,
          progress: command.task.progress,
          dependencies: command.task.dependencies,
          sortOrder: command.task.sortOrder,
        };
        taskChanges.push({ action: 'create', task: { ...newTask, id: taskId } });

        // Add to snapshot and recalculate if has dependencies
        const updatedSnapshot = [...coreSnapshot, newTask as CoreTask];
        if (newTask.dependencies?.length) {
          coreResult = recalculateTaskFromDependencies(taskId, updatedSnapshot, opts);
          // Include the new task itself
          const changedMap = new Map(coreResult.changedTasks.map(t => [t.id, t]));
          if (!changedMap.has(taskId)) {
            coreResult.changedTasks.push(newTask as CoreTask);
            coreResult.changedIds.push(taskId);
          }
        } else {
          coreResult = { changedTasks: [newTask as CoreTask], changedIds: [taskId] };
        }
        break;
      }

      case 'create_tasks_batch': {
        const newTasks: Task[] = command.tasks.map((task) => ({
          id: task.id ?? randomUUID(),
          name: task.name,
          startDate: task.startDate,
          endDate: task.endDate,
          color: task.color,
          parentId: task.parentId,
          progress: task.progress,
          dependencies: task.dependencies,
          sortOrder: task.sortOrder,
        }));

        for (const task of newTasks) {
          taskChanges.push({ action: 'create', task });
        }
        coreResult = {
          changedTasks: newTasks as CoreTask[],
          changedIds: newTasks.map((task) => task.id),
        };
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
