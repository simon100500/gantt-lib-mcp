import { createCustomDayPredicate } from 'gantt-lib';
import type { CustomDayConfig } from 'gantt-lib';
import type { ScheduleCommandOptions } from 'gantt-lib/core/scheduling';
import type { CalendarDay } from '../types';

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

export function getProjectWeekendPredicate(calendarDays: CalendarDay[] = []): ((date: Date) => boolean) | undefined {
  if (calendarDays.length === 0) {
    return undefined;
  }

  return createCustomDayPredicate({ customDays: buildCustomDays(calendarDays) });
}

export function getProjectScheduleOptions(
  ganttDayMode: 'business' | 'calendar',
  calendarDays: CalendarDay[] = [],
): ScheduleCommandOptions {
  if (ganttDayMode === 'calendar') {
    return { businessDays: false };
  }

  const weekendPredicate = getProjectWeekendPredicate(calendarDays);
  return {
    businessDays: true,
    ...(weekendPredicate ? { weekendPredicate } : {}),
  };
}

export function getDefaultProjectScheduleOptions(): ScheduleCommandOptions {
  return getProjectScheduleOptions('business');
}
