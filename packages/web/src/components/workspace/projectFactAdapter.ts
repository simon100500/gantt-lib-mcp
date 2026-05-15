import type { TaskProgressEntry } from '../../lib/apiTypes.ts';
import type { Task } from '../../types.ts';

export type PlanFactTask = Task & {
  planByDate?: Record<string, number>;
  factByDate?: Record<string, number>;
};

function toDateKey(value: string | Date): string | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString().split('T')[0] ?? null;
  }

  const dateKey = value.split('T')[0]?.trim();
  return dateKey && /^\d{4}-\d{2}-\d{2}$/.test(dateKey) ? dateKey : null;
}

function enumerateDateKeys(startValue: string | Date, endValue: string | Date): string[] {
  const startKey = toDateKey(startValue);
  const endKey = toDateKey(endValue);
  if (!startKey || !endKey) {
    return [];
  }

  const startDate = new Date(`${startKey}T00:00:00Z`);
  const endDate = new Date(`${endKey}T00:00:00Z`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return [];
  }

  const firstDate = startDate.getTime() <= endDate.getTime() ? startDate : endDate;
  const lastDate = startDate.getTime() <= endDate.getTime() ? endDate : startDate;
  const dateKeys: string[] = [];
  for (const cursor = new Date(firstDate.getTime()); cursor.getTime() <= lastDate.getTime(); cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    dateKeys.push(cursor.toISOString().split('T')[0] ?? '');
  }
  return dateKeys.filter(Boolean);
}

export function buildPlanByDate(task: Task, parentTaskIds: Set<string>): Record<string, number> | undefined {
  if (parentTaskIds.has(task.id) || !task.workVolume || task.workVolume <= 0) {
    return undefined;
  }

  const dateKeys = enumerateDateKeys(task.startDate, task.endDate);
  if (dateKeys.length === 0) {
    return undefined;
  }

  const dailyValue = task.workVolume / dateKeys.length;
  return Object.fromEntries(dateKeys.map((dateKey) => [dateKey, Number(dailyValue.toFixed(6))]));
}

export function buildFactByDate(taskId: string, progressEntries: TaskProgressEntry[]): Record<string, number> | undefined {
  const values: Record<string, number> = {};
  for (const entry of progressEntries) {
    if (entry.taskId !== taskId || !Number.isFinite(entry.amount)) {
      continue;
    }
    values[entry.entryDate] = (values[entry.entryDate] ?? 0) + entry.amount;
  }

  return Object.keys(values).length > 0 ? values : undefined;
}

export function sumTaskFactAmount(taskId: string, progressEntries: TaskProgressEntry[]): number {
  return progressEntries.reduce((sum, entry) => (
    entry.taskId === taskId && Number.isFinite(entry.amount) ? sum + entry.amount : sum
  ), 0);
}

export function formatFactMetric(value: number | null | undefined, maximumFractionDigits: number = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '-';
  }

  return new Intl.NumberFormat('ru-RU', {
    maximumFractionDigits,
    minimumFractionDigits: 0,
  }).format(value);
}

export function numberMapsEqual(left?: Record<string, number>, right?: Record<string, number>): boolean {
  const keys = new Set([...Object.keys(left ?? {}), ...Object.keys(right ?? {})]);
  for (const key of keys) {
    if (Math.abs((left?.[key] ?? 0) - (right?.[key] ?? 0)) > 0.000001) {
      return false;
    }
  }
  return true;
}

export function omitPlanFactFields(task: PlanFactTask): Task {
  const { planByDate: _planByDate, factByDate: _factByDate, ...rest } = task;
  return rest;
}
