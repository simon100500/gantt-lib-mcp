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
  const { mutateTask, createTask, deleteTask } = useTaskMutation(accessToken);

  const handleTasksChange = useCallback(async (changedTasks: Task[]) => {
    console.log('[useBatchTaskUpdate] handleTasksChange called with', changedTasks.length, 'tasks:', changedTasks.map(t => ({ id: t.id, name: t.name, parentId: t.parentId })));
    // Optimistic update: merge changed tasks into state immediately
    const changedMap = new Map(changedTasks.map(t => [t.id, t]));
    setTasks(prev => prev.map(t => changedMap.get(t.id) ?? t));

    // Server update: send each changed task to server
    // For cascade operations, all tasks are already in changedTasks array
    for (const task of changedTasks) {
      try {
        await mutateTask(task);
      } catch (error) {
        console.error(`[useBatchTaskUpdate] Failed to update task ${task.id}:`, error);
        // On error, you might want to revert the optimistic update
        // For now, we log and continue
      }
    }
  }, [setTasks, mutateTask]);

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
