/**
 * SQLite-backed task storage for MCP server
 *
 * Replaces the in-memory Map-based store with a persistent SQLite store.
 * All public methods are async. TaskScheduler is supplied an in-memory snapshot
 * loaded from the DB before each operation that requires date recalculation.
 */

import { Task, CreateTaskInput, UpdateTaskInput, Message } from './types.js';
import { TaskScheduler } from './scheduler.js';
import { getDb } from './db.js';
import type { Row } from '@libsql/client';

// ---------------------------------------------------------------------------
// Row helpers
// ---------------------------------------------------------------------------

/**
 * Convert a dependency DB row to a TaskDependency object
 */
function rowToDependency(row: Row): { taskId: string; type: 'FS' | 'SS' | 'FF' | 'SF'; lag: number } {
  return {
    taskId: String(row['dep_task_id']),
    type: String(row['type']) as 'FS' | 'SS' | 'FF' | 'SF',
    lag: Number(row['lag'] ?? 0),
  };
}

/**
 * Convert a task DB row (without dependencies) to a partial Task object
 */
function rowToTaskBase(row: Row): Omit<Task, 'dependencies'> {
  return {
    id: String(row['id']),
    name: String(row['name']),
    startDate: String(row['start_date']),
    endDate: String(row['end_date']),
    color: row['color'] != null ? String(row['color']) : undefined,
    progress: Number(row['progress'] ?? 0),
  };
}

/**
 * Fetch dependencies for a task from the DB
 */
async function fetchDependencies(db: Awaited<ReturnType<typeof getDb>>, taskId: string) {
  const result = await db.execute({
    sql: 'SELECT dep_task_id, type, lag FROM dependencies WHERE task_id = ?',
    args: [taskId],
  });
  return result.rows.map(rowToDependency);
}

/**
 * Write updated task fields back to the DB (no dependency changes)
 */
async function writeTaskFields(
  db: Awaited<ReturnType<typeof getDb>>,
  task: Task
): Promise<void> {
  await db.execute({
    sql: `UPDATE tasks SET name = ?, start_date = ?, end_date = ?, color = ?, progress = ? WHERE id = ?`,
    args: [task.name, task.startDate, task.endDate, task.color ?? null, task.progress ?? 0, task.id],
  });
}

// ---------------------------------------------------------------------------
// TaskStore
// ---------------------------------------------------------------------------

/**
 * TaskStore provides async CRUD operations for Gantt tasks backed by SQLite.
 * Also manages AI dialog history (messages table).
 */
export class TaskStore {
  /**
   * Load all tasks from DB into a Map (used as scheduler snapshot)
   */
  private async loadSnapshot(): Promise<Map<string, Task>> {
    const db = await getDb();
    const result = await db.execute('SELECT * FROM tasks');
    const map = new Map<string, Task>();

    for (const row of result.rows) {
      const base = rowToTaskBase(row);
      const deps = await fetchDependencies(db, base.id);
      const task: Task = { ...base, dependencies: deps };
      map.set(task.id, task);
    }

    return map;
  }

  /**
   * Run scheduler recalculation after a task change.
   * Reloads all tasks from DB, runs scheduler in memory, writes back changed tasks.
   */
  private async runScheduler(changedTaskId: string, skipStart = false): Promise<void> {
    const snapshot = await this.loadSnapshot();
    const scheduler = new TaskScheduler(snapshot);
    const updates = scheduler.recalculateDates(changedTaskId, skipStart);

    const db = await getDb();
    for (const [, updated] of updates) {
      await writeTaskFields(db, updated);
    }
  }

  // --------------------------------------------------------------------------
  // Task CRUD
  // --------------------------------------------------------------------------

  /**
   * Create a new task with auto-generated UUID
   */
  async create(input: CreateTaskInput): Promise<Task> {
    const id = crypto.randomUUID();
    const task: Task = {
      id,
      name: input.name,
      startDate: input.startDate,
      endDate: input.endDate,
      color: input.color,
      progress: input.progress ?? 0,
      dependencies: input.dependencies ?? [],
    };

    const db = await getDb();

    // Validate dependencies against existing tasks
    if (task.dependencies && task.dependencies.length > 0) {
      for (const dep of task.dependencies) {
        const check = await db.execute({ sql: 'SELECT id FROM tasks WHERE id = ?', args: [dep.taskId] });
        if (check.rows.length === 0) {
          throw new Error(`Dependency references non-existent task: ${dep.taskId}`);
        }
      }
    }

    // Insert task row
    await db.execute({
      sql: `INSERT INTO tasks (id, name, start_date, end_date, color, progress) VALUES (?, ?, ?, ?, ?, ?)`,
      args: [id, task.name, task.startDate, task.endDate, task.color ?? null, task.progress ?? 0],
    });

    // Insert dependency rows
    if (task.dependencies && task.dependencies.length > 0) {
      for (const dep of task.dependencies) {
        await db.execute({
          sql: `INSERT INTO dependencies (id, task_id, dep_task_id, type, lag) VALUES (?, ?, ?, ?, ?)`,
          args: [crypto.randomUUID(), id, dep.taskId, dep.type, dep.lag ?? 0],
        });
      }
    }

    // Validate no circular dependencies
    const snapshot = await this.loadSnapshot();
    const scheduler = new TaskScheduler(snapshot);
    if (scheduler.detectCycle(id)) {
      // Rollback — remove what we just inserted
      await db.execute({ sql: 'DELETE FROM tasks WHERE id = ?', args: [id] });
      throw new Error('Circular dependency detected: cannot create task with these dependencies');
    }

    // Recalculate dates if task has dependencies
    if (task.dependencies && task.dependencies.length > 0) {
      await this.runScheduler(id);
    }

    // Return the current state of the task from DB
    const created = await this.get(id);
    return created ?? task;
  }

