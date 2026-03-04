/**
 * Test suite for TaskScheduler
 *
 * Tests for the auto-schedule engine using Map<string, Task> snapshots.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { Task, TaskDependency, DependencyType } from './types.js';
import { TaskScheduler } from './scheduler.js';

describe('TaskScheduler', () => {

  // Helper function to create a task Map snapshot
  function createTaskMap(tasks: Task[]): Map<string, Task> {
    return new Map(tasks.map(t => [t.id, t]));
  }

  describe('FS (Finish-Start) dependency', () => {
    it('calculates FS dependency correctly', () => {
      const taskA: Task = {
        id: '1',
        name: 'A',
        startDate: '2026-02-01',
        endDate: '2026-02-05'
      };
      const taskB: Task = {
        id: '2',
        name: 'B',
        startDate: '2026-02-06',
        endDate: '2026-02-10',
        dependencies: [{ taskId: '1', type: 'FS' }]
      };

      const scheduler = new TaskScheduler(createTaskMap([taskA, taskB]));

      // When we recalculate dates for task B
      const updates = scheduler.recalculateDates('2');

      // B should start at '2026-02-06' (A's end date + 1 day)
      assert.strictEqual(updates.get('2')?.startDate, '2026-02-06');
      // Duration should be preserved (4 days)
      assert.strictEqual(updates.get('2')?.endDate, '2026-02-10');
    });
  });

  describe('SS (Start-Start) dependency', () => {
    it('calculates SS dependency correctly', () => {
      const taskA: Task = {
        id: '1',
        name: 'A',
        startDate: '2026-02-01',
        endDate: '2026-02-10'
      };
      const taskB: Task = {
        id: '2',
        name: 'B',
        startDate: '2026-02-05',
        endDate: '2026-02-12',
        dependencies: [{ taskId: '1', type: 'SS' }]
      };

      const scheduler = new TaskScheduler(createTaskMap([taskA, taskB]));

      const updates = scheduler.recalculateDates('2');

      // B should start at '2026-02-01' (same as A's start)
      assert.strictEqual(updates.get('2')?.startDate, '2026-02-01');
    });
  });

  describe('FF (Finish-Finish) dependency', () => {
    it('calculates FF dependency correctly', () => {
      const taskA: Task = {
        id: '1',
        name: 'A',
        startDate: '2026-02-01',
        endDate: '2026-02-15'
      };
      const taskB: Task = {
        id: '2',
        name: 'B',
        startDate: '2026-02-10',
        endDate: '2026-02-20',
        dependencies: [{ taskId: '1', type: 'FF' }]
      };

      const scheduler = new TaskScheduler(createTaskMap([taskA, taskB]));

      const updates = scheduler.recalculateDates('2');

      // B should end at '2026-02-15' (same as A's end)
      assert.strictEqual(updates.get('2')?.endDate, '2026-02-15');
    });
  });

  describe('SF (Start-Finish) dependency', () => {
    it('calculates SF dependency correctly', () => {
      const taskA: Task = {
        id: '1',
        name: 'A',
        startDate: '2026-02-01',
        endDate: '2026-02-10'
      };
      const taskB: Task = {
        id: '2',
        name: 'B',
        startDate: '2026-02-05',
        endDate: '2026-02-15',
        dependencies: [{ taskId: '1', type: 'SF' }]
      };

      const scheduler = new TaskScheduler(createTaskMap([taskA, taskB]));

      const updates = scheduler.recalculateDates('2');

      // B should end at '2026-02-01' (A's start date)
      assert.strictEqual(updates.get('2')?.endDate, '2026-02-01');
    });
  });

  describe('Lag handling', () => {
    it('adds lag days to dependency calculation', () => {
      const taskA: Task = {
        id: '1',
        name: 'A',
        startDate: '2026-02-01',
        endDate: '2026-02-10'
      };
      const taskB: Task = {
        id: '2',
        name: 'B',
        startDate: '2026-02-11',
        endDate: '2026-02-15',
        dependencies: [{ taskId: '1', type: 'FS', lag: 2 }]
      };

      const scheduler = new TaskScheduler(createTaskMap([taskA, taskB]));

      const updates = scheduler.recalculateDates('2');

      // B should start at '2026-02-13' (A's end + 1 + 2 lag days)
      assert.strictEqual(updates.get('2')?.startDate, '2026-02-13');
    });
  });

  describe('Multi-level cascade', () => {
    it('cascades updates through entire dependency chain', () => {
      const taskA: Task = {
        id: '1',
        name: 'A',
        startDate: '2026-02-01',
        endDate: '2026-02-05'
      };
      const taskB: Task = {
        id: '2',
        name: 'B',
        startDate: '2026-02-06',
        endDate: '2026-02-10',
        dependencies: [{ taskId: '1', type: 'FS' }]
      };
      const taskC: Task = {
        id: '3',
        name: 'C',
        startDate: '2026-02-11',
        endDate: '2026-02-15',
        dependencies: [{ taskId: '2', type: 'FS' }]
      };

      const scheduler = new TaskScheduler(createTaskMap([taskA, taskB, taskC]));

      // When A changes and we recalculate
      const updates = scheduler.recalculateDates('2');

      // B should be updated
      assert.strictEqual(updates.has('2'), true);
      assert.strictEqual(updates.get('2')?.startDate, '2026-02-06');

      // C should also be updated (cascade through B)
      assert.strictEqual(updates.has('3'), true);
      assert.strictEqual(updates.get('3')?.startDate, '2026-02-11');
    });
  });

  describe('Circular dependency detection', () => {
    it('rejects circular dependencies', () => {
      const taskA: Task = {
        id: '1',
        name: 'A',
        startDate: '2026-02-01',
        endDate: '2026-02-05',
        dependencies: [{ taskId: '2', type: 'FS' }]
      };
      const taskB: Task = {
        id: '2',
        name: 'B',
        startDate: '2026-02-01',
        endDate: '2026-02-05',
        dependencies: [{ taskId: '1', type: 'FS' }]
      };

      const scheduler = new TaskScheduler(createTaskMap([taskA, taskB]));

      // Should throw error for circular dependency
      assert.throws(() => {
        scheduler.detectCycle('1');
      }, /Circular dependency detected/);
    });

    it('detects circular dependency with cycle message', () => {
      const taskA: Task = {
        id: '1',
        name: 'A',
        startDate: '2026-02-01',
        endDate: '2026-02-05',
        dependencies: [{ taskId: '2', type: 'FS' }]
      };
      const taskB: Task = {
        id: '2',
        name: 'B',
        startDate: '2026-02-01',
        endDate: '2026-02-05',
        dependencies: [{ taskId: '1', type: 'FS' }]
      };

      const scheduler = new TaskScheduler(createTaskMap([taskA, taskB]));

      assert.throws(() => {
        scheduler.detectCycle('1');
      }, /Circular dependency detected/);
    });
  });

  describe('Missing task validation', () => {
    it('rejects dependencies on non-existent tasks', () => {
      const taskA: Task = {
        id: '1',
        name: 'A',
        startDate: '2026-02-01',
        endDate: '2026-02-05',
        dependencies: [{ taskId: '999', type: 'FS' }]
      };

      const scheduler = new TaskScheduler(createTaskMap([taskA]));

      // Should throw error for missing task
      assert.throws(() => {
        scheduler.validateDependencies(taskA);
      }, /Dependency references non-existent task: 999/);
    });
  });

  describe('Multiple dependencies on same task', () => {
    it('resolves to latest dates when multiple dependencies', () => {
      const taskA: Task = {
        id: '1',
        name: 'A',
        startDate: '2026-02-01',
        endDate: '2026-02-10'
      };
      const taskB: Task = {
        id: '2',
        name: 'B',
        startDate: '2026-02-01',
        endDate: '2026-02-15'
      };
      const taskC: Task = {
        id: '3',
        name: 'C',
        startDate: '2026-02-05',
        endDate: '2026-02-12',
        dependencies: [
          { taskId: '1', type: 'FS' },
          { taskId: '2', type: 'FS' }
        ]
      };

      const scheduler = new TaskScheduler(createTaskMap([taskA, taskB, taskC]));

      const updates = scheduler.recalculateDates('3');

      // C should start at '2026-02-16' (later of A's end+1 and B's end+1)
      assert.strictEqual(updates.get('3')?.startDate, '2026-02-16');
    });
  });

  describe('Date format preservation', () => {
    it('preserves YYYY-MM-DD format in calculations', () => {
      const taskA: Task = {
        id: '1',
        name: 'A',
        startDate: '2026-02-01',
        endDate: '2026-02-05'
      };
      const taskB: Task = {
        id: '2',
        name: 'B',
        startDate: '2026-02-06',
        endDate: '2026-02-10',
        dependencies: [{ taskId: '1', type: 'FS' }]
      };

      const scheduler = new TaskScheduler(createTaskMap([taskA, taskB]));

      const updates = scheduler.recalculateDates('2');
      const updatedTask = updates.get('2');

      // Verify date format is preserved
      assert.match(updatedTask!.startDate!, /^\d{4}-\d{2}-\d{2}$/);
      assert.match(updatedTask!.endDate!, /^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('Task with no dependencies', () => {
    it('handles tasks with no dependencies gracefully', () => {
      const taskA: Task = {
        id: '1',
        name: 'A',
        startDate: '2026-02-01',
        endDate: '2026-02-05'
      };

      const scheduler = new TaskScheduler(createTaskMap([taskA]));

      const updates = scheduler.recalculateDates('1');

      // Should return empty map for task with no dependencies
      assert.strictEqual(updates.size, 0);
    });
  });

  describe('Skip start task option', () => {
    it('does not recalculate dates of start task when skipStartTask is true', () => {
      const taskA: Task = {
        id: '1',
        name: 'A',
        startDate: '2026-02-01',
        endDate: '2026-02-05'
      };
      const taskB: Task = {
        id: '2',
        name: 'B',
        startDate: '2026-02-15', // User explicitly moved this
        endDate: '2026-02-20',
        dependencies: [{ taskId: '1', type: 'FS' }]
      };
      const taskC: Task = {
        id: '3',
        name: 'C',
        startDate: '2026-02-21',
        endDate: '2026-02-25',
        dependencies: [{ taskId: '2', type: 'FS' }]
      };

      const scheduler = new TaskScheduler(createTaskMap([taskA, taskB, taskC]));

      // When skipStartTask is true, task B's dates should not be recalculated
      const updates = scheduler.recalculateDates('2', true);

      // B should keep its original dates (not be moved back to A's end)
      const updatedB = updates.get('2');
      assert.strictEqual(updatedB?.startDate, '2026-02-15');
      assert.strictEqual(updatedB?.endDate, '2026-02-20');

      // C should still be recalculated based on B's position
      const updatedC = updates.get('3');
      assert.strictEqual(updatedC?.startDate, '2026-02-21'); // Starts when B ends + 1
    });

    it('recalculates start task dates when skipStartTask is false', () => {
      const taskA: Task = {
        id: '1',
        name: 'A',
        startDate: '2026-02-01',
        endDate: '2026-02-05'
      };
      const taskB: Task = {
        id: '2',
        name: 'B',
        startDate: '2026-02-15',
        endDate: '2026-02-20',
        dependencies: [{ taskId: '1', type: 'FS' }]
      };

      const scheduler = new TaskScheduler(createTaskMap([taskA, taskB]));

      // When skipStartTask is false (default), task B's dates are recalculated
      const updates = scheduler.recalculateDates('2', false);

      // B should be moved back to A's end date + 1
      assert.strictEqual(updates.get('2')?.startDate, '2026-02-06');
    });
  });
});
