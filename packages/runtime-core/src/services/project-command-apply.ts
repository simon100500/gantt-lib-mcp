import { randomUUID } from 'node:crypto';
import {
  buildTaskRangeFromEnd,
  buildTaskRangeFromStart,
  moveTaskWithCascade,
  parseDateOnly,
  recalculateProjectSchedule,
  recalculateTaskFromDependencies,
  reflowTasksOnModeSwitch,
  resizeTaskWithCascade,
  type ScheduleCommandOptions as CoreOptions,
  type ScheduleCommandResult as CoreResult,
  type Task as CoreTask,
} from 'gantt-lib/core/scheduling';
import type {
  Conflict,
  DependencyType,
  Patch,
  ProjectCommand,
  ProjectSnapshot,
  ScheduleExecutionResult,
  Task,
  TaskDependency,
} from '../types.js';

function normalizeTaskDatesForType<TTask extends { startDate: string | Date; endDate: string | Date; type?: 'task' | 'milestone' }>(task: TTask): TTask {
  if ((task.type ?? 'task') !== 'milestone') {
    return task;
  }

  return {
    ...task,
    endDate: task.startDate,
  };
}

function normalizeSnapshot(tasks: Task[]): CoreTask[] {
  return tasks.map((task) => ({
    ...normalizeTaskDatesForType({
      ...task,
      type: task.type ?? 'task',
    }),
    dependencies: task.dependencies?.map((dependency) => ({
      ...dependency,
      lag: dependency.lag ?? 0,
    })),
  }));
}

function cloneTask(task: Task): Task {
  return {
    ...task,
    dependencies: task.dependencies?.map((dependency) => ({ ...dependency })),
    children: task.children?.map(cloneTask),
  };
}

function cloneSnapshot(snapshot: ProjectSnapshot): ProjectSnapshot {
  return {
    tasks: snapshot.tasks.map(cloneTask),
    dependencies: snapshot.dependencies.map((dependency) => ({ ...dependency })),
  };
}

function computePatches(
  beforeTasks: Task[],
  afterTasks: Task[],
  changedIds: string[],
  targetTaskId: string | undefined,
): Patch[] {
  const beforeById = new Map(beforeTasks.map((task) => [task.id, task]));
  const afterById = new Map(afterTasks.map((task) => [task.id, task]));
  const parentIds = new Set<string>();

  for (const task of afterTasks) {
    if (task.parentId) {
      parentIds.add(task.parentId);
    }
  }

  const patches: Patch[] = [];
  for (const id of changedIds) {
    const before = beforeById.get(id);
    const after = afterById.get(id);
    if (!before || !after) {
      continue;
    }
    if (before.startDate === after.startDate && before.endDate === after.endDate) {
      continue;
    }

    let reason: Patch['reason'];
    if (id === targetTaskId) {
      reason = 'direct_command';
    } else if (parentIds.has(id)) {
      reason = 'parent_rollup';
    } else {
      reason = 'dependency_cascade';
    }

    patches.push({
      entityType: 'task',
      entityId: id,
      before: { startDate: before.startDate, endDate: before.endDate },
      after: { startDate: after.startDate, endDate: after.endDate },
      reason,
    });
  }

  return patches;
}

