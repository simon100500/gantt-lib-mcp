import type {
  Task,
  TaskDependency,
  ScheduleCommand,
  ScheduleCommandOptions,
  ScheduleCommandResult,
} from './types.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function normalizeUTCDate(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function parseDateOnly(date: string | Date): Date {
  if (date instanceof Date) {
    return normalizeUTCDate(date);
  }

  return normalizeUTCDate(new Date(`${date.split('T')[0]}T00:00:00.000Z`));
}

function toIsoDate(date: Date): string {
  return normalizeUTCDate(date).toISOString().split('T')[0];
}

function defaultWeekendPredicate(date: Date): boolean {
  const day = normalizeUTCDate(date).getUTCDay();
  return day === 0 || day === 6;
}

function cloneTask(task: Task): Task {
  return {
    ...task,
    dependencies: task.dependencies?.map((dependency) => ({
      ...dependency,
      lag: dependency.lag ?? 0,
    })),
    children: task.children?.map(cloneTask),
  };
}

function getTaskDuration(
  startDate: string | Date,
  endDate: string | Date,
  businessDays = false,
  weekendPredicate?: (date: Date) => boolean,
): number {
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);

  if (businessDays && weekendPredicate) {
    let count = 0;
    const current = new Date(start);
    while (current.getTime() <= end.getTime()) {
      if (!weekendPredicate(current)) {
        count++;
      }
      current.setUTCDate(current.getUTCDate() + 1);
    }
    return Math.max(1, count);
  }

  return Math.max(1, Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1);
}

function addBusinessDays(
  startDate: string | Date,
  businessDays: number,
  weekendPredicate: (date: Date) => boolean,
): Date {
  const current = parseDateOnly(startDate);
  let remaining = Math.max(1, businessDays);

  while (remaining > 0) {
    if (!weekendPredicate(current)) {
      remaining--;
    }

    if (remaining > 0) {
      current.setUTCDate(current.getUTCDate() + 1);
    }
  }

  return current;
}

function subtractBusinessDays(
  endDate: string | Date,
  businessDays: number,
  weekendPredicate: (date: Date) => boolean,
): Date {
  const current = parseDateOnly(endDate);
  let remaining = Math.max(1, businessDays);

  while (remaining > 0) {
    if (!weekendPredicate(current)) {
      remaining--;
    }

    if (remaining > 0) {
      current.setUTCDate(current.getUTCDate() - 1);
    }
  }

  return current;
}

function alignToWorkingDay(
  date: Date,
  direction: 1 | -1,
  weekendPredicate: (date: Date) => boolean,
): Date {
  const current = normalizeUTCDate(date);
  while (weekendPredicate(current)) {
    current.setUTCDate(current.getUTCDate() + direction);
  }
  return current;
}

function getBusinessDayOffset(
  fromDate: Date,
  toDate: Date,
  weekendPredicate: (date: Date) => boolean,
): number {
  const from = normalizeUTCDate(fromDate);
  const to = normalizeUTCDate(toDate);

  if (from.getTime() === to.getTime()) {
    return 0;
  }

  const step = to.getTime() > from.getTime() ? 1 : -1;
  const current = new Date(from);
  let offset = 0;

  while (current.getTime() !== to.getTime()) {
    current.setUTCDate(current.getUTCDate() + step);
    if (!weekendPredicate(current)) {
      offset += step;
    }
  }

  return offset;
}

function shiftBusinessDayOffset(
  date: Date,
  offset: number,
  weekendPredicate: (date: Date) => boolean,
): Date {
  const current = normalizeUTCDate(date);

  if (offset === 0) {
    return current;
  }

  const step = offset > 0 ? 1 : -1;
  let remaining = Math.abs(offset);

  while (remaining > 0) {
    current.setUTCDate(current.getUTCDate() + step);
    if (!weekendPredicate(current)) {
      remaining--;
    }
  }

  return current;
}

