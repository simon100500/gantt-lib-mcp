import { createCustomDayPredicate } from 'gantt-lib';
import type { CustomDayConfig } from 'gantt-lib';
import type { ScheduleCommandOptions } from 'gantt-lib/core/scheduling';
import type { CalendarDayKind, EffectiveCalendarDay, GanttDayMode } from '../types.js';

export const SYSTEM_DEFAULT_CALENDAR_ID = 'system-calendar-ru-default';
export const SYSTEM_DEFAULT_CALENDAR_CODE = 'ru-default';
export const SYSTEM_DEFAULT_CALENDAR_NAME = 'Russian Default Working Calendar';

type CalendarDayRecord = {
  date: Date | string;
  kind: CalendarDayKind;
};

function toCustomDayType(kind: CalendarDayKind): CustomDayConfig['type'] {
  return kind === 'non_working' ? 'weekend' : 'workday';
}

function normalizeCustomDayDate(date: Date | string): Date {
  if (date instanceof Date) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  }

  return new Date(`${date.split('T')[0]}T00:00:00.000Z`);
}

function toCustomDayConfigs(days: CalendarDayRecord[]): CustomDayConfig[] {
  return days.map((day) => ({
    date: normalizeCustomDayDate(day.date),
    type: toCustomDayType(day.kind),
  }));
}

export function buildProjectScheduleOptions(
  ganttDayMode?: GanttDayMode,
  customDays: CustomDayConfig[] = [],
): ScheduleCommandOptions {
  if (ganttDayMode !== 'business') {
    return { businessDays: false };
  }

  return {
    businessDays: true,
    weekendPredicate: createCustomDayPredicate({ customDays }),
  };
}

export async function ensureSystemDefaultCalendar(prisma: any): Promise<string> {
  const existing = await prisma.workCalendar.findUnique({
    where: { code: SYSTEM_DEFAULT_CALENDAR_CODE },
    select: { id: true },
  });

  if (existing) {
    return existing.id;
  }

  throw new Error(`System default calendar "${SYSTEM_DEFAULT_CALENDAR_CODE}" is missing from DB`);
}

export async function loadEffectiveCalendarDays(
  prisma: any,
  calendarId?: string | null,
): Promise<EffectiveCalendarDay[]> {
  const resolvedCalendarId = calendarId ?? await ensureSystemDefaultCalendar(prisma);
  const calendarDays = await prisma.calendarDay.findMany({
    where: { calendarId: resolvedCalendarId },
    select: { date: true, kind: true },
    orderBy: { date: 'asc' },
  });

  if (calendarDays.length === 0) {
    throw new Error(`Calendar "${resolvedCalendarId}" has no configured days in DB`);
  }

  return calendarDays.map((day: CalendarDayRecord) => ({
    date: normalizeCustomDayDate(day.date).toISOString().split('T')[0],
    kind: day.kind,
  }));
}

export async function loadCalendarCustomDays(prisma: any, calendarId?: string | null): Promise<CustomDayConfig[]> {
  return toCustomDayConfigs(await loadEffectiveCalendarDays(prisma, calendarId));
}

export async function getProjectCalendarSettings(
  prisma: any,
  projectId: string,
): Promise<{ ganttDayMode: GanttDayMode; calendarId: string | null; calendarDays: EffectiveCalendarDay[] }> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { ganttDayMode: true, calendarId: true },
  });

  const ganttDayMode: GanttDayMode = project?.ganttDayMode ?? 'business';
  const calendarDays = await loadEffectiveCalendarDays(prisma, project?.calendarId);
  return {
    ganttDayMode,
    calendarId: project?.calendarId ?? await ensureSystemDefaultCalendar(prisma),
    calendarDays,
  };
}

export async function getProjectScheduleOptionsForProject(
  prisma: any,
  projectId: string,
): Promise<ScheduleCommandOptions> {
  const project = await getProjectCalendarSettings(prisma, projectId);
  const customDays = toCustomDayConfigs(project.calendarDays);
  return buildProjectScheduleOptions(project.ganttDayMode, customDays);
}
