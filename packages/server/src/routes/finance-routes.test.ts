import assert from 'node:assert/strict';
import { describe, it } from 'vitest';

describe('finance route calculations', () => {
  it('rolls planned cost from manually priced children up to their parent rows', async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
    const { buildFinanceTaskRows } = await import('./finance-routes.js');

    const rows = buildFinanceTaskRows(
      [
        {
          id: 'parent',
          name: 'Parent',
          parentId: null,
          startDate: new Date('2026-01-01T00:00:00Z'),
          endDate: new Date('2026-01-10T00:00:00Z'),
          progress: 0,
          sortOrder: 1,
          childCount: 2,
        },
        {
          id: 'child-a',
          name: 'Child A',
          parentId: 'parent',
          startDate: new Date('2026-01-01T00:00:00Z'),
          endDate: new Date('2026-01-05T00:00:00Z'),
          progress: 50,
          sortOrder: 2,
          childCount: 0,
        },
        {
          id: 'child-b',
          name: 'Child B',
          parentId: 'parent',
          startDate: new Date('2026-01-06T00:00:00Z'),
          endDate: new Date('2026-01-10T00:00:00Z'),
          progress: 25,
          sortOrder: 3,
          childCount: 0,
        },
      ],
      new Map([
        ['child-a', {
          id: 'setting-a',
          plannedCost: 100,
          currencyCode: 'RUB',
          allocationMode: 'manual',
          allocationParentTaskId: null,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        }],
        ['child-b', {
          id: 'setting-b',
          plannedCost: 50,
          currencyCode: 'RUB',
          allocationMode: 'manual',
          allocationParentTaskId: null,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        }],
      ]),
      [],
      [
        {
          id: '2026-01-01',
          label: 'янв. 2026',
          startDate: '2026-01-01',
          endDate: '2026-01-31',
        },
      ],
      new Date('2026-01-10T00:00:00Z'),
    );

    const parent = rows.find((row) => row.taskId === 'parent');
    assert.equal(parent?.plannedCost, 150);
    assert.equal(parent?.plannedToDate, 150);
    assert.equal(parent?.earnedToDate, 62.5);
    assert.equal(parent?.plannedByPeriod['2026-01-01'], 150);
  });
});