function buildTaskRangeFromStart(
  startDate: Date,
  duration: number,
  businessDays = false,
  weekendPredicate?: (date: Date) => boolean,
  snapDirection: 1 | -1 = 1,
): { start: Date; end: Date } {
  const normalizedStart = businessDays && weekendPredicate
    ? alignToWorkingDay(startDate, snapDirection, weekendPredicate)
    : normalizeUTCDate(startDate);

  if (businessDays && weekendPredicate) {
    return {
      start: normalizedStart,
      end: parseDateOnly(addBusinessDays(normalizedStart, duration, weekendPredicate)),
    };
  }

  return {
    start: normalizedStart,
    end: new Date(normalizedStart.getTime() + (Math.max(1, duration) - 1) * DAY_MS),
  };
}

function buildTaskRangeFromEnd(
  endDate: Date,
  duration: number,
  businessDays = false,
  weekendPredicate?: (date: Date) => boolean,
  snapDirection: 1 | -1 = -1,
): { start: Date; end: Date } {
  const normalizedEnd = businessDays && weekendPredicate
    ? alignToWorkingDay(endDate, snapDirection, weekendPredicate)
    : normalizeUTCDate(endDate);

  if (businessDays && weekendPredicate) {
    return {
      start: parseDateOnly(subtractBusinessDays(normalizedEnd, duration, weekendPredicate)),
      end: normalizedEnd,
    };
  }

  return {
    start: new Date(normalizedEnd.getTime() - (Math.max(1, duration) - 1) * DAY_MS),
    end: normalizedEnd,
  };
}

function moveTaskRange(
  originalStart: string | Date,
  originalEnd: string | Date,
  proposedStart: Date,
  businessDays = false,
  weekendPredicate?: (date: Date) => boolean,
  snapDirection: 1 | -1 = 1,
): { start: Date; end: Date } {
  return buildTaskRangeFromStart(
    proposedStart,
    getTaskDuration(originalStart, originalEnd, businessDays, weekendPredicate),
    businessDays,
    weekendPredicate,
    snapDirection,
  );
}

function getChildren(parentId: string, tasks: Task[]): Task[] {
  return tasks.filter((task) => task.parentId === parentId);
}

function isTaskParent(taskId: string, tasks: Task[]): boolean {
  return tasks.some((task) => task.parentId === taskId);
}

function computeParentDates(parentId: string, tasks: Task[]): { startDate: Date; endDate: Date } {
  const children = getChildren(parentId, tasks);
  if (children.length === 0) {
    const parent = tasks.find((task) => task.id === parentId);
    return {
      startDate: parent ? parseDateOnly(parent.startDate) : new Date(),
      endDate: parent ? parseDateOnly(parent.endDate) : new Date(),
    };
  }

  return {
    startDate: new Date(Math.min(...children.map((task) => parseDateOnly(task.startDate).getTime()))),
    endDate: new Date(Math.max(...children.map((task) => parseDateOnly(task.endDate).getTime()))),
  };
}

function getDependencyLag(dependency: Pick<TaskDependency, 'lag'>): number {
  return Number.isFinite(dependency.lag) ? dependency.lag! : 0;
}

function normalizeDependencyLag(
  linkType: TaskDependency['type'],
  lag: number,
  predecessorStart: Date,
  predecessorEnd: Date,
  businessDays = false,
  weekendPredicate?: (date: Date) => boolean,
): number {
  if (linkType !== 'FS') {
    return lag;
  }

  const predecessorDuration = getTaskDuration(
    predecessorStart,
    predecessorEnd,
    businessDays,
    weekendPredicate,
  );

  return Math.max(-predecessorDuration, lag);
}

