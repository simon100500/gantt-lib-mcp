import { useCallback } from 'react';
import type { Task } from '../types';
import type { UseBatchTaskUpdateResult } from './useBatchTaskUpdate';
import { useUIStore } from '../stores/useUIStore';

type UseTemplateBatchUpdateOptions = {
  tasks: Task[];
  setTasks: (tasks: Task[] | ((prev: Task[]) => Task[])) => void;
  saveTemplateSnapshot: (tasks: Task[]) => Promise<void>;
};

function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((left, right) => (
    (left.sortOrder ?? 0) - (right.sortOrder ?? 0) || left.id.localeCompare(right.id)
  ));
}

function normalizeTaskDates(task: Task): Task {
  if ((task.type ?? 'task') !== 'milestone') {
    return task;
  }
  return {
    ...task,
    endDate: task.startDate,
  };
}

export function useTemplateBatchUpdate({
  tasks,
  setTasks,
  saveTemplateSnapshot,
}: UseTemplateBatchUpdateOptions): UseBatchTaskUpdateResult {
  const savingState = useUIStore((state) => state.savingState);
  const setSavingState = useUIStore((state) => state.setSavingState);

  const persist = useCallback(async (nextTasks: Task[]) => {
    setTasks(sortTasks(nextTasks));
    try {
      setSavingState('saving');
      await saveTemplateSnapshot(sortTasks(nextTasks).map(normalizeTaskDates));
      setSavingState('saved');
    } catch {
      setSavingState('error');
      throw new Error('Failed to save template snapshot');
    }
  }, [saveTemplateSnapshot, setSavingState, setTasks]);

  const handleTasksChange = useCallback(async (changedTasks: Task[]) => {
    await persist(changedTasks);
  }, [persist]);

  const handleShiftProject = useCallback(async (deltaDays: number) => {
    const shifted = tasks.map((task) => {
      const shift = (value: Task['startDate']) => {
        const date = new Date(`${typeof value === 'string' ? value : value.toISOString().split('T')[0]}T00:00:00Z`);
        date.setUTCDate(date.getUTCDate() + deltaDays);
        return date.toISOString().split('T')[0];
      };
      const nextStart = shift(task.startDate);
      const nextEnd = shift(task.endDate);
      return {
        ...task,
        startDate: nextStart,
        endDate: (task.type ?? 'task') === 'milestone' ? nextStart : nextEnd,
      };
    });
    await persist(shifted);
  }, [persist, tasks]);

  const handleGanttDayModeSwitch = useCallback(async () => {
    setSavingState('saved');
  }, [setSavingState]);

  const handleAdd = useCallback(async (task: Task) => {
    await persist([...tasks, { ...normalizeTaskDates(task), sortOrder: tasks.length }]);
  }, [persist, tasks]);

  const handleDelete = useCallback(async (taskId: string) => {
    const toDelete = new Set<string>([taskId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const task of tasks) {
        if (task.parentId && toDelete.has(task.parentId) && !toDelete.has(task.id)) {
          toDelete.add(task.id);
          changed = true;
        }
      }
    }
    const filtered = tasks
      .filter((task) => !toDelete.has(task.id))
      .map((task, index) => ({
        ...task,
        dependencies: (task.dependencies ?? []).filter((dependency) => !toDelete.has(dependency.taskId)),
        sortOrder: index,
      }));
    await persist(filtered);
  }, [persist, tasks]);

  const handleInsertAfter = useCallback(async (taskId: string, newTask: Task) => {
    const anchorIndex = tasks.findIndex((task) => task.id === taskId);
    const nextTasks = [...tasks];
    nextTasks.splice(anchorIndex >= 0 ? anchorIndex + 1 : nextTasks.length, 0, {
      ...normalizeTaskDates(newTask),
      sortOrder: 0,
    });
    await persist(nextTasks.map((task, index) => ({ ...task, sortOrder: index })));
  }, [persist, tasks]);

  const handleReorder = useCallback(async (reorderedTasks: Task[], _movedTaskId?: string, inferredParentId?: string) => {
    const normalized = reorderedTasks.map((task, index) => ({
      ...task,
      parentId: task.id === _movedTaskId ? (inferredParentId ?? task.parentId) : task.parentId,
      sortOrder: index,
    }));
    await persist(normalized);
  }, [persist]);

  const handlePromoteTask = useCallback(async (taskId: string) => {
    const task = tasks.find((candidate) => candidate.id === taskId);
    if (!task) {
      return;
    }
    const parent = task.parentId ? tasks.find((candidate) => candidate.id === task.parentId) : null;
    await persist(tasks.map((candidate) => candidate.id === taskId ? { ...candidate, parentId: parent?.parentId } : candidate));
  }, [persist, tasks]);

  const handleDemoteTask = useCallback(async (taskId: string, newParentId: string) => {
    await persist(tasks.map((task) => task.id === taskId ? { ...task, parentId: newParentId } : task));
  }, [persist, tasks]);

  const handleUngroupTask = useCallback(async (taskId: string) => {
    await persist(tasks.map((task) => task.id === taskId ? { ...task, parentId: undefined } : task));
  }, [persist, tasks]);

  return {
    handleTasksChange,
    handleShiftProject,
    handleGanttDayModeSwitch,
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
