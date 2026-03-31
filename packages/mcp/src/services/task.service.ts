/**
 * TaskService - Prisma-backed task CRUD operations
 *
 * Provides type-safe task management using Prisma Client.
 * Replaces TaskStore's direct SQL queries with Prisma operations.
 * Maintains backward-compatible API with existing TaskStore.
 */

import { getPrisma } from '../prisma.js';
import { TaskScheduler } from '../scheduler.js';
import type {
  Task,
  CreateTaskInput,
  UpdateTaskInput,
  TaskDependency,
  TaskMutationSource,
  TaskMutationEvent,
  ScheduleCommand,
  ScheduleCommandOptions,
  TaskMutationResult,
} from '../types.js';
import { dependencyService } from './dependency.service.js';
import { dateToDomain, domainToDate } from './types.js';
import { randomUUID } from 'node:crypto';
import { sanitizeHierarchyDependencies } from './hierarchy-dependency-sanitizer.js';

export class TaskService {
  private _prisma: ReturnType<typeof getPrisma> | undefined;

  private get prisma() {
    if (!this._prisma) {
      this._prisma = getPrisma();
    }
    return this._prisma;
  }

  // Helper: Convert Prisma Task to domain Task
  private taskToDomain(task: any, dependencies: TaskDependency[] = []): Task {
    return {
      id: task.id,
      name: task.name,
      startDate: dateToDomain(task.startDate),
      endDate: dateToDomain(task.endDate),
      color: task.color || undefined,
      parentId: task.parentId || undefined,
      progress: task.progress,
      dependencies,
      sortOrder: task.sortOrder,
    };
  }

  // Helper: Load snapshot for scheduler (all tasks with dependencies)
  private async loadSnapshot(projectId?: string): Promise<Map<string, Task>> {
    const tasks = await this.prisma.task.findMany({
      where: projectId ? { projectId } : undefined,
      include: { dependencies: true },
    });

    const map = new Map<string, Task>();
    for (const task of tasks) {
      const deps = task.dependencies.map(d => ({
        taskId: d.depTaskId,
        type: d.type as TaskDependency['type'],
        lag: d.lag,
      }));
      map.set(task.id, this.taskToDomain(task, deps));
    }
    return map;
  }

  private async removeHierarchyDependencies(projectId?: string): Promise<string[]> {
    const snapshot = await this.loadSnapshot(projectId);
    const tasks = Array.from(snapshot.values());
    const { sanitizedTasks } = sanitizeHierarchyDependencies(tasks);
    const changedTasks = sanitizedTasks.filter((task, index) => {
      const originalDependencies = tasks[index].dependencies ?? [];
      const sanitizedDependencies = task.dependencies ?? [];

      if (originalDependencies.length !== sanitizedDependencies.length) {
        return true;
      }

      return originalDependencies.some((dep, depIndex) => {
        const sanitizedDep = sanitizedDependencies[depIndex];
        return (
          sanitizedDep?.taskId !== dep.taskId ||
          sanitizedDep?.type !== dep.type ||
          (sanitizedDep?.lag ?? 0) !== (dep.lag ?? 0)
        );
      });
    });

    if (changedTasks.length === 0) {
      return [];
    }

    await this.prisma.$transaction(async (tx) => {
      for (const task of changedTasks) {
        await tx.dependency.deleteMany({
          where: { taskId: task.id },
        });

        if ((task.dependencies ?? []).length > 0) {
          await tx.dependency.createMany({
            data: (task.dependencies ?? []).map(dep => ({
              taskId: task.id,
              depTaskId: dep.taskId,
              type: dep.type,
              lag: dep.lag ?? 0,
            })),
          });
        }
      }
    });

    return changedTasks.map(task => task.id);
  }

