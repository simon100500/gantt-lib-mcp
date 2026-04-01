/**
 * TaskScheduler — thin adapter over gantt-lib/core/scheduling
 *
 * All scheduling logic (date math, cascade, hierarchy, dependency resolution)
 * is delegated to gantt-lib. This module only translates between MCP's
 * Map-based API and gantt-lib's array-based API.
 *
 * Type bridging: MCP's Task has optional `lag` in TaskDependency; gantt-lib's
 * TaskDependency requires `lag: number`. We normalize at the boundary via
 * `normalizeSnapshot`.
 */

import {
  moveTaskWithCascade,
  resizeTaskWithCascade,
  recalculateTaskFromDependencies,
  recalculateProjectSchedule,
  universalCascade,
  parseDateOnly,
  detectCycles,
  validateDependencies as coreValidateDependencies,
  type ScheduleCommandResult as CoreResult,
  type ScheduleCommandOptions as CoreOptions,
  type Task as CoreTask,
} from 'gantt-lib/core/scheduling';
import type {
  Task,
  ScheduleCommand,
  ScheduleCommandOptions,
  ScheduleCommandResult,
} from './types.js';

/**
 * Normalize MCP Task[] to gantt-lib-compatible Task[].
 * Fills `lag: 0` where undefined so gantt-lib's strict types are satisfied.
 */
function normalizeSnapshot(tasks: Task[]): CoreTask[] {
  return tasks.map(t => ({
    ...t,
    dependencies: t.dependencies?.map(d => ({
      ...d,
      lag: d.lag ?? 0,
    })),
  }));
}

export class TaskScheduler {
  private snapshot: Task[];
  private defaultOptions: ScheduleCommandOptions;

  constructor(taskMap: Map<string, Task>, defaultOptions?: ScheduleCommandOptions) {
    this.snapshot = Array.from(taskMap.values());
    this.defaultOptions = defaultOptions ?? {};
  }

  setTaskMap(taskMap: Map<string, Task>): void {
    this.snapshot = Array.from(taskMap.values());
  }

  getSnapshot(): Task[] {
    return this.snapshot.map(t => ({ ...t }));
  }

  validateDependencies(task: Task): void {
    for (const dep of task.dependencies ?? []) {
      if (!this.snapshot.find(t => t.id === dep.taskId)) {
        throw new Error(`Dependency references non-existent task: ${dep.taskId}`);
      }
    }
  }

  detectCycle(
    _taskId: string,
    _visited?: Set<string>,
    _recStack?: Set<string>,
    _path?: string[],
  ): boolean {
    const { hasCycle, cyclePath } = detectCycles(normalizeSnapshot(this.snapshot));
    if (hasCycle && cyclePath) {
      throw new Error(`Circular dependency detected: ${cyclePath.join(' -> ')}`);
    }
    return false;
  }

  private toCoreOptions(options?: ScheduleCommandOptions): CoreOptions {
    const source = options ?? this.defaultOptions;
    return {
      businessDays: source.businessDays,
      weekendPredicate: source.weekendPredicate,
    };
  }

  execute(command: ScheduleCommand, options?: ScheduleCommandOptions): ScheduleCommandResult {
    const opts = this.toCoreOptions(options);
    const includeSnapshot = options?.includeSnapshot ?? this.defaultOptions.includeSnapshot;
    const coreSnapshot = normalizeSnapshot(this.snapshot);
    let coreResult: CoreResult;

    switch (command.type) {
      case 'move_task':
        coreResult = moveTaskWithCascade(
          command.taskId,
          parseDateOnly(command.startDate),
          coreSnapshot,
          opts,
        );
        break;
      case 'resize_task':
        coreResult = resizeTaskWithCascade(
          command.taskId,
          command.anchor,
          parseDateOnly(command.date),
          coreSnapshot,
          opts,
        );
        break;
      case 'recalculate_schedule':
        if (command.taskId) {
          coreResult = recalculateTaskFromDependencies(command.taskId, coreSnapshot, opts);
        } else {
          coreResult = recalculateProjectSchedule(coreSnapshot, opts);
        }
        break;
    }

    const result: ScheduleCommandResult = {
      changedTasks: coreResult.changedTasks as Task[],
      changedIds: coreResult.changedIds,
    };

    if (includeSnapshot) {
      const map = new Map(coreSnapshot.map(t => [t.id, t as Task]));
      for (const changed of coreResult.changedTasks) {
        map.set(changed.id, changed as Task);
      }
      result.snapshot = Array.from(map.values());
    }

    return result;
  }

  moveTask(taskId: string, startDate: string, options?: ScheduleCommandOptions): ScheduleCommandResult {
    return this.execute({ type: 'move_task', taskId, startDate }, options);
  }

  resizeTask(
    taskId: string,
    anchor: 'start' | 'end',
    date: string,
    options?: ScheduleCommandOptions,
  ): ScheduleCommandResult {
    return this.execute({ type: 'resize_task', taskId, anchor, date }, options);
  }

  recalculateDates(changedTaskId: string, skipStartTask = false): Map<string, Task> {
    const opts = this.toCoreOptions();
    const coreSnapshot = normalizeSnapshot(this.snapshot);

    if (skipStartTask) {
      const task = coreSnapshot.find(t => t.id === changedTaskId);
      if (!task) {
        return new Map();
      }

      const cascaded = universalCascade(
        task,
        parseDateOnly(task.startDate),
        parseDateOnly(task.endDate),
        coreSnapshot,
        opts.businessDays ?? false,
        opts.weekendPredicate,
      );
      const changedTasks = [
        { ...task } as Task,
        ...cascaded.filter(t => t.id !== task.id).map(t => t as Task),
      ];
      return new Map(changedTasks.map(t => [t.id, t]));
    }

    const startTask = this.snapshot.find(t => t.id === changedTaskId);
    if (!startTask || !startTask.dependencies?.length) {
      return new Map();
    }

    const coreResult = recalculateTaskFromDependencies(changedTaskId, coreSnapshot, opts);
    const changedMap = new Map(coreResult.changedTasks.map(t => [t.id, t as Task]));

    // Collect transitive successors for backward compat
    const allChanged = new Map<string, Task>();
    const visited = new Set<string>();

    const collect = (taskId: string): void => {
      if (visited.has(taskId)) return;
      visited.add(taskId);

      const changed = changedMap.get(taskId) ?? this.snapshot.find(t => t.id === taskId);
      if (changed) {
        allChanged.set(taskId, changed);
      }

      for (const candidate of this.snapshot) {
        if (candidate.dependencies?.some(d => d.taskId === taskId)) {
          collect(candidate.id);
        }
      }
    };

    collect(changedTaskId);
    return allChanged;
  }
}
