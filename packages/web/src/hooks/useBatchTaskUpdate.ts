import { useCallback, useMemo, useRef } from 'react';
import type { CalendarDay, Task, FrontendProjectCommand } from '../types';
import { replayProjectCommand } from '../lib/projectCommandReplay';
import { deriveOptimisticSnapshot, deriveVisibleSnapshot, useProjectStore } from '../stores/useProjectStore';
import { useUIStore, type SavingState } from '../stores/useUIStore';
import { useProjectCommands, type TaskCommandResult, buildCommandsFromDiff } from './useProjectCommands';
import { useCommandCommit } from './useCommandCommit';
import { getProjectScheduleOptions } from '../lib/projectScheduleOptions';

const EMPTY_CALENDAR_DAYS: CalendarDay[] = [];

export interface UseBatchTaskUpdateOptions {
  tasks: Task[];
  setTasks: (tasks: Task[] | ((prev: Task[]) => Task[])) => void;
  accessToken: string | null;
  ganttDayMode: 'business' | 'calendar';
  calendarDays?: CalendarDay[];
  onCascade?: (tasks: Task[]) => void;
}

export interface UseBatchTaskUpdateResult {
  handleTasksChange: (changedTasks: Task[]) => Promise<void>;
  handleAdd: (task: Task) => Promise<void>;
  handleDelete: (taskId: string) => Promise<void>;
  handleInsertAfter: (taskId: string, newTask: Task) => Promise<void>;
  handleReorder: (reorderedTasks: Task[], movedTaskId?: string, inferredParentId?: string) => Promise<void>;
  handlePromoteTask: (taskId: string) => Promise<void>;
  handleDemoteTask: (taskId: string, newParentId: string) => Promise<void>;
  savingState: SavingState;
}

