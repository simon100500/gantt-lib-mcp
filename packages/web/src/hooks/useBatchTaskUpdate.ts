import { useCallback, useRef } from 'react';
import type { Task, FrontendProjectCommand } from '../types';
import { replayProjectCommand } from '../lib/projectCommandReplay';
import { deriveVisibleSnapshot, useProjectStore } from '../stores/useProjectStore';
import { useUIStore, type SavingState } from '../stores/useUIStore';
import { useTaskMutation, type TaskMutationResponse, buildCommandsFromDiff } from './useTaskMutation';
import { useCommandCommit } from './useCommandCommit';

export interface UseBatchTaskUpdateOptions {
  tasks: Task[];
  setTasks: (tasks: Task[] | ((prev: Task[]) => Task[])) => void;
  accessToken: string | null;
  ganttDayMode: 'business' | 'calendar';
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
  onCascade,
}: UseBatchTaskUpdateOptions): UseBatchTaskUpdateResult {
  const { mutateTask, createTask, deleteTask, fetchTasksSnapshot } = useTaskMutation(accessToken);
  const { commitCommand } = useCommandCommit(accessToken);
  const savingState = useUIStore((state) => state.savingState);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isAuthenticatedMode = Boolean(accessToken);
  const scheduleOptions = { businessDays: ganttDayMode !== 'calendar' } as const;

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

  const applyAuthoritativeTaskResult = useCallback((result: TaskMutationResponse) => {
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
    const baseSnapshot = deriveVisibleSnapshot(
      projectState.confirmed.snapshot,
      projectState.pending,
      undefined,
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

  const hasScheduleDiff = useCallback((originalTask: Task, nextTask: Task) => (
    toDateString(originalTask.startDate) !== toDateString(nextTask.startDate)
    || toDateString(originalTask.endDate) !== toDateString(nextTask.endDate)
  ), [toDateString]);

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
      const result = await mutateTask(currentTask, originalTask);
      workingTasks = mergeTasksById(workingTasks, result.changedTasks);
      setTasks(workingTasks);
      onCascade?.(result.changedTasks);

      result.changedIds.forEach((taskId) => pendingTaskIds.delete(taskId));
      pendingTaskIds.delete(currentTask.id);
    }
  }, [mergeTasksById, mutateTask, onCascade, setTasks, tasks]);

  const handleTasksChange = useCallback(async (changedTasks: Task[]) => {
    console.log('%c[useBatchTaskUpdate] handleTasksChange START', 'background: #4c6ef5; color: white; font-weight: bold; padding: 4px 8px; border-radius: 4px;');
    console.log('[useBatchTaskUpdate] changedTasks count:', changedTasks.length);
    console.log('[useBatchTaskUpdate] CALLER:', new Error().stack?.split('\n')[2]?.trim());
    console.log('[useBatchTaskUpdate] FULL STACK:', new Error().stack);

    // Duplicate/reorder path from gantt-lib:
    // GanttChart.handleReorder emits onTasksChange(full list) and then onReorder(full list).
    // For duplicate, onTasksChange contains brand-new ids, but existing tasks are otherwise unchanged.
    // If we save here, this request can finish before handleReorder's save and briefly overwrite
    // optimistic state with an older snapshot where the clone is still missing.
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
      console.log('%c[useBatchTaskUpdate] handleTasksChange: duplicate flow detected — skipping, handleReorder will save', 'background: #845ef7; color: white; font-weight: bold; padding: 4px 8px; border-radius: 4px;');
      console.log(`%c[useBatchTaskUpdate] handleTasksChange DONE (duplicate flow, skipped)`, 'background: #51cf66; color: white; font-weight: bold; padding: 4px 8px; border-radius: 4px;');
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

    // Check if this is a pure reorder — gantt-lib fires onTasksChange for every drag event,
    // including reorders where no actual task properties changed. In that case, handleReorder
    // is about to be called and is the sole owner of sortOrder persistence.
    // We skip the server save entirely so there's only ONE save in flight.
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
      console.log('%c[useBatchTaskUpdate] handleTasksChange: pure reorder detected — skipping, handleReorder will save', 'background: #f59f00; color: white; font-weight: bold; padding: 4px 8px; border-radius: 4px;');
      console.log(`%c[useBatchTaskUpdate] handleTasksChange DONE (pure reorder, skipped)`, 'background: #51cf66; color: white; font-weight: bold; padding: 4px 8px; border-radius: 4px;');
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

        const clearPreview = setProtocolPreview(commands);
        try {
          await commitCommandsOrThrow(commands);
        } finally {
          clearPreview();
        }

        setSavingStateWithReset('saved');
      } catch (error) {
        console.error('[useBatchTaskUpdate] Command save failed:', error);
        setSavingStateWithReset('error');
      }

      console.log(`%c[useBatchTaskUpdate] handleTasksChange DONE`, 'background: #51cf66; color: white; font-weight: bold; padding: 4px 8px; border-radius: 4px;');
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

    console.log('[useBatchTaskUpdate] Full changedTasks data:');
    console.table(changedTasks.map(t => ({
      id: t.id,
      name: t.name,
      parentId: t.parentId,
      startDate: toDateString(t.startDate),
      endDate: toDateString(t.endDate),
    })));

    const changedMap = new Map(changedTasks.map(t => [t.id, t]));
    setTasks(prev => prev.map(t => changedMap.get(t.id) ?? t));
    console.log('[useBatchTaskUpdate] Optimistic state updated');

    try {
      setSavingStateWithReset('saving');

      if (changedTasks.length === 1) {
        const updatedTask = changedTasks[0];
        const originalTask = tasks.find((task) => task.id === updatedTask.id);
        if (!originalTask) {
          throw new Error(`Original task not found for ${updatedTask.id}`);
        }
        applyAuthoritativeTaskResult(await mutateTask(updatedTask, originalTask));
      } else {
        await persistAuthoritativeCascade(changedTasks);
      }

      setSavingStateWithReset('saved');
    } catch (error) {
      console.error('[useBatchTaskUpdate] Command save failed:', error);
      setSavingStateWithReset('error');
    }

    console.log(`%c[useBatchTaskUpdate] handleTasksChange DONE`, 'background: #51cf66; color: white; font-weight: bold; padding: 4px 8px; border-radius: 4px;');
  }, [applyAuthoritativeTaskResult, mutateTask, persistAuthoritativeCascade, setSavingStateWithReset, setTasks, tasks, toDateString]);

  const handleAdd = useCallback(async (task: Task) => {
    if (isAuthenticatedMode) {
      try {
        setSavingStateWithReset('saving');
        await createTask({
          id: task.id,
          name: task.name,
          startDate: typeof task.startDate === 'string' ? task.startDate.split('T')[0] : task.startDate.toISOString().split('T')[0],
          endDate: typeof task.endDate === 'string' ? task.endDate.split('T')[0] : task.endDate.toISOString().split('T')[0],
          color: task.color,
          parentId: task.parentId,
          progress: task.progress,
          dependencies: task.dependencies,
        });
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
  }, [createTask, isAuthenticatedMode, setSavingStateWithReset, setTasks]);

  const handleDelete = useCallback(async (taskId: string) => {
    console.log('%c[useBatchTaskUpdate] handleDelete called', 'background: #fa5252; color: white; font-weight: bold; padding: 4px 8px; border-radius: 4px;');
    console.log('[useBatchTaskUpdate] taskId to delete:', taskId);
    console.log('[useBatchTaskUpdate] CALLER:', new Error().stack?.split('\n')[2]?.trim());

    if (isAuthenticatedMode) {
      try {
        setSavingStateWithReset('saving');
        const result = await deleteTask(taskId);
        console.log('%c[useBatchTaskUpdate] deleteTask SUCCESS:', 'background: #51cf66; color: white; font-weight: bold; padding: 4px 8px; border-radius: 4px;', result);
        setSavingStateWithReset('saved');
      } catch (error) {
        console.error('[useBatchTaskUpdate] deleteTask FAILED:', error);
        setSavingStateWithReset('error');
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
  }, [tasks, setTasks, deleteTask, setSavingStateWithReset, accessToken, isAuthenticatedMode]);

  const handleInsertAfter = useCallback(async (taskId: string, newTask: Task) => {
    if (isAuthenticatedMode) {
      try {
        setSavingStateWithReset('saving');
        await createTask({
          id: newTask.id,
          name: newTask.name,
          startDate: typeof newTask.startDate === 'string' ? newTask.startDate.split('T')[0] : newTask.startDate.toISOString().split('T')[0],
          endDate: typeof newTask.endDate === 'string' ? newTask.endDate.split('T')[0] : newTask.endDate.toISOString().split('T')[0],
          color: newTask.color,
          parentId: newTask.parentId,
          progress: newTask.progress,
          dependencies: newTask.dependencies,
        });
        setSavingStateWithReset('saved');
      } catch (error) {
        console.error('[useBatchTaskUpdate] Failed to insert task:', error);
        setSavingStateWithReset('error');
      }
      return;
    }

    // Optimistic update
    setTasks(prev => {
      const index = prev.findIndex(t => t.id === taskId);
      if (index === -1) return prev;
      const newTasks = [...prev];
      newTasks.splice(index + 1, 0, newTask);
      return newTasks;
    });

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
      setTasks(prev => prev.map(t => t.id === newTask.id ? created : t));
      setSavingStateWithReset('saved');
    } catch (error) {
      console.error('[useBatchTaskUpdate] Failed to insert task:', error);
      setSavingStateWithReset('error');
      // Revert optimistic update on error
      setTasks(prev => prev.filter(t => t.id !== newTask.id));
    }
  }, [createTask, isAuthenticatedMode, setSavingStateWithReset, setTasks]);

  const handleReorder = useCallback(async (reorderedTasks: Task[], movedTaskId?: string, inferredParentId?: string) => {
    console.log('%c[useBatchTaskUpdate] handleReorder called', 'background: #ff00ff; color: white; font-weight: bold; padding: 4px 8px; border-radius: 4px;');
    console.log('[useBatchTaskUpdate] movedTaskId:', movedTaskId, 'inferredParentId:', inferredParentId);
    console.log('[useBatchTaskUpdate] CALLER:', new Error().stack?.split('\n')[2]?.trim());
    console.log('[useBatchTaskUpdate] FULL STACK:', new Error().stack);

    // Add sortOrder to all tasks based on their position in the array
    const tasksWithOrder = reorderedTasks.map((task, index) => ({
      ...task,
      sortOrder: index,
    }));

    if (isAuthenticatedMode) {
      const commands: FrontendProjectCommand[] = [];

      if (movedTaskId && inferredParentId !== undefined) {
        const movedTask = tasks.find((task) => task.id === movedTaskId);
        if (movedTask && (movedTask.parentId ?? null) !== (inferredParentId || null)) {
          commands.push({
            type: 'update_task_fields',
            taskId: movedTaskId,
            fields: { parentId: inferredParentId || null },
          });
        }
      }

      for (const task of tasksWithOrder) {
        const originalTask = tasks.find((candidate) => candidate.id === task.id);
        if ((originalTask?.sortOrder ?? null) !== (task.sortOrder ?? null)) {
          commands.push({
            type: 'reorder_task',
            taskId: task.id,
            sortOrder: task.sortOrder ?? 0,
          });
        }
      }

      if (commands.length === 0) {
        return;
      }

      const clearPreview = setProtocolPreview(commands);
      try {
        setSavingStateWithReset('saving');
        await commitCommandsOrThrow(commands);
        setSavingStateWithReset('saved');
      } catch (error) {
        console.error('[useBatchTaskUpdate] Failed to persist reordered task list:', error);
        setSavingStateWithReset('error');
      } finally {
        clearPreview();
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
      const movedTask = tasks.find(t => t.id === movedTaskId);
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

        for (const task of updated) {
          const originalTask = tasks.find((candidate) => candidate.id === task.id);
          if ((originalTask?.sortOrder ?? null) !== (task.sortOrder ?? null)) {
            await commitOrThrow({
              type: 'reorder_task',
              taskId: task.id,
              sortOrder: task.sortOrder ?? 0,
            });
          }
        }
        setTasks(await fetchTasksSnapshot());
        setSavingStateWithReset('saved');
      } catch (error) {
        console.error('[useBatchTaskUpdate] Failed to persist reordered hierarchy with parent change:', error);
        setSavingStateWithReset('error');
      }
    } else {
      setTasks(tasksWithOrder);
      try {
        setSavingStateWithReset('saving');
        for (const task of tasksWithOrder) {
          const originalTask = tasks.find((candidate) => candidate.id === task.id);
          if ((originalTask?.sortOrder ?? null) !== (task.sortOrder ?? null)) {
            await commitOrThrow({
              type: 'reorder_task',
              taskId: task.id,
              sortOrder: task.sortOrder ?? 0,
            });
          }
        }
        setTasks(await fetchTasksSnapshot());
        setSavingStateWithReset('saved');
        console.log('[useBatchTaskUpdate] Persisted full reordered task list:', tasksWithOrder.length);
      } catch (error) {
        console.error('[useBatchTaskUpdate] Failed to persist reordered task list:', error);
        setSavingStateWithReset('error');
      }
    }
  }, [commitCommandsOrThrow, commitOrThrow, fetchTasksSnapshot, isAuthenticatedMode, removeDependenciesBetweenTasks, setProtocolPreview, setSavingStateWithReset, setTasks, tasks]);

  const handlePromoteTask = useCallback(async (taskId: string) => {
    console.log('[useBatchTaskUpdate] handlePromoteTask called for taskId:', taskId);
    const task = tasks.find(t => t.id === taskId);
    if (!task || !task.parentId) {
      console.log('[useBatchTaskUpdate] Task not found or already at root level', { task, parentId: task?.parentId });
      return;
    }
    console.log('[useBatchTaskUpdate] Promoting task:', task.name, 'from parentId:', task.parentId);

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
      const result = await mutateTask({ ...task, parentId: undefined }, task);
      console.log('[useBatchTaskUpdate] mutateTask succeeded, result:', result);
      applyAuthoritativeTaskResult(result);
      setSavingStateWithReset('saved');
    } catch (error) {
      console.error('[useBatchTaskUpdate] Failed to promote task:', error);
      setSavingStateWithReset('error');
      // Revert on error
      setTasks(currentTasks => currentTasks.map(t => t.id === taskId ? task : t));
    }
  }, [applyAuthoritativeTaskResult, mutateTask, setSavingStateWithReset, setTasks, tasks]);

  const handleDemoteTask = useCallback(async (taskId: string, newParentId: string) => {
    console.log('[useBatchTaskUpdate] handleDemoteTask called for taskId:', taskId, 'newParentId:', newParentId);
    const task = tasks.find(t => t.id === taskId);
    if (!task) {
      console.log('[useBatchTaskUpdate] Task not found for demote');
      return;
    }
    console.log('[useBatchTaskUpdate] Demoting task:', task.name, 'to parentId:', newParentId);

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
      applyAuthoritativeTaskResult(await mutateTask({ ...task, parentId: newParentId }, task));
      setSavingStateWithReset('saved');
    } catch (error) {
      console.error('[useBatchTaskUpdate] Failed to demote task:', error);
      setSavingStateWithReset('error');
      // Revert on error
      setTasks(currentTasks => currentTasks.map(t => t.id === taskId ? task : t));
    }
  }, [applyAuthoritativeTaskResult, mutateTask, removeDependenciesBetweenTasks, setSavingStateWithReset, setTasks, tasks]);

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
