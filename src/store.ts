/**
 * In-memory task storage for MCP server
 *
 * Uses Map-based storage for task CRUD operations.
 * Supports optional autosave to JSON file for persistence.
 */

import * as fs from 'node:fs/promises';
import { Task, CreateTaskInput, UpdateTaskInput } from './types.js';
import { TaskScheduler } from './scheduler.js';

/**
 * TaskStore provides in-memory storage and CRUD operations for Gantt tasks
 */
export class TaskStore {
  private tasks: Map<string, Task>;
  private scheduler: TaskScheduler;
  private autoSavePath: string | null = null;
  private savePromise: Promise<void> | null = null;

  constructor() {
    this.tasks = new Map();
    this.scheduler = new TaskScheduler(this);
  }

  /**
   * Configure autosave path and load existing data if file exists
   * @param path - File path for autosave (e.g., './gantt-data.json')
   */
  setAutoSavePath(path: string): void {
    this.autoSavePath = path;
    // Load existing data if file exists
    this.loadFromFile().catch(err => {
      console.error(`Failed to load from file: ${err.message}`);
    });
  }

  /**
   * Save current tasks to JSON file asynchronously
   * Errors are logged but don't break operations
   */
  private async saveToFile(): Promise<void> {
    if (!this.autoSavePath) return;

    // Wait for any pending save to complete
    if (this.savePromise) {
      await this.savePromise;
    }

    // Queue the save operation
    this.savePromise = (async () => {
      try {
        const json = this.exportTasks();
        if (this.autoSavePath) {
          await fs.writeFile(this.autoSavePath, json, 'utf-8');
        }
      } catch (error) {
        const err = error as Error;
        console.error(`Failed to save tasks to ${this.autoSavePath}:`, err.message);
      } finally {
        this.savePromise = null;
      }
    })();

    await this.savePromise;
  }

