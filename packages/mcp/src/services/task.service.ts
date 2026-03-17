/**
 * TaskService - Prisma-backed task CRUD operations
 *
 * Provides type-safe task management using Prisma Client.
 * Replaces TaskStore's direct SQL queries with Prisma operations.
 * Maintains backward-compatible API with existing TaskStore.
 */

import { getPrisma } from '../prisma.js';
import { TaskScheduler } from '../scheduler.js';
import type { Task, CreateTaskInput, UpdateTaskInput, TaskDependency, TaskMutationSource, TaskMutationEvent } from '../types.js';
import { dependencyService } from './dependency.service.js';
import { dateToDomain, domainToDate } from './types.js';
import { randomUUID } from 'node:crypto';

export class TaskService {
  private prisma = getPrisma();

  // Helper: Compute parent task dates from its children
  private async computeParentDates(parentId: string, projectId?: string): Promise<{ startDate: Date; endDate: Date } | null> {
    const children = await this.prisma.task.findMany({
      where: { parentId },
      select: { startDate: true, endDate: true },
    });

    if (children.length === 0) {
      return null;
    }

    // Parent start = min of children starts
    // Parent end = max of children ends
    const startDate = new Date(Math.min(...children.map(c => c.startDate.getTime())));
    const endDate = new Date(Math.max(...children.map(c => c.endDate.getTime())));

    return { startDate, endDate };
  }

  // Helper: Convert Prisma Task to domain Task
  private taskToDomain(task: any, dependencies: TaskDependency[] = [], full: boolean = false): Task {
    const base = {
      id: task.id,
      name: task.name,
      startDate: dateToDomain(task.startDate),
      endDate: dateToDomain(task.endDate),
      color: task.color || undefined,
      parentId: task.parentId || undefined,
      progress: task.progress,
    };

    if (!full) {
      return {
        ...base,
        dependencies: [], // Compact mode: empty dependencies array
      } as Task;
    }

    return {
      ...base,
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

  // Helper: Run scheduler and update affected tasks
  private async runScheduler(changedTaskId: string, skipStart = false, projectId?: string): Promise<void> {
    const snapshot = await this.loadSnapshot(projectId);
    const scheduler = new TaskScheduler(snapshot);
    const updates = scheduler.recalculateDates(changedTaskId, skipStart);

    for (const [, task] of updates) {
      await this.prisma.task.update({
        where: { id: task.id },
        data: {
          startDate: domainToDate(task.startDate),
          endDate: domainToDate(task.endDate),
        },
      });
    }
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

    // Recalculate dates if task has dependencies
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
   * List tasks by project ID with compact mode and pagination
   */
  async list(
    projectId?: string,
    parentId?: string | null,
    limit: number = 100,
    offset: number = 0,
    full: boolean = false
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
      return this.taskToDomain(task, deps, full);
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
        return this.taskToDomain(child, childDeps, true);
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
    const result = this.taskToDomain(task, deps, true);
    if (children.length > 0) {
      (result as any).children = children;
    }
    return result;
  }

  /**
   * Update a task
   * Uses transaction for atomic task update + dependency replacement
   */
  async update(id: string, input: UpdateTaskInput, source?: TaskMutationSource): Promise<Task | undefined> {
    const existing = await this.prisma.task.findUnique({
      where: { id },
      select: { projectId: true },
    });

    if (!existing) return undefined;

    const dependenciesUpdated = input.dependencies !== undefined;
    const datesChanged = input.startDate !== undefined || input.endDate !== undefined;

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

    // Recalculate dates
    if (datesChanged || dependenciesUpdated) {
      const skipStart = datesChanged && !dependenciesUpdated;
      await this.runScheduler(id, skipStart, existing.projectId || undefined);
    }

    // Record mutation
    await this.recordMutation('update', existing.projectId || undefined, id, source);

    // After updating a task, recompute parent dates if this is a child task
    if (updateData.parentId !== undefined) {
      // If parentId changed, recompute both old and new parent
      const oldParentId = (await this.prisma.task.findUnique({
        where: { id },
        select: { parentId: true },
      }))?.parentId;

      if (oldParentId) {
        const oldParentDates = await this.computeParentDates(oldParentId, existing.projectId || undefined);
        if (oldParentDates) {
          await this.prisma.task.update({
            where: { id: oldParentId },
            data: {
              startDate: oldParentDates.startDate,
              endDate: oldParentDates.endDate,
            },
          });
        }
      }

      if (updateData.parentId) {
        const newParentDates = await this.computeParentDates(updateData.parentId, existing.projectId || undefined);
        if (newParentDates) {
          await this.prisma.task.update({
            where: { id: updateData.parentId },
            data: {
              startDate: newParentDates.startDate,
              endDate: newParentDates.endDate,
            },
          });
        }
      }
    } else if ((await this.prisma.task.findUnique({
      where: { id },
      select: { parentId: true },
    }))?.parentId) {
      // If this is a child task, recompute its parent's dates
      const currentTask = await this.prisma.task.findUnique({
        where: { id },
        select: { parentId: true },
      });

      if (currentTask?.parentId) {
        const parentDates = await this.computeParentDates(currentTask.parentId, existing.projectId || undefined);
        if (parentDates) {
          await this.prisma.task.update({
            where: { id: currentTask.parentId },
            data: {
              startDate: parentDates.startDate,
              endDate: parentDates.endDate,
            },
          });
        }
      }
    }

    return this.get(id);
  }

  /**
   * Delete a task (dependencies cascade via Prisma)
   */
  async delete(id: string, source?: TaskMutationSource): Promise<boolean> {
    const task = await this.prisma.task.findUnique({
      where: { id },
      select: { projectId: true },
    });

    if (!task) return false;

    await this.prisma.task.delete({ where: { id } });

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

    // Record mutation for each task
    for (const task of tasks) {
      await this.recordMutation('update', projectId, task.id, source);
    }

    // After batch update, recompute parent dates for all affected parents
    const affectedParentIds = new Set<string>();
    for (const task of tasks) {
      if (task.parentId) {
        affectedParentIds.add(task.parentId);
      }
    }

    for (const parentId of affectedParentIds) {
      const parentDates = await this.computeParentDates(parentId, projectId);
      if (parentDates) {
        await this.prisma.task.update({
          where: { id: parentId },
          data: {
            startDate: parentDates.startDate,
            endDate: parentDates.endDate,
          },
        });
      }
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

    await this.recordMutation('import', projectId, undefined, source);

    return tasks.length;
  }
}

export const taskService = new TaskService();
