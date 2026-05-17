import { useCallback, useMemo, useRef } from 'react';
import type { CalendarDay, CalendarWeeklyPattern, Task, FrontendProjectCommand } from '../types';
import { replayProjectCommand } from '../lib/projectCommandReplay';
import { deriveOptimisticSnapshot, deriveVisibleSnapshot, useProjectStore } from '../stores/useProjectStore';
import { useUIStore, type SavingState } from '../stores/useUIStore';
import { useProjectCommands, type TaskCommandResult, buildCommandsFromDiff } from './useProjectCommands';
import { useCommandCommit } from './useCommandCommit';
import { DEFAULT_CALENDAR_WEEKLY_PATTERN, getProjectScheduleOptions } from '../lib/projectScheduleOptions';
import { useAuthStore } from '../stores/useAuthStore';
import { createHistoryGroup, resolveApplyChangesTitle } from './useProjectCommands';

const EMPTY_CALENDAR_DAYS: CalendarDay[] = [];

function summarizeTasks(tasks: Task[]) {
  return tasks.map((task) => ({
    id: task.id,
    name: task.name,
    startDate: typeof task.startDate === 'string' ? task.startDate : task.startDate.toISOString().split('T')[0],
    endDate: typeof task.endDate === 'string' ? task.endDate : task.endDate.toISOString().split('T')[0],
    type: task.type ?? 'task',
    parentId: task.parentId ?? null,
    status: task.status ?? 'not_started',
    progress: task.progress ?? 0,
    workVolume: task.workVolume ?? null,
    workUnit: task.workUnit ?? null,
    completedVolume: task.completedVolume ?? 0,
    dependencies: (task.dependencies ?? []).map((dependency) => ({
      taskId: dependency.taskId,
      type: dependency.type,
      lag: dependency.lag ?? 0,
    })),
  }));
}

function dedupeTasksById(tasks: Task[]): Task[] {
  const byId = new Map<string, Task>();
  for (const task of tasks) {
    byId.set(task.id, task);
  }
  return Array.from(byId.values());
}

function buildHierarchyOrderedTasks(tasks: Task[]): Task[] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const byParent = new Map<string | undefined, Task[]>();
  const originalIndexById = new Map(tasks.map((task, index) => [task.id, index]));

  for (const task of tasks) {
    const normalizedParentId = task.parentId && byId.has(task.parentId)
      ? task.parentId
      : undefined;
    const siblings = byParent.get(normalizedParentId) ?? [];
    siblings.push(task);
    byParent.set(normalizedParentId, siblings);
  }

  for (const siblings of byParent.values()) {
    siblings.sort((left, right) => {
      const leftSortOrder = left.sortOrder;
      const rightSortOrder = right.sortOrder;

      if (leftSortOrder !== undefined || rightSortOrder !== undefined) {
        const normalizedLeftSortOrder = leftSortOrder ?? Number.MAX_SAFE_INTEGER;
        const normalizedRightSortOrder = rightSortOrder ?? Number.MAX_SAFE_INTEGER;
        if (normalizedLeftSortOrder !== normalizedRightSortOrder) {
          return normalizedLeftSortOrder - normalizedRightSortOrder;
        }
      }

      return (originalIndexById.get(left.id) ?? 0) - (originalIndexById.get(right.id) ?? 0);
    });
  }

  const result: Task[] = [];
  const visited = new Set<string>();

  const walk = (parentId?: string) => {
    const children = byParent.get(parentId) ?? [];
    for (const task of children) {
      if (visited.has(task.id)) {
        continue;
      }
      visited.add(task.id);
      result.push(task);
      walk(task.id);
    }
  };

  walk(undefined);

  for (const task of tasks) {
    if (!visited.has(task.id)) {
      result.push(task);
    }
  }

  return result;
}

function mergeReorderedTasksWithReference(
  reorderedTasks: Task[],
  referenceTasks: Task[],
  movedTaskId?: string,
  inferredParentId?: string,
): Task[] {
  const referenceById = new Map(referenceTasks.map((task) => [task.id, task]));

  return reorderedTasks.map((task, index) => {
    const referenceTask = referenceById.get(task.id);
    const definedTaskFields = Object.fromEntries(
      Object.entries(task).filter(([, value]) => value !== undefined),
    ) as Partial<Task>;
    const nextParentId = task.id === movedTaskId
      ? inferredParentId
      : (task.parentId ?? referenceTask?.parentId);

    return {
      id: task.id,
      name: referenceTask?.name ?? task.name,
      startDate: referenceTask?.startDate ?? task.startDate,
      endDate: referenceTask?.endDate ?? task.endDate,
      ...(referenceTask ?? {}),
      ...definedTaskFields,
      parentId: nextParentId,
      sortOrder: index,
    };
  });
}

function isAncestorTask(ancestorId: string, taskId: string, tasks: Task[]): boolean {
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const visited = new Set<string>();
  let current = taskById.get(taskId);

  while (current?.parentId) {
    if (current.parentId === ancestorId) {
      return true;
    }
    if (visited.has(current.parentId)) {
      return false;
    }
    visited.add(current.parentId);
    current = taskById.get(current.parentId);
  }

  return false;
}

function areTasksHierarchicallyRelated(taskId1: string, taskId2: string, tasks: Task[]): boolean {
  if (taskId1 === taskId2) {
    return true;
  }

  return isAncestorTask(taskId1, taskId2, tasks) || isAncestorTask(taskId2, taskId1, tasks);
}

function sanitizeHierarchyDependencies(tasks: Task[]): Task[] {
  return tasks.map((task) => {
    const dependencies = task.dependencies ?? [];
    const filteredDependencies = dependencies.filter((dependency) => (
      !areTasksHierarchicallyRelated(task.id, dependency.taskId, tasks)
    ));

    if (filteredDependencies.length === dependencies.length) {
      return task;
    }

    return {
      ...task,
      dependencies: filteredDependencies.length > 0 ? filteredDependencies : undefined,
    };
  });
}

function resolveBatchHistoryTitle(commands: FrontendProjectCommand[]): string {
  if (
    commands.length === 2
    && commands[0]?.type === 'create_tasks_batch'
    && commands[1]?.type === 'reorder_tasks'
  ) {
    return 'Пользователь — Дублировал задачу';
  }

  if (
    commands.length === 1
    && commands[0]?.type === 'create_tasks_batch'
  ) {
    return 'Пользователь — Создал задачи';
  }

  if (
    commands.length === 1
    && commands[0]?.type === 'delete_tasks'
  ) {
    return 'Пользователь — Удалил задачи';
  }

  if (
    commands.length === 1
    && commands[0]?.type === 'shift_project'
  ) {
    return 'Пользователь — Сдвинул проект';
  }

  return resolveApplyChangesTitle(commands);
}