export function useBatchTaskUpdate({
  tasks,
  setTasks,
  accessToken,
  ganttDayMode,
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
    () => getProjectScheduleOptions(ganttDayMode, effectiveCalendarDays),
    [effectiveCalendarDays, ganttDayMode],
  );

  const toDateString = useCallback((value: Task['startDate']) => (
    typeof value === 'string' ? value.split('T')[0] : value.toISOString().split('T')[0]
  ), []);

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

  const commitCommandsOrThrow = useCallback(async (commands: FrontendProjectCommand[]) => {
    for (const command of commands) {
      await commitOrThrow(command);
    }
  }, [commitOrThrow]);

  const setProtocolPreview = useCallback((commands: FrontendProjectCommand[]) => {
    if (!isAuthenticatedMode || commands.length === 0) {
      return () => {};
    }

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

    projectState.setDragPreview({ commands, snapshot: previewSnapshot });
    return () => {
      useProjectStore.getState().setDragPreview(undefined);
    };
  }, [isAuthenticatedMode, scheduleOptions]);

  const commitAuthCommands = useCallback(async (commands: FrontendProjectCommand[]) => {
    if (commands.length === 0) {
      return;
    }

    const clearPreview = setProtocolPreview(commands);
    try {
      await commitCommandsOrThrow(commands);
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
    color: task.color,
    parentId: task.parentId,
    progress: task.progress,
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

    while (pendingTaskIds.size > 0) {
      const nextTask = changedTasks.find((task) => pendingTaskIds.has(task.id));
      if (!nextTask) {
        break;
      }

      const currentTask = nextTask;
      const originalTask = tasks.find((task) => task.id === currentTask.id) ?? currentTask;
      const result = await applyTaskChanges(currentTask, originalTask);
      workingTasks = mergeTasksById(workingTasks, result.changedTasks);
      setTasks(workingTasks);
      onCascade?.(result.changedTasks);

      result.changedIds.forEach((taskId) => pendingTaskIds.delete(taskId));
      pendingTaskIds.delete(currentTask.id);
    }
  }, [applyTaskChanges, mergeTasksById, onCascade, setTasks, tasks]);

  const handleTasksChange = useCallback(async (changedTasks: Task[]) => {
    // gantt-lib now prefers onReorder for reorder flows and uses onTasksChange only as a
    // fallback when onReorder is not provided. Keep these guards because duplicate/delete
    // flows can still route through onTasksChange with full task arrays.
    const existingTaskIds = new Set(tasks.map(t => t.id));
    const newTasksInBatch = changedTasks.filter(t => !existingTaskIds.has(t.id));
    const existingTasksUnchanged = changedTasks
      .filter(t => existingTaskIds.has(t.id))
      .every(t => {
        const original = tasks.find(orig => orig.id === t.id);
        if (!original) return false;
        const startOrig = toDateString(original.startDate);
        const startNew = toDateString(t.startDate);
        const endOrig = toDateString(original.endDate);
        const endNew = toDateString(t.endDate);
        return (
          original.name === t.name &&
          startOrig === startNew &&
          endOrig === endNew &&
          (original.parentId ?? null) === (t.parentId ?? null) &&
          (original.color ?? null) === (t.color ?? null) &&
          (original.progress ?? 0) === (t.progress ?? 0) &&
          JSON.stringify(original.dependencies ?? []) === JSON.stringify(t.dependencies ?? [])
        );
      });

    const isDuplicateFlow = newTasksInBatch.length > 0 && existingTasksUnchanged;

    if (isDuplicateFlow) {
      return;
    }

    // Check if this is a deletion-related call (only dependency updates, no actual task changes)
    // This happens when gantt-lib's handleDelete calls onTasksChange before onDelete
    // We should skip the optimistic update in this case to avoid reordering issues
    const isDeletionRelated = changedTasks.every(t => {
      const original = tasks.find(orig => orig.id === t.id);
      if (!original) return false;
      // Check if only dependencies changed
      const depsChanged = JSON.stringify(original.dependencies) !== JSON.stringify(t.dependencies);
      const nothingElseChanged =
        original.name === t.name &&
        toDateString(original.startDate) === toDateString(t.startDate) &&
        toDateString(original.endDate) === toDateString(t.endDate) &&
        (original.parentId ?? null) === (t.parentId ?? null) &&
        (original.color ?? null) === (t.color ?? null) &&
        (original.progress ?? 0) === (t.progress ?? 0);
      return depsChanged && nothingElseChanged;
    });

    // Defensive fallback: if a pure reorder ever reaches onTasksChange, do not persist it here.
    // handleReorder owns sortOrder persistence.
    const isPureReorder = changedTasks.length > 0 && changedTasks.every(t => {
      const original = tasks.find(orig => orig.id === t.id);
      if (!original) return false; // New task — not a pure reorder
      const startOrig = toDateString(original.startDate);
      const startNew = toDateString(t.startDate);
      const endOrig = toDateString(original.endDate);
      const endNew = toDateString(t.endDate);
      return (
        original.name === t.name &&
        startOrig === startNew &&
        endOrig === endNew &&
        (original.parentId ?? null) === (t.parentId ?? null) &&
        (original.color ?? null) === (t.color ?? null) &&
        (original.progress ?? 0) === (t.progress ?? 0) &&
        JSON.stringify(original.dependencies ?? []) === JSON.stringify(t.dependencies ?? [])
      );
    });

    if (isPureReorder) {
      return;
    }

    if (isAuthenticatedMode) {
      if (isDeletionRelated && changedTasks.length > 0) {
        console.log('%c[useBatchTaskUpdate] handleTasksChange: deletion preflight detected — skipping, delete_task owns persistence', 'background: #ff6b6b; color: white; font-weight: bold; padding: 4px 8px; border-radius: 4px;');
        return;
      }

      try {
        setSavingStateWithReset('saving');

        const primaryTask = changedTasks[0];
        if (!primaryTask) {
          setSavingStateWithReset('saved');
          return;
        }

        const primaryOriginal = tasks.find((task) => task.id === primaryTask.id);
        const primaryIsScheduleEdit = primaryOriginal ? hasScheduleDiff(primaryOriginal, primaryTask) : false;

        const commands = primaryIsScheduleEdit && primaryOriginal
          ? buildCommandsFromDiff(primaryOriginal, primaryTask)
          : changedTasks.flatMap((task) => {
              const originalTask = tasks.find((candidate) => candidate.id === task.id);
              if (!originalTask) {
                return [];
              }
              return buildCommandsFromDiff(originalTask, task);
            });

        if (commands.length === 0) {
          setSavingStateWithReset('saved');
          return;
        }

        await commitAuthCommands(commands);
        setSavingStateWithReset('saved');
      } catch (error) {
        console.error('[useBatchTaskUpdate] Command save failed:', error);
        setSavingStateWithReset('error');
      }

      return;
    }

    if (isDeletionRelated && changedTasks.length > 0) {
      console.log('%c[useBatchTaskUpdate] DELETION-RELATED: Updating only dependencies in state', 'background: #ff6b6b; color: white; font-weight: bold; padding: 4px 8px; border-radius: 4px;');
      // Update only the dependencies field — preserve task order
      const changedMap = new Map(changedTasks.map(t => [t.id, t]));
      setTasks(prev => prev.map(t => {
        const changed = changedMap.get(t.id);
        if (!changed) return t;
        return { ...t, dependencies: changed.dependencies };
      }));
      // Save the dependency updates to the server
      try {
        setSavingStateWithReset('saving');
        await persistAuthoritativeCascade(changedTasks);
        setSavingStateWithReset('saved');
        console.log('[useBatchTaskUpdate] Saved dependency updates from deletion');
      } catch (error) {
        console.error('[useBatchTaskUpdate] Failed to save dependency updates:', error);
        setSavingStateWithReset('error');
      }
      return;
    }

    const changedMap = new Map(changedTasks.map(t => [t.id, t]));
    setTasks(prev => prev.map(t => changedMap.get(t.id) ?? t));

    try {
      setSavingStateWithReset('saving');

      if (changedTasks.length === 1) {
        const updatedTask = changedTasks[0];
        const originalTask = tasks.find((task) => task.id === updatedTask.id);
        if (!originalTask) {
          throw new Error(`Original task not found for ${updatedTask.id}`);
        }
        applyAuthoritativeTaskResult(await applyTaskChanges(updatedTask, originalTask));
      } else {
        await persistAuthoritativeCascade(changedTasks);
      }

      setSavingStateWithReset('saved');
    } catch (error) {
      console.error('[useBatchTaskUpdate] Command save failed:', error);
      setSavingStateWithReset('error');
    }
  }, [applyAuthoritativeTaskResult, applyTaskChanges, commitAuthCommands, hasScheduleDiff, persistAuthoritativeCascade, setSavingStateWithReset, setTasks, tasks, toDateString]);

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
        color: task.color,
        parentId: task.parentId,
        progress: task.progress,
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
        const reorderedTasks = insertTaskAfterAnchor(tasks, taskId, newTask).map((task, index) => ({
          ...task,
          sortOrder: index,
        }));
        const insertedTask = reorderedTasks.find((task) => task.id === newTask.id);
        if (!insertedTask) {
          throw new Error(`Inserted task ${newTask.id} not found in reordered task list`);
        }

        await createTask(toCreateTaskInput(insertedTask));
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
        color: newTask.color,
        parentId: newTask.parentId,
        progress: newTask.progress,
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
  }, [createTask, insertTaskAfterAnchor, isAuthenticatedMode, setSavingStateWithReset, tasks, toCreateTaskInput]);

  const handleReorder = useCallback(async (reorderedTasks: Task[], movedTaskId?: string, inferredParentId?: string) => {
    const referenceTasks = isAuthenticatedMode ? getCurrentAuthTasks() : tasks;
    const referenceTaskIds = new Set(referenceTasks.map((task) => task.id));

    // Add sortOrder to all tasks based on their position in the array
    const tasksWithOrder = reorderedTasks.map((task, index) => ({
      ...task,
      sortOrder: index,
    }));
    const createdTasks = tasksWithOrder.filter((task) => !referenceTaskIds.has(task.id));

    if (isAuthenticatedMode && createdTasks.length > 0) {
      try {
        setSavingStateWithReset('saving');
        const duplicateCommands: FrontendProjectCommand[] = [{
          type: 'create_tasks_batch',
          tasks: createdTasks.map((task) => toCreateTaskInput(task)),
        }];
        duplicateCommands.push({
          type: 'reorder_tasks',
          updates: tasksWithOrder.map((task) => ({
            taskId: task.id,
            sortOrder: task.sortOrder ?? 0,
          })),
        });

        await commitAuthCommands(duplicateCommands);

        setSavingStateWithReset('saved');
      } catch (error) {
        console.error('[useBatchTaskUpdate] Failed to duplicate reordered task list:', error);
        setSavingStateWithReset('error');
      }
      return;
    }

    const reorderUpdates = tasksWithOrder
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

      if (movedTaskId && inferredParentId !== undefined) {
        const movedTask = referenceTasks.find((task) => task.id === movedTaskId);
        if (movedTask && (movedTask.parentId ?? null) !== (inferredParentId || null)) {
          commands.push({
            type: 'update_task_fields',
            taskId: movedTaskId,
            fields: { parentId: inferredParentId || null },
          });
        }
      }

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
        await commitAuthCommands(commands);
        setSavingStateWithReset('saved');
      } catch (error) {
        console.error('[useBatchTaskUpdate] Failed to persist reordered task list:', error);
        setSavingStateWithReset('error');
      }
      return;
    }

    // Update parentId if provided
    if (movedTaskId && inferredParentId !== undefined) {
      const updated = tasksWithOrder.map(t =>
        t.id === movedTaskId
          ? { ...t, parentId: inferredParentId || undefined }
          : t
      );
      const movedTask = referenceTasks.find(t => t.id === movedTaskId);
      const optimisticTasks = inferredParentId && movedTask
        ? removeDependenciesBetweenTasks(movedTaskId, inferredParentId, updated)
        : updated;
      setTasks(optimisticTasks);

      try {
        setSavingStateWithReset('saving');
        if (movedTask && (movedTask.parentId ?? null) !== (inferredParentId || null)) {
          await commitOrThrow({
            type: 'update_task_fields',
            taskId: movedTaskId,
            fields: { parentId: inferredParentId || null },
          });
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
      setTasks(tasksWithOrder);
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
        console.log('[useBatchTaskUpdate] Persisted full reordered task list:', tasksWithOrder.length);
      } catch (error) {
        console.error('[useBatchTaskUpdate] Failed to persist reordered task list:', error);
        setSavingStateWithReset('error');
      }
    }
  }, [commitAuthCommands, commitOrThrow, fetchProjectSnapshot, getCurrentAuthTasks, isAuthenticatedMode, removeDependenciesBetweenTasks, setSavingStateWithReset, setTasks, tasks]);

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
        await commitAuthCommands(buildCommandsFromDiff(task, { ...task, parentId: undefined }));
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
      const nextTask = removeDependenciesBetweenTasks(
        taskId,
        newParentId,
        tasks.map((currentTask) => (
          currentTask.id === taskId ? { ...currentTask, parentId: newParentId } : currentTask
        )),
      ).find((currentTask) => currentTask.id === taskId);

      if (!nextTask) {
        return;
      }

      try {
        setSavingStateWithReset('saving');
        await commitAuthCommands(buildCommandsFromDiff(task, nextTask));
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
  }, [applyAuthoritativeTaskResult, applyTaskChanges, commitAuthCommands, isAuthenticatedMode, removeDependenciesBetweenTasks, setSavingStateWithReset, setTasks, tasks]);

  return {
    handleTasksChange,
    handleAdd,
    handleDelete,
    handleInsertAfter,
    handleReorder,
    handlePromoteTask,
    handleDemoteTask,
    savingState,
  };
}
