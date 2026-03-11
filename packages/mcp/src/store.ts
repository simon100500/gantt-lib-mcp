/**
 * Prisma-backed task storage for MCP server
 *
 * Replaces SQLite with Prisma/PostgreSQL for multi-user real-time support.
 * All public methods are async. TaskScheduler is supplied an in-memory snapshot
 * loaded from the DB before each operation that requires date recalculation.
 */

import { Task, CreateTaskInput, UpdateTaskInput, Message } from './types.js';
import { TaskScheduler } from './scheduler.js';
import { getDb } from './db.js';

// ---------------------------------------------------------------------------
// Prisma helpers
// ---------------------------------------------------------------------------

/**
 * Convert a Prisma dependency to a TaskDependency object
 */
function prismaToDependency(dep: {
  depTaskId: string;
  type: string;
  lag: number;
}): { taskId: string; type: 'FS' | 'SS' | 'FF' | 'SF'; lag: number } {
  return {
    taskId: dep.depTaskId,
    type: dep.type as 'FS' | 'SS' | 'FF' | 'SF',
    lag: dep.lag ?? 0,
  };
}

function normalizeDependencies(
  dependencies: Array<{ taskId: string; type: 'FS' | 'SS' | 'FF' | 'SF'; lag?: number }> | undefined,
): Array<{ taskId: string; type: 'FS' | 'SS' | 'FF' | 'SF'; lag: number }> {
  if (!dependencies || dependencies.length === 0) {
    return [];
  }

  const deduped = new Map<string, { taskId: string; type: 'FS' | 'SS' | 'FF' | 'SF'; lag: number }>();

  for (const dependency of dependencies) {
    deduped.set(`${dependency.taskId}:${dependency.type}`, {
      taskId: dependency.taskId,
      type: dependency.type,
      lag: dependency.lag ?? 0,
    });
  }

  return [...deduped.values()].sort((a, b) =>
    a.taskId.localeCompare(b.taskId) || a.type.localeCompare(b.type) || a.lag - b.lag,
  );
}

/**
 * Convert a Prisma task (without dependencies) to a partial Task object
 * Note: project_id is read from the row but not included in the Task interface
 * (it's a DB concern only, not part of the gantt-lib Task shape)
 */
function prismaToTaskBase(task: {
  id: string;
  order?: number;
  name: string;
  startDate: string;
  endDate: string;
  color: string | null;
  progress: number;
}): Omit<Task, 'dependencies'> {
  return {
    id: task.id,
    order: task.order,
    name: task.name,
    startDate: task.startDate,
    endDate: task.endDate,
    color: task.color ?? undefined,
    progress: task.progress ?? 0,
  };
}

// ---------------------------------------------------------------------------
// TaskStore
// ---------------------------------------------------------------------------

/**
 * TaskStore provides async CRUD operations for Gantt tasks backed by Prisma/PostgreSQL.
 * Also manages AI dialog history (messages table).
 */
export class TaskStore {
  private async getNextOrder(projectId?: string): Promise<number> {
    const db = await getDb();
    const lastTask = await db.task.findFirst({
      where: projectId ? { projectId } : { projectId: null },
      orderBy: { order: 'desc' },
      select: { order: true },
    });
    return (lastTask?.order ?? -1) + 1;
  }

  /**
   * Load all tasks from DB into a Map (used as scheduler snapshot)
   * @param projectId - Optional project ID to filter tasks by
   */
  private async loadSnapshot(projectId?: string): Promise<Map<string, Task>> {
    const db = await getDb();
    const tasks = await db.task.findMany({
      where: projectId
        ? { projectId }
        : undefined,
      include: { dependencies: true },
    });

    const map = new Map<string, Task>();
    for (const task of tasks) {
      const base = prismaToTaskBase(task);
      const deps = normalizeDependencies(task.dependencies.map(prismaToDependency));
      map.set(task.id, { ...base, dependencies: deps });
    }

    return map;
  }

  /**
   * Run scheduler recalculation after a task change.
   * Reloads all tasks from DB, runs scheduler in memory, writes back changed tasks.
   * @param projectId - Optional project ID to filter recalculation by
   */
  private async runScheduler(changedTaskId: string, skipStart = false, projectId?: string): Promise<void> {
    const snapshot = await this.loadSnapshot(projectId);
    const scheduler = new TaskScheduler(snapshot);
    const updates = scheduler.recalculateDates(changedTaskId, skipStart);

    const db = await getDb();

    // Batch update all changed tasks
    for (const [, updated] of updates) {
      await db.task.update({
        where: { id: updated.id },
        data: {
          name: updated.name,
          startDate: updated.startDate,
          endDate: updated.endDate,
          color: updated.color,
          progress: updated.progress,
        },
      });
    }
  }