export interface UseBatchTaskUpdateOptions {
  tasks: Task[];
  setTasks: (tasks: Task[] | ((prev: Task[]) => Task[])) => void;
  accessToken: string | null;
  ganttDayMode: 'business' | 'calendar';
  calendarWeeklyPattern?: CalendarWeeklyPattern;
  calendarDays?: CalendarDay[];
  onCascade?: (tasks: Task[]) => void;
}

export interface UseBatchTaskUpdateResult {
  handleTasksChange: (changedTasks: Task[]) => Promise<void>;
  handleShiftProject: (deltaDays: number) => Promise<void>;
  handleGanttDayModeSwitch: (ganttDayMode: 'business' | 'calendar') => Promise<void>;
  handleClearAllTasks: () => Promise<void>;
  handleAdd: (task: Task) => Promise<void>;
  handleDelete: (taskId: string) => Promise<void>;
  handleInsertAfter: (taskId: string, newTask: Task) => Promise<void>;
  handleReorder: (reorderedTasks: Task[], movedTaskId?: string, inferredParentId?: string) => Promise<void>;
  handlePromoteTask: (taskId: string) => Promise<void>;
  handleDemoteTask: (taskId: string, newParentId: string) => Promise<void>;
  handleUngroupTask: (taskId: string) => Promise<void>;
  savingState: SavingState;
}

export const __batchTaskUpdateInternals = {
  buildHierarchyOrderedTasks,
  mergeReorderedTasksWithReference,
  resolveBatchHistoryTitle,
  sanitizeHierarchyDependencies,
};

