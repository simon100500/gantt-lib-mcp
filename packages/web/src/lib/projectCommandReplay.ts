import {
  buildTaskRangeFromEnd,
  buildTaskRangeFromStart,
  moveTaskWithCascade,
  resizeTaskWithCascade,
  recalculateProjectSchedule,
  recalculateTaskFromDependencies,
  parseDateOnly,
  type ScheduleCommandOptions,
  type Task as CoreTask,
} from 'gantt-lib/core/scheduling';
import type { FrontendProjectCommand, ProjectSnapshot, Task, TaskDependency } from '../types';

function normalizeTaskDependencies(dependencies: TaskDependency[] | undefined): TaskDependency[] {
  return (dependencies ?? []).map((dependency) => ({
    ...dependency,
    lag: dependency.lag ?? 0,
  }));
}

function normalizeCoreTask(task: Task): CoreTask {
  return {
    ...task,
    dependencies: normalizeTaskDependencies(task.dependencies),
  };
}

function normalizeCoreSnapshot(snapshot: ProjectSnapshot): CoreTask[] {
  return snapshot.tasks.map(normalizeCoreTask);
}

function buildDependencyRows(tasks: Task[]): ProjectSnapshot['dependencies'] {
  return tasks.flatMap((task) =>
    (task.dependencies ?? []).map((dependency, index) => ({
      id: `${task.id}:${dependency.taskId}:${dependency.type}:${index}`,
      taskId: task.id,
      depTaskId: dependency.taskId,
      type: dependency.type,
      lag: dependency.lag ?? 0,
    })),
  );
}

function sortTasksForDisplay(tasks: Task[]): Task[] {
  return tasks
    .map((task, index) => ({ task, index }))
    .sort((a, b) => {
      const sortA = a.task.sortOrder ?? Number.MAX_SAFE_INTEGER;
      const sortB = b.task.sortOrder ?? Number.MAX_SAFE_INTEGER;
      if (sortA !== sortB) {
        return sortA - sortB;
      }
      return a.index - b.index;
    })
    .map(({ task }) => task);
}

function withTasks(tasks: Task[]): ProjectSnapshot {
  const orderedTasks = sortTasksForDisplay(tasks);
  return {
    tasks: orderedTasks,
    dependencies: buildDependencyRows(orderedTasks),
  };
}

function toTaskArray(tasks: CoreTask[]): Task[] {
  return tasks.map((task) => ({
    ...task,
    dependencies: normalizeTaskDependencies(task.dependencies),
  }));
}

