import { createCustomDayPredicate } from 'gantt-lib';
import type { CustomDayConfig } from 'gantt-lib';
import type { ScheduleCommandOptions } from 'gantt-lib/core/scheduling';
import type { CalendarDayKind, CalendarWeeklyPattern, EffectiveCalendarDay, GanttDayMode } from '../types.js';

export const SYSTEM_DEFAULT_CALENDAR_ID = 'system-calendar-ru-default';
export const SYSTEM_DEFAULT_CALENDAR_CODE = 'ru-default';
export const SYSTEM_DEFAULT_CALENDAR_NAME = 'Russian Default Working Calendar';
export const DEFAULT_CALENDAR_WEEKLY_PATTERN: CalendarWeeklyPattern = {
  mon: true,
  tue: true,
  wed: true,
  thu: true,
  fri: true,
  sat: false,
  sun: false,
};

type CalendarDayRecord = {
  date: Date | string;
  kind: CalendarDayKind;
};

type CalendarRecord = {
  id: string;
  mondayWorking: boolean;
  tuesdayWorking: boolean;
  wednesdayWorking: boolean;
  thursdayWorking: boolean;
  fridayWorking: boolean;
  saturdayWorking: boolean;
  sundayWorking: boolean;
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

export function normalizeCalendarWeeklyPattern(value: Partial<CalendarWeeklyPattern> | null | undefined): CalendarWeeklyPattern {
  return {
    mon: value?.mon ?? DEFAULT_CALENDAR_WEEKLY_PATTERN.mon,
    tue: value?.tue ?? DEFAULT_CALENDAR_WEEKLY_PATTERN.tue,
    wed: value?.wed ?? DEFAULT_CALENDAR_WEEKLY_PATTERN.wed,
    thu: value?.thu ?? DEFAULT_CALENDAR_WEEKLY_PATTERN.thu,
    fri: value?.fri ?? DEFAULT_CALENDAR_WEEKLY_PATTERN.fri,
    sat: value?.sat ?? DEFAULT_CALENDAR_WEEKLY_PATTERN.sat,
    sun: value?.sun ?? DEFAULT_CALENDAR_WEEKLY_PATTERN.sun,
  };
}

export function calendarWeeklyPatternEquals(left: CalendarWeeklyPattern, right: CalendarWeeklyPattern): boolean {
  return left.mon === right.mon
    && left.tue === right.tue
    && left.wed === right.wed
    && left.thu === right.thu
    && left.fri === right.fri
    && left.sat === right.sat
    && left.sun === right.sun;
}

export function calendarRecordToWeeklyPattern(calendar: CalendarRecord): CalendarWeeklyPattern {
  return {
    mon: calendar.mondayWorking,
    tue: calendar.tuesdayWorking,
    wed: calendar.wednesdayWorking,
    thu: calendar.thursdayWorking,
    fri: calendar.fridayWorking,
    sat: calendar.saturdayWorking,
    sun: calendar.sundayWorking,
  };
}

function isPatternWeekend(pattern: CalendarWeeklyPattern, date: Date): boolean {
  switch (date.getUTCDay()) {
    case 0:
      return !pattern.sun;
    case 1:
      return !pattern.mon;
    case 2:
      return !pattern.tue;
    case 3:
      return !pattern.wed;
    case 4:
      return !pattern.thu;
    case 5:
      return !pattern.fri;
    case 6:
      return !pattern.sat;
    default:
      return false;
  }
}

export function createProjectCalendarPredicate(
  weeklyPattern: CalendarWeeklyPattern,
  customDays: CustomDayConfig[] = [],
): (date: Date) => boolean {
  return createCustomDayPredicate({
    customDays,
    isWeekend: (date) => isPatternWeekend(weeklyPattern, date),
  });
}

export function buildProjectScheduleOptions(
  ganttDayMode?: GanttDayMode,
  weeklyPattern: CalendarWeeklyPattern = DEFAULT_CALENDAR_WEEKLY_PATTERN,
  customDays: CustomDayConfig[] = [],
): ScheduleCommandOptions {
  if (ganttDayMode !== 'business') {
    return { businessDays: false };
  }

  return {
    businessDays: true,
    weekendPredicate: createProjectCalendarPredicate(weeklyPattern, customDays),
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

  return calendarDays.map((day: CalendarDayRecord) => ({
    date: normalizeCustomDayDate(day.date).toISOString().split('T')[0],
    kind: day.kind,
  }));
}

export async function loadCalendarWeeklyPattern(
  prisma: any,
  calendarId?: string | null,
): Promise<CalendarWeeklyPattern> {
  const resolvedCalendarId = calendarId ?? await ensureSystemDefaultCalendar(prisma);
  const calendar = await prisma.workCalendar.findUnique({
    where: { id: resolvedCalendarId },
    select: {
      id: true,
      mondayWorking: true,
      tuesdayWorking: true,
      wednesdayWorking: true,
      thursdayWorking: true,
      fridayWorking: true,
      saturdayWorking: true,
      sundayWorking: true,
    },
  });

  if (!calendar) {
    throw new Error(`Calendar "${resolvedCalendarId}" is missing from DB`);
  }

  return calendarRecordToWeeklyPattern(calendar as CalendarRecord);
}

export async function loadCalendarCustomDays(prisma: any, calendarId?: string | null): Promise<CustomDayConfig[]> {
  return toCustomDayConfigs(await loadEffectiveCalendarDays(prisma, calendarId));
}

export async function getProjectCalendarSettings(
  prisma: any,
  projectId: string,
): Promise<{
  ganttDayMode: GanttDayMode;
  calendarId: string | null;
  calendarWeeklyPattern: CalendarWeeklyPattern;
  calendarDays: EffectiveCalendarDay[];
}> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { ganttDayMode: true, calendarId: true },
  });

  const ganttDayMode: GanttDayMode = project?.ganttDayMode ?? 'calendar';
  const resolvedCalendarId = project?.calendarId ?? await ensureSystemDefaultCalendar(prisma);
  const [calendarWeeklyPattern, calendarDays] = await Promise.all([
    loadCalendarWeeklyPattern(prisma, resolvedCalendarId),
    loadEffectiveCalendarDays(prisma, resolvedCalendarId),
  ]);
  return {
    ganttDayMode,
    calendarId: resolvedCalendarId,
    calendarWeeklyPattern,
    calendarDays,
  };
}

export async function getProjectScheduleOptionsForProject(
  prisma: any,
  projectId: string,
): Promise<ScheduleCommandOptions> {
  const project = await getProjectCalendarSettings(prisma, projectId);
  const customDays = toCustomDayConfigs(project.calendarDays);
  return buildProjectScheduleOptions(project.ganttDayMode, project.calendarWeeklyPattern, customDays);
}

export async function getProjectScheduleOptionsForDayMode(
  prisma: any,
  projectId: string,
  ganttDayMode: GanttDayMode,
): Promise<ScheduleCommandOptions> {
  const project = await getProjectCalendarSettings(prisma, projectId);
  const customDays = toCustomDayConfigs(project.calendarDays);
  return buildProjectScheduleOptions(ganttDayMode, project.calendarWeeklyPattern, customDays);
}
