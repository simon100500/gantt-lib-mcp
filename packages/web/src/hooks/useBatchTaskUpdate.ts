import { useCallback, useRef } from 'react';
import type { Task } from '../types';
import { useUIStore, type SavingState } from '../stores/useUIStore';
import { useTaskMutation } from './useTaskMutation';

export interface UseBatchTaskUpdateOptions {
  tasks: Task[];
  setTasks: (tasks: Task[] | ((prev: Task[]) => Task[])) => void;
  accessToken: string | null;
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
  onCascade,
}: UseBatchTaskUpdateOptions): UseBatchTaskUpdateResult {
  const { mutateTask, createTask, deleteTask, batchImportTasks } = useTaskMutation(accessToken);
  const savingState = useUIStore((state) => state.savingState);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Filter out parent tasks when children are also in the batch
  // gantt-lib 0.10.0 no longer sends parents with children, but we handle both cases
  const filterParentTasks = useCallback((tasks: Task[]): Task[] => {
    const taskIds = new Set(tasks.map(t => t.id));
    return tasks.filter(task => {
      // Keep task if it has no parentId or if its parent is not in the batch
      return !task.parentId || !taskIds.has(task.parentId);
    });
  }, []);

  const handleTasksChange = useCallback(async (changedTasks: Task[]) => {
    console.log('%c[useBatchTaskUpdate] handleTasksChange START', 'background: #4c6ef5; color: white; font-weight: bold; padding: 4px 8px; border-radius: 4px;');
    console.log('[useBatchTaskUpdate] changedTasks count:', changedTasks.length);
    console.log('[useBatchTaskUpdate] CALLER:', new Error().stack?.split('\n')[2]?.trim());
    console.log('[useBatchTaskUpdate] FULL STACK:', new Error().stack);

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
        original.startDate === t.startDate &&
        original.endDate === t.endDate &&
        original.parentId === t.parentId &&
        original.color === t.color &&
        original.progress === t.progress;
      return depsChanged && nothingElseChanged;
    });

    // Check if this is a pure reorder — gantt-lib fires onTasksChange for every drag event,
    // including reorders where no actual task properties changed. In that case, handleReorder
    // is about to be called and is the sole owner of sortOrder persistence.
    // We skip the server save entirely so there's only ONE save in flight.
    const isPureReorder = changedTasks.length > 0 && changedTasks.every(t => {
      const original = tasks.find(orig => orig.id === t.id);
      if (!original) return false; // New task — not a pure reorder
      const startOrig = typeof original.startDate === 'string' ? original.startDate : (original.startDate as Date).toISOString().split('T')[0];
      const startNew = typeof t.startDate === 'string' ? t.startDate : (t.startDate as Date).toISOString().split('T')[0];
      const endOrig = typeof original.endDate === 'string' ? original.endDate : (original.endDate as Date).toISOString().split('T')[0];
      const endNew = typeof t.endDate === 'string' ? t.endDate : (t.endDate as Date).toISOString().split('T')[0];
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
        if (changedTasks.length === 1) {
          await mutateTask(changedTasks[0]);
        } else {
          await batchImportTasks(changedTasks);
        }
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
      startDate: typeof t.startDate === 'string' ? t.startDate : t.startDate.toISOString().split('T')[0],
      endDate: typeof t.endDate === 'string' ? t.endDate : t.endDate.toISOString().split('T')[0],
    })));

    // When a parent task is moved, we need to move all its descendants with the same delta
    // gantt-lib doesn't do this automatically for parent-child relationships
    const tasksWithDescendants: Task[] = [...changedTasks];
    const changedTaskIds = new Set(changedTasks.map(t => t.id)); // Track which tasks gantt-lib already sent

    console.log('[useBatchTaskUpdate] Starting parent-child check...');
    console.log('[useBatchTaskUpdate] Total tasks in state:', tasks.length);
    console.log('[useBatchTaskUpdate] Changed tasks:', changedTasks.length);
    console.log('[useBatchTaskUpdate] Changed task IDs:', Array.from(changedTaskIds));

    for (const changedTask of changedTasks) {
      console.log('[useBatchTaskUpdate] Processing changed task:', changedTask.id, changedTask.name);

      // Check if this is a parent task (has children)
      const hasChildren = tasks.some(t => t.parentId === changedTask.id);
      console.log('[useBatchTaskUpdate] Task', changedTask.id, 'hasChildren:', hasChildren);

      if (hasChildren) {
        console.log('[useBatchTaskUpdate] Task', changedTask.id, 'IS A PARENT - finding children...');

        // Find original task to calculate date delta
        const originalTask = tasks.find(t => t.id === changedTask.id);
        if (!originalTask) {
          console.log('[useBatchTaskUpdate] WARNING: Original task not found for', changedTask.id);
          continue;
        }

        // Log raw date types and values for debugging
        console.log('[useBatchTaskUpdate] DEBUG - Original task dates:', {
          startDateType: typeof originalTask.startDate,
          startDateValue: originalTask.startDate,
          endDateType: typeof originalTask.endDate,
          endDateValue: originalTask.endDate,
        });
        console.log('[useBatchTaskUpdate] DEBUG - Changed task dates:', {
          startDateType: typeof changedTask.startDate,
          startDateValue: changedTask.startDate,
          endDateType: typeof changedTask.endDate,
          endDateValue: changedTask.endDate,
        });

        const originalStart = typeof originalTask.startDate === 'string'
          ? new Date(originalTask.startDate)
          : originalTask.startDate;
        const originalEnd = typeof originalTask.endDate === 'string'
          ? new Date(originalTask.endDate)
          : originalTask.endDate;
        const newStart = typeof changedTask.startDate === 'string'
          ? new Date(changedTask.startDate)
          : changedTask.startDate;
        const newEnd = typeof changedTask.endDate === 'string'
          ? new Date(changedTask.endDate)
          : changedTask.endDate;

        console.log('[useBatchTaskUpdate] Original dates:', originalStart.toISOString().split('T')[0], '-', originalEnd.toISOString().split('T')[0]);
        console.log('[useBatchTaskUpdate] New dates:', newStart.toISOString().split('T')[0], '-', newEnd.toISOString().split('T')[0]);

        const startDelta = newStart.getTime() - originalStart.getTime();
        const endDelta = newEnd.getTime() - originalEnd.getTime();

        console.log('[useBatchTaskUpdate] Deltas:', startDelta, 'ms (start),', endDelta, 'ms (end)');

        // Only apply delta if dates actually changed
        if (startDelta !== 0 || endDelta !== 0) {
          console.log(`%c[useBatchTaskUpdate] Parent task ${changedTask.id} MOVED - adding descendants`, 'background: #ffd43b; color: black; font-weight: bold; padding: 4px 8px; border-radius: 4px;');

          // Recursively find all descendants and apply the same delta
          const addDescendants = (parentId: string, depth = 0) => {
            const children = tasks.filter(t => t.parentId === parentId);
            console.log(`[useBatchTaskUpdate] ${'  '.repeat(depth)}Found ${children.length} direct children of ${parentId}`);

            for (const child of children) {
              // Skip if gantt-lib already sent this child with correct dates
              if (changedTaskIds.has(child.id)) {
                console.log(`%c[useBatchTaskUpdate] ${'  '.repeat(depth)}SKIPPING ${child.id} - already in changedTasks (gantt-lib sent it)`, 'background: #a3e635; color: black; padding: 2px 6px; border-radius: 3px;');
                continue;
              }

              console.log(`[useBatchTaskUpdate] ${'  '.repeat(depth)}Processing child: ${child.id} (${child.name})`);

              const childStart = typeof child.startDate === 'string'
                ? new Date(child.startDate)
                : child.startDate;
              const childEnd = typeof child.endDate === 'string'
                ? new Date(child.endDate)
                : child.endDate;

              console.log(`[useBatchTaskUpdate] ${'  '.repeat(depth)}  Old: ${childStart.toISOString().split('T')[0]} - ${childEnd.toISOString().split('T')[0]}`);

              const newChildStart = new Date(childStart.getTime() + startDelta).toISOString().split('T')[0];
              const newChildEnd = new Date(childEnd.getTime() + endDelta).toISOString().split('T')[0];

              console.log(`[useBatchTaskUpdate] ${'  '.repeat(depth)}  New: ${newChildStart} - ${newChildEnd}`);

              tasksWithDescendants.push({
                ...child,
                startDate: newChildStart,
                endDate: newChildEnd,
              });

              console.log(`%c[useBatchTaskUpdate] ${'  '.repeat(depth)}Added descendant ${child.id} to batch`, 'background: #d0f0fd; color: black; padding: 2px 6px; border-radius: 3px;');

              // Recursively add nested children
              addDescendants(child.id, depth + 1);
            }
          };

          addDescendants(changedTask.id);
        } else {
          console.log(`[useBatchTaskUpdate] Parent task ${changedTask.id} dates unchanged, not moving descendants`);
        }
      } else {
        console.log('[useBatchTaskUpdate] Task', changedTask.id, 'is NOT a parent');
      }
    }

    if (tasksWithDescendants.length > changedTasks.length) {
      console.log(`[useBatchTaskUpdate] Added ${tasksWithDescendants.length - changedTasks.length} descendants to the batch`);
    }

    // DON'T filter out parent tasks!
    // gantt-lib 0.10.0 DOES send parents with children via onCascade callback
    // The filterParentTasks was incorrectly filtering out parents that were explicitly sent
    const filteredTasks = tasksWithDescendants; // No filtering - use all tasks

    // Strip sortOrder before sending to server.
    // handleTasksChange is called by gantt-lib's onTasksChange which fires for EVERY drag event
    // (including reorders). gantt-lib passes task objects through spread, so the original
    // sortOrder values from the server load are still present on the task objects.
    // handleReorder is the sole owner of sortOrder persistence — it fires immediately after
    // onTasksChange and saves the new correct sortOrders. If we let handleTasksChange write
    // the old sortOrder values first, they race with (and can overwrite) handleReorder's save,
    // causing the "first reload shows old order" bug.
    const tasksWithoutSortOrder = filteredTasks.map(({ ...t }) => {
      delete (t as any).sortOrder;
      return t;
    });

    // Optimistic update: merge changed tasks into state immediately
    const changedMap = new Map(filteredTasks.map(t => [t.id, t]));
    setTasks(prev => prev.map(t => changedMap.get(t.id) ?? t));
    console.log('[useBatchTaskUpdate] Optimistic state updated');

    // Server update: use batch API for multiple tasks, single PATCH for one task
    if (tasksWithoutSortOrder.length > 1) {
      console.log(`[useBatchTaskUpdate] Using BATCH API for ${tasksWithoutSortOrder.length} tasks`);
      try {
        setSavingStateWithReset('saving');
        const saved = await batchImportTasks(tasksWithoutSortOrder);
        console.log(`[useBatchTaskUpdate] BATCH saved ${saved} tasks`);
        setSavingStateWithReset('saved');
      } catch (error) {
        console.error('[useBatchTaskUpdate] Batch save failed:', error);
        setSavingStateWithReset('error');
        // TODO: revert optimistic update on error
      }
    } else {
      console.log('[useBatchTaskUpdate] Using single PATCH for 1 task');
      try {
        setSavingStateWithReset('saving');
        await mutateTask(tasksWithoutSortOrder[0]);
        console.log('[useBatchTaskUpdate] Single task saved');
        setSavingStateWithReset('saved');
      } catch (error) {
        console.error('[useBatchTaskUpdate] Single task save failed:', error);
        setSavingStateWithReset('error');
      }
    }

    console.log(`%c[useBatchTaskUpdate] handleTasksChange DONE`, 'background: #51cf66; color: white; font-weight: bold; padding: 4px 8px; border-radius: 4px;');
  }, [setTasks, mutateTask, batchImportTasks, setSavingStateWithReset, tasks]);

  const handleAdd = useCallback(async (task: Task) => {
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
  }, [setTasks, createTask, setSavingStateWithReset]);

  const handleDelete = useCallback(async (taskId: string) => {
    console.log('%c[useBatchTaskUpdate] handleDelete called', 'background: #fa5252; color: white; font-weight: bold; padding: 4px 8px; border-radius: 4px;');
    console.log('[useBatchTaskUpdate] taskId to delete:', taskId);
    console.log('[useBatchTaskUpdate] CALLER:', new Error().stack?.split('\n')[2]?.trim());

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
  }, [tasks, setTasks, deleteTask, setSavingStateWithReset, accessToken]);

  const handleInsertAfter = useCallback(async (taskId: string, newTask: Task) => {
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
  }, [setTasks, createTask, setSavingStateWithReset]);

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

    // Update parentId if provided
    if (movedTaskId && inferredParentId !== undefined) {
      const updated = tasksWithOrder.map(t =>
        t.id === movedTaskId
          ? { ...t, parentId: inferredParentId || undefined }
          : t
      );
      setTasks(updated);

      // Find all tasks whose sortOrder changed (not just the moved one).
      // When a task changes position, ALL tasks that shifted also get new sortOrder values.
      // We must persist all of them, otherwise the DB retains stale sortOrders for shifted tasks.
      const tasksWithChangedOrder: Task[] = [];
      for (const newTask of updated) {
        const oldTask = tasks.find(t => t.id === newTask.id);
        // Include the moved task (parentId changed) and any task with a different sortOrder
        const oldSortOrder = (oldTask as any)?.sortOrder ?? -1;
        const parentChanged = newTask.id === movedTaskId;
        if (parentChanged || oldSortOrder !== newTask.sortOrder) {
          tasksWithChangedOrder.push(newTask);
        }
      }

      console.log('[useBatchTaskUpdate] Tasks with changed sortOrder (with parent change):', tasksWithChangedOrder.length);

      if (tasksWithChangedOrder.length > 1) {
        try {
          setSavingStateWithReset('saving');
          await batchImportTasks(tasksWithChangedOrder);
          setSavingStateWithReset('saved');
        } catch (error) {
          console.error(`[useBatchTaskUpdate] Failed to batch update tasks with parent change:`, error);
          setSavingStateWithReset('error');
        }
      } else if (tasksWithChangedOrder.length === 1) {
        try {
          setSavingStateWithReset('saving');
          await mutateTask(tasksWithChangedOrder[0]);
          setSavingStateWithReset('saved');
        } catch (error) {
          console.error(`[useBatchTaskUpdate] Failed to update task ${movedTaskId}:`, error);
          setSavingStateWithReset('error');
        }
      }
    } else {
      // When just reordering (no parent change), we need to update sortOrder for ALL tasks
      // that have changed position
      setTasks(tasksWithOrder);

      // Find tasks whose sortOrder has changed
      const tasksWithChangedOrder: Task[] = [];
      for (const newTask of tasksWithOrder) {
        const oldTask = tasks.find(t => t.id === newTask.id);
        const oldSortOrder = (oldTask as any)?.sortOrder ?? -1;
        if (oldSortOrder !== newTask.sortOrder) {
          tasksWithChangedOrder.push(newTask);
        }
      }

      console.log('[useBatchTaskUpdate] Tasks with changed sortOrder:', tasksWithChangedOrder.length);

      // Batch update all tasks with changed sortOrder
      if (tasksWithChangedOrder.length > 0) {
        try {
          setSavingStateWithReset('saving');
          await batchImportTasks(tasksWithChangedOrder);
          setSavingStateWithReset('saved');
          console.log('[useBatchTaskUpdate] Batch updated sortOrder for', tasksWithChangedOrder.length, 'tasks');
        } catch (error) {
          console.error('[useBatchTaskUpdate] Failed to update sortOrder:', error);
          setSavingStateWithReset('error');
        }
      }
    }
  }, [setTasks, mutateTask, batchImportTasks, setSavingStateWithReset, tasks]);

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
      const result = await mutateTask({ ...task, parentId: undefined });
      console.log('[useBatchTaskUpdate] mutateTask succeeded, result:', result);
      setSavingStateWithReset('saved');
    } catch (error) {
      console.error('[useBatchTaskUpdate] Failed to promote task:', error);
      setSavingStateWithReset('error');
      // Revert on error
      setTasks(currentTasks => currentTasks.map(t => t.id === taskId ? task : t));
    }
  }, [tasks, setTasks, mutateTask, setSavingStateWithReset]);

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
      currentTasks.map(t =>
        t.id === taskId ? { ...t, parentId: newParentId } : t
      )
    );

    // Server update
    try {
      setSavingStateWithReset('saving');
      await mutateTask({ ...task, parentId: newParentId });
      setSavingStateWithReset('saved');
    } catch (error) {
      console.error('[useBatchTaskUpdate] Failed to demote task:', error);
      setSavingStateWithReset('error');
      // Revert on error
      setTasks(currentTasks => currentTasks.map(t => t.id === taskId ? task : t));
    }
  }, [tasks, setTasks, mutateTask, setSavingStateWithReset]);

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
