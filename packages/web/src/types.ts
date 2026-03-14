export interface TaskDependency {
  taskId: string;
  type: 'FS' | 'SS' | 'FF' | 'SF';
  lag?: number;
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
