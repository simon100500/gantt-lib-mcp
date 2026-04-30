import type { FrontendProjectCommand } from '../types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function normalizeDateOnly(value: string | Date): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return value.split('T')[0];
}

function utcDayIndex(value: string): number {
  const [year, month, day] = value.split('-').map((part) => Number.parseInt(part, 10));
  return Date.UTC(year, month - 1, day) / MS_PER_DAY;
}

function durationDays(startDate: string, endDate: string): number {
  return utcDayIndex(endDate) - utcDayIndex(startDate) + 1;
}

export interface BuildScheduleDateCommandsInput {
  taskId: string;
  originalStartDate: string | Date;
  originalEndDate: string | Date;
  nextStartDate: string | Date;
  nextEndDate: string | Date;
}

export function buildScheduleDateCommands({
  taskId,
  originalStartDate,
  originalEndDate,
  nextStartDate,
  nextEndDate,
}: BuildScheduleDateCommandsInput): FrontendProjectCommand[] {
  const originalStart = normalizeDateOnly(originalStartDate);
  const originalEnd = normalizeDateOnly(originalEndDate);
  const nextStart = normalizeDateOnly(nextStartDate);
  const nextEnd = normalizeDateOnly(nextEndDate);
  const startChanged = originalStart !== nextStart;
  const endChanged = originalEnd !== nextEnd;

  if (!startChanged && !endChanged) {
    return [];
  }

  if (
    startChanged
    && endChanged
    && durationDays(originalStart, originalEnd) === durationDays(nextStart, nextEnd)
  ) {
    return [{ type: 'move_task', taskId, startDate: nextStart }];
  }

  if (startChanged && !endChanged) {
    return [{ type: 'resize_task', taskId, anchor: 'start', date: nextStart }];
  }

  if (!startChanged && endChanged) {
    return [{ type: 'resize_task', taskId, anchor: 'end', date: nextEnd }];
  }

  if (utcDayIndex(nextStart) < utcDayIndex(originalStart)) {
    return [
      { type: 'resize_task', taskId, anchor: 'end', date: nextEnd },
      { type: 'resize_task', taskId, anchor: 'start', date: nextStart },
    ];
  }

  return [
    { type: 'resize_task', taskId, anchor: 'start', date: nextStart },
    { type: 'resize_task', taskId, anchor: 'end', date: nextEnd },
  ];
}
