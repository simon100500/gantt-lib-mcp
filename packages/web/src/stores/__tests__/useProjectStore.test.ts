import { afterEach, describe, expect, it } from 'vitest';
import { useProjectStore } from '../useProjectStore.ts';
import type { Task } from '../../types.ts';

const baseTasks: Task[] = [
  { id: 'task-a', name: 'Task A', startDate: '2026-05-01', endDate: '2026-05-02', sortOrder: 0 },
  { id: 'task-b', name: 'Task B', startDate: '2026-05-03', endDate: '2026-05-04', sortOrder: 1 },
  { id: 'task-c', name: 'Task C', startDate: '2026-05-05', endDate: '2026-05-06', sortOrder: 2 },
];

function resetStore() {
  useProjectStore.getState().hydrateConfirmed(1, {
    tasks: baseTasks.map((task) => ({ ...task })),
    dependencies: [],
  });
  useProjectStore.getState().hydratePending([]);
  useProjectStore.getState().setDragPreview(undefined);
}

describe('useProjectStore resolvePending', () => {
  afterEach(() => {
    resetStore();
  });

  it('applies accepted reorder_tasks to confirmed snapshot when server returns no changedTasks', () => {
    resetStore();

    useProjectStore.getState().addPending({
      requestId: 'req-1',
      baseVersion: 1,
      status: 'pending',
      command: {
        type: 'reorder_tasks',
        updates: [
          { taskId: 'task-c', sortOrder: 0 },
          { taskId: 'task-a', sortOrder: 1 },
          { taskId: 'task-b', sortOrder: 2 },
        ],
      },
    });

    useProjectStore.getState().resolvePending('req-1', 2, {
      changedTasks: [],
      changedDependencyIds: [],
    });

    const state = useProjectStore.getState();
    expect(state.pending).toEqual([]);
    expect(state.confirmed.version).toBe(2);
    expect(state.confirmed.snapshot.tasks.map((task) => task.id)).toEqual(['task-c', 'task-a', 'task-b']);
    expect(state.confirmed.snapshot.tasks.map((task) => task.sortOrder)).toEqual([0, 1, 2]);
  });
});
