import { useCallback, useState, useRef, useEffect } from 'react';
import type { Task } from '../types';
import { useTaskMutation } from './useTaskMutation';

export type SavingState = 'idle' | 'saving' | 'saved' | 'error';

// Track saving state globally (single instance across all components)
let globalSavingState: SavingState = 'idle';
const listeners = new Set<(state: SavingState) => void>();

function notifyListeners(state: SavingState) {
  globalSavingState = state;
  listeners.forEach(listener => listener(state));
}

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
  const [localSavingState, setLocalSavingState] = useState<SavingState>(globalSavingState);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Subscribe to global saving state changes
  useEffect(() => {
    const listener = (state: SavingState) => setLocalSavingState(state);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  // Helper to update saving state and reset after delay
  const setSavingStateWithReset = useCallback((state: SavingState) => {
    notifyListeners(state);

    // Clear any existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    // Reset to 'idle' after 2 seconds for 'saved' and 'error' states
    if (state === 'saved' || state === 'error') {
      saveTimeoutRef.current = setTimeout(() => {
        if (globalSavingState === state) {
          notifyListeners('idle');
        }
      }, 2000);
    }
  }, []);

  const handleTasksChange = useCallback(async (changedTasks: Task[]) => {
    console.log('%c[useBatchTaskUpdate] handleTasksChange START', 'background: #4c6ef5; color: white; font-weight: bold; padding: 4px 8px; border-radius: 4px;');
    console.log('[useBatchTaskUpdate] changedTasks count:', changedTasks.length);
    console.log('[useBatchTaskUpdate] Full changedTasks data:');
    console.table(changedTasks.map(t => ({
      id: t.id,
      name: t.name,
      parentId: t.parentId,
      startDate: typeof t.startDate === 'string' ? t.startDate : t.startDate.toISOString().split('T')[0],
      endDate: typeof t.endDate === 'string' ? t.endDate : t.endDate.toISOString().split('T')[0],
    })));

    // Optimistic update: merge changed tasks into state immediately
    const changedMap = new Map(changedTasks.map(t => [t.id, t]));
    setTasks(prev => prev.map(t => changedMap.get(t.id) ?? t));
    console.log('[useBatchTaskUpdate] Optimistic state updated');

    // Server update: use batch API for multiple tasks, single PATCH for one task
    if (changedTasks.length > 1) {
      console.log(`[useBatchTaskUpdate] Using BATCH API for ${changedTasks.length} tasks`);
      try {
        setSavingStateWithReset('saving');
        const saved = await batchImportTasks(changedTasks);
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
        await mutateTask(changedTasks[0]);
        console.log('[useBatchTaskUpdate] Single task saved');
        setSavingStateWithReset('saved');
      } catch (error) {
        console.error('[useBatchTaskUpdate] Single task save failed:', error);
        setSavingStateWithReset('error');
      }
    }

    console.log(`%c[useBatchTaskUpdate] handleTasksChange DONE`, 'background: #51cf66; color: white; font-weight: bold; padding: 4px 8px; border-radius: 4px;');
  }, [setTasks, mutateTask, batchImportTasks, setSavingStateWithReset]);

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
    // Optimistic update
    const taskToDelete = tasks.find(t => t.id === taskId);
    setTasks(prev => prev.filter(t => t.id !== taskId));

    // Server update
    try {
      setSavingStateWithReset('saving');
      await deleteTask(taskId);
      setSavingStateWithReset('saved');
    } catch (error) {
      console.error('[useBatchTaskUpdate] Failed to delete task:', error);
      setSavingStateWithReset('error');
      // Revert optimistic update on error
      if (taskToDelete) {
        setTasks(prev => [...prev, taskToDelete]);
      }
    }
  }, [tasks, setTasks, deleteTask, setSavingStateWithReset]);

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
    console.log('%c[useBatchTaskUpdate] handleReorder called', 'background: #4c6ef5; color: white; font-weight: bold; padding: 4px 8px; border-radius: 4px;');
    console.log('[useBatchTaskUpdate] movedTaskId:', movedTaskId, 'inferredParentId:', inferredParentId);

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

      // Send server update for moved task with sortOrder
      const movedTask = updated.find(t => t.id === movedTaskId);
      if (movedTask) {
        try {
          setSavingStateWithReset('saving');
          await mutateTask(movedTask);
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

      const lastSiblingIndex = currentTasks
        .map((t, i) => ({ task: t, index: i }))
        .filter(({ task }) => task.parentId === parentId)
        .sort((a, b) => b.index - a.index)[0];

      if (!lastSiblingIndex) return currentTasks;

      const withoutPromoted = currentTasks.filter(t => t.id !== taskId);
      const insertIndex = lastSiblingIndex.index + 1;
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
    savingState: localSavingState,
  };
}
