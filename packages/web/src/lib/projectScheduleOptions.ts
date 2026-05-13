import { createCustomDayPredicate } from 'gantt-lib';
import type { CustomDayConfig } from 'gantt-lib';
import type { ScheduleCommandOptions } from 'gantt-lib/core/scheduling';
import type { CalendarDay, CalendarWeeklyPattern } from '../types';

export const DEFAULT_CALENDAR_WEEKLY_PATTERN: CalendarWeeklyPattern = {
  mon: true,
  tue: true,
  wed: true,
  thu: true,
  fri: true,
  sat: false,
  sun: false,
};

function toCustomDayType(kind: CalendarDay['kind']): CustomDayConfig['type'] {
  return kind === 'non_working' ? 'weekend' : 'workday';
}

function normalizeCalendarDayDate(date: string): Date {
  return new Date(`${date.split('T')[0]}T00:00:00.000Z`);
}

export function buildCustomDays(calendarDays: CalendarDay[] = []): CustomDayConfig[] {
  return calendarDays.map((day) => ({
    date: normalizeCalendarDayDate(day.date),
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

export function getProjectWeekendPredicate(
  calendarWeeklyPattern: CalendarWeeklyPattern = DEFAULT_CALENDAR_WEEKLY_PATTERN,
  calendarDays: CalendarDay[] = [],
): (date: Date) => boolean {
  return createCustomDayPredicate({
    customDays: buildCustomDays(calendarDays),
    isWeekend: (date) => isPatternWeekend(calendarWeeklyPattern, date),
  });
}

export function getProjectScheduleOptions(
  ganttDayMode: 'business' | 'calendar',
  calendarWeeklyPattern: CalendarWeeklyPattern = DEFAULT_CALENDAR_WEEKLY_PATTERN,
  calendarDays: CalendarDay[] = [],
): ScheduleCommandOptions {
  if (ganttDayMode === 'calendar') {
    return { businessDays: false };
  }

  const weekendPredicate = getProjectWeekendPredicate(calendarWeeklyPattern, calendarDays);
  return {
    businessDays: true,
    weekendPredicate,
  };
}

export function getDefaultProjectScheduleOptions(): ScheduleCommandOptions {
  return getProjectScheduleOptions('calendar', DEFAULT_CALENDAR_WEEKLY_PATTERN);
}