function computeLagFromDates(
  linkType: TaskDependency['type'],
  predStart: Date,
  predEnd: Date,
  succStart: Date,
  succEnd: Date,
  businessDays = false,
  weekendPredicate?: (date: Date) => boolean,
): number {
  const pS = Date.UTC(predStart.getUTCFullYear(), predStart.getUTCMonth(), predStart.getUTCDate());
  const pE = Date.UTC(predEnd.getUTCFullYear(), predEnd.getUTCMonth(), predEnd.getUTCDate());
  const sS = Date.UTC(succStart.getUTCFullYear(), succStart.getUTCMonth(), succStart.getUTCDate());
  const sE = Date.UTC(succEnd.getUTCFullYear(), succEnd.getUTCMonth(), succEnd.getUTCDate());

  if (!businessDays || !weekendPredicate) {
    switch (linkType) {
      case 'FS':
        return normalizeDependencyLag(linkType, Math.round((sS - pE) / DAY_MS) - 1, predStart, predEnd);
      case 'SS':
        return Math.round((sS - pS) / DAY_MS);
      case 'FF':
        return Math.round((sE - pE) / DAY_MS);
      case 'SF':
        return Math.round((sE - pS) / DAY_MS);
    }
  }

  const anchorDate = linkType === 'SS' || linkType === 'SF' ? predStart : predEnd;
  const targetDate = linkType === 'FS' || linkType === 'SS' ? succStart : succEnd;
  const businessOffset = getBusinessDayOffset(anchorDate, targetDate, weekendPredicate);

  switch (linkType) {
    case 'FS':
      return normalizeDependencyLag(linkType, businessOffset - 1, predStart, predEnd, businessDays, weekendPredicate);
    case 'SS':
      return businessOffset;
    case 'FF':
      return businessOffset;
    case 'SF':
      return businessOffset;
  }
}

function calculateSuccessorDate(
  predecessorStart: Date,
  predecessorEnd: Date,
  linkType: TaskDependency['type'],
  lag = 0,
  businessDays = false,
  weekendPredicate?: (date: Date) => boolean,
): Date {
  const normalizedLag = normalizeDependencyLag(
    linkType,
    lag,
    predecessorStart,
    predecessorEnd,
    businessDays,
    weekendPredicate,
  );

  if (!businessDays || !weekendPredicate) {
    switch (linkType) {
      case 'FS':
        return new Date(predecessorEnd.getTime() + (normalizedLag + 1) * DAY_MS);
      case 'SS':
        return new Date(predecessorStart.getTime() + normalizedLag * DAY_MS);
      case 'FF':
        return new Date(predecessorEnd.getTime() + normalizedLag * DAY_MS);
      case 'SF':
        return new Date(predecessorStart.getTime() + normalizedLag * DAY_MS);
    }
  }

  const anchorDate = (linkType === 'FS' || linkType === 'FF') ? predecessorEnd : predecessorStart;
  let offset = 0;
  switch (linkType) {
    case 'FS':
      offset = normalizedLag + 1;
      break;
    case 'SS':
      offset = normalizedLag;
      break;
    case 'FF':
      offset = normalizedLag;
      break;
    case 'SF':
      offset = normalizedLag;
      break;
  }

  return shiftBusinessDayOffset(anchorDate, offset, weekendPredicate!);
}

function recalculateIncomingLags(
  task: Task,
  newStartDate: Date,
  newEndDate: Date,
  allTasks: Task[],
  businessDays = false,
  weekendPredicate?: (date: Date) => boolean,
): NonNullable<Task['dependencies']> {
  if (!task.dependencies) {
    return [];
  }

  return task.dependencies.map((dependency) => {
    const predecessor = allTasks.find((candidate) => candidate.id === dependency.taskId);
    if (!predecessor) {
      return { ...dependency, lag: getDependencyLag(dependency) };
    }

    return {
      ...dependency,
      lag: computeLagFromDates(
        dependency.type,
        parseDateOnly(predecessor.startDate),
        parseDateOnly(predecessor.endDate),
        newStartDate,
        newEndDate,
        businessDays,
        weekendPredicate,
      ),
    };
  });
}