  private async syncParentDates(projectId?: string): Promise<void> {
    const tasks = await this.prisma.task.findMany({
      where: projectId ? { projectId } : undefined,
      select: {
        id: true,
        parentId: true,
        startDate: true,
        endDate: true,
      },
    });

    const taskById = new Map(tasks.map(task => [task.id, task]));
    const childrenById = new Map<string, string[]>();

    for (const task of tasks) {
      if (!task.parentId) continue;
      const children = childrenById.get(task.parentId) ?? [];
      children.push(task.id);
      childrenById.set(task.parentId, children);
    }

    const rangeMemo = new Map<string, { startDate: Date; endDate: Date }>();

    const computeRange = (taskId: string): { startDate: Date; endDate: Date } | null => {
      const memoized = rangeMemo.get(taskId);
      if (memoized) {
        return memoized;
      }

      const task = taskById.get(taskId);
      if (!task) {
        return null;
      }

      const childIds = childrenById.get(taskId) ?? [];
      if (childIds.length === 0) {
        const ownRange = {
          startDate: task.startDate,
          endDate: task.endDate,
        };
        rangeMemo.set(taskId, ownRange);
        return ownRange;
      }

      const childRanges = childIds
        .map(childId => computeRange(childId))
        .filter((range): range is { startDate: Date; endDate: Date } => range !== null);

      if (childRanges.length === 0) {
        return null;
      }

      const derivedRange = {
        startDate: new Date(Math.min(...childRanges.map(range => range.startDate.getTime()))),
        endDate: new Date(Math.max(...childRanges.map(range => range.endDate.getTime()))),
      };

      rangeMemo.set(taskId, derivedRange);
      return derivedRange;
    };

    const updates = tasks
      .filter(task => (childrenById.get(task.id) ?? []).length > 0)
      .map(task => {
        const derivedRange = computeRange(task.id);
        if (!derivedRange) {
          return null;
        }

        const startChanged = task.startDate.getTime() !== derivedRange.startDate.getTime();
        const endChanged = task.endDate.getTime() !== derivedRange.endDate.getTime();

        if (!startChanged && !endChanged) {
          return null;
        }

        return {
          id: task.id,
          startDate: derivedRange.startDate,
          endDate: derivedRange.endDate,
        };
      })
      .filter((update): update is { id: string; startDate: Date; endDate: Date } => update !== null);

    if (updates.length === 0) {
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      for (const update of updates) {
        await tx.task.update({
          where: { id: update.id },
          data: {
            startDate: update.startDate,
            endDate: update.endDate,
          },
        });
      }
    });
  }

  private isWeekend(date: Date): boolean {
    const day = date.getUTCDay();
    return day === 0 || day === 6;
  }

  private async getScheduleOptions(projectId?: string): Promise<ScheduleCommandOptions> {
    if (!projectId) {
      return {
        businessDays: false,
        weekendPredicate: (date) => this.isWeekend(date),
      };
    }

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { ganttDayMode: true },
    });

    return {
      businessDays: project?.ganttDayMode === 'business',
      weekendPredicate: (date) => this.isWeekend(date),
    };
  }

  private async runScheduler(
    changedTaskId: string,
    skipStart = false,
    projectId?: string,
    source?: TaskMutationSource,
  ): Promise<TaskMutationResult> {
    const snapshot = await this.loadSnapshot(projectId);
    const options = await this.getScheduleOptions(projectId);
    const scheduler = new TaskScheduler(snapshot, options);
    const updates = scheduler.recalculateDates(changedTaskId, skipStart);

    if (updates.size === 0) {
      const task = await this.get(changedTaskId);
      if (!task) {
        return { changedTasks: [], changedIds: [] };
      }

      await this.recordMutation('update', projectId, changedTaskId, source);
      return {
        task,
        changedTasks: [task],
        changedIds: [changedTaskId],
      };
    }

    return this.persistScheduleResult(
      projectId,
      {
        task: snapshot.get(changedTaskId),
        changedTasks: Array.from(updates.values()),
        changedIds: Array.from(updates.keys()),
      },
      source,
      changedTaskId,
    );
  }

  private async persistScheduleResult(
    projectId: string | undefined,
    result: TaskMutationResult,
    source: TaskMutationSource | undefined,
    primaryTaskId?: string,
  ): Promise<TaskMutationResult> {
    if (result.changedTasks.length > 0) {
      await this.prisma.$transaction(async (tx) => {
        for (const task of result.changedTasks) {
          await tx.task.update({
            where: { id: task.id },
            data: {
              name: task.name,
              startDate: domainToDate(task.startDate),
              endDate: domainToDate(task.endDate),
              color: task.color ?? null,
              parentId: task.parentId ?? null,
              progress: task.progress ?? 0,
              sortOrder: task.sortOrder,
            },
          });

          await tx.dependency.deleteMany({
            where: { taskId: task.id },
          });

          if ((task.dependencies ?? []).length > 0) {
            await tx.dependency.createMany({
              data: (task.dependencies ?? []).map((dependency) => ({
                taskId: task.id,
                depTaskId: dependency.taskId,
                type: dependency.type,
                lag: dependency.lag ?? 0,
              })),
            });
          }
        }
      });
    }

    for (const taskId of result.changedIds) {
      await this.recordMutation('update', projectId, taskId, source);
    }

    const refreshedSnapshot = await this.loadSnapshot(projectId);
    const snapshotTasks = Array.from(refreshedSnapshot.values());
    const changedTasks = result.changedIds
      .map((id) => refreshedSnapshot.get(id))
      .filter((task): task is Task => task !== undefined);

    return {
      task: primaryTaskId ? refreshedSnapshot.get(primaryTaskId) : result.task,
      changedTasks,
      changedIds: result.changedIds,
      snapshot: result.snapshot ? snapshotTasks : undefined,
    };
  }

  /** @deprecated Use commandService.commitCommand instead. Kept for backward compat. */
  async executeScheduleCommand(
    projectId: string | undefined,
    command: ScheduleCommand,
    source?: TaskMutationSource,
  ): Promise<TaskMutationResult> {
    const snapshot = await this.loadSnapshot(projectId);
    const options = await this.getScheduleOptions(projectId);
    const scheduler = new TaskScheduler(snapshot, options);
    const result = scheduler.execute(command, { ...options, includeSnapshot: true });

    return this.persistScheduleResult(
      projectId,
      {
        ...result,
        task: command.taskId ? snapshot.get(command.taskId) : undefined,
      },
      source,
      command.taskId,
    );
  }

  // Helper: Record mutation event
  private async recordMutation(
    mutationType: 'create' | 'update' | 'delete' | 'delete_all' | 'import',
    projectId: string | undefined,
    taskId: string | undefined,
    source?: TaskMutationSource
  ): Promise<void> {
    // Convert domain TaskMutationSource to Prisma MutationSource enum
    const sourceMapping: Record<TaskMutationSource, 'agent' | 'manual_save' | 'api' | 'system'> = {
      'agent': 'agent',
      'manual-save': 'manual_save',
      'api': 'api',
      'system': 'system',
    };
    const mutationSource = source ? sourceMapping[source] : 'system';

    await this.prisma.taskMutation.create({
      data: {
        projectId,
        taskId,
        source: mutationSource,
        mutationType,
        runId: process.env.AI_RUN_ID || null,
        sessionId: process.env.AI_SESSION_ID || null,
      },
    });
  }

  /**
   * Create a new task with dependencies
   * Uses transaction for atomic task + dependencies creation
   */
  async create(input: CreateTaskInput, projectId?: string, source?: TaskMutationSource): Promise<Task> {
    const id = randomUUID();

    // Validate dependencies exist
    if (input.dependencies && input.dependencies.length > 0) {
      await dependencyService.validateDependencies(input.dependencies);
    }

    // Validate parent if provided
    if (input.parentId) {
      if (input.parentId === id) {
        throw new Error('Task cannot be its own parent');
      }
      const parent = await this.prisma.task.findUnique({
        where: { id: input.parentId },
      });
      if (!parent) {
        throw new Error(`Parent task not found: ${input.parentId}`);
      }
    }

    // Get next sort order
    const whereClause = projectId ? { projectId } : {};
    const maxSort = await this.prisma.task.aggregate({
      where: whereClause,
      _max: { sortOrder: true },
    });
    const sortOrder = (maxSort._max.sortOrder ?? -1) + 1;

    // Create task and dependencies in transaction
    const task = await this.prisma.$transaction(async (tx) => {
      const created = await tx.task.create({
        data: {
          id,
          projectId: projectId || '', // Required field in Prisma schema
          name: input.name,
          startDate: domainToDate(input.startDate),
          endDate: domainToDate(input.endDate),
          color: input.color || null,
          parentId: input.parentId || null,
          progress: input.progress ?? 0,
          sortOrder,
        },
      });

      if (input.dependencies && input.dependencies.length > 0) {
        await tx.dependency.createMany({
          data: input.dependencies.map(dep => ({
            taskId: id,
            depTaskId: dep.taskId,
            type: dep.type,
            lag: dep.lag ?? 0,
          })),
        });
      }

      return created;
    });

    // Check for circular dependencies
    const snapshot = await this.loadSnapshot(projectId);
    const scheduler = new TaskScheduler(snapshot);
    if (scheduler.detectCycle(id)) {
      await this.prisma.task.delete({ where: { id } });
      throw new Error('Circular dependency detected');
    }

    if (input.parentId) {
      await this.removeHierarchyDependencies(projectId);
      await this.syncParentDates(projectId);
    }

    // Recalculate dates only after hierarchy cleanup so impossible
    // ancestor/descendant dependencies cannot move the task first.
    if (input.dependencies && input.dependencies.length > 0) {
      await this.runScheduler(id, false, projectId);
    }

    // Record mutation
    await this.recordMutation('create', projectId, id, source);

    // Return fresh task with dependencies
    const result = await this.get(id);
    return result!;
  }

  /**
   * List tasks by project ID with pagination
   */
  async list(
    projectId?: string,
    parentId?: string | null,
    limit: number = 100,
    offset: number = 0
  ): Promise<{ tasks: Task[]; hasMore: boolean; total: number }> {
    // Validate parameters
    if (limit < 1 || limit > 1000) {
      throw new Error('limit must be between 1 and 1000');
    }
    if (offset < 0) {
      throw new Error('offset must be >= 0');
    }

    // Build where clause with combined filters
    const whereClause: any = {};
    if (projectId) whereClause.projectId = projectId;
    if (parentId !== undefined) whereClause.parentId = parentId;

    // Query total count first
    const total = await this.prisma.task.count({
      where: Object.keys(whereClause).length > 0 ? whereClause : undefined,
    });

    // Query tasks with pagination
    const tasks = await this.prisma.task.findMany({
      where: Object.keys(whereClause).length > 0 ? whereClause : undefined,
      include: { dependencies: true },
      orderBy: { sortOrder: 'asc' },
      take: limit,
      skip: offset,
    });

    const result = tasks.map(task => {
      const deps = task.dependencies.map(d => ({
        taskId: d.depTaskId,
        type: d.type as TaskDependency['type'],
        lag: d.lag,
      }));
      return this.taskToDomain(task, deps);
    });

    return {
      tasks: result,
      hasMore: offset + limit < total,
      total,
    };
  }

  /**
   * Get a task by ID with dependencies and optional children
   */
  async get(id: string, includeChildren: boolean | 'shallow' | 'deep' = false): Promise<Task | undefined> {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: { dependencies: true },
    });

    if (!task) return undefined;

    const deps = task.dependencies.map(d => ({
      taskId: d.depTaskId,
      type: d.type as TaskDependency['type'],
      lag: d.lag,
    }));

    // Load children if requested
    let children: Task[] = [];
    if (includeChildren !== false) {
      const childTasks = await this.prisma.task.findMany({
        where: { parentId: id },
        include: { dependencies: true },
        orderBy: { sortOrder: 'asc' },
      });

      children = childTasks.map(child => {
        const childDeps = child.dependencies.map(d => ({
          taskId: d.depTaskId,
          type: d.type as TaskDependency['type'],
          lag: d.lag,
        }));
        return this.taskToDomain(child, childDeps);
      });

      // Recursive loading for 'deep' mode
      if (includeChildren === 'deep') {
        for (const child of children) {
          const nestedChildren = await this.get(child.id, 'deep');
          if (nestedChildren) {
            (child as any).children = nestedChildren.children || [];
          }
        }
      }
    }

    // Return task with children if loaded
    const result = this.taskToDomain(task, deps);
    if (children.length > 0) {
      (result as any).children = children;
    }
    return result;
  }

  /**
   * Update a task
   * Uses transaction for atomic task update + dependency replacement
   */
  async updateWithResult(
    id: string,
    input: UpdateTaskInput,
    source?: TaskMutationSource,
  ): Promise<TaskMutationResult | undefined> {
    const existing = await this.prisma.task.findUnique({
      where: { id },
      select: { projectId: true, parentId: true },
    });

    if (!existing) return undefined;

    const dependenciesUpdated = input.dependencies !== undefined;
    const datesChanged = input.startDate !== undefined || input.endDate !== undefined;
    const hierarchyChanged = input.parentId !== undefined && input.parentId !== existing.parentId;

    // Validate new dependencies
    if (input.dependencies) {
      await dependencyService.validateDependencies(input.dependencies);
    }

    // Validate parent
    if (input.parentId !== undefined && input.parentId) {
      if (input.parentId === id) {
        throw new Error('Task cannot be its own parent');
      }
      const parent = await this.prisma.task.findUnique({
        where: { id: input.parentId },
      });
      if (!parent) {
        throw new Error(`Parent task not found: ${input.parentId}`);
      }
    }

    // Build update data
    const updateData: any = {};
    if (input.name !== undefined) updateData.name = input.name;
    if (input.startDate !== undefined) updateData.startDate = domainToDate(input.startDate);
    if (input.endDate !== undefined) updateData.endDate = domainToDate(input.endDate);
    if (input.color !== undefined) updateData.color = input.color;
    // Handle parentId: null means remove parent, undefined means don't change
    if (input.parentId !== undefined) updateData.parentId = input.parentId;
    if (input.progress !== undefined) updateData.progress = input.progress;
    if (input.sortOrder !== undefined) updateData.sortOrder = input.sortOrder;

    // Transaction: update task, replace dependencies if needed
    await this.prisma.$transaction(async (tx) => {
      await tx.task.update({
        where: { id },
        data: updateData,
      });

      if (dependenciesUpdated) {
        await tx.dependency.deleteMany({ where: { taskId: id } });
        if (input.dependencies && input.dependencies.length > 0) {
          await tx.dependency.createMany({
            data: input.dependencies.map(dep => ({
              taskId: id,
              depTaskId: dep.taskId,
              type: dep.type,
              lag: dep.lag ?? 0,
            })),
          });
        }
      }
    });

    // Check for circular dependencies
    const snapshot = await this.loadSnapshot(existing.projectId || undefined);
    const scheduler = new TaskScheduler(snapshot);
    if (scheduler.detectCycle(id)) {
      throw new Error('Circular dependency detected');
    }

    if (hierarchyChanged) {
      await this.removeHierarchyDependencies(existing.projectId || undefined);
    }

    let result: TaskMutationResult;

    if (datesChanged || dependenciesUpdated) {
      const skipStart = datesChanged && !dependenciesUpdated;
      result = await this.runScheduler(id, skipStart, existing.projectId || undefined, source);
    } else {
      const task = await this.get(id);
      if (!task) {
        return undefined;
      }

      await this.recordMutation('update', existing.projectId || undefined, id, source);
      result = {
        task,
        changedTasks: [task],
        changedIds: [id],
      };
    }

    if (hierarchyChanged || datesChanged || existing.parentId || input.parentId) {
      await this.syncParentDates(existing.projectId || undefined);
    }

    const refreshedTask = await this.get(id);
    if (!refreshedTask) {
      return result;
    }

    return {
      ...result,
      task: refreshedTask,
      changedTasks: result.changedTasks.map((task) => (task.id === refreshedTask.id ? refreshedTask : task)),
    };
  }

  async update(id: string, input: UpdateTaskInput, source?: TaskMutationSource): Promise<Task | undefined> {
    const result = await this.updateWithResult(id, input, source);
    return result?.task;
  }

  /**
   * Delete a task with explicit dependency cleanup
   * Deletes both dependencies FROM this task and dependencies TO this task
   */
  async delete(id: string, source?: TaskMutationSource): Promise<boolean> {
    const task = await this.prisma.task.findUnique({
      where: { id },
      select: { projectId: true },
    });

    if (!task) return false;

    // Delete dependencies where this task is the source (from this task)
    await dependencyService.deleteByTaskId(id);
    // Delete dependencies where this task is the target (to this task)
    await dependencyService.deleteDependentOnTask(id);

    // Delete the task itself
    await this.prisma.task.delete({ where: { id } });

    await this.syncParentDates(task.projectId || undefined);

    await this.recordMutation('delete', task.projectId || undefined, id, source);

    return true;
  }

  /**
   * Delete all tasks for a project
   */
  async deleteAll(projectId?: string, source?: TaskMutationSource): Promise<number> {
    const result = await this.prisma.task.deleteMany({
      where: projectId ? { projectId } : {},
    });

    if (result.count > 0) {
      await this.recordMutation('delete_all', projectId, undefined, source);
    }

    return result.count;
  }

  /**
   * Get the current task revision number for a project
   */
  async getTaskRevision(projectId?: string): Promise<number> {
    const scopeId = projectId ?? '__global__';
    const revision = await this.prisma.taskRevision.findUnique({
      where: { projectId: scopeId },
      select: { revision: true },
    });
    return revision?.revision ?? 0;
  }

  /**
   * Get mutation events for a specific agent run
   */
  async getMutationEventsByRun(runId: string, projectId?: string): Promise<TaskMutationEvent[]> {
    const mutations = await this.prisma.taskMutation.findMany({
      where: {
        runId,
        ...(projectId ? { projectId } : {}),
      },
      orderBy: { createdAt: 'asc' },
    });
    return mutations.map(m => this.mutationToDomain(m));
  }

  /**
   * Get mutation events since a given ISO timestamp
   */
  async getMutationEventsSince(since: string, projectId?: string): Promise<TaskMutationEvent[]> {
    const mutations = await this.prisma.taskMutation.findMany({
      where: {
        createdAt: { gte: new Date(since) },
        ...(projectId ? { projectId } : {}),
      },
      orderBy: { createdAt: 'asc' },
    });
    return mutations.map(m => this.mutationToDomain(m));
  }

  /**
   * Convert Prisma TaskMutation to domain TaskMutationEvent
   */
  private mutationToDomain(m: any): TaskMutationEvent {
    const sourceReverseMap: Record<string, TaskMutationSource> = {
      agent: 'agent',
      manual_save: 'manual-save',
      api: 'api',
      system: 'system',
    };
    return {
      id: m.id,
      projectId: m.projectId ?? undefined,
      runId: m.runId ?? undefined,
      sessionId: m.sessionId ?? undefined,
      source: sourceReverseMap[m.source] ?? 'system',
      mutationType: m.mutationType as TaskMutationEvent['mutationType'],
      taskId: m.taskId ?? undefined,
      createdAt: m.createdAt.toISOString(),
    };
  }

  /**
   * Export all tasks as JSON
   */
  async exportTasks(): Promise<string> {
    const result = await this.list();
    return JSON.stringify(result.tasks, null, 2);
  }

  /**
   * Batch update tasks (incremental updates, does NOT delete existing tasks)
   * This is used for gantt-lib's onChange callbacks where only changed tasks are sent
   * Uses upsert to create new tasks or update existing ones
   * Uses topological sort to ensure parents are created/updated before children
   */
  async batchUpdateTasks(jsonData: string, projectId?: string, source?: TaskMutationSource): Promise<number> {
    let tasks: Task[];
    try {
      tasks = JSON.parse(jsonData) as Task[];
    } catch (e) {
      throw new Error(`Invalid JSON: ${(e as Error).message}`);
    }

    if (!Array.isArray(tasks)) {
      throw new Error('Import data must be an array of tasks');
    }

    // Sort tasks so that parents are created/updated before children
    // Build a dependency graph and use topological sort
    const taskMap = new Map(tasks.map(t => [t.id, t]));
    const sortedTasks: Task[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    // Recursive function to visit tasks in dependency order
    const visit = (taskId: string) => {
      if (visited.has(taskId)) return;
      if (visiting.has(taskId)) {
        // Circular dependency - skip to avoid infinite loop
        return;
      }

      visiting.add(taskId);
      const task = taskMap.get(taskId);
      if (task && task.parentId && taskMap.has(task.parentId)) {
        // Visit parent first
        visit(task.parentId);
      }

      visiting.delete(taskId);
      visited.add(taskId);
      if (task) {
        sortedTasks.push(task);
      }
    };

    // Visit all tasks
    for (const task of tasks) {
      visit(task.id);
    }

    // Use transaction for atomic batch update
    await this.prisma.$transaction(async (tx) => {
      for (const task of sortedTasks) {
        // Extract sortOrder from task if provided (for reordering operations)
        const sortOrder = (task as any).sortOrder;

        // Build create data
        const createData: any = {
          id: task.id,
          projectId: projectId || '',
          name: task.name,
          startDate: domainToDate(task.startDate),
          endDate: domainToDate(task.endDate),
          color: task.color || null,
          parentId: task.parentId || null,
          progress: task.progress ?? 0,
          sortOrder: sortOrder ?? 0,
        };

        // Build update data
        const updateData: any = {
          name: task.name,
          startDate: domainToDate(task.startDate),
          endDate: domainToDate(task.endDate),
          color: task.color || null,
          parentId: task.parentId || null,
          progress: task.progress ?? 0,
        };

        // Only update sortOrder if explicitly provided
        if (sortOrder !== undefined) {
          updateData.sortOrder = sortOrder;
        }

        // Upsert task: create if not exists, update if exists
        await tx.task.upsert({
          where: { id: task.id },
          create: {
            ...createData,
            dependencies: task.dependencies
              ? {
                  create: task.dependencies.map(dep => ({
                    depTaskId: dep.taskId,
                    type: dep.type,
                    lag: dep.lag ?? 0,
                  })),
                }
              : undefined,
          },
          update: updateData,
        });

        // Update dependencies if provided
        if (task.dependencies !== undefined) {
          // Delete existing dependencies
          await tx.dependency.deleteMany({ where: { taskId: task.id } });
          // Create new dependencies if any
          if (task.dependencies.length > 0) {
            await tx.dependency.createMany({
              data: task.dependencies.map(dep => ({
                taskId: task.id,
                depTaskId: dep.taskId,
                type: dep.type,
                lag: dep.lag ?? 0,
              })),
            });
          }
        }
      }
    });

    await this.removeHierarchyDependencies(projectId);
    await this.syncParentDates(projectId);

    // Record mutation for each task
    for (const task of tasks) {
      await this.recordMutation('update', projectId, task.id, source);
    }

    return tasks.length;
  }

  /**
   * Import tasks from JSON (replaces existing for project)
   * Uses transaction for atomic operation - all tasks succeed or all fail
   */
  async importTasks(jsonData: string, projectId?: string, source?: TaskMutationSource): Promise<number> {
    let tasks: Task[];
    try {
      tasks = JSON.parse(jsonData) as Task[];
    } catch (e) {
      throw new Error(`Invalid JSON: ${(e as Error).message}`);
    }

    if (!Array.isArray(tasks)) {
      throw new Error('Import data must be an array of tasks');
    }

    // Sort tasks so that parents are created before children
    // Build a dependency graph and use topological sort
    const taskMap = new Map(tasks.map(t => [t.id, t]));
    const sortedTasks: Task[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    // Recursive function to visit tasks in dependency order
    const visit = (taskId: string) => {
      if (visited.has(taskId)) return;
      if (visiting.has(taskId)) {
        // Circular dependency - skip to avoid infinite loop
        return;
      }

      visiting.add(taskId);
      const task = taskMap.get(taskId);
      if (task && task.parentId && taskMap.has(task.parentId)) {
        // Visit parent first
        visit(task.parentId);
      }

      visiting.delete(taskId);
      visited.add(taskId);
      if (task) {
        sortedTasks.push(task);
      }
    };

    // Visit all tasks
    for (const task of tasks) {
      visit(task.id);
    }

    // Use transaction for atomic import - delete all, then create all
    await this.prisma.$transaction(async (tx) => {
      // Delete existing tasks for project (cascades to dependencies)
      await tx.task.deleteMany({
        where: projectId ? { projectId } : {},
      });

      // Import all tasks in sorted order (parents before children)
      for (const [index, task] of sortedTasks.entries()) {
        await tx.task.create({
          data: {
            id: task.id,
            projectId: projectId || '', // Required field in Prisma schema
            name: task.name,
            startDate: domainToDate(task.startDate),
            endDate: domainToDate(task.endDate),
            color: task.color || null,
            parentId: task.parentId || null,
            progress: task.progress ?? 0,
            sortOrder: index,
            dependencies: task.dependencies
              ? {
                  create: task.dependencies.map(dep => ({
                    depTaskId: dep.taskId,
                    type: dep.type,
                    lag: dep.lag ?? 0,
                  })),
                }
              : undefined,
          },
        });
      }
    });

    await this.removeHierarchyDependencies(projectId);
    await this.syncParentDates(projectId);

    await this.recordMutation('import', projectId, undefined, source);

    return tasks.length;
  }
}

export const taskService = new TaskService();
