/**
 * Auto-schedule engine for Gantt chart task dependencies
 *
 * Implements cascading date recalculation with support for all four
 * gantt-lib dependency types: FS, SS, FF, SF with circular dependency
 * detection and missing task validation.
 */

import { Task, TaskDependency, DependencyType } from './types.js';

/**
 * Result of applying a single dependency
 */
interface DateCalculation {
  startDate?: string;
  endDate?: string;
}

/**
 * TaskScheduler provides automatic date recalculation based on task dependencies.
 *
 * Accepts a Map<string, Task> snapshot for all operations — no async store access needed.
 *
 * Supports all four gantt-lib dependency types:
 * - FS (Finish-Start): dependent starts when predecessor finishes
 * - SS (Start-Start): dependent starts when predecessor starts
 * - FF (Finish-Finish): dependent finishes when predecessor finishes
 * - SF (Start-Finish): dependent finishes when predecessor starts
 */
export class TaskScheduler {
  /**
   * @param taskMap - Snapshot of all tasks (Map<id, Task>)
   */
  constructor(private taskMap: Map<string, Task>) {}

  /**
   * Replace the internal task snapshot (used after DB reloads)
   */
  setTaskMap(taskMap: Map<string, Task>): void {
    this.taskMap = taskMap;
  }

  /**
   * Validate all dependency references exist
   * @throws Error if any dependency references a non-existent task
   */
  validateDependencies(task: Task): void {
    if (!task.dependencies) return;
    for (const dep of task.dependencies) {
      if (!this.taskMap.get(dep.taskId)) {
        throw new Error(`Dependency references non-existent task: ${dep.taskId}`);
      }
    }
  }

  /**
   * Detect circular dependencies using DFS traversal
   * @param taskId - Task ID to start detection from
   * @param visited - Set of visited task IDs (for external use)
   * @param recStack - Recursion stack for cycle detection (internal)
   * @param path - Current path for error message (internal)
   * @returns true if circular dependency detected
   * @throws Error if circular dependency is detected
   */
  detectCycle(
    taskId: string,
    visited = new Set<string>(),
    recStack = new Set<string>(),
    path: string[] = []
  ): boolean {
    visited.add(taskId);
    recStack.add(taskId);
    path.push(taskId);

    const task = this.taskMap.get(taskId);
    if (task?.dependencies) {
      for (const dep of task.dependencies) {
        if (!visited.has(dep.taskId)) {
          if (this.detectCycle(dep.taskId, visited, recStack, [...path])) return true;
        } else if (recStack.has(dep.taskId)) {
          // Cycle detected - throw error
          const cyclePath = [...path, dep.taskId].join(' -> ');
          throw new Error(`Circular dependency detected: ${cyclePath}`);
        }
      }
    }

    recStack.delete(taskId);
    return false;
  }

  /**
   * Recalculate dates for a task and all dependent tasks (cascade)
   *
   * @param startTaskId - ID of task to start recalculation from
   * @param skipStartTask - If true, don't recalculate the start task itself (default: false)
   * @returns Map of task IDs to their updated task objects
   */
  recalculateDates(startTaskId: string, skipStartTask = false): Map<string, Task> {
    const updates = new Map<string, Task>();
    const visited = new Set<string>();

    // Helper to get task (prefer updates over original snapshot)
    const getTask = (id: string): Task | undefined => {
      return updates.get(id) || this.taskMap.get(id);
    };

    // Helper to apply dependency with access to updates map
    const applyDependencyWithUpdates = (task: Task, dep: TaskDependency): DateCalculation => {
      const predecessor = getTask(dep.taskId);
      if (!predecessor) throw new Error(`Task not found: ${dep.taskId}`);

      const lag = dep.lag || 0;

      switch (dep.type) {
        case 'FS': // Finish-Start: dependent starts the day after predecessor finishes
          return { startDate: this.addDays(predecessor.endDate, (lag || 0) + 1) };
        case 'SS': // Start-Start: dependent starts when predecessor starts
          return { startDate: this.addDays(predecessor.startDate, lag) };
        case 'FF': // Finish-Finish: dependent ends when predecessor finishes
          return { endDate: this.addDays(predecessor.endDate, lag) };
        case 'SF': // Start-Finish: dependent ends when predecessor starts
          return { endDate: this.addDays(predecessor.startDate, lag) };
        default:
          // Validate dependency type at compile time
          const _exhaustiveCheck: never = dep.type as never;
          throw new Error(`Unknown dependency type: ${_exhaustiveCheck}`);
      }
    };

    const processTask = (taskId: string): void => {
      if (visited.has(taskId)) return;
      visited.add(taskId);

      const task = this.taskMap.get(taskId);
      if (!task) return;

      // Skip processing the start task itself if requested
      // (its dates have been explicitly set by the user)
      if (skipStartTask && taskId === startTaskId) {
        // Just mark as visited and add to updates, then cascade to downstream tasks
        updates.set(taskId, task);

        // Find and process all tasks that depend on this one
        for (const [, t] of this.taskMap) {
          if (t.dependencies?.some(d => d.taskId === taskId)) {
            processTask(t.id);
          }
        }
        return;
      }

      if (!task.dependencies || task.dependencies.length === 0) return;

      // Apply all dependencies, using latest dates
      let newStartDate: string | undefined;
      let newEndDate: string | undefined;

      for (const dep of task.dependencies) {
        const result = applyDependencyWithUpdates(task, dep);
        if (result.startDate) {
          newStartDate = newStartDate
            ? (result.startDate > newStartDate ? result.startDate : newStartDate)
            : result.startDate;
        }
        if (result.endDate) {
          newEndDate = newEndDate
            ? (result.endDate > newEndDate ? result.endDate : newEndDate)
            : result.endDate;
        }
      }

      // Calculate duration to preserve if only start/end changes
      const originalDuration = this.dayDiff(task.startDate, task.endDate);
      let updatedTask: Task = { ...task };

      if (newStartDate && newStartDate !== task.startDate) {
        updatedTask.startDate = newStartDate;
        if (!newEndDate) {
          // Preserve duration
          updatedTask.endDate = this.addDays(newStartDate, originalDuration);
        }
      }
      if (newEndDate) {
        updatedTask.endDate = newEndDate;
      }

      updates.set(taskId, updatedTask);

      // Find and process all tasks that depend on this one
      for (const [, t] of this.taskMap) {
        if (t.dependencies?.some(d => d.taskId === taskId)) {
          processTask(t.id);
        }
      }
    };

    processTask(startTaskId);
    return updates;
  }

  /**
   * Calculate the difference in days between two dates
   * @param start - Start date string
   * @param end - End date string
   * @returns Number of days (inclusive)
   */
  private dayDiff(start: string, end: string): number {
    const startDate = new Date(start);
    const endDate = new Date(end);
    return Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  }

  /**
   * Add days to a date string
   * @param date - Date string in YYYY-MM-DD format
   * @param days - Number of days to add (can be negative)
   * @returns New date string in YYYY-MM-DD format
   */
  private addDays(date: string, days: number): string {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  }
}