function createChangedResult(
  snapshot: Task[],
  nextTasks: Task[],
  includeSnapshot = false,
): ScheduleCommandResult {
  const originalById = new Map(snapshot.map((task) => [task.id, cloneTask(task)]));
  const changedTasks = nextTasks.filter((task) => {
    const original = originalById.get(task.id);
    return JSON.stringify(original) !== JSON.stringify(task);
  });

  return {
    changedTasks,
    changedIds: changedTasks.map((task) => task.id),
    snapshot: includeSnapshot ? nextTasks.map(cloneTask) : undefined,
  };
}

function universalCascade(
  movedTask: Task,
  newStart: Date,
  newEnd: Date,
  allTasks: Task[],
  businessDays = false,
  weekendPredicate?: (date: Date) => boolean,
): Task[] {
  const taskById = new Map(allTasks.map((task) => [task.id, task]));
  const updatedDates = new Map<string, { start: Date; end: Date }>();
  const resultMap = new Map<string, Task>();

  updatedDates.set(movedTask.id, { start: newStart, end: newEnd });
  resultMap.set(movedTask.id, {
    ...cloneTask(movedTask),
    startDate: toIsoDate(newStart),
    endDate: toIsoDate(newEnd),
  });

  const queue: Array<[string, 'direct' | 'child-delta' | 'parent-recalc' | 'dependency']> = [[movedTask.id, 'direct']];
  const childShifted = new Set<string>();
  let iterations = 0;
  const maxIterations = allTasks.length * 3;

  while (queue.length > 0 && iterations < maxIterations) {
    iterations++;
    const [currentId, arrivalMode] = queue.shift()!;
    const currentOriginal = taskById.get(currentId);
    const currentRange = updatedDates.get(currentId);

    if (!currentOriginal || !currentRange) {
      continue;
    }

    if (arrivalMode !== 'parent-recalc') {
      for (const child of getChildren(currentId, allTasks)) {
        if (childShifted.has(child.id) || child.locked) {
          continue;
        }

        const parentOrigStart = parseDateOnly(currentOriginal.startDate);
        const parentOrigEnd = parseDateOnly(currentOriginal.endDate);
        const childOrigStart = parseDateOnly(child.startDate);
        const childOrigEnd = parseDateOnly(child.endDate);

        const startDeltaMs = currentRange.start.getTime() - parentOrigStart.getTime();
        const endDeltaMs = currentRange.end.getTime() - parentOrigEnd.getTime();

        let childNewStart: Date;
        let childNewEnd: Date;

        if (businessDays && weekendPredicate) {
          const movedRange = moveTaskRange(
            childOrigStart,
            childOrigEnd,
            new Date(childOrigStart.getTime() + startDeltaMs),
            true,
            weekendPredicate,
            currentRange.start.getTime() >= parentOrigStart.getTime() ? 1 : -1,
          );
          childNewStart = movedRange.start;
          childNewEnd = movedRange.end;
        } else {
          childNewStart = new Date(childOrigStart.getTime() + startDeltaMs);
          childNewEnd = new Date(childOrigEnd.getTime() + endDeltaMs);
        }

        const previous = updatedDates.get(child.id);
        if (previous && previous.start.getTime() === childNewStart.getTime() && previous.end.getTime() === childNewEnd.getTime()) {
          continue;
        }

        updatedDates.set(child.id, { start: childNewStart, end: childNewEnd });
        childShifted.add(child.id);
        queue.push([child.id, 'child-delta']);
        resultMap.set(child.id, {
          ...cloneTask(child),
          startDate: toIsoDate(childNewStart),
          endDate: toIsoDate(childNewEnd),
        });
      }
    }

    if (currentOriginal.parentId) {
      const parent = taskById.get(currentOriginal.parentId);
      if (parent && !parent.locked) {
        const siblings = getChildren(parent.id, allTasks);
        const siblingPositions = siblings.map((sibling) => {
          const updated = updatedDates.get(sibling.id);
          return updated ?? {
            start: parseDateOnly(sibling.startDate),
            end: parseDateOnly(sibling.endDate),
          };
        });

        const minStart = new Date(Math.min(...siblingPositions.map((range) => range.start.getTime())));
        const maxEnd = new Date(Math.max(...siblingPositions.map((range) => range.end.getTime())));
        const previous = updatedDates.get(parent.id);

        if (!previous || previous.start.getTime() !== minStart.getTime() || previous.end.getTime() !== maxEnd.getTime()) {
          updatedDates.set(parent.id, { start: minStart, end: maxEnd });
          queue.push([parent.id, 'parent-recalc']);
          resultMap.set(parent.id, {
            ...cloneTask(parent),
            startDate: toIsoDate(minStart),
            endDate: toIsoDate(maxEnd),
          });
        }
      }
    }

    for (const task of allTasks) {
      if (task.locked || !task.dependencies?.length) {
        continue;
      }

      const dependency = task.dependencies.find((candidate) => candidate.taskId === currentId);
      if (!dependency) {
        continue;
      }

      const duration = getTaskDuration(task.startDate, task.endDate, businessDays, weekendPredicate);
      const constraintDate = calculateSuccessorDate(
        currentRange.start,
        currentRange.end,
        dependency.type,
        getDependencyLag(dependency),
        businessDays,
        weekendPredicate,
      );

      const nextRange = dependency.type === 'FS' || dependency.type === 'SS'
        ? buildTaskRangeFromStart(constraintDate, duration, businessDays, weekendPredicate)
        : buildTaskRangeFromEnd(constraintDate, duration, businessDays, weekendPredicate);

      const previous = updatedDates.get(task.id);
      if (previous && previous.start.getTime() === nextRange.start.getTime() && previous.end.getTime() === nextRange.end.getTime()) {
        continue;
      }

      updatedDates.set(task.id, nextRange);
      queue.push([task.id, 'dependency']);
      resultMap.set(task.id, {
        ...cloneTask(task),
        startDate: toIsoDate(nextRange.start),
        endDate: toIsoDate(nextRange.end),
      });
    }
  }

  return Array.from(resultMap.values());
}

