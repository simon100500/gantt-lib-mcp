import test from 'node:test';
import assert from 'node:assert/strict';
import type { Task } from '../types.js';
import { sanitizeHierarchyDependencies } from './hierarchy-dependency-sanitizer.js';

test('removes dependencies from child to ancestor and ancestor to child', () => {
  const tasks: Task[] = [
    {
      id: 'parent',
      name: 'Parent',
      startDate: '2026-03-01',
      endDate: '2026-03-03',
      dependencies: [{ taskId: 'child', type: 'FS', lag: 0 }],
    },
    {
      id: 'child',
      name: 'Child',
      startDate: '2026-03-04',
      endDate: '2026-03-05',
      parentId: 'parent',
      dependencies: [{ taskId: 'parent', type: 'FS', lag: 0 }],
    },
  ];

  const result = sanitizeHierarchyDependencies(tasks);
  const parent = result.sanitizedTasks.find(task => task.id === 'parent');
  const child = result.sanitizedTasks.find(task => task.id === 'child');

  assert.deepEqual(parent?.dependencies, []);
  assert.deepEqual(child?.dependencies, []);
  assert.deepEqual(result.removedDependencies, [
    { taskId: 'parent', depTaskId: 'child' },
    { taskId: 'child', depTaskId: 'parent' },
  ]);
});

test('removes dependencies across any ancestor depth and keeps unrelated links', () => {
  const tasks: Task[] = [
    {
      id: 'root',
      name: 'Root',
      startDate: '2026-03-01',
      endDate: '2026-03-02',
      dependencies: [{ taskId: 'grandchild', type: 'FS', lag: 0 }],
    },
    {
      id: 'child',
      name: 'Child',
      startDate: '2026-03-03',
      endDate: '2026-03-04',
      parentId: 'root',
    },
    {
      id: 'grandchild',
      name: 'Grandchild',
      startDate: '2026-03-05',
      endDate: '2026-03-06',
      parentId: 'child',
      dependencies: [
        { taskId: 'root', type: 'SS', lag: 0 },
        { taskId: 'external', type: 'FS', lag: 2 },
      ],
    },
    {
      id: 'external',
      name: 'External',
      startDate: '2026-03-07',
      endDate: '2026-03-08',
    },
  ];

  const result = sanitizeHierarchyDependencies(tasks);
  const root = result.sanitizedTasks.find(task => task.id === 'root');
  const grandchild = result.sanitizedTasks.find(task => task.id === 'grandchild');

  assert.deepEqual(root?.dependencies, []);
  assert.deepEqual(grandchild?.dependencies, [{ taskId: 'external', type: 'FS', lag: 2 }]);
  assert.deepEqual(result.removedDependencies, [
    { taskId: 'root', depTaskId: 'grandchild' },
    { taskId: 'grandchild', depTaskId: 'root' },
  ]);
});
