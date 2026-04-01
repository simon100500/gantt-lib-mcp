export interface TaskDependency {
  taskId: string;
  type: 'FS' | 'SS' | 'FF' | 'SF';
  lag: number;
}

export interface ProjectDependency {
  id: string;
  taskId: string;
  depTaskId: string;
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

export interface CalendarDay {
  date: string;
  kind: 'working' | 'non_working' | 'shortened';
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

// === Phase 36: Command types for frontend state model ===

export type FrontendProjectCommand =
  | { type: 'move_task'; taskId: string; startDate: string; }
  | { type: 'resize_task'; taskId: string; anchor: 'start' | 'end'; date: string; }
  | { type: 'set_task_start'; taskId: string; startDate: string; }
  | { type: 'set_task_end'; taskId: string; endDate: string; }
  | { type: 'change_duration'; taskId: string; duration: number; anchor?: 'start' | 'end'; }
  | {
      type: 'update_task_fields';
      taskId: string;
      fields: {
        name?: string;
        color?: string;
        parentId?: string | null;
        progress?: number;
        dependencies?: TaskDependency[];
      };
    }
  | { type: 'create_task'; task: Omit<Task, 'id'> & { id?: string }; }
  | { type: 'delete_task'; taskId: string; }
  | { type: 'create_dependency'; taskId: string; dependency: { taskId: string; type: string; lag?: number; }; }
  | { type: 'remove_dependency'; taskId: string; depTaskId: string; }
  | { type: 'change_dependency_lag'; taskId: string; depTaskId: string; lag: number; }
  | { type: 'recalculate_schedule'; taskId?: string; }
  | { type: 'reparent_task'; taskId: string; newParentId: string | null; }
  | { type: 'reorder_tasks'; updates: Array<{ taskId: string; sortOrder: number; }>; };

export interface ProjectSnapshot {
  tasks: Task[];
  dependencies: ProjectDependency[];
}

export interface PendingCommand {
  requestId: string;
  baseVersion: number;
  command: FrontendProjectCommand;
}

export interface ProjectState {
  confirmed: {
    version: number;
    snapshot: ProjectSnapshot;
  };
  // Optimistic commands already sent to the server and awaiting authoritative ack.
  pending: PendingCommand[];
  // Pointer-time preview shown during an active interaction before commit.
  dragPreview?: {
    commands: FrontendProjectCommand[];
    snapshot: ProjectSnapshot;
  };
}