function moveTaskWithCascade(
  taskId: string,
  newStart: Date,
  snapshot: Task[],
  options?: ScheduleCommandOptions,
): ScheduleCommandResult {
  const task = snapshot.find((candidate) => candidate.id === taskId);
  if (!task) {
    return { changedTasks: [], changedIds: [], snapshot: options?.includeSnapshot ? snapshot.map(cloneTask) : undefined };
  }

  const businessDays = options?.businessDays ?? false;
  const weekendPredicate = options?.weekendPredicate;
  const newRange = moveTaskRange(task.startDate, task.endDate, newStart, businessDays, weekendPredicate);
  return setTaskRangeWithCascade(taskId, newRange.start, newRange.end, snapshot, options);
}

function resizeTaskWithCascade(
  taskId: string,
  anchor: 'start' | 'end',
  newDate: Date,
  snapshot: Task[],
  options?: ScheduleCommandOptions,
): ScheduleCommandResult {
  const task = snapshot.find((candidate) => candidate.id === taskId);
  if (!task) {
    return { changedTasks: [], changedIds: [], snapshot: options?.includeSnapshot ? snapshot.map(cloneTask) : undefined };
  }

  const newRange = anchor === 'end'
    ? { start: parseDateOnly(task.startDate), end: normalizeUTCDate(newDate) }
    : { start: normalizeUTCDate(newDate), end: parseDateOnly(task.endDate) };

  return setTaskRangeWithCascade(taskId, newRange.start, newRange.end, snapshot, options);
}