export function useBatchTaskUpdate({
  tasks,
  setTasks,
  accessToken,
  ganttDayMode,
  calendarWeeklyPattern = DEFAULT_CALENDAR_WEEKLY_PATTERN,
  calendarDays = EMPTY_CALENDAR_DAYS,
  onCascade,
}: UseBatchTaskUpdateOptions): UseBatchTaskUpdateResult {
  const { applyTaskChanges, createTask, deleteTask, fetchProjectSnapshot } = useProjectCommands(accessToken);
  const { commitCommand } = useCommandCommit(accessToken);
  const savingState = useUIStore((state) => state.savingState);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deletingTaskIdsRef = useRef<Set<string>>(new Set());
  const isAuthenticatedMode = Boolean(accessToken);
  const effectiveCalendarDays = calendarDays.length > 0 ? calendarDays : EMPTY_CALENDAR_DAYS;
  const scheduleOptions = useMemo(
    () => getProjectScheduleOptions(ganttDayMode, calendarWeeklyPattern, effectiveCalendarDays),
    [calendarWeeklyPattern, effectiveCalendarDays, ganttDayMode],
  );

  const toDateString = useCallback((value: Task['startDate']) => (
    typeof value === 'string' ? value.split('T')[0] : value.toISOString().split('T')[0]
  ), []);

  const shiftDateString = useCallback((value: Task['startDate'], deltaDays: number): string | null => {
    const date = new Date(`${toDateString(value)}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) {
      return null;
    }

    date.setUTCDate(date.getUTCDate() + deltaDays);
    return date.toISOString().split('T')[0];
  }, [toDateString]);

  const areTasksPersistenceEqual = useCallback((left: Task, right: Task) => (
    left.name === right.name
    && toDateString(left.startDate) === toDateString(right.startDate)
    && toDateString(left.endDate) === toDateString(right.endDate)
    && (left.type ?? 'task') === (right.type ?? 'task')
    && (left.parentId ?? null) === (right.parentId ?? null)
    && (left.color ?? null) === (right.color ?? null)
    && (left.status ?? 'not_started') === (right.status ?? 'not_started')
    && (left.progress ?? 0) === (right.progress ?? 0)
    && (left.workVolume ?? null) === (right.workVolume ?? null)
    && (left.workUnit ?? null) === (right.workUnit ?? null)
    && (left.completedVolume ?? 0) === (right.completedVolume ?? 0)
    && JSON.stringify(left.dependencies ?? []) === JSON.stringify(right.dependencies ?? [])
  ), [toDateString]);

  const mergeTasksById = useCallback((currentTasks: Task[], nextTasks: Task[]): Task[] => {
    if (nextTasks.length === 0) {
      return currentTasks;
    }

    const changedById = new Map(nextTasks.map((task) => [task.id, task]));
    const merged = currentTasks.map((task) => changedById.get(task.id) ?? task);
    const mergedIds = new Set(merged.map((task) => task.id));

    for (const task of nextTasks) {
      if (!mergedIds.has(task.id)) {
        merged.push(task);
      }
    }

    return merged;
  }, []);

  const removeDependenciesBetweenTasks = useCallback((taskId1: string, taskId2: string, nextTasks: Task[]): Task[] => (
    nextTasks.map(task => {
      if (task.id !== taskId1 && task.id !== taskId2) {
        return task;
      }

      const dependencies = task.dependencies ?? [];
      const otherTaskId = task.id === taskId1 ? taskId2 : taskId1;
      const filteredDependencies = dependencies.filter(dep => dep.taskId !== otherTaskId);

      if (filteredDependencies.length === dependencies.length) {
        return task;
      }

      return {
        ...task,
        dependencies: filteredDependencies,
      };
    })
  ), []);

  const buildFieldUpdateCommandsForTasks = useCallback((originalTasks: Task[], nextTasks: Task[]): FrontendProjectCommand[] => {
    const updateCommands = nextTasks.flatMap((task) => {
      const originalTask = originalTasks.find((candidate) => candidate.id === task.id);
      if (!originalTask) {
        return [];
      }
      return buildCommandsFromDiff(originalTask, task)
        .filter((command): command is Extract<FrontendProjectCommand, { type: 'update_task_fields' }> => command.type === 'update_task_fields');
    });

    if (updateCommands.length > 1) {
      return [{
        type: 'update_tasks_fields_batch',
        updates: updateCommands.map((command) => ({
          taskId: command.taskId,
          fields: command.fields,
        })),
      }];
    }

    return updateCommands;
  }, []);

  // Helper to update saving state and reset after delay
  const setSavingStateWithReset = useCallback((state: SavingState) => {
    useUIStore.getState().setSavingState(state);

    // Clear any existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    // Reset to 'idle' after 2 seconds for 'saved' and 'error' states
    if (state === 'saved' || state === 'error') {
      saveTimeoutRef.current = setTimeout(() => {
        if (useUIStore.getState().savingState === state) {
          useUIStore.getState().setSavingState('idle');
        }
      }, 2000);
    }
  }, []);

  const applyAuthoritativeTaskResult = useCallback((result: TaskCommandResult) => {
    if (result.changedTasks.length === 0) {
      return;
    }

    console.log('[UI->STATE] applyAuthoritativeTaskResult', {
      changedIds: result.changedIds,
      changedTasks: summarizeTasks(result.changedTasks),
    });

    setTasks((prev) => mergeTasksById(prev, result.changedTasks));

    onCascade?.(result.changedTasks);
  }, [mergeTasksById, onCascade, setTasks]);

  const commitOrThrow = useCallback(async (command: FrontendProjectCommand) => {
    const result = await commitCommand(command);
    if (!result.accepted) {
      throw new Error(`Command rejected: ${result.reason}`);
    }
    return result;
  }, [commitCommand]);

  const commitCommandsOrThrow = useCallback(async (
    commands: FrontendProjectCommand[],
    options?: { includeSnapshot?: boolean; historyTitle?: string },
  ) => {
    const historySeed = {
      groupId: crypto.randomUUID(),
      requestContextId: crypto.randomUUID(),
    };
    const historyTitle = options?.historyTitle ?? resolveBatchHistoryTitle(commands);

    for (const [index, command] of commands.entries()) {
      console.log('[UI->COMMIT] command', command);
      const result = await commitCommand(
        command,
        createHistoryGroup(historyTitle, index === commands.length - 1, historySeed),
        { includeSnapshot: options?.includeSnapshot },
      );
      if (!result.accepted) {
        throw new Error(`Command rejected: ${result.reason}`);
      }
    }
  }, [commitCommand]);

  const setProtocolPreview = useCallback((commands: FrontendProjectCommand[]) => {
    if (!isAuthenticatedMode || commands.length === 0) {
      return () => {};
    }

    const previewId = crypto.randomUUID();
    const projectState = useProjectStore.getState();
    const baseSnapshot = deriveOptimisticSnapshot(
      projectState.confirmed.snapshot,
      projectState.pending,
      scheduleOptions,
    );
    const previewSnapshot = commands.reduce(
      (snapshot, command, index) => replayProjectCommand(snapshot, command, scheduleOptions, `preview:${index}`),
      baseSnapshot,
    );

    projectState.setDragPreview({ id: previewId, commands, snapshot: previewSnapshot });
    return () => {
      const currentPreview = useProjectStore.getState().dragPreview;
      if (currentPreview?.id === previewId) {
        useProjectStore.getState().setDragPreview(undefined);
      }
    };
  }, [isAuthenticatedMode, scheduleOptions]);

  const commitAuthCommands = useCallback(async (
    commands: FrontendProjectCommand[],
    options?: { includeSnapshot?: boolean; historyTitle?: string },
  ) => {
    if (commands.length === 0) {
      return;
    }

    const clearPreview = setProtocolPreview(commands);
    try {
      await commitCommandsOrThrow(commands, options);
    } finally {
      clearPreview();
    }
  }, [commitCommandsOrThrow, setProtocolPreview]);

  const getCurrentAuthTasks = useCallback((): Task[] => {
    if (!isAuthenticatedMode) {
      return tasks;
    }

    const projectState = useProjectStore.getState();
    return deriveVisibleSnapshot(
      projectState.confirmed.snapshot,
      projectState.pending,
      projectState.dragPreview,
      scheduleOptions,
    ).tasks;
  }, [isAuthenticatedMode, scheduleOptions, tasks]);

  const hasScheduleDiff = useCallback((originalTask: Task, nextTask: Task) => (
    toDateString(originalTask.startDate) !== toDateString(nextTask.startDate)
    || toDateString(originalTask.endDate) !== toDateString(nextTask.endDate)
  ), [toDateString]);

  const toCreateTaskInput = useCallback((task: Task) => ({
    id: task.id,
    name: task.name,
    startDate: typeof task.startDate === 'string' ? task.startDate.split('T')[0] : task.startDate.toISOString().split('T')[0],
    endDate: typeof task.endDate === 'string' ? task.endDate.split('T')[0] : task.endDate.toISOString().split('T')[0],
    type: task.type,
    color: task.color,
    parentId: task.parentId,
    status: task.status,
    progress: task.progress,
    workVolume: task.workVolume ?? null,
    workUnit: task.workUnit ?? null,
    completedVolume: task.completedVolume ?? 0,
    dependencies: task.dependencies,
    sortOrder: task.sortOrder,
  }), []);

  const findInsertIndexAfterSubtree = useCallback((taskList: Task[], anchorTaskId: string): number => {
    const anchorIndex = taskList.findIndex((task) => task.id === anchorTaskId);
    if (anchorIndex === -1) {
      return taskList.length - 1;
    }

    const taskById = new Map(taskList.map((task) => [task.id, task]));
    let insertIndex = anchorIndex;

    for (let index = anchorIndex + 1; index < taskList.length; index += 1) {
      let currentParentId = taskList[index]?.parentId;
      let isDescendant = false;

      while (currentParentId) {
        if (currentParentId === anchorTaskId) {
          isDescendant = true;
          break;
        }
        currentParentId = taskById.get(currentParentId)?.parentId;
      }

      if (!isDescendant) {
        break;
      }

      insertIndex = index;
    }

    return insertIndex;
  }, []);

  const insertTaskAfterAnchor = useCallback((taskList: Task[], anchorTaskId: string, taskToInsert: Task): Task[] => {
    const existingIndex = taskList.findIndex((task) => task.id === taskToInsert.id);
    const workingTasks = existingIndex === -1
      ? [...taskList]
      : taskList.filter((task) => task.id !== taskToInsert.id);

    const insertIndex = findInsertIndexAfterSubtree(workingTasks, anchorTaskId);
    const nextTasks = [...workingTasks];
    nextTasks.splice(insertIndex + 1, 0, taskToInsert);
    return nextTasks;
  }, [findInsertIndexAfterSubtree]);

  const persistAuthoritativeCascade = useCallback(async (changedTasks: Task[]) => {
    let workingTasks = tasks;
    const pendingTaskIds = new Set(changedTasks.map((task) => task.id));

    console.log('[UI CASCADE] persistAuthoritativeCascade:start', summarizeTasks(changedTasks));

    while (pendingTaskIds.size > 0) {
      const nextTask = changedTasks.find((task) => pendingTaskIds.has(task.id));
      if (!nextTask) {
        break;
      }

      const currentTask = nextTask;
      const originalTask = tasks.find((task) => task.id === currentTask.id) ?? currentTask;
      console.log('[UI CASCADE] persistAuthoritativeCascade:step', {
        taskId: currentTask.id,
        originalTask: summarizeTasks([originalTask])[0],
        currentTask: summarizeTasks([currentTask])[0],
      });
      const result = await applyTaskChanges(currentTask, originalTask);
      workingTasks = mergeTasksById(workingTasks, result.changedTasks);
      setTasks(workingTasks);
      onCascade?.(result.changedTasks);

      result.changedIds.forEach((taskId) => pendingTaskIds.delete(taskId));
      pendingTaskIds.delete(currentTask.id);
    }
  }, [applyTaskChanges, mergeTasksById, onCascade, setTasks, tasks]);

  const handleTasksChange = useCallback(async (changedTasks: Task[]) => {
    const uniqueChangedTasks = dedupeTasksById(changedTasks);
    const referenceTasks = isAuthenticatedMode ? getCurrentAuthTasks() : tasks;

    console.log('[UI SHIFT] onTasksChange', {
      changedTasks: summarizeTasks(changedTasks),
      uniqueChangedTasks: summarizeTasks(uniqueChangedTasks),
      referenceTasks: summarizeTasks(
        uniqueChangedTasks
          .map((task) => referenceTasks.find((candidate) => candidate.id === task.id))
          .filter((task): task is Task => Boolean(task)),
      ),
    });

    const isNoOpTouch = uniqueChangedTasks.length > 0 && uniqueChangedTasks.every((task) => {
      const original = referenceTasks.find((candidate) => candidate.id === task.id);
      return original ? areTasksPersistenceEqual(original, task) : false;
    });

    if (isNoOpTouch) {
      console.log('[UI SHIFT] skipped:no-op-touch');
      return;
    }

    // gantt-lib now prefers onReorder for reorder flows and uses onTasksChange only as a
    // fallback when onReorder is not provided. Keep these guards because duplicate/delete
    // flows can still route through onTasksChange with full task arrays.
    const existingTaskIds = new Set(referenceTasks.map(t => t.id));
    const newTasksInBatch = uniqueChangedTasks.filter(t => !existingTaskIds.has(t.id));
    const existingTasksUnchanged = uniqueChangedTasks
      .filter(t => existingTaskIds.has(t.id))
      .every(t => {
        const original = referenceTasks.find(orig => orig.id === t.id);
        if (!original) return false;
        return areTasksPersistenceEqual(original, t);
      });

    const isDuplicateFlow = newTasksInBatch.length > 0 && existingTasksUnchanged;

    if (isDuplicateFlow) {
      console.log('[UI SHIFT] skipped:duplicate-flow');
      return;
    }

    // Check if this is a deletion-related call (only dependency updates, no actual task changes)
    // This happens when gantt-lib's handleDelete calls onTasksChange before onDelete
    // We should skip the optimistic update in this case to avoid reordering issues
    const isDeletionRelated = uniqueChangedTasks.every(t => {
      const original = referenceTasks.find(orig => orig.id === t.id);
      if (!original) return false;
      // Check if only dependencies changed
      const depsChanged = JSON.stringify(original.dependencies) !== JSON.stringify(t.dependencies);
      const nothingElseChanged =
        original.name === t.name &&
        toDateString(original.startDate) === toDateString(t.startDate) &&
        toDateString(original.endDate) === toDateString(t.endDate) &&
        (original.parentId ?? null) === (t.parentId ?? null) &&
        (original.color ?? null) === (t.color ?? null) &&
        (original.progress ?? 0) === (t.progress ?? 0) &&
        (original.status ?? 'not_started') === (t.status ?? 'not_started') &&
        (original.workVolume ?? null) === (t.workVolume ?? null) &&
        (original.workUnit ?? null) === (t.workUnit ?? null) &&
        (original.completedVolume ?? 0) === (t.completedVolume ?? 0);
      return depsChanged && nothingElseChanged;
    });

    // Defensive fallback: if a pure reorder ever reaches onTasksChange, do not persist it here.
    // handleReorder owns sortOrder persistence.
    const isPureReorder = uniqueChangedTasks.length > 0 && uniqueChangedTasks.every(t => {
      const original = referenceTasks.find(orig => orig.id === t.id);
      if (!original) return false; // New task — not a pure reorder
      return areTasksPersistenceEqual(original, t);
    });

    if (isPureReorder) {
      console.log('[UI SHIFT] skipped:pure-reorder');
      return;
    }

    if (isAuthenticatedMode) {
      try {
        setSavingStateWithReset('saving');

        const changedTaskIds = new Set(uniqueChangedTasks.map((task) => task.id));
        const mergedTasks = referenceTasks.map((task) => changedTaskIds.has(task.id)
          ? (uniqueChangedTasks.find((candidate) => candidate.id === task.id) ?? task)
          : task);
        const hasHierarchyEdit = uniqueChangedTasks.some((task) => {
          const originalTask = referenceTasks.find((candidate) => candidate.id === task.id);
          return (originalTask?.parentId ?? null) !== (task.parentId ?? null);
        });
        const effectiveChangedTasks = hasHierarchyEdit
          ? sanitizeHierarchyDependencies(mergedTasks).filter((task) => {
              const originalTask = referenceTasks.find((candidate) => candidate.id === task.id);
              const dependenciesChanged = JSON.stringify(originalTask?.dependencies ?? []) !== JSON.stringify(task.dependencies ?? []);
              return changedTaskIds.has(task.id) || dependenciesChanged;
            })
          : uniqueChangedTasks;

        const primaryTask = effectiveChangedTasks[0];
        if (!primaryTask) {
          setSavingStateWithReset('saved');
          return;
        }

        // Build commands for ALL changed tasks (not just the primary).
        // Previously, when the primary had schedule changes, only its commands
        // were generated — cascade secondary tasks were silently dropped.
        // The server would then cascade independently (potentially differently),
        // causing visual desyncs and lag mismatches.
        const primaryOriginal = referenceTasks.find((task) => task.id === primaryTask.id);
        const primaryIsScheduleEdit = primaryOriginal ? hasScheduleDiff(primaryOriginal, primaryTask) : false;
        const commands = primaryIsScheduleEdit
          ? (primaryOriginal ? buildCommandsFromDiff(primaryOriginal, primaryTask) : [])
          : effectiveChangedTasks.flatMap((task) => {
              const originalTask = referenceTasks.find((candidate) => candidate.id === task.id);
              if (!originalTask) {
                return [];
              }
              return buildCommandsFromDiff(originalTask, task);
            });

        if (primaryIsScheduleEdit) {
          console.log('[UI SHIFT] primary schedule edit: secondary cascades will be handled by server, skipping direct commits for secondary tasks', {
            primaryTask: summarizeTasks([primaryTask])[0],
            skippedSecondaryTasks: summarizeTasks(effectiveChangedTasks.slice(1)),
          });
        }

        const batchedCommands = (
          !primaryIsScheduleEdit
          && commands.length > 1
          && commands.every((command) => command.type === 'update_task_fields')
        )
          ? [{
              type: 'update_tasks_fields_batch' as const,
              updates: commands.map((command) => ({
                taskId: command.taskId,
                fields: command.fields,
              })),
            }]
          : commands;

        if (batchedCommands.length === 0) {
          console.log('[UI SHIFT] skipped:no-commands-built');
          setSavingStateWithReset('saved');
          return;
        }

        console.log('[UI SHIFT] built-commands', batchedCommands);
        await commitAuthCommands(
          batchedCommands,
          { includeSnapshot: primaryIsScheduleEdit || hasHierarchyEdit || batchedCommands.length > 1 },
        );
        setSavingStateWithReset('saved');
      } catch (error) {
        console.error('[useBatchTaskUpdate] Command save failed:', error);
        setSavingStateWithReset('error');
      }

      return;
    }

    if (isDeletionRelated && uniqueChangedTasks.length > 0) {
      console.log('%c[useBatchTaskUpdate] DELETION-RELATED: Updating only dependencies in state', 'background: #ff6b6b; color: white; font-weight: bold; padding: 4px 8px; border-radius: 4px;');
      // Update only the dependencies field — preserve task order
      const changedMap = new Map(uniqueChangedTasks.map(t => [t.id, t]));
      setTasks(prev => prev.map(t => {
        const changed = changedMap.get(t.id);
        if (!changed) return t;
        return { ...t, dependencies: changed.dependencies };
      }));
      // Save the dependency updates to the server
      try {
        setSavingStateWithReset('saving');
        await persistAuthoritativeCascade(uniqueChangedTasks);
        setSavingStateWithReset('saved');
        console.log('[useBatchTaskUpdate] Saved dependency updates from deletion');
      } catch (error) {
        console.error('[useBatchTaskUpdate] Failed to save dependency updates:', error);
        setSavingStateWithReset('error');
      }
      return;
    }

    const changedMap = new Map(uniqueChangedTasks.map(t => [t.id, t]));
    setTasks(prev => prev.map(t => changedMap.get(t.id) ?? t));

    try {
      setSavingStateWithReset('saving');

      if (uniqueChangedTasks.length === 1) {
        const updatedTask = uniqueChangedTasks[0];
        const originalTask = referenceTasks.find((task) => task.id === updatedTask.id);
        if (!originalTask) {
          throw new Error(`Original task not found for ${updatedTask.id}`);
        }
        applyAuthoritativeTaskResult(await applyTaskChanges(updatedTask, originalTask));
      } else {
        await persistAuthoritativeCascade(uniqueChangedTasks);
      }

      setSavingStateWithReset('saved');
    } catch (error) {
      console.error('[useBatchTaskUpdate] Command save failed:', error);
      setSavingStateWithReset('error');
    }
  }, [applyAuthoritativeTaskResult, applyTaskChanges, areTasksPersistenceEqual, commitAuthCommands, getCurrentAuthTasks, hasScheduleDiff, isAuthenticatedMode, persistAuthoritativeCascade, setSavingStateWithReset, setTasks, tasks, toDateString]);

  const handleShiftProject = useCallback(async (deltaDays: number) => {
    if (!Number.isFinite(deltaDays) || deltaDays === 0) {
      return;
    }

    if (isAuthenticatedMode) {
      if (getCurrentAuthTasks().length === 0) {
        return;
      }

      try {
        setSavingStateWithReset('saving');
        await commitAuthCommands([{ type: 'shift_project', deltaDays }], { includeSnapshot: true });
        setSavingStateWithReset('saved');
      } catch (error) {
        console.error('[useBatchTaskUpdate] Failed to shift project:', error);
        setSavingStateWithReset('error');
        throw error;
      }
      return;
    }

    setTasks((currentTasks) => currentTasks.map((task) => {
      const nextStartDate = shiftDateString(task.startDate, deltaDays);
      const nextEndDate = shiftDateString(task.endDate, deltaDays);
      if (!nextStartDate || !nextEndDate) {
        return task;
      }

      return {
        ...task,
        startDate: nextStartDate,
        endDate: nextEndDate,
      };
    }));
  }, [commitAuthCommands, getCurrentAuthTasks, isAuthenticatedMode, setSavingStateWithReset, setTasks, shiftDateString]);

  const handleGanttDayModeSwitch = useCallback(async (nextGanttDayMode: 'business' | 'calendar') => {
    if (!isAuthenticatedMode) {
      return;
    }

    const authState = useAuthStore.getState();
    const currentProject = authState.project;
    if (!currentProject || currentProject.ganttDayMode === nextGanttDayMode) {
      return;
    }

    try {
      setSavingStateWithReset('saving');
      await commitAuthCommands([{
        type: 'switch_gantt_day_mode',
        ganttDayMode: nextGanttDayMode,
      }]);

      useAuthStore.setState({
        project: authState.project?.id === currentProject.id
          ? { ...authState.project, ganttDayMode: nextGanttDayMode }
          : authState.project,
        projects: authState.projects.map((project) => (
          project.id === currentProject.id
            ? { ...project, ganttDayMode: nextGanttDayMode }
            : project
        )),
      });

      setSavingStateWithReset('saved');
    } catch (error) {
      console.error('[useBatchTaskUpdate] Failed to switch gantt day mode:', error);
      setSavingStateWithReset('error');
      throw error;
    }
  }, [commitAuthCommands, isAuthenticatedMode, setSavingStateWithReset]);

  const handleClearAllTasks = useCallback(async () => {
    const taskIds = (isAuthenticatedMode ? getCurrentAuthTasks() : tasks).map((task) => task.id);
    if (taskIds.length === 0) {
      return;
    }

    if (isAuthenticatedMode) {
      try {
        setSavingStateWithReset('saving');
        await commitAuthCommands(
          [{ type: 'delete_tasks', taskIds }],
          { includeSnapshot: true, historyTitle: 'Пользователь — Очистил все задачи' },
        );
        setSavingStateWithReset('saved');
      } catch (error) {
        console.error('[useBatchTaskUpdate] Failed to clear all tasks:', error);
        setSavingStateWithReset('error');
        throw error;
      }
      return;
    }

    setTasks([]);
  }, [commitAuthCommands, getCurrentAuthTasks, isAuthenticatedMode, setSavingStateWithReset, setTasks, tasks]);

  const handleAdd = useCallback(async (task: Task) => {
    if (isAuthenticatedMode) {
      try {
        setSavingStateWithReset('saving');
        await createTask(toCreateTaskInput(task));
        setSavingStateWithReset('saved');
      } catch (error) {
        console.error('[useBatchTaskUpdate] Failed to create task:', error);
        setSavingStateWithReset('error');
      }
      return;
    }

    // Optimistic update
    setTasks(prev => [...prev, task]);

    // Server update
    try {
      setSavingStateWithReset('saving');
      const created = await createTask({
        name: task.name,
        startDate: typeof task.startDate === 'string' ? task.startDate : task.startDate.toISOString().split('T')[0],
        endDate: typeof task.endDate === 'string' ? task.endDate : task.endDate.toISOString().split('T')[0],
        type: task.type,
        color: task.color,
        parentId: task.parentId,
        status: task.status,
        progress: task.progress,
        workVolume: task.workVolume ?? null,
        workUnit: task.workUnit ?? null,
        completedVolume: task.completedVolume ?? 0,
        dependencies: task.dependencies,
      });

      // Replace optimistic task with server response
      setTasks(prev => prev.map(t => t.id === task.id ? created : t));
      setSavingStateWithReset('saved');
    } catch (error) {
      console.error('[useBatchTaskUpdate] Failed to create task:', error);
      setSavingStateWithReset('error');
      // Revert optimistic update on error
      setTasks(prev => prev.filter(t => t.id !== task.id));
    }
  }, [createTask, isAuthenticatedMode, setSavingStateWithReset, setTasks, toCreateTaskInput]);

  const handleDelete = useCallback(async (taskId: string) => {
    if (isAuthenticatedMode) {
      if (deletingTaskIdsRef.current.has(taskId)) {
        return;
      }

      console.log('%c[useBatchTaskUpdate] handleDelete called', 'background: #fa5252; color: white; font-weight: bold; padding: 4px 8px; border-radius: 4px;');
      console.log('[useBatchTaskUpdate] taskId to delete:', taskId);
      console.log('[useBatchTaskUpdate] CALLER:', new Error().stack?.split('\n')[2]?.trim());

      const taskIdsToDelete = (() => {
        const byParent = new Map<string, Task[]>();
        for (const task of tasks) {
          if (!task.parentId) {
            continue;
          }
          const siblings = byParent.get(task.parentId) ?? [];
          siblings.push(task);
          byParent.set(task.parentId, siblings);
        }

        const collected: string[] = [];
        const visit = (id: string) => {
          if (deletingTaskIdsRef.current.has(id) || collected.includes(id)) {
            return;
          }
          collected.push(id);
          const children = byParent.get(id) ?? [];
          for (const child of children) {
            visit(child.id);
          }
        };

        visit(taskId);
        return collected;
      })();

      taskIdsToDelete.forEach((id) => deletingTaskIdsRef.current.add(id));

      try {
        setSavingStateWithReset('saving');
        const result = taskIdsToDelete.length > 1
          ? await commitOrThrow({ type: 'delete_tasks', taskIds: taskIdsToDelete })
          : await deleteTask(taskId);
        console.log('%c[useBatchTaskUpdate] deleteTask SUCCESS:', 'background: #51cf66; color: white; font-weight: bold; padding: 4px 8px; border-radius: 4px;', result);
        setSavingStateWithReset('saved');
      } catch (error) {
        console.error('[useBatchTaskUpdate] deleteTask FAILED:', error);
        setSavingStateWithReset('error');
      } finally {
        taskIdsToDelete.forEach((id) => deletingTaskIdsRef.current.delete(id));
      }
      return;
    }

    // Capture the original index for correct revert position
    const originalIndex = tasks.findIndex(t => t.id === taskId);
    const taskToDelete = originalIndex !== -1 ? tasks[originalIndex] : undefined;
    console.log('[useBatchTaskUpdate] taskToDelete found:', taskToDelete ? `YES at index ${originalIndex} (${taskToDelete.name})` : 'NO - task not in state!');

    // Optimistic update: remove the task immediately
    setTasks(prev => prev.filter(t => t.id !== taskId));

    // Skip server call if no access token (local/guest mode)
    if (!accessToken) {
      console.log('[useBatchTaskUpdate] No accessToken - local mode, skip API delete');
      return;
    }

    // Server update
    try {
      setSavingStateWithReset('saving');
      console.log('[useBatchTaskUpdate] Calling deleteTask API for:', taskId);
      const result = await deleteTask(taskId);
      console.log('%c[useBatchTaskUpdate] deleteTask SUCCESS:', 'background: #51cf66; color: white; font-weight: bold; padding: 4px 8px; border-radius: 4px;', result);
      setSavingStateWithReset('saved');
    } catch (error) {
      console.error('%c[useBatchTaskUpdate] deleteTask FAILED - reverting optimistic update at original position', 'background: #ff0000; color: white; font-weight: bold; padding: 4px 8px; border-radius: 4px;');
      console.error('[useBatchTaskUpdate] Error:', error);
      setSavingStateWithReset('error');
      // Revert optimistic update on error: re-insert at original position (not end)
      if (taskToDelete) {
        setTasks(prev => {
          const reverted = [...prev];
          const clampedIndex = Math.min(originalIndex, reverted.length);
          reverted.splice(clampedIndex, 0, taskToDelete);
          return reverted;
        });
      }
    }
  }, [tasks, setTasks, deleteTask, setSavingStateWithReset, accessToken, commitOrThrow, isAuthenticatedMode]);

  const handleInsertAfter = useCallback(async (taskId: string, newTask: Task) => {
    if (isAuthenticatedMode) {
      try {
        setSavingStateWithReset('saving');
        const referenceTasks = buildHierarchyOrderedTasks(getCurrentAuthTasks());
        const reorderedTasks = insertTaskAfterAnchor(referenceTasks, taskId, newTask).map((task, index) => ({
          ...task,
          sortOrder: index,
        }));
        const insertedTask = reorderedTasks.find((task) => task.id === newTask.id);
        if (!insertedTask) {
          throw new Error(`Inserted task ${newTask.id} not found in reordered task list`);
        }

        await commitAuthCommands([
          {
            type: 'create_tasks_batch',
            tasks: [toCreateTaskInput(insertedTask)],
          },
          {
            type: 'reorder_tasks',
            updates: reorderedTasks.map((task) => ({
              taskId: task.id,
              sortOrder: task.sortOrder ?? 0,
            })),
          },
        ], {
          includeSnapshot: true,
          historyTitle: 'Пользователь — Создал задачу',
        });
        setSavingStateWithReset('saved');
      } catch (error) {
        console.error('[useBatchTaskUpdate] Failed to insert task:', error);
        setSavingStateWithReset('error');
      }
      return;
    }

    // Optimistic update
    setTasks((prev) => insertTaskAfterAnchor(prev, taskId, newTask));

    // Server update
    try {
      setSavingStateWithReset('saving');
      const created = await createTask({
        name: newTask.name,
        startDate: typeof newTask.startDate === 'string' ? newTask.startDate : newTask.startDate.toISOString().split('T')[0],
        endDate: typeof newTask.endDate === 'string' ? newTask.endDate : newTask.endDate.toISOString().split('T')[0],
        type: newTask.type,
        color: newTask.color,
        parentId: newTask.parentId,
        status: newTask.status,
        progress: newTask.progress,
        workVolume: newTask.workVolume ?? null,
        workUnit: newTask.workUnit ?? null,
        completedVolume: newTask.completedVolume ?? 0,
        dependencies: newTask.dependencies,
      });

      // Replace optimistic task with server response
      setTasks((prev) => prev.map((task) => task.id === newTask.id ? created : task));
      setSavingStateWithReset('saved');
    } catch (error) {
      console.error('[useBatchTaskUpdate] Failed to insert task:', error);
      setSavingStateWithReset('error');
      // Revert optimistic update on error
      setTasks(prev => prev.filter(t => t.id !== newTask.id));
    }
  }, [commitAuthCommands, getCurrentAuthTasks, insertTaskAfterAnchor, isAuthenticatedMode, setSavingStateWithReset, tasks, toCreateTaskInput]);

  const handleReorder = useCallback(async (reorderedTasks: Task[], movedTaskId?: string, inferredParentId?: string) => {
    const referenceTasks = isAuthenticatedMode ? getCurrentAuthTasks() : tasks;
    const referenceTaskIds = new Set(referenceTasks.map((task) => task.id));

    const reorderedWithParents = mergeReorderedTasksWithReference(
      reorderedTasks,
      referenceTasks,
      movedTaskId,
      inferredParentId,
    );
    const tasksWithOrder = movedTaskId && inferredParentId
      ? removeDependenciesBetweenTasks(movedTaskId, inferredParentId, reorderedWithParents)
      : reorderedWithParents;
    const sanitizedTasksWithOrder = sanitizeHierarchyDependencies(tasksWithOrder);
    const createdTasks = sanitizedTasksWithOrder.filter((task) => !referenceTaskIds.has(task.id));

    if (isAuthenticatedMode && createdTasks.length > 0) {
      try {
        setSavingStateWithReset('saving');
        const duplicateCommands: FrontendProjectCommand[] = [{
          type: 'create_tasks_batch',
          tasks: createdTasks.map((task) => toCreateTaskInput(task)),
        }];
        duplicateCommands.push({
          type: 'reorder_tasks',
          updates: sanitizedTasksWithOrder.map((task) => ({
            taskId: task.id,
            sortOrder: task.sortOrder ?? 0,
          })),
        });

        await commitAuthCommands(duplicateCommands, { includeSnapshot: true });

        setSavingStateWithReset('saved');
      } catch (error) {
        console.error('[useBatchTaskUpdate] Failed to duplicate reordered task list:', error);
        setSavingStateWithReset('error');
      }
      return;
    }

    const reorderUpdates = sanitizedTasksWithOrder
      .filter((task) => {
        const originalTask = referenceTasks.find((candidate) => candidate.id === task.id);
        return (originalTask?.sortOrder ?? null) !== (task.sortOrder ?? null);
      })
      .map((task) => ({
        taskId: task.id,
        sortOrder: task.sortOrder ?? 0,
      }));

    if (isAuthenticatedMode) {
      const commands: FrontendProjectCommand[] = [];
      commands.push(...buildFieldUpdateCommandsForTasks(referenceTasks, sanitizedTasksWithOrder));

      if (reorderUpdates.length > 0) {
        commands.push({
          type: 'reorder_tasks',
          updates: reorderUpdates,
        });
      }

      if (commands.length === 0) {
        return;
      }

      try {
        setSavingStateWithReset('saving');
        await commitAuthCommands(commands, { includeSnapshot: true });
        setSavingStateWithReset('saved');
      } catch (error) {
        console.error('[useBatchTaskUpdate] Failed to persist reordered task list:', error);
        setSavingStateWithReset('error');
      }
      return;
    }

    // Update parentId if provided
    if (movedTaskId) {
      const updated = sanitizedTasksWithOrder.map((task) => (
        task.id === movedTaskId
          ? { ...task, parentId: inferredParentId || undefined }
          : task
      ));
      const movedTask = referenceTasks.find(t => t.id === movedTaskId);
      const optimisticTasks = inferredParentId && movedTask
        ? removeDependenciesBetweenTasks(movedTaskId, inferredParentId, updated)
        : updated;
      setTasks(optimisticTasks);

      try {
        setSavingStateWithReset('saving');
        const fieldCommands = buildFieldUpdateCommandsForTasks(referenceTasks, optimisticTasks);
        for (const command of fieldCommands) {
          await commitOrThrow(command);
        }

        if (reorderUpdates.length > 0) {
          await commitOrThrow({
            type: 'reorder_tasks',
            updates: reorderUpdates,
          });
        }
        setTasks(await fetchProjectSnapshot());
        setSavingStateWithReset('saved');
      } catch (error) {
        console.error('[useBatchTaskUpdate] Failed to persist reordered hierarchy with parent change:', error);
        setSavingStateWithReset('error');
      }
    } else {
      setTasks(sanitizedTasksWithOrder);
      try {
        setSavingStateWithReset('saving');
        if (reorderUpdates.length > 0) {
          await commitOrThrow({
            type: 'reorder_tasks',
            updates: reorderUpdates,
          });
        }
        setTasks(await fetchProjectSnapshot());
        setSavingStateWithReset('saved');
        console.log('[useBatchTaskUpdate] Persisted full reordered task list:', sanitizedTasksWithOrder.length);
      } catch (error) {
        console.error('[useBatchTaskUpdate] Failed to persist reordered task list:', error);
        setSavingStateWithReset('error');
      }
    }
  }, [buildFieldUpdateCommandsForTasks, commitAuthCommands, commitOrThrow, fetchProjectSnapshot, getCurrentAuthTasks, isAuthenticatedMode, removeDependenciesBetweenTasks, setSavingStateWithReset, setTasks, tasks]);

  const handlePromoteTask = useCallback(async (taskId: string) => {
    console.log('[useBatchTaskUpdate] handlePromoteTask called for taskId:', taskId);
    const task = tasks.find(t => t.id === taskId);
    if (!task || !task.parentId) {
      console.log('[useBatchTaskUpdate] Task not found or already at root level', { task, parentId: task?.parentId });
      return;
    }
    console.log('[useBatchTaskUpdate] Promoting task:', task.name, 'from parentId:', task.parentId);

    if (isAuthenticatedMode) {
      try {
        setSavingStateWithReset('saving');
        await commitAuthCommands(buildCommandsFromDiff(task, { ...task, parentId: undefined }), { includeSnapshot: true });
        setSavingStateWithReset('saved');
      } catch (error) {
        console.error('[useBatchTaskUpdate] Failed to promote task:', error);
        setSavingStateWithReset('error');
      }
      return;
    }

    // Optimistic update: remove parentId and move after last sibling
    setTasks(currentTasks => {
      const parentId = task.parentId!;
      const siblings = currentTasks.filter(t => t.parentId === parentId);

      if (siblings.length <= 1) {
        return currentTasks.map(t => t.id === taskId ? { ...t, parentId: undefined } : t);
      }

      const withoutPromoted = currentTasks.filter(t => t.id !== taskId);
      // Re-derive the insert position from withoutPromoted so that removing the promoted task
      // from the array doesn't skew the index. lastSiblingIndex.index was computed on the
      // original array (which still contained the promoted task), so using it directly as an
      // offset into the shorter withoutPromoted array places the task one slot too far when the
      // promoted task appeared before the last sibling.
      const lastSiblingInWithout = withoutPromoted
        .map((t, i) => ({ task: t, index: i }))
        .filter(({ task }) => task.parentId === parentId)
        .sort((a, b) => b.index - a.index)[0];
      const insertIndex = (lastSiblingInWithout?.index ?? -1) + 1;
      const promotedTask = { ...task, parentId: undefined };
      return [
        ...withoutPromoted.slice(0, insertIndex),
        promotedTask,
        ...withoutPromoted.slice(insertIndex)
      ];
    });

    // Server update
    console.log('[useBatchTaskUpdate] Calling mutateTask with parentId: undefined for task:', task.id);
    try {
      setSavingStateWithReset('saving');
      const result = await applyTaskChanges({ ...task, parentId: undefined }, task);
      console.log('[useBatchTaskUpdate] mutateTask succeeded, result:', result);
      applyAuthoritativeTaskResult(result);
      setSavingStateWithReset('saved');
    } catch (error) {
      console.error('[useBatchTaskUpdate] Failed to promote task:', error);
      setSavingStateWithReset('error');
      // Revert on error
      setTasks(currentTasks => currentTasks.map(t => t.id === taskId ? task : t));
    }
  }, [applyAuthoritativeTaskResult, applyTaskChanges, commitAuthCommands, isAuthenticatedMode, setSavingStateWithReset, setTasks, tasks]);

  const handleDemoteTask = useCallback(async (taskId: string, newParentId: string) => {
    console.log('[useBatchTaskUpdate] handleDemoteTask called for taskId:', taskId, 'newParentId:', newParentId);
    const task = tasks.find(t => t.id === taskId);
    if (!task) {
      console.log('[useBatchTaskUpdate] Task not found for demote');
      return;
    }
    console.log('[useBatchTaskUpdate] Demoting task:', task.name, 'to parentId:', newParentId);

    if (isAuthenticatedMode) {
      const nextTasks = removeDependenciesBetweenTasks(
        taskId,
        newParentId,
        tasks.map((currentTask) => (
          currentTask.id === taskId ? { ...currentTask, parentId: newParentId } : currentTask
        )),
      );

      try {
        setSavingStateWithReset('saving');
        await commitAuthCommands(buildFieldUpdateCommandsForTasks(
          tasks,
          nextTasks.filter((currentTask) => currentTask.id === taskId || currentTask.id === newParentId),
        ), { includeSnapshot: true });
        setSavingStateWithReset('saved');
      } catch (error) {
        console.error('[useBatchTaskUpdate] Failed to demote task:', error);
        setSavingStateWithReset('error');
      }
      return;
    }

    // Optimistic update: set parentId
    setTasks(currentTasks =>
      removeDependenciesBetweenTasks(
        taskId,
        newParentId,
        currentTasks.map(t =>
          t.id === taskId ? { ...t, parentId: newParentId } : t
        )
      )
    );

    // Server update
    try {
      setSavingStateWithReset('saving');
      applyAuthoritativeTaskResult(await applyTaskChanges({ ...task, parentId: newParentId }, task));
      setSavingStateWithReset('saved');
    } catch (error) {
      console.error('[useBatchTaskUpdate] Failed to demote task:', error);
      setSavingStateWithReset('error');
      // Revert on error
      setTasks(currentTasks => currentTasks.map(t => t.id === taskId ? task : t));
    }
  }, [applyAuthoritativeTaskResult, applyTaskChanges, buildFieldUpdateCommandsForTasks, commitAuthCommands, isAuthenticatedMode, removeDependenciesBetweenTasks, setSavingStateWithReset, setTasks, tasks]);

  const handleUngroupTask = useCallback(async (taskId: string) => {
    const parentTask = tasks.find((task) => task.id === taskId);
    if (!parentTask) {
      return;
    }

    const changedTasks = tasks
      .filter((task) => task.parentId === taskId)
      .map((task) => ({
        ...task,
        parentId: parentTask.parentId,
      }));

    if (changedTasks.length === 0) {
      return;
    }

    if (isAuthenticatedMode) {
      const updateCommands = changedTasks.map((task) => ({
        type: 'update_task_fields' as const,
        taskId: task.id,
        fields: {
          parentId: task.parentId ?? null,
        },
      }));
      const commands: FrontendProjectCommand[] = updateCommands.length > 1
        ? [{
            type: 'update_tasks_fields_batch',
            updates: updateCommands.map((command) => ({
              taskId: command.taskId,
              fields: command.fields,
            })),
          }]
        : [updateCommands[0]];

      try {
        setSavingStateWithReset('saving');
        await commitAuthCommands(commands, { includeSnapshot: true });
        setSavingStateWithReset('saved');
      } catch (error) {
        console.error('[useBatchTaskUpdate] Failed to ungroup task:', error);
        setSavingStateWithReset('error');
      }
      return;
    }

    const changedTaskMap = new Map(changedTasks.map((task) => [task.id, task]));
    setTasks((currentTasks) => currentTasks.map((task) => changedTaskMap.get(task.id) ?? task));
  }, [commitAuthCommands, isAuthenticatedMode, setSavingStateWithReset, setTasks, tasks]);

  return {
    handleTasksChange,
    handleShiftProject,
    handleGanttDayModeSwitch,
    handleClearAllTasks,
    handleAdd,
    handleDelete,
    handleInsertAfter,
    handleReorder,
    handlePromoteTask,
    handleDemoteTask,
    handleUngroupTask,
    savingState,
  };
}
