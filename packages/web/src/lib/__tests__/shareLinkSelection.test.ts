import { describe, expect, it } from 'vitest';

import type { Task } from '../../types.ts';
import {
  collectTaskSubtreeIds,
  getShareSelectionState,
  toggleShareSelection,
} from '../shareLinkSelection.ts';

const tasks: Task[] = [
  { id: 'parent', name: 'Parent', startDate: '2026-05-01', endDate: '2026-05-05', dependencies: [] },
  { id: 'child-a', name: 'Child A', startDate: '2026-05-01', endDate: '2026-05-02', parentId: 'parent', dependencies: [] },
  { id: 'child-b', name: 'Child B', startDate: '2026-05-02', endDate: '2026-05-03', parentId: 'parent', dependencies: [] },
  { id: 'leaf', name: 'Leaf', startDate: '2026-05-03', endDate: '2026-05-03', parentId: 'child-b', dependencies: [] },
];

describe('shareLinkSelection', () => {
  it('collects full subtree ids', () => {
    expect(collectTaskSubtreeIds(tasks, 'parent')).toEqual(['parent', 'child-a', 'child-b', 'leaf']);
    expect(collectTaskSubtreeIds(tasks, 'child-b')).toEqual(['child-b', 'leaf']);
  });

  it('toggles whole subtree on parent click', () => {
    const selected = toggleShareSelection(tasks, new Set<string>(), 'parent');
    expect(Array.from(selected)).toEqual(['parent', 'child-a', 'child-b', 'leaf']);

    const cleared = toggleShareSelection(tasks, selected, 'parent');
    expect(Array.from(cleared)).toEqual([]);
  });

  it('marks partially selected parents as indeterminate', () => {
    const selected = new Set<string>(['parent', 'child-a', 'child-b']);
    expect(getShareSelectionState(tasks, selected, 'parent')).toEqual({
      checked: false,
      indeterminate: true,
    });
    expect(getShareSelectionState(tasks, selected, 'child-a')).toEqual({
      checked: true,
      indeterminate: false,
    });
  });
});
