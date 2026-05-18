import type { FactTask } from '../api/factApi';

function getUtcDayIndex(dateKey: string): number {
  return Math.floor(new Date(`${dateKey}T00:00:00.000Z`).getTime() / 86_400_000);
}

export function getPlannedProgressByDate(task: Pick<FactTask, 'startDate' | 'endDate'>, dateKey: string): number {
  const startIndex = getUtcDayIndex(task.startDate);
  const endIndex = getUtcDayIndex(task.endDate);
  const currentIndex = getUtcDayIndex(dateKey);

  if (!Number.isFinite(startIndex) || !Number.isFinite(endIndex) || !Number.isFinite(currentIndex)) {
    return 0;
  }

  if (currentIndex < startIndex) {
    return 0;
  }

  if (currentIndex >= endIndex) {
    return 100;
  }

  const totalDays = Math.max(1, endIndex - startIndex + 1);
  const elapsedDays = Math.max(0, currentIndex - startIndex + 1);
  return Math.max(0, Math.min(100, Math.round((elapsedDays / totalDays) * 100)));
}

