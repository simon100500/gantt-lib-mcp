import { describe, expect, it } from 'vitest';
import { computeTasksHash } from '../hooks/useAutoSave.ts';
import { normalizeTaskOrder, sortTasksByOrder } from './taskOrder.ts';
import type { Task } from '../types.ts';

describe('task order helpers', () => {
  const tasks: Task[] = [
    { id: 'b', name: 'B', startDate: '2026-03-01', endDate: '2026-03-02' },
    { id: 'a', name: 'A', startDate: '2026-03-03', endDate: '2026-03-04' },
  ];

  it('normalizes visible array order into stable order values', () => {
    expect(normalizeTaskOrder(tasks)).toEqual([
      { ...tasks[0], order: 0 },
      { ...tasks[1], order: 1 },
    ]);
  });

  it('sorts persisted tasks by order before rendering', () => {
    const outOfOrder: Task[] = [
      { ...tasks[0], order: 2 },
      { ...tasks[1], order: 1 },
    ];

    expect(sortTasksByOrder(outOfOrder).map(task => task.id)).toEqual(['a', 'b']);
  });

  it('treats reorder-only changes as a distinct autosave state', () => {
    const initial = normalizeTaskOrder(tasks);
    const reordered = normalizeTaskOrder([tasks[1], tasks[0]]);

    expect(computeTasksHash(initial)).not.toBe(computeTasksHash(reordered));
  });
});