export function setTaskRangeWithCascade(
  taskId: string,
  newStart: Date,
  newEnd: Date,
  snapshot: Task[],
  options?: ScheduleCommandOptions,
): ScheduleCommandResult {
  const task = snapshot.find((candidate) => candidate.id === taskId);
  if (!task) {
    return { changedTasks: [], changedIds: [], snapshot: options?.includeSnapshot ? snapshot.map(cloneTask) : undefined };
  }

  const businessDays = options?.businessDays ?? false;
  const weekendPredicate = options?.weekendPredicate;
  const updatedTask: Task = {
    ...cloneTask(task),
    startDate: toIsoDate(newStart),
    endDate: toIsoDate(newEnd),
    dependencies: recalculateIncomingLags(task, newStart, newEnd, snapshot, businessDays, weekendPredicate),
  };

  const cascade = universalCascade(updatedTask, newStart, newEnd, snapshot, businessDays, weekendPredicate);
  const resultMap = new Map<string, Task>();
  for (const taskResult of cascade) {
    resultMap.set(taskResult.id, taskResult);
  }

  return createChangedResult(snapshot, Array.from(resultMap.values()), options?.includeSnapshot);
}

function recalculateTaskFromDependencies(
  taskId: string,
  snapshot: Task[],
  options?: ScheduleCommandOptions,
): ScheduleCommandResult {
  const task = snapshot.find((candidate) => candidate.id === taskId);
  if (!task) {
    return { changedTasks: [], changedIds: [], snapshot: options?.includeSnapshot ? snapshot.map(cloneTask) : undefined };
  }

  if (!task.dependencies?.length) {
    return createChangedResult(snapshot, [cloneTask(task)], options?.includeSnapshot);
  }

  const businessDays = options?.businessDays ?? false;
  const weekendPredicate = options?.weekendPredicate;
  const duration = getTaskDuration(task.startDate, task.endDate, businessDays, weekendPredicate);
  let constrainedRange: { start: Date; end: Date } | null = null;

  for (const dependency of task.dependencies) {
    const predecessor = snapshot.find((candidate) => candidate.id === dependency.taskId);
    if (!predecessor) {
      continue;
    }

    const constraintDate = calculateSuccessorDate(
      parseDateOnly(predecessor.startDate),
      parseDateOnly(predecessor.endDate),
      dependency.type,
      getDependencyLag(dependency),
      businessDays,
      weekendPredicate,
    );

    const candidateRange = dependency.type === 'FS' || dependency.type === 'SS'
      ? buildTaskRangeFromStart(constraintDate, duration, businessDays, weekendPredicate)
      : buildTaskRangeFromEnd(constraintDate, duration, businessDays, weekendPredicate);

    if (
      !constrainedRange ||
      candidateRange.start.getTime() > constrainedRange.start.getTime() ||
      (
        candidateRange.start.getTime() === constrainedRange.start.getTime() &&
        candidateRange.end.getTime() > constrainedRange.end.getTime()
      )
    ) {
      constrainedRange = candidateRange;
    }
  }

  if (!constrainedRange) {
    return createChangedResult(snapshot, [cloneTask(task)], options?.includeSnapshot);
  }

  return setTaskRangeWithCascade(taskId, constrainedRange.start, constrainedRange.end, snapshot, options);
}

