export interface TaskDependency {
  taskId: string;
  type: 'FS' | 'SS' | 'FF' | 'SF';
  lag: number;
}

export interface DependencyError {
  type: 'cycle' | 'constraint' | 'missing-task';
  taskId: string;
  message: string;
  relatedTaskIds?: string[];
}

export interface ValidationResult {
  isValid: boolean;
  errors: DependencyError[];
}

export interface Task {
  id: string;
  name: string;
  startDate: string | Date;   // YYYY-MM-DD string or Date object (gantt-lib compatible)
  endDate: string | Date;     // YYYY-MM-DD string or Date object (gantt-lib compatible)
  color?: string;
  parentId?: string;          // Optional parent task ID for hierarchy
  progress?: number;
  accepted?: boolean;        // Controls progress bar color at 100% (green vs yellow)
  locked?: boolean;          // Prevents drag/resize/edit
  divider?: 'top' | 'bottom'; // Visual grouping lines
  dependencies?: TaskDependency[];
  sortOrder?: number;        // Display order position
}

type RawTaskDependency = Omit<TaskDependency, 'lag'> & {
  lag?: number;
};

type RawTask = Omit<Task, 'dependencies'> & {
  dependencies?: RawTaskDependency[];
};

export function normalizeTask(task: RawTask): Task {
  return {
    ...task,
    dependencies: task.dependencies?.map((dependency) => ({
      ...dependency,
      lag: dependency.lag ?? 0,
    })),
  };
}

export function normalizeTasks(tasks: RawTask[]): Task[] {
  return tasks.map(normalizeTask);
}

export function sanitizeHierarchyDependencies(tasks: Task[]): Task[] {
  const parentById = new Map(tasks.map(task => [task.id, task.parentId]));
  const childrenById = new Map<string, string[]>();

  for (const task of tasks) {
    if (!task.parentId) continue;
    const children = childrenById.get(task.parentId) ?? [];
    children.push(task.id);
    childrenById.set(task.parentId, children);
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

  return tasks.map(task => {
    const dependencies = task.dependencies ?? [];
    const descendants = collectDescendants(task.id);
    const sanitizedDependencies = dependencies.filter(dep =>
      !descendants.has(dep.taskId) && !isAncestor(dep.taskId, task.id)
    );

    if (sanitizedDependencies.length === dependencies.length) {
      return task;
    }

    return {
      ...task,
      dependencies: sanitizedDependencies,
    };
  });
}