function applyTaskFieldUpdateToSnapshot(
  snapshot: CoreTask[],
  update: Extract<ProjectCommand, { type: 'update_task_fields' }>,
  options: CoreOptions,
): CoreResult {
  const task = snapshot.find((candidate) => candidate.id === update.taskId);
  if (!task) {
    return { changedTasks: [], changedIds: [] };
  }

  const updatedTask: CoreTask = {
    ...task,
    ...(update.fields.name !== undefined ? { name: update.fields.name } : {}),
    ...(update.fields.type !== undefined ? { type: update.fields.type } : {}),
    ...(update.fields.color !== undefined ? { color: update.fields.color ?? undefined } : {}),
    ...(update.fields.parentId !== undefined ? { parentId: update.fields.parentId ?? undefined } : {}),
    ...(update.fields.progress !== undefined ? { progress: update.fields.progress } : {}),
    ...(update.fields.dependencies !== undefined
      ? {
          dependencies: update.fields.dependencies.map((dependency) => ({
            ...dependency,
            lag: dependency.lag ?? 0,
          })),
        }
      : {}),
  };

  const updatedSnapshot = snapshot.map((candidate) =>
    candidate.id === update.taskId ? normalizeTaskDatesForType(updatedTask) : candidate,
  );

  let result: CoreResult;
  if (update.fields.parentId !== undefined || update.fields.type !== undefined) {
    result = recalculateProjectSchedule(updatedSnapshot, options);
  } else if (update.fields.dependencies !== undefined) {
    result = recalculateTaskFromDependencies(update.taskId, updatedSnapshot, options);
  } else {
    result = { changedTasks: [updatedTask], changedIds: [updatedTask.id] };
  }

  if (!result.changedIds.includes(updatedTask.id)) {
    return {
      changedTasks: [updatedTask, ...result.changedTasks],
      changedIds: [updatedTask.id, ...result.changedIds],
    };
  }

  return {
    changedTasks: result.changedTasks.map((candidate) =>
      candidate.id === updatedTask.id
        ? {
            ...candidate,
            name: updatedTask.name,
            type: updatedTask.type,
            color: updatedTask.color,
            parentId: updatedTask.parentId,
            progress: updatedTask.progress,
            dependencies: updatedTask.dependencies,
          }
        : candidate,
    ),
    changedIds: result.changedIds,
  };
}