  // --------------------------------------------------------------------------
  // Task CRUD
  // --------------------------------------------------------------------------

  /**
   * Create a new task with auto-generated UUID
   * @param input - Task creation input
   * @param projectId - Optional project ID to associate the task with
   */
  async create(input: CreateTaskInput, projectId?: string): Promise<Task> {
    const db = await getDb();
    const id = input.id ?? crypto.randomUUID();

    // Validate dependencies against existing tasks (any task can be a dependency, regardless of project)
    if (input.dependencies && input.dependencies.length > 0) {
      const normalizedDependencies = normalizeDependencies(input.dependencies);
      const depTaskIds = normalizedDependencies.map(d => d.taskId);
      const existingTasks = await db.task.findMany({
        where: { id: { in: depTaskIds } },
        select: { id: true },
      });

      const existingIds = new Set(existingTasks.map(t => t.id));
      const missing = depTaskIds.filter(id => !existingIds.has(id));
      if (missing.length > 0) {
        throw new Error(`Dependency references non-existent task(s): ${missing.join(', ')}`);
      }
    }

    const normalizedDependencies = normalizeDependencies(input.dependencies);

    // Create task with dependencies in a transaction
    const task = await db.task.create({
      data: {
        id,
        projectId,
        order: input.order ?? await this.getNextOrder(projectId),
        name: input.name,
        startDate: input.startDate,
        endDate: input.endDate,
        color: input.color,
        progress: input.progress ?? 0,
        dependencies: normalizedDependencies.length > 0
          ? {
              create: normalizedDependencies.map(dep => ({
                id: crypto.randomUUID(),
                depTaskId: dep.taskId,
                type: dep.type,
                lag: dep.lag ?? 0,
              })),
            }
          : undefined,
      },
      include: { dependencies: true },
    });

    // Validate no circular dependencies
    const snapshot = await this.loadSnapshot(projectId);
    const scheduler = new TaskScheduler(snapshot);
    if (scheduler.detectCycle(id)) {
      // Rollback — delete what we just inserted
      await db.task.delete({ where: { id } });
      throw new Error('Circular dependency detected: cannot create task with these dependencies');
    }

    // Recalculate dates if task has dependencies
    if (task.dependencies && task.dependencies.length > 0) {
      await this.runScheduler(id, false, projectId);
      // Reload to get updated dates
      const updated = await db.task.findUnique({
        where: { id },
        include: { dependencies: true },
      });
      if (updated) {
        const base = prismaToTaskBase(updated);
        const deps = normalizeDependencies(updated.dependencies.map(prismaToDependency));
        return { ...base, dependencies: deps };
      }
    }

    const base = prismaToTaskBase(task);
    const deps = normalizeDependencies(task.dependencies.map(prismaToDependency));
    return { ...base, dependencies: deps };
  }

  /**
   * List all tasks, optionally filtered by project ID
   * @param projectId - Optional project ID to filter tasks by
   * @param includeGlobal - If true, also include tasks with project_id=null (only works when projectId is specified)
   */
  async list(projectId?: string, includeGlobal = false): Promise<Task[]> {
    const db = await getDb();

    console.log('[STORE DEBUG] list() called with:', { projectId, includeGlobal });

    const tasks = await db.task.findMany({
      where: (projectId && includeGlobal)
        ? { OR: [{ projectId }, { projectId: null }] }
        : projectId
          ? { projectId }
          : undefined,
      orderBy: [
        { order: 'asc' },
        { id: 'asc' },
      ],
      include: { dependencies: true },
    });

    console.log('[STORE DEBUG] Prisma query executed, rows returned:', tasks.length);

    const result = tasks.map(task => {
      const base = prismaToTaskBase(task);
      const deps = normalizeDependencies(task.dependencies.map(prismaToDependency));
      return { ...base, dependencies: deps };
    });

    console.log('[STORE DEBUG] Returning tasks:', result.length, 'tasks');
    return result;
  }

  /**
   * Get a task by ID
   */
  async get(id: string): Promise<Task | undefined> {
    const db = await getDb();
    const task = await db.task.findUnique({
      where: { id },
      include: { dependencies: true },
    });

    if (!task) return undefined;

    const base = prismaToTaskBase(task);
    const deps = normalizeDependencies(task.dependencies.map(prismaToDependency));
    return { ...base, dependencies: deps };
  }

