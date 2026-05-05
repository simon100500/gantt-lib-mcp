import { describe, expect, it } from 'vitest';
import { __batchTaskUpdateInternals } from '../useBatchTaskUpdate.ts';
import type { Task } from '../../types.ts';

const { mergeReorderedTasksWithReference, sanitizeHierarchyDependencies } = __batchTaskUpdateInternals;

describe('useBatchTaskUpdate reorder normalization', () => {
  it('preserves authoritative task fields when gantt reorder payload is partial', () => {
    const referenceTasks: Task[] = [
      {
        id: 'task-a',
        name: 'Task A',
        startDate: '2026-05-01',
        endDate: '2026-05-04',
        color: '#123456',
        progress: 55,
        workVolume: 13,
        workUnit: 'h',
        completedVolume: 7,
        accepted: true,
        locked: true,
        divider: 'top',
        baselineStartDate: '2026-04-28',
        baselineEndDate: '2026-05-03',
        dependencies: [{ taskId: 'task-b', type: 'FS', lag: 2 }],
        sortOrder: 0,
      },
      {
        id: 'task-b',
        name: 'Task B',
        startDate: '2026-05-05',
        endDate: '2026-05-06',
        color: '#abcdef',
        sortOrder: 1,
      },
    ];

    const reorderedTasks: Task[] = [
      {
        id: 'task-b',
        name: 'Task B',
        startDate: '2026-05-05',
        endDate: '2026-05-06',
      },
      {
        id: 'task-a',
        name: 'Task A',
        startDate: '2026-05-01',
        endDate: '2026-05-04',
      },
    ];

    const merged = mergeReorderedTasksWithReference(reorderedTasks, referenceTasks);

    expect(merged).toEqual([
      {
        id: 'task-b',
        name: 'Task B',
        startDate: '2026-05-05',
        endDate: '2026-05-06',
        color: '#abcdef',
        sortOrder: 0,
      },
      {
        id: 'task-a',
        name: 'Task A',
        startDate: '2026-05-01',
        endDate: '2026-05-04',
        color: '#123456',
        progress: 55,
        workVolume: 13,
        workUnit: 'h',
        completedVolume: 7,
        accepted: true,
        locked: true,
        divider: 'top',
        baselineStartDate: '2026-04-28',
        baselineEndDate: '2026-05-03',
        dependencies: [{ taskId: 'task-b', type: 'FS', lag: 2 }],
        sortOrder: 1,
      },
    ]);
  });

  it('applies inferred parent only to moved task while keeping other fields from reference snapshot', () => {
    const referenceTasks: Task[] = [
      {
        id: 'task-a',
        name: 'Task A',
        startDate: '2026-05-01',
        endDate: '2026-05-04',
        parentId: 'parent-old',
        color: '#123456',
      },
      {
        id: 'task-b',
        name: 'Task B',
        startDate: '2026-05-05',
        endDate: '2026-05-06',
        parentId: 'parent-stable',
        color: '#abcdef',
      },
    ];

    const reorderedTasks: Task[] = [
      {
        id: 'task-a',
        name: 'Task A',
        startDate: '2026-05-01',
        endDate: '2026-05-04',
      },
      {
        id: 'task-b',
        name: 'Task B',
        startDate: '2026-05-05',
        endDate: '2026-05-06',
      },
    ];

    const merged = mergeReorderedTasksWithReference(reorderedTasks, referenceTasks, 'task-a', 'parent-new');

    expect(merged[0]).toMatchObject({
      id: 'task-a',
      parentId: 'parent-new',
      color: '#123456',
      sortOrder: 0,
    });
    expect(merged[1]).toMatchObject({
      id: 'task-b',
      parentId: 'parent-stable',
      color: '#abcdef',
      sortOrder: 1,
    });
  });

  it('detaches the moved last child when inferredParentId is undefined', () => {
    const referenceTasks: Task[] = [
      {
        id: 'parent-1',
        name: 'Parent',
        startDate: '2026-05-01',
        endDate: '2026-05-04',
        sortOrder: 0,
      },
      {
        id: 'task-a',
        name: 'Task A',
        startDate: '2026-05-02',
        endDate: '2026-05-03',
        parentId: 'parent-1',
        color: '#123456',
        sortOrder: 1,
      },
    ];

    const reorderedTasks: Task[] = [
      {
        id: 'parent-1',
        name: 'Parent',
        startDate: '2026-05-01',
        endDate: '2026-05-04',
      },
      {
        id: 'task-a',
        name: 'Task A',
        startDate: '2026-05-02',
        endDate: '2026-05-03',
      },
    ];

    const merged = mergeReorderedTasksWithReference(reorderedTasks, referenceTasks, 'task-a', undefined);

    expect(merged[1]).toMatchObject({
      id: 'task-a',
      parentId: undefined,
      color: '#123456',
      sortOrder: 1,
    });
  });

  it('removes dependencies between ancestor and descendant tasks after hierarchy edits', () => {
    const sanitized = sanitizeHierarchyDependencies([
      {
        id: 'parent-1',
        name: 'Parent',
        startDate: '2026-05-01',
        endDate: '2026-05-04',
        dependencies: [{ taskId: 'child-1', type: 'FS', lag: 0 }],
      },
      {
        id: 'child-1',
        name: 'Child',
        startDate: '2026-05-02',
        endDate: '2026-05-03',
        parentId: 'parent-1',
        dependencies: [{ taskId: 'parent-1', type: 'FS', lag: 0 }],
      },
    ]);

    expect(sanitized[0]).toMatchObject({
      id: 'parent-1',
      dependencies: undefined,
    });
    expect(sanitized[1]).toMatchObject({
      id: 'child-1',
      dependencies: undefined,
    });
  });
});
