import { describe, expect, it } from 'vitest';

const weekdayCalendar = {
  mon: true,
  tue: true,
  wed: true,
  thu: true,
  fri: true,
  sat: false,
  sun: false,
};

describe('task plan normalization', () => {
  it('treats entering a future value as duration extension and redistributes remaining planned volume over existing planned days', async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret';
    const { normalizeTaskPlanByDate } = await import('./task-plan-routes.js');
    const result = normalizeTaskPlanByDate({
      startDate: '2026-05-18',
      endDate: '2026-05-20',
      workVolume: 36,
      basePlanByDate: {
        '2026-05-18': 12,
        '2026-05-19': 12,
        '2026-05-20': 12,
      },
      nextPlanByDate: {
        '2026-05-18': 12,
        '2026-05-19': 12,
        '2026-05-20': 12,
        '2026-05-25': 15,
      },
      todayIso: '2026-05-18',
      calendarWeeklyPattern: weekdayCalendar,
      calendarDays: [],
    });

    expect(result).toEqual({
      startDate: '2026-05-18',
      endDate: '2026-05-25',
      planByDate: {
        '2026-05-18': 7,
        '2026-05-19': 7,
        '2026-05-20': 7,
        '2026-05-25': 15,
      },
    });
  });

  it('keeps a cleared edited plan cell empty and does not put redistributed residue back into that date', async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret';
    const { normalizeTaskPlanByDate } = await import('./task-plan-routes.js');
    const result = normalizeTaskPlanByDate({
      startDate: '2026-05-18',
      endDate: '2026-05-20',
      workVolume: 6,
      basePlanByDate: {
        '2026-05-18': 2,
        '2026-05-19': 2,
        '2026-05-20': 2,
      },
      nextPlanByDate: {
        '2026-05-18': 2,
        '2026-05-20': 2,
      },
      todayIso: '2026-05-18',
      calendarWeeklyPattern: weekdayCalendar,
      calendarDays: [],
    });

    expect(result.planByDate['2026-05-19']).toBeUndefined();
    expect(result.planByDate).toEqual({
      '2026-05-18': 2,
      '2026-05-20': 4,
    });
  });

  it('caps bulk positive fill by total work volume and leaves over-selected dates empty', async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret';
    const { normalizeTaskPlanByDate } = await import('./task-plan-routes.js');
    const result = normalizeTaskPlanByDate({
      startDate: '2026-05-18',
      endDate: '2026-05-22',
      workVolume: 10,
      basePlanByDate: {},
      nextPlanByDate: {
        '2026-05-18': 3,
        '2026-05-19': 3,
        '2026-05-20': 3,
        '2026-05-21': 3,
        '2026-05-22': 3,
      },
      todayIso: '2026-05-18',
      calendarWeeklyPattern: weekdayCalendar,
      calendarDays: [],
    });

    expect(result).toEqual({
      startDate: '2026-05-18',
      endDate: '2026-05-21',
      planByDate: {
        '2026-05-18': 3,
        '2026-05-19': 3,
        '2026-05-20': 3,
        '2026-05-21': 1,
      },
    });
  });

  it('shortens the task and redistributes volume over remaining days when the last filled day is deleted', async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret';
    const { normalizeTaskPlanByDate } = await import('./task-plan-routes.js');
    const result = normalizeTaskPlanByDate({
      startDate: '2026-05-18',
      endDate: '2026-05-20',
      workVolume: 6,
      basePlanByDate: {
        '2026-05-18': 2,
        '2026-05-19': 2,
        '2026-05-20': 2,
      },
      nextPlanByDate: {
        '2026-05-18': 2,
        '2026-05-19': 2,
      },
      todayIso: '2026-05-18',
      calendarWeeklyPattern: weekdayCalendar,
      calendarDays: [],
    });

    expect(result).toEqual({
      startDate: '2026-05-18',
      endDate: '2026-05-19',
      planByDate: {
        '2026-05-18': 3,
        '2026-05-19': 3,
      },
    });
  });

  it('trims trailing empty task dates to the last non-empty plan date', async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret';
    const { normalizeTaskPlanByDate } = await import('./task-plan-routes.js');
    const result = normalizeTaskPlanByDate({
      startDate: '2026-05-18',
      endDate: '2026-05-22',
      workVolume: 10,
      basePlanByDate: {
        '2026-05-18': 5,
        '2026-05-19': 5,
      },
      nextPlanByDate: {
        '2026-05-18': 5,
        '2026-05-19': 5,
      },
      todayIso: '2026-05-18',
      calendarWeeklyPattern: weekdayCalendar,
      calendarDays: [],
    });

    expect(result.endDate).toBe('2026-05-19');
    expect(result.planByDate).toEqual({
      '2026-05-18': 5,
      '2026-05-19': 5,
    });
  });
});
