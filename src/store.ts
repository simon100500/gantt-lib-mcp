/**
 * In-memory task storage for MCP server
 *
 * Uses Map-based storage for task CRUD operations.
 * Per STATE.md decision: In-memory only, no file persistence.
 */

import { Task, CreateTaskInput, UpdateTaskInput } from './types.js';

/**
 * TaskStore provides in-memory storage and CRUD operations for Gantt tasks
 */
export class TaskStore {
  private tasks: Map<string, Task>;

  constructor() {
    this.tasks = new Map();
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
    this.tasks.set(id, task);
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

    const updated: Task = {
      ...task,
      ...(input.name !== undefined && { name: input.name }),
      ...(input.startDate !== undefined && { startDate: input.startDate }),
      ...(input.endDate !== undefined && { endDate: input.endDate }),
      ...(input.color !== undefined && { color: input.color }),
      ...(input.progress !== undefined && { progress: input.progress }),
      ...(input.dependencies !== undefined && { dependencies: input.dependencies }),
    };

    this.tasks.set(id, updated);
    return updated;
  }

  /**
   * Delete a task
   * @param id - Task ID
   * @returns true if deleted, false if not found
   */
  delete(id: string): boolean {
    return this.tasks.delete(id);
  }
}

/**
 * Singleton instance of TaskStore for use throughout the application
 */
export const taskStore = new TaskStore();
