import type { CustomDayConfig } from 'gantt-lib';

/**
 * Russian official holidays for 2026
 * These dates are non-working days in Russia and will be highlighted as weekends in the Gantt chart
 */
export const russianHolidays2026: CustomDayConfig[] = [
  // New Year holidays (Jan 1-8)
  { date: new Date(Date.UTC(2026, 0, 1)), type: 'weekend' },
  { date: new Date(Date.UTC(2026, 0, 2)), type: 'weekend' },
  { date: new Date(Date.UTC(2026, 0, 3)), type: 'weekend' },
  { date: new Date(Date.UTC(2026, 0, 4)), type: 'weekend' },
  { date: new Date(Date.UTC(2026, 0, 5)), type: 'weekend' },
  { date: new Date(Date.UTC(2026, 0, 6)), type: 'weekend' },
  { date: new Date(Date.UTC(2026, 0, 7)), type: 'weekend' },
  { date: new Date(Date.UTC(2026, 0, 8)), type: 'weekend' },
  // Defender of the Fatherland Day (Feb 23)
  { date: new Date(Date.UTC(2026, 1, 23)), type: 'weekend' },
  // International Women's Day (Mar 8)
  { date: new Date(Date.UTC(2026, 2, 8)), type: 'weekend' },
  // Spring and Labour Day (May 1)
  { date: new Date(Date.UTC(2026, 4, 1)), type: 'weekend' },
  // Victory Day (May 9)
  { date: new Date(Date.UTC(2026, 4, 9)), type: 'weekend' },
  // Russia Day (Jun 12)
  { date: new Date(Date.UTC(2026, 5, 12)), type: 'weekend' },
  // Unity Day (Nov 4)
  { date: new Date(Date.UTC(2026, 10, 4)), type: 'weekend' },
];
