import { useCallback, useState } from 'react';

import { useProjectStore } from '../../stores/useProjectStore.ts';
import type { TaskProgressEntry } from '../../lib/apiTypes.ts';
import type { Task } from '../../types.ts';

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const clamped = Math.max(0, Math.min(100, value));
  return Math.round((clamped + Number.EPSILON) * 100) / 100;
}

function deriveTaskStatusFromProgress(currentStatus: Task['status'] | undefined, progress: number): NonNullable<Task['status']> {
  if (currentStatus === 'closed') {
    return 'closed';
  }
  if (progress >= 100) {
    return 'done';
  }
  if (progress > 0) {
    return 'in_progress';
  }
  return currentStatus === 'in_progress' ? 'in_progress' : 'not_started';
}

interface UseTaskWorkProgressMutationsOptions {
  accessToken?: string | null;
  projectId: string | null;
  workspaceKind: string;
  tasks: Task[];
  setTasks: (tasks: Task[] | ((prev: Task[]) => Task[])) => void;
  parentTaskIds: Set<string>;
  progressEntries: TaskProgressEntry[];
}

export function useTaskWorkProgressMutations({
  accessToken = null,
  projectId,
  workspaceKind,
  tasks,
  setTasks,
  parentTaskIds,
  progressEntries,
}: UseTaskWorkProgressMutationsOptions) {
  const replaceProgressEntriesForTask = useProjectStore((state) => state.replaceProgressEntriesForTask);
  const [workProgressLoadingTaskIds, setWorkProgressLoadingTaskIds] = useState<Set<string>>(() => new Set());

  const applyTaskWorkMutation = useCallback((updatedTask: Task, nextEntries?: TaskProgressEntry[]) => {
    setTasks((prev) => prev.map((task) => (task.id === updatedTask.id ? updatedTask : task)));

    const projectStoreState = useProjectStore.getState();
    projectStoreState.mergeConfirmedSnapshot({
      ...projectStoreState.confirmed.snapshot,
      tasks: projectStoreState.confirmed.snapshot.tasks.map((task) => (
        task.id === updatedTask.id ? { ...task, ...updatedTask } : task
      )),
    });

    if (nextEntries) {
      replaceProgressEntriesForTask(updatedTask.id, nextEntries);
    }
  }, [replaceProgressEntriesForTask, setTasks]);

  const applyTaskWorkMutations = useCallback((updatedTasks: Task[], nextEntries?: TaskProgressEntry[]) => {
    const taskMap = new Map(updatedTasks.map((task) => [task.id, task]));
    setTasks((prev) => prev.map((task) => taskMap.get(task.id) ?? task));

    const projectStoreState = useProjectStore.getState();
    projectStoreState.mergeConfirmedSnapshot({
      ...projectStoreState.confirmed.snapshot,
      tasks: projectStoreState.confirmed.snapshot.tasks.map((task) => {
        const updatedTask = taskMap.get(task.id);
        return updatedTask ? { ...task, ...updatedTask } : task;
      }),
    });

    if (nextEntries) {
      const taskIds = new Set(updatedTasks.map((task) => task.id));
      for (const currentTaskId of taskIds) {
        replaceProgressEntriesForTask(
          currentTaskId,
          nextEntries.filter((entry) => entry.taskId === currentTaskId),
        );
      }
    }
  }, [replaceProgressEntriesForTask, setTasks]);

  const handleUpdateTaskStatus = useCallback(async (
    task: Task,
    status: 'not_started' | 'in_progress' | 'done' | 'closed',
  ) => {
    if (parentTaskIds.has(task.id)) {
      throw new Error('Статус можно менять только у конечных задач.');
    }

    if (!accessToken || workspaceKind !== 'project') {
      const allNextEntries: TaskProgressEntry[] = [...progressEntries];
      const now = new Date().toISOString();
      const today = new Date().toISOString().split('T')[0] ?? '';
      const resolvedTasks = [task].map((currentTask) => {
        let resolvedTask: Task = { ...currentTask, status };

        if (status === 'done') {
          const targetCompletedVolume = currentTask.workVolume && currentTask.workVolume > 0
            ? currentTask.workVolume
            : (currentTask.completedVolume ?? 0);
          const delta = targetCompletedVolume - (currentTask.completedVolume ?? 0);
          if (currentTask.workVolume && currentTask.workVolume > 0 && Math.abs(delta) > 0.000001) {
            const currentEntries = allNextEntries.filter((entry) => entry.taskId === currentTask.id);
            const existingTodayEntry = currentEntries.find((entry) => entry.entryDate === today);
            const replacementEntries = existingTodayEntry
              ? currentEntries.map((entry) => (
                entry.id === existingTodayEntry.id
                  ? { ...entry, amount: entry.amount + delta, updatedAt: now }
                  : entry
              ))
              : [
                ...currentEntries,
                {
                  id: `local-status:${currentTask.id}:${today}`,
                  projectId: projectId ?? 'local',
                  taskId: currentTask.id,
                  entryDate: today,
                  amount: delta,
                  createdAt: now,
                  updatedAt: now,
                },
              ];

            for (let index = allNextEntries.length - 1; index >= 0; index -= 1) {
              if (allNextEntries[index]?.taskId === currentTask.id) {
                allNextEntries.splice(index, 1);
              }
            }
            allNextEntries.push(...replacementEntries);
          }

          resolvedTask = {
            ...resolvedTask,
            progress: 100,
            completedVolume: targetCompletedVolume,
          };
        }

        return resolvedTask;
      });

      applyTaskWorkMutations(resolvedTasks, allNextEntries);
      return { task: resolvedTasks[0] ?? task };
    }

    const response = await fetch(`/api/tasks/${encodeURIComponent(task.id)}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ status }),
    });
    const body = await response.json().catch(() => null) as {
      error?: string;
      task?: {
        workVolume: number | null;
        workUnit: string | null;
        completedVolume: number;
        status: 'not_started' | 'in_progress' | 'done' | 'closed';
        progress: number;
      };
      progressEntries?: TaskProgressEntry[];
      affectedTasks?: Task[];
      affectedProgressEntries?: TaskProgressEntry[];
    } | null;

    if (!response.ok || !body?.task) {
      throw new Error(body?.error || `HTTP ${response.status}`);
    }

    const resolvedTask: Task = {
      ...task,
      workVolume: body.task.workVolume,
      workUnit: body.task.workUnit,
      completedVolume: body.task.completedVolume,
      status: body.task.status,
      progress: body.task.progress,
    };
    if (body.affectedTasks?.length) {
      applyTaskWorkMutations(body.affectedTasks, body.affectedProgressEntries);
    } else {
      applyTaskWorkMutation(resolvedTask, body.progressEntries);
    }

    return { task: resolvedTask };
  }, [accessToken, applyTaskWorkMutation, applyTaskWorkMutations, parentTaskIds, progressEntries, projectId, workspaceKind]);

  const handleUpdateTaskWorkMetadata = useCallback(async (
    task: Task,
    patch: { workVolume?: number | null; workUnit?: string | null },
  ) => {
    if (!accessToken || workspaceKind !== 'project') {
      const nextTask = {
        ...task,
        ...(patch.workVolume !== undefined ? { workVolume: patch.workVolume } : {}),
        ...(patch.workUnit !== undefined ? { workUnit: patch.workUnit } : {}),
      };
      const nextProgress = nextTask.workVolume && nextTask.workVolume > 0
        ? clampPercent(((nextTask.completedVolume ?? 0) / nextTask.workVolume) * 100)
        : 0;
      const resolvedTask = {
        ...nextTask,
        status: deriveTaskStatusFromProgress(task.status, nextProgress),
        progress: nextProgress,
      };
      applyTaskWorkMutation(resolvedTask);
      return { task: resolvedTask };
    }

    const response = await fetch(`/api/tasks/${encodeURIComponent(task.id)}/work-metadata`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(patch),
    });
    const body = await response.json().catch(() => null) as {
      error?: string;
      task?: { workVolume: number | null; workUnit: string | null; completedVolume: number; status: 'not_started' | 'in_progress' | 'done' | 'closed'; progress: number };
      progressEntries?: TaskProgressEntry[];
    } | null;

    if (!response.ok || !body?.task) {
      throw new Error(body?.error || `HTTP ${response.status}`);
    }

    const resolvedTask: Task = {
      ...task,
      workVolume: body.task.workVolume,
      workUnit: body.task.workUnit,
      completedVolume: body.task.completedVolume,
      status: body.task.status,
      progress: body.task.progress,
    };
    applyTaskWorkMutation(resolvedTask, body.progressEntries);
    return { task: resolvedTask, progressEntries: body.progressEntries };
  }, [accessToken, applyTaskWorkMutation, workspaceKind]);

  const handleAddTaskProgressEntry = useCallback(async (
    task: Task,
    input: { entryDate: string; value: number; inputMode: 'volume' | 'percent' },
  ) => {
    if (!task.workVolume || task.workVolume <= 0) {
      throw new Error('Сначала задайте общий объём работы.');
    }

    if (!accessToken || workspaceKind !== 'project') {
      const nextAmount = input.inputMode === 'percent'
        ? task.workVolume * (input.value / 100)
        : input.value;
      const existingEntries = progressEntries.filter((entry) => entry.taskId === task.id);
      const currentEntry = existingEntries.find((entry) => entry.entryDate === input.entryDate);
      const now = new Date().toISOString();
      const nextEntries = currentEntry
        ? existingEntries.map((entry) => (
          entry.id === currentEntry.id
            ? { ...entry, amount: entry.amount + nextAmount, updatedAt: now }
            : entry
        ))
        : [
          ...existingEntries,
          {
            id: `local:${task.id}:${input.entryDate}`,
            projectId: projectId ?? 'local',
            taskId: task.id,
            entryDate: input.entryDate,
            amount: nextAmount,
            createdAt: now,
            updatedAt: now,
          },
        ];
      const completedVolume = nextEntries.reduce((sum, entry) => sum + entry.amount, 0);
      const resolvedTask: Task = {
        ...task,
        completedVolume,
        status: deriveTaskStatusFromProgress(task.status, clampPercent((completedVolume / task.workVolume) * 100)),
        progress: clampPercent((completedVolume / task.workVolume) * 100),
      };
      applyTaskWorkMutation(resolvedTask, nextEntries);
      return { task: resolvedTask, progressEntries: nextEntries };
    }

    const response = await fetch(`/api/tasks/${encodeURIComponent(task.id)}/progress-entries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(input),
    });
    const body = await response.json().catch(() => null) as {
      error?: string;
      task?: { completedVolume: number; progress: number; workVolume: number | null; workUnit: string | null; status: 'not_started' | 'in_progress' | 'done' | 'closed' };
      progressEntries?: TaskProgressEntry[];
    } | null;

    if (!response.ok || !body?.task) {
      throw new Error(body?.error || `HTTP ${response.status}`);
    }

    const resolvedTask: Task = {
      ...task,
      workVolume: body.task.workVolume,
      workUnit: body.task.workUnit,
      completedVolume: body.task.completedVolume,
      status: body.task.status,
      progress: body.task.progress,
    };
    applyTaskWorkMutation(resolvedTask, body.progressEntries);
    return { task: resolvedTask, progressEntries: body.progressEntries };
  }, [accessToken, applyTaskWorkMutation, progressEntries, projectId, workspaceKind]);

  const handleUpdateTaskProgressEntry = useCallback(async (
    task: Task,
    entry: TaskProgressEntry,
    input: { entryDate: string; amount: number },
  ) => {
    if (!task.workVolume || task.workVolume <= 0) {
      throw new Error('Сначала задайте общий объём работы.');
    }

    if (!accessToken || workspaceKind !== 'project') {
      const existingEntries = progressEntries.filter((progressEntry) => progressEntry.taskId === task.id);
      const duplicateEntry = existingEntries.find((progressEntry) => (
        progressEntry.id !== entry.id && progressEntry.entryDate === input.entryDate
      ));
      if (duplicateEntry) {
        throw new Error('На эту дату уже есть запись.');
      }

      const now = new Date().toISOString();
      const nextEntries = existingEntries.map((progressEntry) => (
        progressEntry.id === entry.id
          ? { ...progressEntry, entryDate: input.entryDate, amount: input.amount, updatedAt: now }
          : progressEntry
      ));
      const completedVolume = nextEntries.reduce((sum, progressEntry) => sum + progressEntry.amount, 0);
      const resolvedTask: Task = {
        ...task,
        completedVolume,
        status: deriveTaskStatusFromProgress(task.status, clampPercent((completedVolume / task.workVolume) * 100)),
        progress: clampPercent((completedVolume / task.workVolume) * 100),
      };
      applyTaskWorkMutation(resolvedTask, nextEntries);
      return { task: resolvedTask, progressEntries: nextEntries };
    }

    const response = await fetch(`/api/tasks/${encodeURIComponent(task.id)}/progress-entries/${encodeURIComponent(entry.id)}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(input),
    });
    const body = await response.json().catch(() => null) as {
      error?: string;
      task?: { completedVolume: number; progress: number; workVolume: number | null; workUnit: string | null; status: 'not_started' | 'in_progress' | 'done' | 'closed' };
      progressEntries?: TaskProgressEntry[];
    } | null;

    if (!response.ok || !body?.task) {
      throw new Error(body?.error || `HTTP ${response.status}`);
    }

    const resolvedTask: Task = {
      ...task,
      workVolume: body.task.workVolume,
      workUnit: body.task.workUnit,
      completedVolume: body.task.completedVolume,
      status: body.task.status,
      progress: body.task.progress,
    };
    applyTaskWorkMutation(resolvedTask, body.progressEntries);
    return { task: resolvedTask, progressEntries: body.progressEntries };
  }, [accessToken, applyTaskWorkMutation, progressEntries, workspaceKind]);

  const handleDeleteTaskProgressEntry = useCallback(async (
    task: Task,
    entry: TaskProgressEntry,
  ) => {
    if (!task.workVolume || task.workVolume <= 0) {
      throw new Error('Сначала задайте общий объём работы.');
    }

    if (!accessToken || workspaceKind !== 'project') {
      const nextEntries = progressEntries.filter((progressEntry) => (
        progressEntry.taskId === task.id && progressEntry.id !== entry.id
      ));
      const completedVolume = nextEntries.reduce((sum, progressEntry) => sum + progressEntry.amount, 0);
      const resolvedTask: Task = {
        ...task,
        completedVolume,
        status: deriveTaskStatusFromProgress(task.status, clampPercent((completedVolume / task.workVolume) * 100)),
        progress: clampPercent((completedVolume / task.workVolume) * 100),
      };
      applyTaskWorkMutation(resolvedTask, nextEntries);
      return { task: resolvedTask, progressEntries: nextEntries };
    }

    const response = await fetch(`/api/tasks/${encodeURIComponent(task.id)}/progress-entries/${encodeURIComponent(entry.id)}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    const body = await response.json().catch(() => null) as {
      error?: string;
      task?: { completedVolume: number; progress: number; workVolume: number | null; workUnit: string | null; status: 'not_started' | 'in_progress' | 'done' | 'closed' };
      progressEntries?: TaskProgressEntry[];
    } | null;

    if (!response.ok || !body?.task) {
      throw new Error(body?.error || `HTTP ${response.status}`);
    }

    const resolvedTask: Task = {
      ...task,
      workVolume: body.task.workVolume,
      workUnit: body.task.workUnit,
      completedVolume: body.task.completedVolume,
      status: body.task.status,
      progress: body.task.progress,
    };
    applyTaskWorkMutation(resolvedTask, body.progressEntries);
    return { task: resolvedTask, progressEntries: body.progressEntries };
  }, [accessToken, applyTaskWorkMutation, progressEntries, workspaceKind]);

  const runWithWorkProgressLoader = useCallback(async <T,>(taskId: string, action: () => Promise<T>): Promise<T> => {
    setWorkProgressLoadingTaskIds((current) => new Set(current).add(taskId));
    try {
      return await action();
    } finally {
      setWorkProgressLoadingTaskIds((current) => {
        const next = new Set(current);
        next.delete(taskId);
        return next;
      });
    }
  }, []);

  const applyProgressColumnVolumeDeltas = useCallback(async (changedTasks: Task[]): Promise<Task[]> => {
    const passthroughTasks: Task[] = [];

    for (const changedTask of changedTasks) {
      const originalTask = tasks.find((task) => task.id === changedTask.id);
      const originalProgress = originalTask?.progress ?? 0;
      const nextProgress = changedTask.progress ?? 0;
      const progressChanged = Math.abs(nextProgress - originalProgress) > 0.0001;

      if (!originalTask || !progressChanged) {
        passthroughTasks.push(changedTask);
        continue;
      }

      if (parentTaskIds.has(originalTask.id)) {
        const normalizedProgress = nextProgress >= 100 ? 100 : 0;
        passthroughTasks.push({
          ...changedTask,
          progress: normalizedProgress,
          status: deriveTaskStatusFromProgress(originalTask.status, normalizedProgress),
        });
        continue;
      }

      if (!originalTask.workVolume || originalTask.workVolume <= 0) {
        passthroughTasks.push({
          ...changedTask,
          progress: clampPercent(nextProgress),
          status: deriveTaskStatusFromProgress(originalTask.status, clampPercent(nextProgress)),
        });
        continue;
      }

      const currentPercent = ((originalTask.completedVolume ?? 0) / originalTask.workVolume) * 100;
      const targetPercent = clampPercent(nextProgress);
      const deltaAmount = ((targetPercent - currentPercent) / 100) * originalTask.workVolume;

      if (Math.abs(deltaAmount) < 0.000001) {
        continue;
      }

      const sanitizedTask = { ...changedTask, progress: originalProgress };
      const hasOnlyProgressChange = Object.keys(changedTask).every((key) => {
        const taskKey = key as keyof Task;
        return taskKey === 'progress' || changedTask[taskKey] === originalTask[taskKey];
      });

      if (!hasOnlyProgressChange) {
        passthroughTasks.push(sanitizedTask);
      }

      await runWithWorkProgressLoader(originalTask.id, async () => {
        await handleAddTaskProgressEntry(originalTask, {
          entryDate: new Date().toISOString().split('T')[0] ?? '',
          value: Number(deltaAmount.toFixed(6)),
          inputMode: 'volume',
        });
      });
    }

    return passthroughTasks;
  }, [handleAddTaskProgressEntry, parentTaskIds, runWithWorkProgressLoader, tasks]);

  return {
    workProgressLoadingTaskIds,
    applyTaskWorkMutation,
    applyTaskWorkMutations,
    handleUpdateTaskStatus,
    handleUpdateTaskWorkMetadata,
    handleAddTaskProgressEntry,
    handleUpdateTaskProgressEntry,
    handleDeleteTaskProgressEntry,
    runWithWorkProgressLoader,
    applyProgressColumnVolumeDeltas,
  };
}
