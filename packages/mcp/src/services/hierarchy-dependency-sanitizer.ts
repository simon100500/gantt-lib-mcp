import type { Task } from '../types.js';

export interface RemovedHierarchyDependency {
  taskId: string;
  depTaskId: string;
}

export interface HierarchyDependencySanitizationResult {
  sanitizedTasks: Task[];
  removedDependencies: RemovedHierarchyDependency[];
}

export function sanitizeHierarchyDependencies(tasks: Task[]): HierarchyDependencySanitizationResult {
  const parentById = new Map(tasks.map(task => [task.id, task.parentId]));
  const childrenById = new Map<string, string[]>();

  for (const task of tasks) {
    if (!task.parentId) continue;
    const siblings = childrenById.get(task.parentId) ?? [];
    siblings.push(task.id);
    childrenById.set(task.parentId, siblings);
  }

  const descendantMemo = new Map<string, Set<string>>();

  const collectDescendants = (taskId: string): Set<string> => {
    const memoized = descendantMemo.get(taskId);
    if (memoized) {
      return memoized;
    }

    const descendants = new Set<string>();
    for (const childId of childrenById.get(taskId) ?? []) {
      descendants.add(childId);
      for (const nestedChildId of collectDescendants(childId)) {
        descendants.add(nestedChildId);
      }
    }

    descendantMemo.set(taskId, descendants);
    return descendants;
  };

  const isAncestor = (ancestorId: string, taskId: string): boolean => {
    let currentParentId = parentById.get(taskId);
    while (currentParentId) {
      if (currentParentId === ancestorId) {
        return true;
      }
      currentParentId = parentById.get(currentParentId);
    }
    return false;
  };

  const removedDependencies: RemovedHierarchyDependency[] = [];
  const sanitizedTasks = tasks.map(task => {
    const descendants = collectDescendants(task.id);
    const dependencies = task.dependencies ?? [];
    const sanitizedDependencies = dependencies.filter(dep => {
      const invalid =
        descendants.has(dep.taskId) ||
        isAncestor(dep.taskId, task.id);

      if (invalid) {
        removedDependencies.push({
          taskId: task.id,
          depTaskId: dep.taskId,
        });
      }

      return !invalid;
    });

    if (sanitizedDependencies.length === dependencies.length) {
      return task;
    }

    return {
      ...task,
      dependencies: sanitizedDependencies,
    };
  });

  return {
    sanitizedTasks,
    removedDependencies,
  };
}
