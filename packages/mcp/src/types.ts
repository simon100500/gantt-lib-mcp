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

/**
 * Work type definition for batch task creation
 */
export interface WorkType {
  /** Name of the work type (e.g., "Бетонирование стен") */
  name: string;
  /** Duration in days */
  duration: number;
}

/**
 * Repeat parameters for batch task generation
 */
export interface RepeatBy {
  /** Array of section numbers (e.g., [1, 2, 3, 4, 5, 6]) */
  sections?: number[];
  /** Array of floor numbers (e.g., [1, 2, 3, 4]) */
  floors?: number[];
  /** Additional repeat parameters (e.g., phases, zones) */
  [key: string]: number[] | undefined;
}

/**
 * Input type for creating tasks in batch
 */
export interface CreateTasksBatchInput {
  /** Base start date for the first task in each stream (YYYY-MM-DD) */
  baseStartDate: string;
  /** Array of work types with their durations */
  workTypes: WorkType[];
  /** Parameters for repeating tasks */
  repeatBy: RepeatBy;
  /** Number of parallel streams (default: 1) */
  streams?: number;
  /** Optional name template (use placeholders: {workType}, {section}, {floor}) */
  nameTemplate?: string;
}

/**
 * Result of batch task creation
 */
export interface BatchCreateResult {
  /** Number of tasks successfully created */
  created: number;
  /** IDs of created tasks */
  taskIds: string[];
  /** Tasks that failed to create (if any) */
  failed?: Array<{ index: number; error: string }>;
}

/**
 * Dialog message for AI conversation history
 */
export interface Message {
  /** Unique identifier */
  id: string;
  /** Optional project ID for multi-user context */
  projectId?: string;
  /** Message role */
  role: 'user' | 'assistant';
  /** Message content */
  content: string;
  /** ISO timestamp of creation */
  createdAt: string;
}

/**
 * User account for authentication and authorization
 */
export interface User {
  /** Unique identifier */
  id: string;
  /** Email address (unique) */
  email: string;
  /** ISO timestamp of account creation */
  createdAt: string;
}

/**
 * Project for organizing tasks and sessions
 */
export interface Project {
  /** Unique identifier */
  id: string;
  /** Owner user ID */
  userId: string;
  /** Project name */
  name: string;
  /** ISO timestamp of creation */
  createdAt: string;
}

/**
 * User session with access and refresh tokens
 */
export interface Session {
  /** Unique identifier */
  id: string;
  /** User ID */
  userId: string;
  /** Active project ID */
  projectId: string;
  /** JWT access token */
  accessToken: string;
  /** JWT refresh token */
  refreshToken: string;
  /** ISO timestamp of token expiration */
  expiresAt: string;
  /** ISO timestamp of session creation */
  createdAt: string;
}

/**
 * OTP code entry for email-based authentication
 */
export interface OtpEntry {
  /** Unique identifier */
  id: string;
  /** Email address for OTP delivery */
  email: string;
  /** OTP code */
  code: string;
  /** ISO timestamp of code expiration */
  expiresAt: string;
  /** Whether the code has been used */
  used: boolean;
}

/**
 * Authentication token pair
 */
export interface AuthToken {
  /** JWT access token */
  accessToken: string;
  /** JWT refresh token */
  refreshToken: string;
}
