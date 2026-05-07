import type { TaskStatus } from '../types.js';

export function clampTaskProgress(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const clamped = Math.max(0, Math.min(100, value));
  return Math.round((clamped + Number.EPSILON) * 100) / 100;
}

export function normalizeStoredTaskStatus(value: string | null | undefined): TaskStatus {
  switch (value) {
    case 'in_progress':
    case 'done':
    case 'closed':
    case 'not_started':
      return value;
    default:
      return 'not_started';
  }
}

export function deriveTaskStatusFromProgress(
  currentStatus: TaskStatus | null | undefined,
  progress: number | null | undefined,
): TaskStatus {
  const normalizedCurrent = normalizeStoredTaskStatus(currentStatus);
  const normalizedProgress = clampTaskProgress(progress ?? 0);

  if (normalizedCurrent === 'closed') {
    return 'closed';
  }
  if (normalizedProgress >= 100) {
    return 'done';
  }
  if (normalizedProgress > 0) {
    return 'in_progress';
  }
  if (normalizedCurrent === 'in_progress') {
    return 'in_progress';
  }
  return 'not_started';
}

type TaskStatusSyncInput = {
  currentStatus?: TaskStatus | null;
  currentProgress?: number | null;
  currentWorkVolume?: number | null;
  currentCompletedVolume?: number | null;
  nextStatus?: TaskStatus | null;
  nextProgress?: number | null;
  nextWorkVolume?: number | null;
  nextCompletedVolume?: number | null;
};

export type TaskStatusSyncResult = {
  status: TaskStatus;
  progress: number;
  completedVolume: number;
};

export function synchronizeTaskStatus(input: TaskStatusSyncInput): TaskStatusSyncResult {
  const currentStatus = normalizeStoredTaskStatus(input.currentStatus);
  const workVolume = input.nextWorkVolume ?? input.currentWorkVolume ?? null;
  let progress = clampTaskProgress(input.nextProgress ?? input.currentProgress ?? 0);
  let completedVolume = Math.max(0, input.nextCompletedVolume ?? input.currentCompletedVolume ?? 0);

  if (input.nextStatus !== undefined && input.nextStatus !== null) {
    const manualStatus = normalizeStoredTaskStatus(input.nextStatus);
    if (manualStatus === 'done') {
      progress = 100;
      if (workVolume !== null && Number.isFinite(workVolume) && workVolume > 0) {
        completedVolume = workVolume;
      }
    }

    return {
      status: manualStatus,
      progress,
      completedVolume,
    };
  }

  if (input.nextCompletedVolume !== undefined && workVolume !== null && Number.isFinite(workVolume) && workVolume > 0) {
    progress = clampTaskProgress((completedVolume / workVolume) * 100);
  }

  return {
    status: deriveTaskStatusFromProgress(currentStatus, progress),
    progress,
    completedVolume,
  };
}