function recalculateProjectSchedule(
  snapshot: Task[],
  options?: ScheduleCommandOptions,
): ScheduleCommandResult {
  const businessDays = options?.businessDays ?? false;
  const weekendPredicate = options?.weekendPredicate;
  const workingMap = new Map(snapshot.map((task) => [task.id, cloneTask(task)]));
  const indegree = new Map<string, number>();
  const successorIdsByTask = new Map<string, string[]>();

  for (const task of snapshot) {
    indegree.set(task.id, 0);
    successorIdsByTask.set(task.id, []);
  }

  for (const task of snapshot) {
    for (const dependency of task.dependencies ?? []) {
      if (!workingMap.has(dependency.taskId)) {
        continue;
      }

      indegree.set(task.id, (indegree.get(task.id) ?? 0) + 1);
      successorIdsByTask.get(dependency.taskId)?.push(task.id);
    }
  }

  const queue = snapshot
    .filter((task) => (indegree.get(task.id) ?? 0) === 0)
    .map((task) => task.id);

  while (queue.length > 0) {
    const currentId = queue.shift()!;

    for (const successorId of successorIdsByTask.get(currentId) ?? []) {
      const nextIndegree = (indegree.get(successorId) ?? 0) - 1;
      indegree.set(successorId, nextIndegree);

      if (nextIndegree !== 0) {
        continue;
      }

      const currentTask = workingMap.get(successorId);
      if (!currentTask || currentTask.locked || !currentTask.dependencies?.length) {
        queue.push(successorId);
        continue;
      }

      const duration = getTaskDuration(currentTask.startDate, currentTask.endDate, businessDays, weekendPredicate);
      let constrainedRange: { start: Date; end: Date } | null = null;

      for (const dependency of currentTask.dependencies) {
        const predecessor = workingMap.get(dependency.taskId);
        if (!predecessor) {
          continue;
        }

        const constraintDate = calculateSuccessorDate(
          parseDateOnly(predecessor.startDate),
          parseDateOnly(predecessor.endDate),
          dependency.type,
          getDependencyLag(dependency),
          businessDays,
          weekendPredicate,
        );

        const candidateRange = dependency.type === 'FS' || dependency.type === 'SS'
          ? buildTaskRangeFromStart(constraintDate, duration, businessDays, weekendPredicate)
          : buildTaskRangeFromEnd(constraintDate, duration, businessDays, weekendPredicate);

        if (
          !constrainedRange ||
          candidateRange.start.getTime() > constrainedRange.start.getTime() ||
          (
            candidateRange.start.getTime() === constrainedRange.start.getTime() &&
            candidateRange.end.getTime() > constrainedRange.end.getTime()
          )
        ) {
          constrainedRange = candidateRange;
        }
      }

      if (!constrainedRange) {
        queue.push(successorId);
        continue;
      }

      workingMap.set(successorId, {
        ...currentTask,
        startDate: toIsoDate(constrainedRange.start),
        endDate: toIsoDate(constrainedRange.end),
      });
      queue.push(successorId);
    }
  }

  const parentsByDepth = snapshot
    .filter((task) => isTaskParent(task.id, snapshot))
    .map((task) => {
      let depth = 0;
      let current = task.parentId ? workingMap.get(task.parentId) : undefined;
      while (current) {
        depth++;
        current = current.parentId ? workingMap.get(current.parentId) : undefined;
      }
      return { taskId: task.id, depth };
    })
    .sort((left, right) => right.depth - left.depth);

  const workingTasks = () => Array.from(workingMap.values());
  for (const { taskId } of parentsByDepth) {
    const parent = workingMap.get(taskId);
    if (!parent || parent.locked) {
      continue;
    }

    const { startDate, endDate } = computeParentDates(taskId, workingTasks());
    workingMap.set(taskId, {
      ...parent,
      startDate: toIsoDate(startDate),
      endDate: toIsoDate(endDate),
    });
  }

  return createChangedResult(snapshot, Array.from(workingMap.values()), options?.includeSnapshot);
}

export class TaskScheduler {
  private taskMap: Map<string, Task>;
  private defaultOptions: ScheduleCommandOptions;

  constructor(taskMap: Map<string, Task>, defaultOptions?: ScheduleCommandOptions) {
    this.taskMap = new Map(Array.from(taskMap.entries()).map(([id, task]) => [id, cloneTask(task)]));
    this.defaultOptions = {
      weekendPredicate: defaultWeekendPredicate,
      ...defaultOptions,
    };
  }

