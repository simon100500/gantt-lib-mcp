import { describe, expect, it } from 'vitest';
import { __commandCommitInternals } from '../useCommandCommit.ts';
import type { FrontendProjectCommand } from '../../types.ts';

const { coalesceCommands } = __commandCommitInternals;

describe('useCommandCommit coalescing', () => {
  it('coalesces consecutive reorder commands into the latest order', () => {
    const previous: FrontendProjectCommand = {
      type: 'reorder_tasks',
      updates: [
        { taskId: 'task-a', sortOrder: 1 },
        { taskId: 'task-b', sortOrder: 2 },
      ],
    };
    const next: FrontendProjectCommand = {
      type: 'reorder_tasks',
      updates: [
        { taskId: 'task-a', sortOrder: 3 },
        { taskId: 'task-b', sortOrder: 4 },
      ],
    };

    expect(coalesceCommands(previous, next)).toEqual(next);
  });

  it('merges consecutive field updates for the same task', () => {
    const previous: FrontendProjectCommand = {
      type: 'update_task_fields',
      taskId: 'task-a',
      fields: {
        parentId: 'parent-1',
      },
    };
    const next: FrontendProjectCommand = {
      type: 'update_task_fields',
      taskId: 'task-a',
      fields: {
        dependencies: [{ taskId: 'task-b', type: 'FS', lag: 0 }],
      },
    };

    expect(coalesceCommands(previous, next)).toEqual({
      type: 'update_task_fields',
      taskId: 'task-a',
      fields: {
        parentId: 'parent-1',
        dependencies: [{ taskId: 'task-b', type: 'FS', lag: 0 }],
      },
    });
  });
});
