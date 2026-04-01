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
          return {
            clientRequestId,
            accepted: false as const,
            reason: 'version_conflict' as const,
            currentVersion: project.version,
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
        for (const taskChange of executeResult.taskChanges) {
          if (taskChange.action === 'create' && taskChange.task) {
            const maxSort = await tx.task.aggregate({
              where: { projectId },
              _max: { sortOrder: true },
            });
            const sortOrder = (maxSort._max.sortOrder ?? -1) + 1;
            await tx.task.create({
              data: {
                id: taskChange.task.id,
                projectId,
                name: taskChange.task.name,
                startDate: domainToDate(taskChange.task.startDate),
                endDate: domainToDate(taskChange.task.endDate),
                color: taskChange.task.color ?? null,
                parentId: taskChange.task.parentId ?? null,
                progress: taskChange.task.progress ?? 0,
                sortOrder,
              },
            });
            if (taskChange.task.dependencies?.length) {
              const taskDef = taskChange.task;
              await tx.dependency.createMany({
                data: taskDef.dependencies!.map(dep => ({
                  id: randomUUID(),
                  taskId: taskDef.id,
                  depTaskId: dep.taskId,
                  type: dep.type,
                  lag: dep.lag ?? 0,
                })),
              });
            }
          } else if (taskChange.action === 'delete') {
            await tx.dependency.deleteMany({ where: { taskId: taskChange.taskId } });
            await tx.dependency.deleteMany({ where: { depTaskId: taskChange.taskId } });
            await tx.task.delete({ where: { id: taskChange.taskId } });
          } else if (taskChange.action === 'update_parent') {
            await tx.task.update({
              where: { id: taskChange.taskId },
              data: { parentId: taskChange.newParentId ?? null },
            });
          } else if (taskChange.action === 'update_sort') {
            await tx.task.update({
              where: { id: taskChange.taskId },
              data: { sortOrder: taskChange.sortOrder },
            });
          }
        }

        // Step 7: Persist full semantic state for every changed task that still exists.
        const deletedTaskIds = new Set(
          executeResult.taskChanges
            .filter((taskChange) => taskChange.action === 'delete')
            .map((taskChange) => taskChange.taskId),
        );

        for (const task of executeResult.changedTasks) {
          if (deletedTaskIds.has(task.id)) {
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
      });

      return result;
    } catch (error: any) {
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
        };
      }

      return {
        clientRequestId,
        accepted: false as const,
        reason: 'validation_error' as const,
        currentVersion: -1,
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
      case 'reorder_tasks':
        return command.updates[0]?.taskId;
      case 'recalculate_schedule':
        return command.taskId;
      case 'create_task':
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
        const task = coreSnapshot.find((candidate) => candidate.id === command.taskId);
        if (!task) {
          return { changedTasks: [], changedDependencyIds: [], conflicts: [], dependencyChanges: [], taskChanges };
        }

        const updatedTask: CoreTask = {
          ...task,
          ...(command.fields.name !== undefined ? { name: command.fields.name } : {}),
          ...(command.fields.color !== undefined ? { color: command.fields.color } : {}),
          ...(command.fields.parentId !== undefined ? { parentId: command.fields.parentId ?? undefined } : {}),
          ...(command.fields.progress !== undefined ? { progress: command.fields.progress } : {}),
          ...(command.fields.dependencies !== undefined
            ? {
                dependencies: command.fields.dependencies.map((dependency) => ({
                  ...dependency,
                  lag: dependency.lag ?? 0,
                })),
              }
            : {}),
        };

        const updatedSnapshot = coreSnapshot.map((candidate) =>
          candidate.id === command.taskId ? updatedTask : candidate,
        );

        if (command.fields.parentId !== undefined) {
          coreResult = recalculateProjectSchedule(updatedSnapshot, opts);
        } else if (command.fields.dependencies !== undefined) {
          coreResult = recalculateTaskFromDependencies(command.taskId, updatedSnapshot, opts);
        } else {
          coreResult = { changedTasks: [updatedTask], changedIds: [updatedTask.id] };
        }

        if (!coreResult.changedIds.includes(updatedTask.id)) {
          coreResult = {
            changedTasks: [updatedTask, ...coreResult.changedTasks],
            changedIds: [updatedTask.id, ...coreResult.changedIds],
          };
        } else {
          coreResult = {
            changedTasks: coreResult.changedTasks.map((candidate) =>
              candidate.id === updatedTask.id ? updatedTask : candidate,
            ),
            changedIds: coreResult.changedIds,
          };
        }
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
        const taskId = randomUUID();
        const newTask: Task = {
          id: taskId,
          name: command.task.name,
          startDate: command.task.startDate,
          endDate: command.task.endDate,
          color: command.task.color,
          parentId: command.task.parentId,
          progress: command.task.progress,
          dependencies: command.task.dependencies,
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
