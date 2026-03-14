import { useCallback } from 'react';
import type { Task } from '../types';
import { useTaskMutation } from './useTaskMutation';

export interface UseBatchTaskUpdateOptions {
  tasks: Task[];
  setTasks: (tasks: Task[] | ((prev: Task[]) => Task[])) => void;
  accessToken: string | null;
  onCascade?: (tasks: Task[]) => void;
}

export function useBatchTaskUpdate({
  tasks,
  setTasks,
  accessToken,
  onCascade,
}: UseBatchTaskUpdateOptions) {
  const { mutateTask, createTask, deleteTask, batchImportTasks } = useTaskMutation(accessToken);

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
        const saved = await batchImportTasks(changedTasks);
        console.log(`[useBatchTaskUpdate] BATCH saved ${saved} tasks`);
      } catch (error) {
        console.error('[useBatchTaskUpdate] Batch save failed:', error);
        // TODO: revert optimistic update on error
      }
    } else {
      console.log('[useBatchTaskUpdate] Using single PATCH for 1 task');
      try {
        await mutateTask(changedTasks[0]);
        console.log('[useBatchTaskUpdate] Single task saved');
      } catch (error) {
        console.error('[useBatchTaskUpdate] Single task save failed:', error);
      }
    }

    console.log(`%c[useBatchTaskUpdate] handleTasksChange DONE`, 'background: #51cf66; color: white; font-weight: bold; padding: 4px 8px; border-radius: 4px;');
  }, [setTasks, mutateTask, batchImportTasks]);

  const handleAdd = useCallback(async (task: Task) => {
    // Optimistic update
    setTasks(prev => [...prev, task]);

    // Server update
    try {
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
    } catch (error) {
      console.error('[useBatchTaskUpdate] Failed to create task:', error);
      // Revert optimistic update on error
      setTasks(prev => prev.filter(t => t.id !== task.id));
    }
  }, [setTasks, createTask]);

  const handleDelete = useCallback(async (taskId: string) => {
    // Optimistic update
    const taskToDelete = tasks.find(t => t.id === taskId);
    setTasks(prev => prev.filter(t => t.id !== taskId));

    // Server update
    try {
      await deleteTask(taskId);
    } catch (error) {
      console.error('[useBatchTaskUpdate] Failed to delete task:', error);
      // Revert optimistic update on error
      if (taskToDelete) {
        setTasks(prev => [...prev, taskToDelete]);
      }
    }
  }, [tasks, setTasks, deleteTask]);

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
    } catch (error) {
      console.error('[useBatchTaskUpdate] Failed to insert task:', error);
      // Revert optimistic update on error
      setTasks(prev => prev.filter(t => t.id !== newTask.id));
    }
  }, [setTasks, createTask]);

  const handleReorder = useCallback((reorderedTasks: Task[], movedTaskId?: string, inferredParentId?: string) => {
    // Update parentId if provided
    if (movedTaskId && inferredParentId !== undefined) {
      const updated = reorderedTasks.map(t =>
        t.id === movedTaskId
          ? { ...t, parentId: inferredParentId || undefined }
          : t
      );
      setTasks(updated);

      // Send server update for moved task
      const movedTask = updated.find(t => t.id === movedTaskId);
      if (movedTask) {
        mutateTask(movedTask).catch(error => {
          console.error(`[useBatchTaskUpdate] Failed to update task ${movedTaskId}:`, error);
        });
      }
    } else {
      setTasks(reorderedTasks);
    }
  }, [setTasks, mutateTask]);

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
      const result = await mutateTask({ ...task, parentId: undefined });
      console.log('[useBatchTaskUpdate] mutateTask succeeded, result:', result);
    } catch (error) {
      console.error('[useBatchTaskUpdate] Failed to promote task:', error);
      // Revert on error
      setTasks(currentTasks => currentTasks.map(t => t.id === taskId ? task : t));
    }
  }, [tasks, setTasks, mutateTask]);

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
      await mutateTask({ ...task, parentId: newParentId });
    } catch (error) {
      console.error('[useBatchTaskUpdate] Failed to demote task:', error);
      // Revert on error
      setTasks(currentTasks => currentTasks.map(t => t.id === taskId ? task : t));
    }
  }, [tasks, setTasks, mutateTask]);

  return {
    handleTasksChange,
    handleAdd,
    handleDelete,
    handleInsertAfter,
    handleReorder,
    handlePromoteTask,
    handleDemoteTask,
  };
}
