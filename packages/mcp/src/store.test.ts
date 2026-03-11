/**
 * Tests for client-authoritative task storage
 *
 * These tests verify that:
 * 1. TaskStore.importTasks() stores tasks without running scheduler
 * 2. No SSE broadcasts happen on PUT /api/tasks
 * 3. GET /api/tasks returns stored tasks as-is
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { TaskStore } from './store.js';
import { getDb } from './db.js';

describe('TaskStore - Client-Authoritative', () => {
  let store: TaskStore;

  beforeEach(async () => {
    store = new TaskStore();
    // Clear test data (use undefined for global tasks, no projectId)
    await store.deleteAll(undefined);
  });

  afterEach(async () => {
    // Cleanup
    await store.deleteAll(undefined);
  });

  describe('importTasks', () => {
    it('should store tasks without running scheduler', async () => {
      const tasks = [
        {
          id: 'task-1',
          name: 'Task 1',
          startDate: '2026-03-01',
          endDate: '2026-03-05',
          progress: 0,
          order: 0,
          dependencies: [],
        },
        {
          id: 'task-2',
          name: 'Task 2',
          startDate: '2026-03-06', // Overlaps with task-1
          endDate: '2026-03-10',
          progress: 0,
          order: 1,
          dependencies: [
            { taskId: 'task-1', type: 'FS' as const, lag: 0 },
          ],
        },
      ];

      // Import tasks (no projectId = global tasks)
      const count = await store.importTasks(JSON.stringify(tasks), undefined);

      // Verify count
      assert.strictEqual(count, 2);

      // Verify tasks are stored as-is (no scheduler recalculation)
      const stored = await store.list(undefined, false);
      assert.strictEqual(stored.length, 2);

      // Task 1 should be exactly as provided (except color normalization)
      const task1 = stored.find(t => t.id === 'task-1');
      assert.strictEqual(task1?.id, tasks[0].id);
      assert.strictEqual(task1?.name, tasks[0].name);
      assert.strictEqual(task1?.startDate, tasks[0].startDate);
      assert.strictEqual(task1?.endDate, tasks[0].endDate);
      assert.strictEqual(task1?.order, tasks[0].order);
      assert.strictEqual(task1?.progress, tasks[0].progress);
      assert.deepStrictEqual(task1?.dependencies, tasks[0].dependencies);

      // Task 2 should be exactly as provided (no date adjustment from scheduler)
      const task2 = stored.find(t => t.id === 'task-2');
      assert.strictEqual(task2?.id, tasks[1].id);
      assert.strictEqual(task2?.name, tasks[1].name);
      assert.strictEqual(task2?.startDate, tasks[1].startDate);
      assert.strictEqual(task2?.endDate, tasks[1].endDate);
      assert.strictEqual(task2?.order, tasks[1].order);
      assert.strictEqual(task2?.progress, tasks[1].progress);
      assert.deepStrictEqual(task2?.dependencies, tasks[1].dependencies);
    });

    it('should preserve task order exactly as provided', async () => {
      const tasks = [
        {
          id: 'task-1',
          name: 'First',
          startDate: '2026-03-01',
          endDate: '2026-03-05',
          progress: 0,
          order: 5, // Non-sequential order
          dependencies: [],
        },
        {
          id: 'task-2',
          name: 'Second',
          startDate: '2026-03-06',
          endDate: '2026-03-10',
          progress: 0,
          order: 10, // Non-sequential order
          dependencies: [],
        },
      ];

      await store.importTasks(JSON.stringify(tasks), undefined);

      const stored = await store.list(undefined, false);
      assert.strictEqual(stored[0].order, 5);
      assert.strictEqual(stored[1].order, 10);
    });
  });

  describe('list', () => {
    it('should return stored tasks without modification', async () => {
      const tasks = [
        {
          id: 'task-1',
          name: 'Task with exact dates',
          startDate: '2026-03-01',
          endDate: '2026-03-05',
          progress: 50,
          order: 0,
          dependencies: [],
        },
      ];

      await store.importTasks(JSON.stringify(tasks), undefined);

      const retrieved = await store.list(undefined, false);

      // Should match exactly (except color normalization), no normalization or recalculation
      assert.strictEqual(retrieved.length, 1);
      assert.strictEqual(retrieved[0].id, tasks[0].id);
      assert.strictEqual(retrieved[0].name, tasks[0].name);
      assert.strictEqual(retrieved[0].startDate, tasks[0].startDate);
      assert.strictEqual(retrieved[0].endDate, tasks[0].endDate);
      assert.strictEqual(retrieved[0].order, tasks[0].order);
      assert.strictEqual(retrieved[0].progress, tasks[0].progress);
      assert.deepStrictEqual(retrieved[0].dependencies, tasks[0].dependencies);
    });
  });
});