  /**
   * Load tasks from JSON file
   * Silently ignores if file doesn't exist
   */
  private async loadFromFile(): Promise<void> {
    if (!this.autoSavePath) return;

    try {
      const json = await fs.readFile(this.autoSavePath, 'utf-8');
      this.importTasks(json);
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        // File doesn't exist yet, silently ignore
        return;
      }
      console.error(`Failed to load tasks from ${this.autoSavePath}:`, err.message);
    }
  }

  /**
   * Create a new task with auto-generated UUID
   * @param input - Task creation input
   * @returns Created task with generated ID
   */
  create(input: CreateTaskInput): Task {
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

    // Validate dependencies before storing
    this.scheduler.validateDependencies(task);

    // Check for circular dependencies
    if (this.scheduler.detectCycle(id)) {
      throw new Error(`Circular dependency detected: cannot create task with these dependencies`);
    }

    this.tasks.set(id, task);

    // If task has dependencies, recalculate its dates based on predecessors
    if (task.dependencies && task.dependencies.length > 0) {
      const updates = this.scheduler.recalculateDates(id);
      for (const [updateId, updatedTask] of updates.entries()) {
        this.tasks.set(updateId, updatedTask);
      }
    }

    // Autosave after creating task
    this.saveToFile().catch(err => {
      console.error(`Failed to autosave after create: ${err.message}`);
    });

    return task;
  }

  /**
   * List all tasks
   * @returns Array of all tasks
   */
  list(): Task[] {
    return Array.from(this.tasks.values());
  }

  /**
   * Get a task by ID
   * @param id - Task ID
   * @returns Task if found, undefined otherwise
   */
  get(id: string): Task | undefined {
    return this.tasks.get(id);
  }

  /**
   * Update a task
   * @param id - Task ID
   * @param input - Update input with optional fields
   * @returns Updated task if found, undefined otherwise
   */
  update(id: string, input: UpdateTaskInput): Task | undefined {
    const task = this.tasks.get(id);
    if (!task) return undefined;

    // Check if dependencies are being updated
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

    // Validate new dependencies
    this.scheduler.validateDependencies(updated);

    // Check for circular dependencies with new dependencies
    if (this.scheduler.detectCycle(id)) {
      throw new Error(`Circular dependency detected: cannot update task with these dependencies`);
    }

    this.tasks.set(id, updated);

    // If dates or dependencies changed, recalculate dependent tasks
    const datesChanged = input.startDate !== undefined || input.endDate !== undefined;
    if (datesChanged || dependenciesUpdated) {
      // If user explicitly changed dates, update lag in dependencies first
      // and skip recalculating the start task itself
      const skipStartTask = datesChanged && !dependenciesUpdated;

      if (datesChanged && !dependenciesUpdated && updated.dependencies && updated.dependencies.length > 0) {
        this.updateLagsForMovedTask(updated, input);
      }

      const updates = this.recalculateTaskDates(id, skipStartTask);

      // Autosave after updating task
      this.saveToFile().catch(err => {
        console.error(`Failed to autosave after update: ${err.message}`);
      });

      // Return the updated task with cascade info
      return this.tasks.get(id);
    }

    // Autosave after updating task (even if no date/dependency changes)
    this.saveToFile().catch(err => {
      console.error(`Failed to autosave after update: ${err.message}`);
    });

    return updated;
  }

  /**
   * Update lag values in dependencies when a task is explicitly moved
   * @param task - The task that was moved
   * @param input - The update input containing the new dates
   */
  private updateLagsForMovedTask(task: Task, input: UpdateTaskInput): void {
    if (!task.dependencies) return;

    const newStartDate = input.startDate ?? task.startDate;
    const newEndDate = input.endDate ?? task.endDate;

    for (let i = 0; i < task.dependencies.length; i++) {
      const dep = task.dependencies[i];
      const predecessor = this.get(dep.taskId);
      if (!predecessor) continue;

      let newLag = dep.lag ?? 0;

      // Calculate new lag based on dependency type
      switch (dep.type) {
        case 'FS': {
          // Task starts after predecessor finishes
          const currentStart = this.dayDiff(predecessor.endDate, newStartDate);
          newLag = currentStart;
          break;
        }
        case 'SS': {
          // Task starts when predecessor starts
          const currentStart = this.dayDiff(predecessor.startDate, newStartDate);
          newLag = currentStart;
          break;
        }
        case 'FF': {
          // Task ends when predecessor ends
          const currentEnd = this.dayDiff(predecessor.endDate, newEndDate);
          newLag = currentEnd;
          break;
        }
        case 'SF': {
          // Task ends when predecessor starts
          const currentEnd = this.dayDiff(predecessor.startDate, newEndDate);
          newLag = currentEnd;
          break;
        }
      }

      task.dependencies[i] = { ...dep, lag: newLag };
    }

    // Update the task with modified dependencies
    this.tasks.set(task.id, { ...task, dependencies: task.dependencies });
  }

  /**
   * Calculate the difference in days between two dates
   * @param start - Start date string
   * @param end - End date string
   * @returns Number of days
   */
  private dayDiff(start: string, end: string): number {
    const startDate = new Date(start);
    const endDate = new Date(end);
    return Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  }

  /**
   * Delete a task
   * @param id - Task ID
   * @returns true if deleted, false if not found
   */
  async delete(id: string): Promise<boolean> {
    const deleted = this.tasks.delete(id);

    if (deleted) {
      // Autosave after deleting task
      await this.saveToFile();
    }

    return deleted;
  }

  /**
   * Recalculate dates for a task and all dependent tasks
   * @param taskId - ID of the task that changed
   * @param skipStartTask - If true, don't recalculate the start task itself
   * @returns Map of updated task IDs to their new state
   */
  recalculateTaskDates(taskId: string, skipStartTask = false): Map<string, Task> {
    // Validate no circular dependencies before recalculation
    const task = this.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    // Validate all dependencies exist
    this.scheduler.validateDependencies(task);

    // Check for circular dependencies starting from this task
    if (this.scheduler.detectCycle(taskId)) {
      throw new Error(`Circular dependency detected involving task: ${taskId}`);
    }

    // Perform cascading date recalculation
    const updates = this.scheduler.recalculateDates(taskId, skipStartTask);

    // Apply updates to the store
    for (const [id, updatedTask] of updates.entries()) {
      this.tasks.set(id, updatedTask);
    }

    return updates;
  }

  /**
   * Export all tasks to JSON format
   * @returns JSON string of all tasks
   */
  exportTasks(): string {
    const tasks = Array.from(this.tasks.values());
    return JSON.stringify(tasks, null, 2);
  }

  /**
   * Import tasks from JSON data (replaces all existing tasks)
   * @param jsonData - JSON string containing array of tasks
   * @returns Number of tasks imported
   */
  importTasks(jsonData: string): number {
    let tasks: Task[];
    try {
      tasks = JSON.parse(jsonData) as Task[];
    } catch (e) {
      throw new Error(`Invalid JSON data: ${(e as Error).message}`);
    }

    if (!Array.isArray(tasks)) {
      throw new Error('Import data must be an array of tasks');
    }

    // Clear existing tasks
    this.tasks.clear();

    // Import each task
    for (const task of tasks) {
      this.tasks.set(task.id, task);
    }

    return tasks.length;
  }
}

/**
 * Singleton instance of TaskStore for use throughout the application
 */
export const taskStore = new TaskStore();
