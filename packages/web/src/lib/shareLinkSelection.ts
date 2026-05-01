import type { Task } from '../types.ts';

export interface ShareSelectionState {
  checked: boolean;
  indeterminate: boolean;
}

function buildChildrenByParent(tasks: Task[]): Map<string, string[]> {
  const childrenByParent = new Map<string, string[]>();

  for (const task of tasks) {
    if (!task.parentId) {
      continue;
    }

    const bucket = childrenByParent.get(task.parentId) ?? [];
    bucket.push(task.id);
    childrenByParent.set(task.parentId, bucket);
  }

  return childrenByParent;
}

export function collectTaskSubtreeIds(tasks: Task[], rootTaskId: string): string[] {
  const taskIds = new Set(tasks.map((task) => task.id));
  if (!taskIds.has(rootTaskId)) {
    return [];
  }

  const childrenByParent = buildChildrenByParent(tasks);
  const queue = [rootTaskId];
  const result: string[] = [];
  const seen = new Set<string>();

  while (queue.length > 0) {
    const currentId = queue.shift();
    if (!currentId || seen.has(currentId)) {
      continue;
    }

    seen.add(currentId);
    result.push(currentId);
    queue.push(...(childrenByParent.get(currentId) ?? []));
  }

  return result;
}

export function toggleShareSelection(tasks: Task[], selectedTaskIds: Set<string>, taskId: string): Set<string> {
  const next = new Set(selectedTaskIds);
  const subtreeIds = collectTaskSubtreeIds(tasks, taskId);
  if (subtreeIds.length === 0) {
    return next;
  }

  const shouldSelect = subtreeIds.some((id) => !next.has(id));
  for (const id of subtreeIds) {
    if (shouldSelect) {
      next.add(id);
    } else {
      next.delete(id);
    }
  }

  return next;
}

export function getShareSelectionState(tasks: Task[], selectedTaskIds: Set<string>, taskId: string): ShareSelectionState {
  const subtreeIds = collectTaskSubtreeIds(tasks, taskId);
  if (subtreeIds.length === 0) {
    return {
      checked: false,
      indeterminate: false,
    };
  }

  const selectedCount = subtreeIds.filter((id) => selectedTaskIds.has(id)).length;
  if (selectedCount === 0) {
    return { checked: false, indeterminate: false };
  }
  if (selectedCount === subtreeIds.length) {
    return { checked: true, indeterminate: false };
  }

  return { checked: false, indeterminate: true };
}
