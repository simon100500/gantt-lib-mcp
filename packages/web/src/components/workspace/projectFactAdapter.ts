import type { TaskPlanEntry, TaskProgressEntry } from '../../lib/apiTypes.ts';
import type { CalendarDay, CalendarWeeklyPattern, Task } from '../../types.ts';

const PLAN_EPSILON = 0.000001;

export type PlanFactTask = Task & {
  planByDate?: Record<string, number>;
  factByDate?: Record<string, number>;
};

function roundPlanValue(value: number): number {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

export function toDateKey(value: string | Date): string | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString().split('T')[0] ?? null;
  }

  const dateKey = value.split('T')[0]?.trim();
  return dateKey && /^\d{4}-\d{2}-\d{2}$/.test(dateKey) ? dateKey : null;
}

export function enumerateDateKeys(startValue: string | Date, endValue: string | Date): string[] {
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

function isPatternWeekend(pattern: CalendarWeeklyPattern, dateKey: string): boolean {
  const day = new Date(`${dateKey}T00:00:00Z`).getUTCDay();
  if (day === 0) return !pattern.sun;
  if (day === 1) return !pattern.mon;
  if (day === 2) return !pattern.tue;
  if (day === 3) return !pattern.wed;
  if (day === 4) return !pattern.thu;
  if (day === 5) return !pattern.fri;
  return !pattern.sat;
}

function isWorkingDate(
  dateKey: string,
  calendarWeeklyPattern: CalendarWeeklyPattern,
  calendarDays: CalendarDay[],
): boolean {
  const override = calendarDays.find((day) => day.date === dateKey)?.kind;
  if (override === 'non_working') {
    return false;
  }
  if (override === 'working' || override === 'shortened') {
    return true;
  }
  return !isPatternWeekend(calendarWeeklyPattern, dateKey);
}

function buildEntryMap(entries: Array<{ entryDate: string; amount: number }>): Record<string, number> | undefined {
  const values: Record<string, number> = {};
  for (const entry of entries) {
    if (!entry.entryDate || !Number.isFinite(entry.amount)) {
      continue;
    }
    values[entry.entryDate] = roundPlanValue((values[entry.entryDate] ?? 0) + entry.amount);
  }
  return Object.keys(values).length > 0 ? values : undefined;
}

export function buildPlanByDate(
  task: Task,
  parentTaskIds: Set<string>,
  planEntries: TaskPlanEntry[],
  calendarWeeklyPattern: CalendarWeeklyPattern,
  calendarDays: CalendarDay[],
): Record<string, number> | undefined {
  if (parentTaskIds.has(task.id) || !task.workVolume || task.workVolume <= 0) {
    return undefined;
  }

  const storedPlanByDate = buildEntryMap(planEntries);
  if (storedPlanByDate) {
    return storedPlanByDate;
  }

  const dateKeys = enumerateDateKeys(task.startDate, task.endDate)
    .filter((dateKey) => isWorkingDate(dateKey, calendarWeeklyPattern, calendarDays));
  const effectiveDateKeys = dateKeys.length > 0 ? dateKeys : enumerateDateKeys(task.startDate, task.endDate);
  if (effectiveDateKeys.length === 0) {
    return undefined;
  }

  const dailyValue = task.workVolume / effectiveDateKeys.length;
  return Object.fromEntries(effectiveDateKeys.map((dateKey) => [dateKey, roundPlanValue(dailyValue)]));
}

export function buildFactByDate(taskId: string, progressEntries: TaskProgressEntry[]): Record<string, number> | undefined {
  return buildEntryMap(progressEntries.filter((entry) => entry.taskId === taskId));
}

export function buildPlanEntriesByTaskId(planEntries: TaskPlanEntry[]): Map<string, TaskPlanEntry[]> {
  const entriesByTaskId = new Map<string, TaskPlanEntry[]>();
  for (const entry of planEntries) {
    const taskEntries = entriesByTaskId.get(entry.taskId);
    if (taskEntries) {
      taskEntries.push(entry);
    } else {
      entriesByTaskId.set(entry.taskId, [entry]);
    }
  }
  return entriesByTaskId;
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
    if (Math.abs((left?.[key] ?? 0) - (right?.[key] ?? 0)) > PLAN_EPSILON) {
      return false;
    }
  }
  return true;
}

export function omitPlanFactFields(task: PlanFactTask): Task {
  const { planByDate: _planByDate, factByDate: _factByDate, ...rest } = task;
  return rest;
}
