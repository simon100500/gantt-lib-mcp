import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { HistoryGroupSnapshotResponse, RestoreHistoryGroupResponse, ProjectSnapshot } from '../types.js';
import { applyProjectCommandToSnapshot } from './project-command-apply.js';

describe('applyProjectCommandToSnapshot', () => {
  it('applies typed commands without mutating the input snapshot or adding version state', () => {
    const original: ProjectSnapshot = {
      tasks: [
        {
          id: 'task-1',
          name: 'Task 1',
          startDate: '2026-04-01',
          endDate: '2026-04-03',
          dependencies: [],
          sortOrder: 0,
        },
      ],
      dependencies: [],
    };

    const result = applyProjectCommandToSnapshot(
      original,
      { type: 'move_task', taskId: 'task-1', startDate: '2026-04-05' },
      { businessDays: false },
    );

    assert.equal(original.tasks[0]?.startDate, '2026-04-01');
    assert.equal(result.snapshot.tasks[0]?.startDate, '2026-04-05');
    assert.deepEqual(Object.keys(result).sort(), [
      'changedDependencyIds',
      'changedTaskIds',
      'conflicts',
      'patches',
      'snapshot',
    ]);
    assert.ok(!('version' in result));
  });

  it('keeps created tasks in the returned snapshot and changed ids', () => {
    const result = applyProjectCommandToSnapshot(
      { tasks: [], dependencies: [] },
      {
        type: 'create_task',
        task: {
          id: 'task-2',
          name: 'Task 2',
          startDate: '2026-04-10',
          endDate: '2026-04-12',
        },
      },
      { businessDays: false },
    );

    assert.deepEqual(result.changedTaskIds, ['task-2']);
    assert.equal(result.snapshot.tasks[0]?.id, 'task-2');
  });

  it('exposes shared history response contracts for snapshot preview and restore', () => {
    const preview: HistoryGroupSnapshotResponse = {
      groupId: 'group-1',
      isCurrent: true,
      currentVersion: 5,
      snapshot: { tasks: [], dependencies: [] },
    };
    const restore: RestoreHistoryGroupResponse = {
      groupId: 'rollback-1',
      targetGroupId: 'group-1',
      version: 6,
      snapshot: { tasks: [], dependencies: [] },
    };

    assert.equal(preview.currentVersion, 5);
    assert.equal(restore.targetGroupId, 'group-1');
  });
});
