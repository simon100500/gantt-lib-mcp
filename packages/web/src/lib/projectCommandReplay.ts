import {
  buildTaskRangeFromEnd,
  buildTaskRangeFromStart,
  getTaskDuration,
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

function normalizeCreatedTask(task: Task, options: ScheduleCommandOptions): Task {
  const duration = getTaskDuration(
    task.startDate as string,
    task.endDate as string,
    options.businessDays ?? false,
    options.weekendPredicate,
  );
  const normalizedRange = buildTaskRangeFromStart(
    parseDateOnly(task.startDate as string),
    duration,
    options.businessDays ?? false,
    options.weekendPredicate,
  );

  return {
    ...task,
    startDate: normalizedRange.start.toISOString().split('T')[0],
    endDate: normalizedRange.end.toISOString().split('T')[0],
  };
}

function scheduleCreatedTasks(
  snapshot: CoreTask[],
  newTasks: Task[],
  options: ScheduleCommandOptions,
): ProjectSnapshot {
  const normalizedNewTasks = newTasks.map((task) => normalizeCreatedTask(task, options));
  const recalculated = recalculateProjectSchedule(
    [...toTaskArray(snapshot), ...normalizedNewTasks].map(normalizeCoreTask),
    options,
  );
  const newTaskIds = new Set(normalizedNewTasks.map((task) => task.id));
  const finalNewTasksById = new Map(normalizedNewTasks.map((task) => [task.id, task]));

  for (const changedTask of toTaskArray(recalculated.changedTasks)) {
    if (newTaskIds.has(changedTask.id)) {
      finalNewTasksById.set(changedTask.id, changedTask);
    }
  }

  const mergedExistingTasks = toTaskArray(mergeChangedTasks(
    snapshot,
    recalculated.changedTasks.filter((task) => !newTaskIds.has(task.id)),
  ));

  return withTasks([
    ...mergedExistingTasks,
    ...newTasks.map((task) => finalNewTasksById.get(task.id) ?? task),
  ]);
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
      const createdSortOrder = command.task.sortOrder;
      const createdTask: Task = {
        id: taskId,
        name: command.task.name,
        startDate: command.task.startDate,
        endDate: command.task.endDate,
        color: command.task.color,
        parentId: command.task.parentId,
        progress: command.task.progress,
        dependencies: normalizeTaskDependencies(command.task.dependencies),
        sortOrder: createdSortOrder,
      };

      const nextTasks = toTaskArray(coreSnapshot).map((task) => (
        createdSortOrder !== undefined && (task.sortOrder ?? Number.MAX_SAFE_INTEGER) >= createdSortOrder
          ? { ...task, sortOrder: (task.sortOrder ?? createdSortOrder) + 1 }
          : task
      ));
      return scheduleCreatedTasks(nextTasks.map(normalizeCoreTask), [createdTask], options);
    }

    case 'create_tasks_batch': {
      const nextTasks = [...toTaskArray(coreSnapshot)];
      const createdTasks: Task[] = [];

      for (const taskDef of command.tasks) {
        const taskId = taskDef.id ?? `pending:${requestId ?? crypto.randomUUID()}`;
        createdTasks.push({
          id: taskId,
          name: taskDef.name,
          startDate: taskDef.startDate,
          endDate: taskDef.endDate,
          color: taskDef.color,
          parentId: taskDef.parentId,
          progress: taskDef.progress,
          dependencies: normalizeTaskDependencies(taskDef.dependencies),
          sortOrder: taskDef.sortOrder,
        });
      }

      return scheduleCreatedTasks(nextTasks.map(normalizeCoreTask), createdTasks, options);
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

    case 'delete_tasks': {
      const deletedIds = new Set(command.taskIds);
      const withoutTasks = toTaskArray(coreSnapshot)
        .filter((task) => !deletedIds.has(task.id))
        .map((task) => ({
          ...task,
          dependencies: normalizeTaskDependencies(task.dependencies).filter((dependency) => !deletedIds.has(dependency.taskId)),
        }));
      const recalculated = recalculateProjectSchedule(withoutTasks.map(normalizeCoreTask), options);
      return withTasks(toTaskArray(mergeChangedTasks(withoutTasks.map(normalizeCoreTask), recalculated.changedTasks)));
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
              ...(command.fields.color !== undefined ? { color: command.fields.color ?? undefined } : {}),
              ...(command.fields.parentId !== undefined ? { parentId: command.fields.parentId ?? undefined } : {}),
              ...(command.fields.progress !== undefined ? { progress: command.fields.progress } : {}),
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

    case 'update_tasks_fields_batch': {
      let nextTasks = toTaskArray(coreSnapshot);

      for (const update of command.updates) {
        nextTasks = replayProjectCommand(
          withTasks(nextTasks),
          {
            type: 'update_task_fields',
            taskId: update.taskId,
            fields: update.fields,
          },
          options,
          requestId,
        ).tasks;
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