  /**
   * Update a task. Replaces dependency rows if dependencies are provided.
   * Runs scheduler recalculation if dates or dependencies changed.
   */
  async update(id: string, input: UpdateTaskInput): Promise<Task | undefined> {
    const task = await this.get(id);
    if (!task) return undefined;

    const db = await getDb();
    const dependenciesUpdated = input.dependencies !== undefined;

    // Validate new dependencies exist
    if (input.dependencies) {
      const normalizedDependencies = normalizeDependencies(input.dependencies);
      const depTaskIds = normalizedDependencies.map(d => d.taskId);
      const existingTasks = await db.task.findMany({
        where: { id: { in: depTaskIds } },
        select: { id: true },
      });

      const existingIds = new Set(existingTasks.map(t => t.id));
      const missing = depTaskIds.filter(id => !existingIds.has(id));
      if (missing.length > 0) {
        throw new Error(`Dependency references non-existent task(s): ${missing.join(', ')}`);
      }
    }

    const normalizedDependencies = input.dependencies === undefined
      ? undefined
      : normalizeDependencies(input.dependencies);

    const updated: Task = {
      ...task,
      ...(input.order !== undefined && { order: input.order }),
      ...(input.name !== undefined && { name: input.name }),
      ...(input.startDate !== undefined && { startDate: input.startDate }),
      ...(input.endDate !== undefined && { endDate: input.endDate }),
      ...(input.color !== undefined && { color: input.color }),
      ...(input.progress !== undefined && { progress: input.progress }),
      ...(normalizedDependencies !== undefined && { dependencies: normalizedDependencies }),
    };

    // Update task
    await db.task.update({
      where: { id },
      data: {
        order: updated.order ?? 0,
        name: updated.name,
        startDate: updated.startDate,
        endDate: updated.endDate,
        color: updated.color ?? null,
        progress: updated.progress ?? 0,
      },
    });

    // Replace dependencies if updated
    if (dependenciesUpdated) {
      // Delete existing dependencies
      await db.dependency.deleteMany({
        where: { taskId: id },
      });

      // Create new dependencies
      if (updated.dependencies && updated.dependencies.length > 0) {
        await db.dependency.createMany({
          data: updated.dependencies.map(dep => ({
            id: crypto.randomUUID(),
            taskId: id,
            depTaskId: dep.taskId,
            type: dep.type,
            lag: dep.lag ?? 0,
          })),
        });
      }
    }

    // Validate no circular dependencies
    const snapshot = await this.loadSnapshot();
    const scheduler = new TaskScheduler(snapshot);
    if (scheduler.detectCycle(id)) {
      throw new Error('Circular dependency detected: cannot update task with these dependencies');
    }

    // Recalculate if dates or dependencies changed
    const datesChanged = input.startDate !== undefined || input.endDate !== undefined;
    if (datesChanged || dependenciesUpdated) {
      const skipStartTask = datesChanged && !dependenciesUpdated;

      // If dates explicitly changed, update lags in dependencies
      if (datesChanged && !dependenciesUpdated && updated.dependencies && updated.dependencies.length > 0) {
        await this.updateLagsForMovedTask(updated, input);
      }

      // Get projectId for scheduler scope
      const taskRecord = await db.task.findUnique({
        where: { id },
        select: { projectId: true },
      });

      await this.runScheduler(id, skipStartTask, taskRecord?.projectId ?? undefined);
    }

    return await this.get(id);
  }

  /**
   * Update lag values in dependency rows when a task is explicitly moved
   */
  private async updateLagsForMovedTask(task: Task, input: UpdateTaskInput): Promise<void> {
    if (!task.dependencies || task.dependencies.length === 0) return;

    const newStartDate = input.startDate ?? task.startDate;
    const newEndDate = input.endDate ?? task.endDate;
    const db = await getDb();

    for (const dep of task.dependencies) {
      const predecessor = await this.get(dep.taskId);
      if (!predecessor) continue;

      let newLag = dep.lag ?? 0;

      switch (dep.type) {
        case 'FS': {
          newLag = this.dayDiff(predecessor.endDate, newStartDate);
          break;
        }
        case 'SS': {
          newLag = this.dayDiff(predecessor.startDate, newStartDate);
          break;
        }
        case 'FF': {
          newLag = this.dayDiff(predecessor.endDate, newEndDate);
          break;
        }
        case 'SF': {
          newLag = this.dayDiff(predecessor.startDate, newEndDate);
          break;
        }
      }

      await db.dependency.updateMany({
        where: {
          taskId: task.id,
          depTaskId: dep.taskId,
        },
        data: { lag: newLag },
      });
    }
  }

  /**
   * Calculate the difference in days between two date strings
   */
  private dayDiff(start: string, end: string): number {
    const startDate = new Date(start);
    const endDate = new Date(end);
    return Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  }

