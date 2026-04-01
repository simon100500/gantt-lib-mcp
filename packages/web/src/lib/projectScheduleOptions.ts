import { createCustomDayPredicate } from 'gantt-lib';
import type { ScheduleCommandOptions } from 'gantt-lib/core/scheduling';
import { russianHolidays2026 } from './russianHolidays2026';

const projectWeekendPredicate = createCustomDayPredicate({ customDays: russianHolidays2026 });

export function getProjectScheduleOptions(
  ganttDayMode: 'business' | 'calendar',
): ScheduleCommandOptions {
  if (ganttDayMode === 'calendar') {
    return { businessDays: false };
  }

  return {
    businessDays: true,
    weekendPredicate: projectWeekendPredicate,
  };
}

export function getDefaultProjectScheduleOptions(): ScheduleCommandOptions {
  return getProjectScheduleOptions('business');
}