function normalizeCreatedTask(task: Task, options: CoreOptions): Task {
  if ((task.type ?? 'task') === 'milestone') {
    return normalizeTaskDatesForType({
      ...task,
      type: task.type ?? 'task',
    });
  }

  const startDate = parseDateOnly(task.startDate as string);
  const endDate = parseDateOnly(task.endDate as string);
  const duration = Math.max(
    1,
    Math.round((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)) + 1,
  );
  const normalizedRange = buildTaskRangeFromStart(
    startDate,
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

function scheduleCreatedTasks(snapshot: CoreTask[], newTasks: Task[], options: CoreOptions): CoreResult {
  const normalizedNewTasks = newTasks.map((task) => normalizeCreatedTask(task, options)) as CoreTask[];
  const updatedSnapshot = [...snapshot, ...normalizedNewTasks];
  const recalculated = recalculateProjectSchedule(updatedSnapshot, options);
  const newTaskIds = new Set(normalizedNewTasks.map((task) => task.id));
  const finalNewTasksById = new Map(normalizedNewTasks.map((task) => [task.id, task]));

  for (const changedTask of recalculated.changedTasks) {
    if (newTaskIds.has(changedTask.id)) {
      finalNewTasksById.set(changedTask.id, changedTask);
    }
  }

  const existingChangedTasks = recalculated.changedTasks.filter((task) => !newTaskIds.has(task.id));
  const changedTasks = [
    ...newTasks.map((task) => finalNewTasksById.get(task.id) ?? (task as CoreTask)),
    ...existingChangedTasks,
  ];

  return {
    changedTasks,
    changedIds: changedTasks.map((task) => task.id),
  };
}

function buildTaskSnapshot(tasks: CoreTask[]): Task[] {
  return tasks.map((task) => ({
    id: task.id,
    name: task.name,
    startDate: String(task.startDate),
    endDate: String(task.endDate),
    type: task.type ?? 'task',
    color: task.color,
    parentId: task.parentId,
    progress: task.progress,
    dependencies: task.dependencies?.map((dependency) => ({
      taskId: dependency.taskId,
      type: dependency.type as DependencyType,
      lag: dependency.lag ?? 0,
    })),
    ...('sortOrder' in task ? { sortOrder: task.sortOrder as number | undefined } : {}),
  }));
}

function updateDependencyRows(snapshot: ProjectSnapshot, command: ProjectCommand): string[] {
  switch (command.type) {
    case 'create_task': {
      const createdId = snapshot.tasks[snapshot.tasks.length - 1]?.id;
      const createdTask = createdId ? snapshot.tasks.find((task) => task.id === createdId) : null;
      if (!createdTask?.dependencies?.length) {
        return [];
      }
      const createdDependencyIds = createdTask.dependencies.map(() => randomUUID());
      snapshot.dependencies.push(
        ...createdTask.dependencies.map((dependency, index) => ({
          id: createdDependencyIds[index]!,
          taskId: createdTask.id,
          depTaskId: dependency.taskId,
          type: dependency.type,
          lag: dependency.lag ?? 0,
        })),
      );
      return createdDependencyIds;
    }
    case 'create_tasks_batch': {
      const existingTaskIds = new Set(snapshot.dependencies.map((dependency) => dependency.taskId));
      const createdDependencyIds: string[] = [];
      for (const task of snapshot.tasks) {
        if (existingTaskIds.has(task.id) || !task.dependencies?.length) {
          continue;
        }
        for (const dependency of task.dependencies) {
          const dependencyId = randomUUID();
          createdDependencyIds.push(dependencyId);
          snapshot.dependencies.push({
            id: dependencyId,
            taskId: task.id,
            depTaskId: dependency.taskId,
            type: dependency.type,
            lag: dependency.lag ?? 0,
          });
        }
      }
      return createdDependencyIds;
    }
    case 'delete_task': {
      snapshot.dependencies = snapshot.dependencies.filter(
        (dependency) => dependency.taskId !== command.taskId && dependency.depTaskId !== command.taskId,
      );
      return [];
    }
    case 'delete_tasks': {
      const deletedIds = new Set(command.taskIds);
      snapshot.dependencies = snapshot.dependencies.filter(
        (dependency) => !deletedIds.has(dependency.taskId) && !deletedIds.has(dependency.depTaskId),
      );
      return [];
    }
    case 'create_dependency': {
      const dependencyId = randomUUID();
      snapshot.dependencies.push({
        id: dependencyId,
        taskId: command.taskId,
        depTaskId: command.dependency.taskId,
        type: command.dependency.type,
        lag: command.dependency.lag ?? 0,
      });
      return [dependencyId];
    }
    case 'remove_dependency': {
      const removed = snapshot.dependencies.filter(
        (dependency) => dependency.taskId === command.taskId && dependency.depTaskId === command.depTaskId,
      );
      snapshot.dependencies = snapshot.dependencies.filter(
        (dependency) => dependency.taskId !== command.taskId || dependency.depTaskId !== command.depTaskId,
      );
      return removed.map((dependency) => dependency.id);
    }
    case 'change_dependency_lag': {
      const changed = snapshot.dependencies.filter(
        (dependency) => dependency.taskId === command.taskId && dependency.depTaskId === command.depTaskId,
      );
      snapshot.dependencies = snapshot.dependencies.map((dependency) =>
        dependency.taskId === command.taskId && dependency.depTaskId === command.depTaskId
          ? { ...dependency, lag: command.lag }
          : dependency,
      );
      return changed.map((dependency) => dependency.id);
    }
    case 'update_task_fields': {
      if (!('dependencies' in command.fields)) {
        return [];
      }
      snapshot.dependencies = snapshot.dependencies.filter((dependency) => dependency.taskId !== command.taskId);
      const nextDependencies = command.fields.dependencies ?? [];
      const createdDependencyIds = nextDependencies.map(() => randomUUID());
      snapshot.dependencies.push(
        ...nextDependencies.map((dependency, index) => ({
          id: createdDependencyIds[index]!,
          taskId: command.taskId,
          depTaskId: dependency.taskId,
          type: dependency.type,
          lag: dependency.lag ?? 0,
        })),
      );
      return createdDependencyIds;
    }
    case 'update_tasks_fields_batch': {
      const changedDependencyIds: string[] = [];
      for (const update of command.updates) {
        if (!('dependencies' in update.fields)) {
          continue;
        }
        snapshot.dependencies = snapshot.dependencies.filter((dependency) => dependency.taskId !== update.taskId);
        const nextDependencies = update.fields.dependencies ?? [];
        const createdIds = nextDependencies.map(() => randomUUID());
        changedDependencyIds.push(...createdIds);
        snapshot.dependencies.push(
          ...nextDependencies.map((dependency, index) => ({
            id: createdIds[index]!,
            taskId: update.taskId,
            depTaskId: dependency.taskId,
            type: dependency.type,
            lag: dependency.lag ?? 0,
          })),
        );
      }
      return changedDependencyIds;
    }
    default:
      return [];
  }
}

export function applyProjectCommandToSnapshot(
  snapshot: ProjectSnapshot,
  command: ProjectCommand,
  options: CoreOptions,
): ScheduleExecutionResult {
  const beforeSnapshot = cloneSnapshot(snapshot);
  const beforeTasks = beforeSnapshot.tasks.map(cloneTask);
  let workingSnapshot = normalizeSnapshot(beforeSnapshot.tasks);
  const conflicts: Conflict[] = [];

  let coreResult: CoreResult;
  switch (command.type) {
    case 'switch_gantt_day_mode': {
      const weekendPredicate = options.weekendPredicate ?? (() => false);
      const reflowedTasks = reflowTasksOnModeSwitch(
        workingSnapshot,
        command.ganttDayMode === 'business',
        weekendPredicate,
      ) as CoreTask[];
      coreResult = {
        changedTasks: reflowedTasks.filter((task) => {
          const before = workingSnapshot.find((candidate) => candidate.id === task.id);
          return JSON.stringify(before) !== JSON.stringify(task);
        }),
        changedIds: reflowedTasks
          .filter((task) => {
            const before = workingSnapshot.find((candidate) => candidate.id === task.id);
            return JSON.stringify(before) !== JSON.stringify(task);
          })
          .map((task) => task.id),
      };
      workingSnapshot = reflowedTasks;
      break;
    }

    case 'move_task':
      coreResult = moveTaskWithCascade(command.taskId, parseDateOnly(command.startDate), workingSnapshot, options);
      break;
    case 'resize_task':
      coreResult = resizeTaskWithCascade(command.taskId, command.anchor, parseDateOnly(command.date), workingSnapshot, options);
      break;
    case 'set_task_start': {
      const task = workingSnapshot.find((candidate) => candidate.id === command.taskId);
      if (!task) {
        coreResult = { changedTasks: [], changedIds: [] };
        break;
      }
      coreResult = moveTaskWithCascade(command.taskId, parseDateOnly(command.startDate), workingSnapshot, options);
      break;
    }
    case 'set_task_end':
      coreResult = resizeTaskWithCascade(command.taskId, 'end', parseDateOnly(command.endDate), workingSnapshot, options);
      break;
    case 'change_duration': {
      const task = workingSnapshot.find((candidate) => candidate.id === command.taskId);
      if (!task) {
        coreResult = { changedTasks: [], changedIds: [] };
        break;
      }
      const anchor = command.anchor ?? 'end';
      if (anchor === 'end') {
        const { end } = buildTaskRangeFromStart(
          parseDateOnly(task.startDate as string),
          command.duration,
          options.businessDays ?? false,
          options.weekendPredicate,
        );
        coreResult = resizeTaskWithCascade(command.taskId, 'end', end, workingSnapshot, options);
      } else {
        const { start } = buildTaskRangeFromEnd(
          parseDateOnly(task.endDate as string),
          command.duration,
          options.businessDays ?? false,
          options.weekendPredicate,
        );
        coreResult = resizeTaskWithCascade(command.taskId, 'start', start, workingSnapshot, options);
      }
      break;
    }
    case 'update_task_fields':
      coreResult = applyTaskFieldUpdateToSnapshot(workingSnapshot, command, options);
      break;
    case 'update_tasks_fields_batch': {
      let batchSnapshot = [...workingSnapshot];
      const changedTaskMap = new Map<string, CoreTask>();
      const changedIds: string[] = [];

      for (const update of command.updates) {
        const singleResult = applyTaskFieldUpdateToSnapshot(
          batchSnapshot,
          {
            type: 'update_task_fields',
            taskId: update.taskId,
            fields: update.fields,
          },
          options,
        );

        for (const changedTask of singleResult.changedTasks) {
          changedTaskMap.set(changedTask.id, changedTask);
        }
        for (const changedId of singleResult.changedIds) {
          if (!changedIds.includes(changedId)) {
            changedIds.push(changedId);
          }
        }
        if (singleResult.changedTasks.length > 0) {
          const changedById = new Map(singleResult.changedTasks.map((task) => [task.id, task]));
          batchSnapshot = batchSnapshot.map((task) => changedById.get(task.id) ?? task);
        }
      }

      coreResult = {
        changedTasks: changedIds
          .map((changedId) => changedTaskMap.get(changedId))
          .filter((task): task is CoreTask => Boolean(task)),
        changedIds,
      };
      break;
    }
    case 'recalculate_schedule':
      coreResult = command.taskId
        ? recalculateTaskFromDependencies(command.taskId, workingSnapshot, options)
        : recalculateProjectSchedule(workingSnapshot, options);
      break;
    case 'create_task': {
      const newTask: Task = {
        id: command.task.id ?? randomUUID(),
        name: command.task.name,
        startDate: command.task.startDate,
        endDate: command.task.endDate,
        type: command.task.type ?? 'task',
        color: command.task.color,
        parentId: command.task.parentId,
        progress: command.task.progress,
        dependencies: command.task.dependencies,
        sortOrder: command.task.sortOrder,
      };
      coreResult = scheduleCreatedTasks(workingSnapshot, [newTask], options);
      break;
    }
    case 'create_tasks_batch': {
      const newTasks = command.tasks.map((task) => ({
        id: task.id ?? randomUUID(),
        name: task.name,
        startDate: task.startDate,
        endDate: task.endDate,
        type: task.type ?? 'task',
        color: task.color,
        parentId: task.parentId,
        progress: task.progress,
        dependencies: task.dependencies,
        sortOrder: task.sortOrder,
      }));
      coreResult = scheduleCreatedTasks(workingSnapshot, newTasks, options);
      break;
    }
    case 'delete_task': {
      const remainingSnapshot = workingSnapshot.filter((task) => task.id !== command.taskId);
      const successors = workingSnapshot.filter((task) => task.dependencies?.some((dependency) => dependency.taskId === command.taskId));
      coreResult = successors.length > 0
        ? recalculateProjectSchedule(remainingSnapshot, options)
        : { changedTasks: [], changedIds: [] };
      break;
    }
    case 'delete_tasks': {
      const deletedIds = new Set(command.taskIds);
      const remainingSnapshot = workingSnapshot
        .filter((task) => !deletedIds.has(task.id))
        .map((task) => ({
          ...task,
          dependencies: (task.dependencies ?? []).filter((dependency) => !deletedIds.has(dependency.taskId)),
        }));
      coreResult = recalculateProjectSchedule(remainingSnapshot, options);
      break;
    }
    case 'create_dependency': {
      const updatedSnapshot = workingSnapshot.map((task) =>
        task.id === command.taskId
          ? {
              ...task,
              dependencies: [
                ...(task.dependencies ?? []),
                {
                  taskId: command.dependency.taskId,
                  type: command.dependency.type,
                  lag: command.dependency.lag ?? 0,
                },
              ],
            }
          : task,
      );
      coreResult = recalculateTaskFromDependencies(command.taskId, updatedSnapshot, options);
      break;
    }
    case 'remove_dependency': {
      const updatedSnapshot = workingSnapshot.map((task) =>
        task.id === command.taskId
          ? {
              ...task,
              dependencies: (task.dependencies ?? []).filter((dependency) => dependency.taskId !== command.depTaskId),
            }
          : task,
      );
      coreResult = recalculateTaskFromDependencies(command.taskId, updatedSnapshot, options);
      if (coreResult.changedTasks.length === 0) {
        const task = updatedSnapshot.find((candidate) => candidate.id === command.taskId);
        coreResult = task ? { changedTasks: [task], changedIds: [task.id] } : { changedTasks: [], changedIds: [] };
      }
      break;
    }
    case 'change_dependency_lag': {
      const updatedSnapshot = workingSnapshot.map((task) =>
        task.id === command.taskId
          ? {
              ...task,
              dependencies: (task.dependencies ?? []).map((dependency) =>
                dependency.taskId === command.depTaskId ? { ...dependency, lag: command.lag } : dependency,
              ),
            }
          : task,
      );
      coreResult = recalculateTaskFromDependencies(command.taskId, updatedSnapshot, options);
      break;
    }
    case 'reparent_task': {
      const updatedSnapshot = workingSnapshot.map((task) =>
        task.id === command.taskId ? { ...task, parentId: command.newParentId ?? undefined } : task,
      );
      coreResult = recalculateProjectSchedule(updatedSnapshot, options);
      break;
    }
    case 'reorder_tasks':
      coreResult = { changedTasks: [], changedIds: [] };
      break;
    default: {
      const _never: never = command;
      coreResult = { changedTasks: [], changedIds: [] };
      void _never;
    }
  }

  const updatedSnapshot: ProjectSnapshot = {
    tasks: buildTaskSnapshot(coreResult.changedTasks.length > 0
      ? workingSnapshot.map((task) => {
          const changed = coreResult.changedTasks.find((candidate) => candidate.id === task.id);
          return changed ?? task;
        })
      : workingSnapshot),
    dependencies: beforeSnapshot.dependencies.map((dependency) => ({ ...dependency })),
  };

  const changedTaskById = new Map(updatedSnapshot.tasks.map((task) => [task.id, task]));
  for (const changedTask of buildTaskSnapshot(coreResult.changedTasks)) {
    changedTaskById.set(changedTask.id, changedTask);
  }

  if (command.type === 'create_task' || command.type === 'create_tasks_batch') {
    for (const task of buildTaskSnapshot(coreResult.changedTasks)) {
      changedTaskById.set(task.id, task);
    }
  } else if (command.type === 'delete_task') {
    changedTaskById.delete(command.taskId);
  } else if (command.type === 'delete_tasks') {
    for (const taskId of command.taskIds) {
      changedTaskById.delete(taskId);
    }
  }

  updatedSnapshot.tasks = Array.from(changedTaskById.values()).sort((left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0));
  const changedDependencyIds = updateDependencyRows(updatedSnapshot, command);

  for (const task of updatedSnapshot.tasks) {
    if (command.type === 'create_dependency' || command.type === 'remove_dependency' || command.type === 'change_dependency_lag') {
      const source = command.taskId === task.id
        ? updatedSnapshot.dependencies
            .filter((dependency) => dependency.taskId === task.id)
            .map((dependency) => ({
              taskId: dependency.depTaskId,
              type: dependency.type,
              lag: dependency.lag,
            }))
        : undefined;
      if (source) {
        task.dependencies = source;
      }
    }
  }

  return {
    snapshot: updatedSnapshot,
    changedTaskIds: coreResult.changedIds,
    changedDependencyIds,
    conflicts,
    patches: computePatches(beforeTasks, updatedSnapshot.tasks, coreResult.changedIds, 'taskId' in command ? command.taskId : undefined),
  };
}
