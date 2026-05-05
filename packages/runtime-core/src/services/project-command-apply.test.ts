import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyProjectCommandToSnapshot } from './project-command-apply.js';
import type { ProjectSnapshot } from '../types.js';

describe('applyProjectCommandToSnapshot', () => {
  it('applies reorder_tasks to the derived snapshot used by history preview', () => {
    const snapshot: ProjectSnapshot = {
      tasks: [
        { id: 'task-a', name: 'Task A', startDate: '2026-05-01', endDate: '2026-05-02', sortOrder: 0, dependencies: [] },
        { id: 'task-b', name: 'Task B', startDate: '2026-05-03', endDate: '2026-05-04', sortOrder: 1, dependencies: [] },
        { id: 'task-c', name: 'Task C', startDate: '2026-05-05', endDate: '2026-05-06', sortOrder: 2, dependencies: [] },
      ],
      dependencies: [],
    };

    const result = applyProjectCommandToSnapshot(
      snapshot,
      {
        type: 'reorder_tasks',
        updates: [
          { taskId: 'task-c', sortOrder: 0 },
          { taskId: 'task-a', sortOrder: 1 },
          { taskId: 'task-b', sortOrder: 2 },
        ],
      },
      {},
    );

    assert.deepEqual(
      result.snapshot.tasks.map((task) => ({ id: task.id, sortOrder: task.sortOrder })),
      [
        { id: 'task-c', sortOrder: 0 },
        { id: 'task-a', sortOrder: 1 },
        { id: 'task-b', sortOrder: 2 },
      ],
    );
  });
});