export function replayProjectCommand(
  snapshot: ProjectSnapshot,
  command: FrontendProjectCommand,
  options: ScheduleCommandOptions = {},
  requestId?: string,
): ProjectSnapshot {
  const coreSnapshot = normalizeCoreSnapshot(snapshot);

  switch (command.type) {
    case 'move_task':
      return withTasks(toTaskArray(
        mergeChangedTasks(coreSnapshot, moveTaskWithCascade(command.taskId, parseDateOnly(command.startDate), coreSnapshot, options).changedTasks),
      ));

    case 'resize_task':
      return withTasks(toTaskArray(
        mergeChangedTasks(coreSnapshot, resizeTaskWithCascade(command.taskId, command.anchor, parseDateOnly(command.date), coreSnapshot, options).changedTasks),
      ));

    case 'set_task_start':
      return withTasks(toTaskArray(
        mergeChangedTasks(coreSnapshot, moveTaskWithCascade(command.taskId, parseDateOnly(command.startDate), coreSnapshot, options).changedTasks),
      ));

    case 'set_task_end':
      return withTasks(toTaskArray(
        mergeChangedTasks(coreSnapshot, resizeTaskWithCascade(command.taskId, 'end', parseDateOnly(command.endDate), coreSnapshot, options).changedTasks),
      ));

    case 'change_duration': {
      const task = coreSnapshot.find((candidate) => candidate.id === command.taskId);
      if (!task) return snapshot;
      const start = parseDateOnly(task.startDate as string);
      const end = parseDateOnly(task.endDate as string);
      if ((command.anchor ?? 'end') === 'end') {
        const { end: nextEnd } = buildTaskRangeFromStart(
          start,
          command.duration,
          options.businessDays ?? false,
          options.weekendPredicate,
        );
        return withTasks(toTaskArray(
          mergeChangedTasks(coreSnapshot, resizeTaskWithCascade(command.taskId, 'end', nextEnd, coreSnapshot, options).changedTasks),
        ));
      }

      const { start: nextStart } = buildTaskRangeFromEnd(
        end,
        command.duration,
        options.businessDays ?? false,
        options.weekendPredicate,
      );
      return withTasks(toTaskArray(
        mergeChangedTasks(coreSnapshot, resizeTaskWithCascade(command.taskId, 'start', nextStart, coreSnapshot, options).changedTasks),
      ));
    }

    case 'create_task': {
      const taskId = command.task.id ?? `pending:${requestId ?? crypto.randomUUID()}`;
      const createdTask: Task = {
        id: taskId,
        name: command.task.name,
        startDate: command.task.startDate,
        endDate: command.task.endDate,
        color: command.task.color,
        parentId: command.task.parentId,
        progress: command.task.progress,
        dependencies: normalizeTaskDependencies(command.task.dependencies),
      };

      const nextTasks = [...toTaskArray(coreSnapshot), createdTask];
      if ((createdTask.dependencies?.length ?? 0) === 0) {
        return withTasks(nextTasks);
      }

      const recalculated = recalculateTaskFromDependencies(taskId, nextTasks.map(normalizeCoreTask), options);
      return withTasks(toTaskArray(mergeChangedTasks(nextTasks.map(normalizeCoreTask), recalculated.changedTasks)));
    }

    case 'delete_task': {
      const withoutTask = toTaskArray(coreSnapshot)
        .filter((task) => task.id !== command.taskId)
        .map((task) => ({
          ...task,
          dependencies: normalizeTaskDependencies(task.dependencies).filter((dependency) => dependency.taskId !== command.taskId),
        }));
      const recalculated = recalculateProjectSchedule(withoutTask.map(normalizeCoreTask), options);
      return withTasks(toTaskArray(mergeChangedTasks(withoutTask.map(normalizeCoreTask), recalculated.changedTasks)));
    }

    case 'create_dependency': {
      const nextTasks = toTaskArray(coreSnapshot).map((task) => (
        task.id === command.taskId
          ? {
              ...task,
              dependencies: [
                ...normalizeTaskDependencies(task.dependencies),
                { ...command.dependency, lag: command.dependency.lag ?? 0, type: command.dependency.type as TaskDependency['type'] },
              ],
            }
          : task
      ));
      const recalculated = recalculateTaskFromDependencies(command.taskId, nextTasks.map(normalizeCoreTask), options);
      return withTasks(toTaskArray(mergeChangedTasks(nextTasks.map(normalizeCoreTask), recalculated.changedTasks)));
    }

    case 'remove_dependency': {
      const nextTasks = toTaskArray(coreSnapshot).map((task) => (
        task.id === command.taskId
          ? {
              ...task,
              dependencies: normalizeTaskDependencies(task.dependencies).filter((dependency) => dependency.taskId !== command.depTaskId),
            }
          : task
      ));
      const recalculated = recalculateTaskFromDependencies(command.taskId, nextTasks.map(normalizeCoreTask), options);
      return withTasks(toTaskArray(mergeChangedTasks(nextTasks.map(normalizeCoreTask), recalculated.changedTasks)));
    }

    case 'change_dependency_lag': {
      const nextTasks = toTaskArray(coreSnapshot).map((task) => (
        task.id === command.taskId
          ? {
              ...task,
              dependencies: normalizeTaskDependencies(task.dependencies).map((dependency) => (
                dependency.taskId === command.depTaskId ? { ...dependency, lag: command.lag } : dependency
              )),
            }
          : task
      ));
      const recalculated = recalculateTaskFromDependencies(command.taskId, nextTasks.map(normalizeCoreTask), options);
      return withTasks(toTaskArray(mergeChangedTasks(nextTasks.map(normalizeCoreTask), recalculated.changedTasks)));
    }

    case 'recalculate_schedule': {
      const result = command.taskId
        ? recalculateTaskFromDependencies(command.taskId, coreSnapshot, options)
        : recalculateProjectSchedule(coreSnapshot, options);
      return withTasks(toTaskArray(mergeChangedTasks(coreSnapshot, result.changedTasks)));
    }

    case 'update_task_fields': {
      const nextTasks = toTaskArray(coreSnapshot).map((task) => (
        task.id === command.taskId
          ? {
              ...task,
              ...(command.fields.name !== undefined ? { name: command.fields.name } : {}),
              ...(command.fields.color !== undefined ? { color: command.fields.color } : {}),
              ...(command.fields.parentId !== undefined ? { parentId: command.fields.parentId ?? undefined } : {}),
              ...(command.fields.progress !== undefined ? { progress: command.fields.progress } : {}),
              ...(command.fields.sortOrder !== undefined ? { sortOrder: command.fields.sortOrder } : {}),
              ...(command.fields.dependencies !== undefined ? { dependencies: normalizeTaskDependencies(command.fields.dependencies) } : {}),
            }
          : task
      ));

      if (command.fields.parentId !== undefined) {
        const result = recalculateProjectSchedule(nextTasks.map(normalizeCoreTask), options);
        return withTasks(toTaskArray(mergeChangedTasks(nextTasks.map(normalizeCoreTask), result.changedTasks)));
      }
      if (command.fields.dependencies !== undefined) {
        const result = recalculateTaskFromDependencies(command.taskId, nextTasks.map(normalizeCoreTask), options);
        return withTasks(toTaskArray(mergeChangedTasks(nextTasks.map(normalizeCoreTask), result.changedTasks)));
      }

      return withTasks(nextTasks);
    }

    case 'reparent_task': {
      const nextTasks = toTaskArray(coreSnapshot).map((task) => (
        task.id === command.taskId ? { ...task, parentId: command.newParentId ?? undefined } : task
      ));
      const result = recalculateProjectSchedule(nextTasks.map(normalizeCoreTask), options);
      return withTasks(toTaskArray(mergeChangedTasks(nextTasks.map(normalizeCoreTask), result.changedTasks)));
    }

    case 'reorder_task':
      return withTasks(
        toTaskArray(coreSnapshot).map((task) => (
          task.id === command.taskId ? { ...task, sortOrder: command.sortOrder } : task
        )),
      );

    case 'reorder_tasks': {
      const sortById = new Map(command.updates.map((update) => [update.taskId, update.sortOrder]));
      return withTasks(
        toTaskArray(coreSnapshot).map((task) => (
          sortById.has(task.id) ? { ...task, sortOrder: sortById.get(task.id)! } : task
        )),
      );
    }
  }
}

function mergeChangedTasks(snapshot: CoreTask[], changedTasks: CoreTask[]): CoreTask[] {
  const changedById = new Map(changedTasks.map((task) => [task.id, task]));
  const merged = snapshot.map((task) => changedById.get(task.id) ?? task);

  for (const task of changedTasks) {
    if (!merged.some((candidate) => candidate.id === task.id)) {
      merged.push(task);
    }
  }

  return merged;
}