  /**
   * Delete a task by ID. CASCADE removes its dependency rows.
   * @returns true if deleted, false if not found
   */
  async delete(id: string): Promise<boolean> {
    const db = await getDb();
    try {
      await db.task.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Apply incremental task changes without replacing the entire project task set.
   * Useful for UI autosave where only a subset of tasks changed.
   */
  async applyPatch(
    patch: { upserts?: Task[]; deletes?: string[] },
    projectId?: string,
  ): Promise<{ upserts: number; deletes: number }> {
    const upserts = patch.upserts ?? [];
    const deletes = patch.deletes ?? [];
    const currentTasks = await this.list(projectId, false);
    const taskMap = new Map(currentTasks.map(task => [task.id, task]));

    for (const taskId of deletes) {
      taskMap.delete(taskId);
    }

    for (const task of upserts) {
      taskMap.set(task.id, {
        ...task,
        order: task.order,
        dependencies: normalizeDependencies(task.dependencies),
      });
    }

    const mergedTasks = [...taskMap.values()].sort((a, b) => {
      const orderA = a.order ?? Number.MAX_SAFE_INTEGER;
      const orderB = b.order ?? Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) return orderA - orderB;
      return a.id.localeCompare(b.id);
    });

    await this.importTasks(JSON.stringify(mergedTasks), projectId);

    return { upserts: upserts.length, deletes: deletes.length };
  }

  /**
   * Clear all tasks from the database, optionally filtered by project ID. CASCADE removes dependencies.
   * @param projectId - Optional project ID to filter deletions by
   * @returns number of tasks deleted
   */
  async deleteAll(projectId?: string): Promise<number> {
    const db = await getDb();
    const result = await db.task.deleteMany({
      where: projectId ? { projectId } : undefined,
    });
    return result.count;
  }

  /**
   * Export all tasks to JSON string
   */
  async exportTasks(): Promise<string> {
    const tasks = await this.list();
    return JSON.stringify(tasks, null, 2);
  }

  /**
   * Import tasks from JSON string (replaces existing tasks for the given project).
   * @param projectId - If provided, only tasks for this project are deleted before import
   * @returns number of tasks imported
   */
  async importTasks(jsonData: string, projectId?: string): Promise<number> {
    let tasks: Task[];
    try {
      tasks = JSON.parse(jsonData) as Task[];
    } catch (e) {
      throw new Error(`Invalid JSON data: ${(e as Error).message}`);
    }

    if (!Array.isArray(tasks)) {
      throw new Error('Import data must be an array of tasks');
    }

    const db = await getDb();

    await db.$transaction(async (tx) => {
      // Clear only the project's tasks (CASCADE removes deps); never touch other projects
      await tx.task.deleteMany({
        where: projectId ? { projectId } : undefined,
      });

      // Insert each task and its dependencies inside the same transaction so
      // listeners only ever observe the final committed snapshot.
      for (const [index, task] of tasks.entries()) {
        const normalizedDependencies = normalizeDependencies(task.dependencies);
        await tx.task.create({
          data: {
            id: task.id,
            projectId: projectId ?? null,
            order: task.order ?? index,
            name: task.name,
            startDate: task.startDate,
            endDate: task.endDate,
            color: task.color ?? null,
            progress: task.progress ?? 0,
            dependencies: normalizedDependencies.length > 0
              ? {
                  create: normalizedDependencies.map(dep => ({
                    id: crypto.randomUUID(),
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

    return tasks.length;
  }

  // --------------------------------------------------------------------------
  // Message history
  // --------------------------------------------------------------------------

  /**
   * Add a message to the dialog history
   * @param role - Message role ('user' or 'assistant')
   * @param content - Message content
   * @param projectId - Optional project ID to associate the message with
   */
  async addMessage(role: 'user' | 'assistant', content: string, projectId?: string): Promise<Message> {
    const db = await getDb();
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    await db.$executeRaw`
      INSERT INTO messages (id, project_id, role, content, created_at)
      VALUES (${id}, ${projectId ?? null}, ${role}, ${content}, ${createdAt})
    `;

    return {
      id,
      projectId,
      role,
      content,
      createdAt,
    };
  }

  /**
   * Get all messages ordered by creation time, optionally filtered by project ID
   * @param projectId - Optional project ID to filter messages by
   */
  async getMessages(projectId?: string): Promise<Message[]> {
    const db = await getDb();
    const messages = await db.message.findMany({
      where: projectId ? { projectId } : undefined,
      orderBy: { createdAt: 'asc' },
    });

    return messages.map(msg => ({
      id: msg.id,
      projectId: msg.projectId ?? undefined,
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
      createdAt: msg.createdAt.toISOString(),
    }));
  }
}

/**
 * Singleton instance of TaskStore for use throughout the application
 */
export const taskStore = new TaskStore();