  /**
   * List all tasks
   */
  async list(): Promise<Task[]> {
    const db = await getDb();
    const result = await db.execute('SELECT * FROM tasks');
    const tasks: Task[] = [];
    for (const row of result.rows) {
      const base = rowToTaskBase(row);
      const deps = await fetchDependencies(db, base.id);
      tasks.push({ ...base, dependencies: deps });
    }
    return tasks;
  }

  /**
   * Get a task by ID
   */
  async get(id: string): Promise<Task | undefined> {
    const db = await getDb();
    const result = await db.execute({ sql: 'SELECT * FROM tasks WHERE id = ?', args: [id] });
    if (result.rows.length === 0) return undefined;
    const base = rowToTaskBase(result.rows[0]);
    const deps = await fetchDependencies(db, id);
    return { ...base, dependencies: deps };
  }

  /**
   * Update a task. Replaces dependency rows if dependencies are provided.
   * Runs scheduler recalculation if dates or dependencies changed.
   */
  async update(id: string, input: UpdateTaskInput): Promise<Task | undefined> {
    const task = await this.get(id);
    if (!task) return undefined;

    const dependenciesUpdated = input.dependencies !== undefined;

    const updated: Task = {
      ...task,
      ...(input.name !== undefined && { name: input.name }),
      ...(input.startDate !== undefined && { startDate: input.startDate }),
      ...(input.endDate !== undefined && { endDate: input.endDate }),
      ...(input.color !== undefined && { color: input.color }),
      ...(input.progress !== undefined && { progress: input.progress }),
      ...(input.dependencies !== undefined && { dependencies: input.dependencies }),
    };

    const db = await getDb();

    // Validate new dependencies exist
    if (input.dependencies) {
      for (const dep of input.dependencies) {
        const check = await db.execute({ sql: 'SELECT id FROM tasks WHERE id = ?', args: [dep.taskId] });
        if (check.rows.length === 0) {
          throw new Error(`Dependency references non-existent task: ${dep.taskId}`);
        }
      }
    }

    // Write updated task fields
    await db.execute({
      sql: `UPDATE tasks SET name = ?, start_date = ?, end_date = ?, color = ?, progress = ? WHERE id = ?`,
      args: [updated.name, updated.startDate, updated.endDate, updated.color ?? null, updated.progress ?? 0, id],
    });

    // Replace dependency rows if updated
    if (dependenciesUpdated) {
      await db.execute({ sql: 'DELETE FROM dependencies WHERE task_id = ?', args: [id] });
      if (updated.dependencies && updated.dependencies.length > 0) {
        for (const dep of updated.dependencies) {
          await db.execute({
            sql: `INSERT INTO dependencies (id, task_id, dep_task_id, type, lag) VALUES (?, ?, ?, ?, ?)`,
            args: [crypto.randomUUID(), id, dep.taskId, dep.type, dep.lag ?? 0],
          });
        }
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

      await this.runScheduler(id, skipStartTask);
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

      await db.execute({
        sql: 'UPDATE dependencies SET lag = ? WHERE task_id = ? AND dep_task_id = ?',
        args: [newLag, task.id, dep.taskId],
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
    const result = await db.execute({ sql: 'DELETE FROM tasks WHERE id = ?', args: [id] });
    return (result.rowsAffected ?? 0) > 0;
  }

  /**
   * Export all tasks to JSON string
   */
  async exportTasks(): Promise<string> {
    const tasks = await this.list();
    return JSON.stringify(tasks, null, 2);
  }

  /**
   * Import tasks from JSON string (replaces all existing tasks).
   * @returns number of tasks imported
   */
  async importTasks(jsonData: string): Promise<number> {
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

    // Clear all tasks (CASCADE removes deps)
    await db.execute('DELETE FROM tasks');

    // Insert each task and its dependencies
    for (const task of tasks) {
      await db.execute({
        sql: `INSERT INTO tasks (id, name, start_date, end_date, color, progress) VALUES (?, ?, ?, ?, ?, ?)`,
        args: [task.id, task.name, task.startDate, task.endDate, task.color ?? null, task.progress ?? 0],
      });

      if (task.dependencies && task.dependencies.length > 0) {
        for (const dep of task.dependencies) {
          await db.execute({
            sql: `INSERT INTO dependencies (id, task_id, dep_task_id, type, lag) VALUES (?, ?, ?, ?, ?)`,
            args: [crypto.randomUUID(), task.id, dep.taskId, dep.type, dep.lag ?? 0],
          });
        }
      }
    }

    return tasks.length;
  }

  // --------------------------------------------------------------------------
  // Message history
  // --------------------------------------------------------------------------

  /**
   * Add a message to the dialog history
   */
  async addMessage(role: 'user' | 'assistant', content: string): Promise<Message> {
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    const db = await getDb();
    await db.execute({
      sql: `INSERT INTO messages (id, role, content, created_at) VALUES (?, ?, ?, ?)`,
      args: [id, role, content, createdAt],
    });

    return { id, role, content, createdAt };
  }

  /**
   * Get all messages ordered by creation time
   */
  async getMessages(): Promise<Message[]> {
    const db = await getDb();
    const result = await db.execute('SELECT * FROM messages ORDER BY created_at ASC');
    return result.rows.map(row => ({
      id: String(row['id']),
      role: String(row['role']) as 'user' | 'assistant',
      content: String(row['content']),
      createdAt: String(row['created_at']),
    }));
  }
}

/**
 * Singleton instance of TaskStore for use throughout the application
 */
export const taskStore = new TaskStore();
