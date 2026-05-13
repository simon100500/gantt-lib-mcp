import type { CalendarDay, CalendarWeeklyPattern } from '../types.ts';
import { DEFAULT_CALENDAR_WEEKLY_PATTERN, normalizeCalendarWeeklyPattern } from './projectScheduleOptions.ts';

export function normalizeProjectCalendarDays(calendarDays: CalendarDay[] = []): CalendarDay[] {
  const normalized = new Map<string, CalendarDay['kind']>();
  for (const day of calendarDays) {
    const date = day.date.trim().slice(0, 10);
    if (!date) {
      continue;
    }
    normalized.set(date, day.kind);
  }

  return Array.from(normalized.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, kind]) => ({ date, kind }));
}

export function calendarDaysEqual(left: CalendarDay[] = [], right: CalendarDay[] = []): boolean {
  return JSON.stringify(normalizeProjectCalendarDays(left)) === JSON.stringify(normalizeProjectCalendarDays(right));
}

export function calendarWeeklyPatternEqual(
  left: CalendarWeeklyPattern = DEFAULT_CALENDAR_WEEKLY_PATTERN,
  right: CalendarWeeklyPattern = DEFAULT_CALENDAR_WEEKLY_PATTERN,
): boolean {
  const normalizedLeft = normalizeCalendarWeeklyPattern(left);
  const normalizedRight = normalizeCalendarWeeklyPattern(right);
  return normalizedLeft.mon === normalizedRight.mon
    && normalizedLeft.tue === normalizedRight.tue
    && normalizedLeft.wed === normalizedRight.wed
    && normalizedLeft.thu === normalizedRight.thu
    && normalizedLeft.fri === normalizedRight.fri
    && normalizedLeft.sat === normalizedRight.sat
    && normalizedLeft.sun === normalizedRight.sun;
}

export function getWeeklyPatternPreset(pattern: CalendarWeeklyPattern): 'five-day' | 'six-day' | 'seven-day' | 'custom' {
  const normalized = normalizeCalendarWeeklyPattern(pattern);
  if (calendarWeeklyPatternEqual(normalized, DEFAULT_CALENDAR_WEEKLY_PATTERN)) {
    return 'five-day';
  }
  if (normalized.mon && normalized.tue && normalized.wed && normalized.thu && normalized.fri && normalized.sat && !normalized.sun) {
    return 'six-day';
  }
  if (normalized.mon && normalized.tue && normalized.wed && normalized.thu && normalized.fri && normalized.sat && normalized.sun) {
    return 'seven-day';
  }
  return 'custom';
}

export function getWeeklyPatternLabel(pattern: CalendarWeeklyPattern): string {
  switch (getWeeklyPatternPreset(pattern)) {
    case 'five-day':
      return '5-дневная неделя';
    case 'six-day':
      return '6-дневная неделя';
    case 'seven-day':
      return '7-дневная неделя';
    default:
      return 'Пользовательская неделя';
  }
}

export function getPatternForPreset(preset: 'five-day' | 'six-day' | 'seven-day'): CalendarWeeklyPattern {
  switch (preset) {
    case 'six-day':
      return { mon: true, tue: true, wed: true, thu: true, fri: true, sat: true, sun: false };
    case 'seven-day':
      return { mon: true, tue: true, wed: true, thu: true, fri: true, sat: true, sun: true };
    default:
      return DEFAULT_CALENDAR_WEEKLY_PATTERN;
  }
}

export function formatCalendarDayKind(kind: CalendarDay['kind']): string {
  return kind === 'working' ? 'рабочий' : kind === 'non_working' ? 'выходной' : 'сокращённый';
}

export function isWorkingByPattern(pattern: CalendarWeeklyPattern, date: Date): boolean {
  switch (date.getUTCDay()) {
    case 0:
      return pattern.sun;
    case 1:
      return pattern.mon;
    case 2:
      return pattern.tue;
    case 3:
      return pattern.wed;
    case 4:
      return pattern.thu;
    case 5:
      return pattern.fri;
    case 6:
      return pattern.sat;
    default:
      return true;
  }
}