  setTaskMap(taskMap: Map<string, Task>): void {
    this.taskMap = new Map(Array.from(taskMap.entries()).map(([id, task]) => [id, cloneTask(task)]));
  }

  getSnapshot(): Task[] {
    return Array.from(this.taskMap.values()).map(cloneTask);
  }

  validateDependencies(task: Task): void {
    for (const dependency of task.dependencies ?? []) {
      if (!this.taskMap.has(dependency.taskId)) {
        throw new Error(`Dependency references non-existent task: ${dependency.taskId}`);
      }
    }
  }

  detectCycle(
    taskId: string,
    visited = new Set<string>(),
    recStack = new Set<string>(),
    path: string[] = [],
  ): boolean {
    visited.add(taskId);
    recStack.add(taskId);
    path.push(taskId);

    const task = this.taskMap.get(taskId);
    for (const dependency of task?.dependencies ?? []) {
      if (!visited.has(dependency.taskId)) {
        if (this.detectCycle(dependency.taskId, visited, recStack, [...path])) {
          return true;
        }
      } else if (recStack.has(dependency.taskId)) {
        throw new Error(`Circular dependency detected: ${[...path, dependency.taskId].join(' -> ')}`);
      }
    }

    recStack.delete(taskId);
    return false;
  }

  execute(command: ScheduleCommand, options?: ScheduleCommandOptions): ScheduleCommandResult {
    const snapshot = this.getSnapshot();
    const resolvedOptions = {
      ...this.defaultOptions,
      ...options,
      weekendPredicate: options?.weekendPredicate ?? this.defaultOptions.weekendPredicate,
    };

    switch (command.type) {
      case 'move_task':
        return moveTaskWithCascade(command.taskId, parseDateOnly(command.startDate), snapshot, resolvedOptions);
      case 'resize_task':
        return resizeTaskWithCascade(command.taskId, command.anchor, parseDateOnly(command.date), snapshot, resolvedOptions);
      case 'recalculate_schedule':
        return command.taskId
          ? recalculateTaskFromDependencies(command.taskId, snapshot, resolvedOptions)
          : recalculateProjectSchedule(snapshot, resolvedOptions);
    }
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

  recalculateDates(startTaskId: string, skipStartTask = false): Map<string, Task> {
    const snapshot = this.getSnapshot();

    if (skipStartTask) {
      const task = snapshot.find((candidate) => candidate.id === startTaskId);
      if (!task) {
        return new Map();
      }

      const cascaded = universalCascade(
        task,
        parseDateOnly(task.startDate),
        parseDateOnly(task.endDate),
        snapshot,
        this.defaultOptions.businessDays ?? false,
        this.defaultOptions.weekendPredicate,
      );
      const changedTasks = [
        cloneTask(task),
        ...cascaded.filter((candidate) => candidate.id !== task.id),
      ];
      return new Map(changedTasks.map((task) => [task.id, cloneTask(task)]));
    }

    const startTask = snapshot.find((candidate) => candidate.id === startTaskId);
    if (!startTask || !startTask.dependencies?.length) {
      return new Map();
    }

    const result = recalculateTaskFromDependencies(startTaskId, snapshot, {
      ...this.defaultOptions,
      includeSnapshot: true,
    });
    const finalSnapshot = result.snapshot ?? snapshot;
    const finalById = new Map(finalSnapshot.map((task) => [task.id, cloneTask(task)]));
    const updates = new Map<string, Task>();
    const visited = new Set<string>();

    const collect = (taskId: string): void => {
      if (visited.has(taskId)) {
        return;
      }
      visited.add(taskId);

      const task = finalById.get(taskId);
      if (task) {
        updates.set(taskId, cloneTask(task));
      }

      for (const candidate of finalSnapshot) {
        if (candidate.dependencies?.some((dependency) => dependency.taskId === taskId)) {
          collect(candidate.id);
        }
      }
    };

    collect(startTaskId);
    return updates;
  }
}
