/**
 * gantt-lib compatible type definitions for MCP server
 *
 * These types match the gantt-lib specification for Gantt chart task management.
 * All dates are stored as ISO string format 'YYYY-MM-DD' per DATA-03 requirement.
 */

/**
 * Dependency type enumeration for task relationships
 * FS: Finish-Start (task B starts after task A finishes)
 * SS: Start-Start (task B starts when task A starts)
 * FF: Finish-Finish (task B finishes when task A finishes)
 * SF: Start-Finish (task B finishes after task A starts)
 */
export type DependencyType = 'FS' | 'SS' | 'FF' | 'SF';

/**
 * Task dependency relationship compatible with gantt-lib
 */
export interface TaskDependency {
  /** ID of the dependent task */
  taskId: string;
  /** Type of dependency relationship */
  type: DependencyType;
  /** Optional lag in days (default: 0) */
  lag?: number;
}

/**
 * Gantt chart task compatible with gantt-lib
 */
export interface Task {
  /** Unique identifier */
  id: string;
  /** Task name */
  name: string;
  /** Start date in ISO format: 'YYYY-MM-DD' */
  startDate: string;
  /** End date in ISO format: 'YYYY-MM-DD' */
  endDate: string;
  /** Optional display color */
  color?: string;
  /** Optional progress percentage (0-100) */
  progress?: number;
  /** Optional task dependencies */
  dependencies?: TaskDependency[];
}

/**
 * Input type for creating a new task
 */
export interface CreateTaskInput {
  /** Task name */
  name: string;
  /** Start date in ISO format: 'YYYY-MM-DD' */
  startDate: string;
  /** End date in ISO format: 'YYYY-MM-DD' */
  endDate: string;
  /** Optional display color */
  color?: string;
  /** Optional progress percentage (0-100) */
  progress?: number;
  /** Optional task dependencies */
  dependencies?: TaskDependency[];
}

/**
 * Input type for updating a task (all fields optional)
 */
export interface UpdateTaskInput {
  /** Task ID */
  id: string;
  /** Optional task name */
  name?: string;
  /** Optional start date in ISO format: 'YYYY-MM-DD' */
  startDate?: string;
  /** Optional end date in ISO format: 'YYYY-MM-DD' */
  endDate?: string;
  /** Optional display color */
  color?: string;
  /** Optional progress percentage (0-100) */
  progress?: number;
  /** Optional task dependencies */
  dependencies?: TaskDependency[];
}

/**
 * Input type for import/export operations
 */
export interface FilePathInput {
  /** File path for export/import */
  filePath: string;
}

/**
 * Input type for import_tasks tool
 */
export interface ImportTasksInput {
  /** JSON string containing array of tasks */
  jsonData: string;
}

/**
 * Input type for set_autosave_path tool
 */
export interface AutoSaveInput {
  /** Optional file path for autosave (default: ./gantt-data.json) */
  filePath?: string;
}
