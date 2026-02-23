/**
 * In-memory task storage for MCP server
 *
 * Uses Map-based storage for task CRUD operations.
 * Per STATE.md decision: In-memory only, no file persistence.
 */

import { Task, CreateTaskInput, UpdateTaskInput } from './types.js';
import { TaskScheduler } from './scheduler.js';

/**
 * TaskStore provides in-memory storage and CRUD operations for Gantt tasks
 */
export class TaskStore {
  private tasks: Map<string, Task>;
  private scheduler: TaskScheduler;

  constructor() {
    this.tasks = new Map();
    this.scheduler = new TaskScheduler(this);
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
      // Return the updated task with cascade info
      return this.tasks.get(id);
    }

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
  delete(id: string): boolean {
    return this.tasks.delete(id);
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
}

/**
 * Singleton instance of TaskStore for use throughout the application
 */
export const taskStore = new TaskStore();
