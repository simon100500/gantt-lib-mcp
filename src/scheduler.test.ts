/**
 * Test suite for TaskScheduler (TDD RED phase)
 *
 * This file contains failing tests for the auto-schedule engine.
 * Tests will fail initially because TaskScheduler class doesn't exist yet.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { Task, TaskDependency, DependencyType } from './types.js';

// Mock task store for testing
interface MockTaskStore {
  get(id: string): Task | undefined;
  list(): Task[];
}

// This import will fail initially - TaskScheduler doesn't exist yet
// @ts-ignore - will be fixed in GREEN phase
import { TaskScheduler } from './scheduler.js';

describe('TaskScheduler', () => {

  // Helper function to create mock store
  function createMockStore(tasks: Task[]): MockTaskStore {
    const taskMap = new Map(tasks.map(t => [t.id, t]));
    return {
      get: (id: string) => taskMap.get(id),
      list: () => tasks
    };
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

      const mockStore = createMockStore([taskA, taskB]);
      const scheduler = new TaskScheduler(mockStore);

      // When we recalculate dates for task B
      const updates = scheduler.recalculateDates('2');

      // B should start at '2026-02-05' (A's end date)
      assert.strictEqual(updates.get('2')?.startDate, '2026-02-05');
      // Duration should be preserved (4 days)
      assert.strictEqual(updates.get('2')?.endDate, '2026-02-09');
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

      const mockStore = createMockStore([taskA, taskB]);
      const scheduler = new TaskScheduler(mockStore);

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

      const mockStore = createMockStore([taskA, taskB]);
      const scheduler = new TaskScheduler(mockStore);

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

      const mockStore = createMockStore([taskA, taskB]);
      const scheduler = new TaskScheduler(mockStore);

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

      const mockStore = createMockStore([taskA, taskB]);
      const scheduler = new TaskScheduler(mockStore);

      const updates = scheduler.recalculateDates('2');

      // B should start at '2026-02-12' (A's end + 2 days)
      assert.strictEqual(updates.get('2')?.startDate, '2026-02-12');
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

      const mockStore = createMockStore([taskA, taskB, taskC]);
      const scheduler = new TaskScheduler(mockStore);

      // When A changes and we recalculate
      const updates = scheduler.recalculateDates('2');

      // B should be updated
      assert.strictEqual(updates.has('2'), true);
      assert.strictEqual(updates.get('2')?.startDate, '2026-02-05');

      // C should also be updated (cascade through B)
      assert.strictEqual(updates.has('3'), true);
      assert.strictEqual(updates.get('3')?.startDate, '2026-02-09');
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

      const mockStore = createMockStore([taskA, taskB]);
      const scheduler = new TaskScheduler(mockStore);

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

      const mockStore = createMockStore([taskA, taskB]);
      const scheduler = new TaskScheduler(mockStore);

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

      const mockStore = createMockStore([taskA]);
      const scheduler = new TaskScheduler(mockStore);

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

      const mockStore = createMockStore([taskA, taskB, taskC]);
      const scheduler = new TaskScheduler(mockStore);

      const updates = scheduler.recalculateDates('3');

      // C should start at '2026-02-15' (later of A's end and B's end)
      assert.strictEqual(updates.get('3')?.startDate, '2026-02-15');
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

      const mockStore = createMockStore([taskA, taskB]);
      const scheduler = new TaskScheduler(mockStore);

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

      const mockStore = createMockStore([taskA]);
      const scheduler = new TaskScheduler(mockStore);

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

      const mockStore = createMockStore([taskA, taskB, taskC]);
      const scheduler = new TaskScheduler(mockStore);

      // When skipStartTask is true, task B's dates should not be recalculated
      const updates = scheduler.recalculateDates('2', true);

      // B should keep its original dates (not be moved back to A's end)
      const updatedB = updates.get('2');
      assert.strictEqual(updatedB?.startDate, '2026-02-15');
      assert.strictEqual(updatedB?.endDate, '2026-02-20');

      // C should still be recalculated based on B's position
      const updatedC = updates.get('3');
      assert.strictEqual(updatedC?.startDate, '2026-02-20'); // Starts when B ends
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

      const mockStore = createMockStore([taskA, taskB]);
      const scheduler = new TaskScheduler(mockStore);

      // When skipStartTask is false (default), task B's dates are recalculated
      const updates = scheduler.recalculateDates('2', false);

      // B should be moved back to A's end date
      assert.strictEqual(updates.get('2')?.startDate, '2026-02-05');
    });
  });
});
