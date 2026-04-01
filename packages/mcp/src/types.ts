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
  /** Optional parent task ID for hierarchy */
  parentId?: string;
  /** Optional progress percentage (0-100) */
  progress?: number;
  /** Optional task dependencies */
  dependencies?: TaskDependency[];
  /** Optional sort order for display position */
  sortOrder?: number;
  /** Optional child tasks for hierarchical loading */
  children?: Task[];
  /** Optional flag to prevent drag/resize interactions */
  locked?: boolean;
  /** Optional accepted flag used by the web client */
  accepted?: boolean;
  /** Optional divider hint used by the web client */
  divider?: 'top' | 'bottom';
}

/**
 * Input type for creating a new task
 */
export interface CreateTaskInput {
  /** Optional client-generated task ID for optimistic/linked creation flows */
  id?: string;
  /** Task name */
  name: string;
  /** Start date in ISO format: 'YYYY-MM-DD' */
  startDate: string;
  /** End date in ISO format: 'YYYY-MM-DD' */
  endDate: string;
  /** Optional display color */
  color?: string;
  /** Optional parent task ID for hierarchy */
  parentId?: string;
  /** Optional progress percentage (0-100) */
  progress?: number;
  /** Optional task dependencies */
  dependencies?: TaskDependency[];
  /** Optional sort order for display position */
  sortOrder?: number;
  /** Optional project ID to associate the task with */
  projectId?: string;
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
  /** Optional parent task ID for hierarchy */
  parentId?: string;
  /** Optional progress percentage (0-100) */
  progress?: number;
  /** Optional task dependencies */
  dependencies?: TaskDependency[];
  /** Optional sort order for display position */
  sortOrder?: number;
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
 * Input type for get_conversation_history tool
 */
export interface GetConversationHistoryInput {
  /** Optional project ID to filter messages by. If not provided, uses the current session project (PROJECT_ID env var) */
  projectId?: string;
  /** Number of recent messages to return (default: 20, max: 50) */
  limit?: number;
}

/**
 * Input type for add_message tool
 */
export interface AddMessageInput {
  /** Message content (must be non-empty) */
  content: string;
  /** Optional project ID to associate the message with. If not provided, uses the current session project (PROJECT_ID env var) */
  projectId?: string;
}

export type TaskMutationSource = 'agent' | 'manual-save' | 'api' | 'system';
export type GanttDayMode = 'business' | 'calendar';
export type ProjectStatus = 'active' | 'archived' | 'deleted';

export type CalendarScope = 'system' | 'project';
export type CalendarDayKind = 'working' | 'non_working' | 'shortened';
export type CalendarDaySource = 'system_seed' | 'manual' | 'import';

export interface EffectiveCalendarDay {
  date: string;
  kind: CalendarDayKind;
}

export interface ScheduleCommandOptions {
  /** Account for business days during scheduling */
  businessDays?: boolean;
  /** Weekend predicate for business-day mode */
  weekendPredicate?: (date: Date) => boolean;
  /** Include the normalized final snapshot in the response */
  includeSnapshot?: boolean;
}

export type ScheduleCommand =
  | {
      type: 'move_task';
      taskId: string;
      startDate: string;
    }
  | {
      type: 'resize_task';
      taskId: string;
      anchor: 'start' | 'end';
      date: string;
    }
  | {
      type: 'recalculate_schedule';
      taskId?: string;
    };

export interface ScheduleCommandResult {
  /** Tasks whose normalized persisted state changed */
  changedTasks: Task[];
  /** IDs of changed tasks */
  changedIds: string[];
  /** Optional full normalized snapshot after command execution */
  snapshot?: Task[];
}

export interface TaskMutationResult extends ScheduleCommandResult {
  /** Primary task addressed by the mutation when applicable */
  task?: Task;
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
  /** Availability status for the owner UI */
  status: ProjectStatus;
  /** Day-counting mode for gantt duration calculations */
  ganttDayMode: GanttDayMode;
  /** Selected working calendar for business-day mode */
  calendarId: string | null;
  /** Effective calendar day overrides loaded from DB */
  calendarDays: EffectiveCalendarDay[];
  /** ISO timestamp when project was archived */
  archivedAt: string | null;
  /** ISO timestamp when project was soft-deleted */
  deletedAt: string | null;
  /** ISO timestamp of creation */
  createdAt: string;
}

export interface WorkCalendar {
  id: string;
  code?: string | null;
  name: string;
  scope: CalendarScope;
  timezone?: string | null;
  isDefault: boolean;
  projectId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkCalendarDay {
  id: string;
  calendarId: string;
  date: string;
  kind: CalendarDayKind;
  label?: string | null;
  source: CalendarDaySource;
  createdAt: string;
  updatedAt: string;
}

export interface ShareLink {
  id: string;
  projectId: string;
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

// === Phase 36: Unified Scheduling Core types ===

/** Snapshot of all tasks and dependencies in a project at a point in time */
export type ProjectSnapshot = {
  tasks: Task[];
  dependencies: Array<{ id: string; taskId: string; depTaskId: string; type: DependencyType; lag: number; }>;
};

/** Typed project command — discriminated union by `type` field.
 *  Per D-04: command.payload: unknown is NOT allowed. Each variant has typed fields. */
export type ProjectCommand =
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
  | { type: 'create_task'; task: CreateTaskInput; }
  | { type: 'delete_task'; taskId: string; }
  | { type: 'create_dependency'; taskId: string; dependency: TaskDependency; }
  | { type: 'remove_dependency'; taskId: string; depTaskId: string; }
  | { type: 'change_dependency_lag'; taskId: string; depTaskId: string; lag: number; }
  | { type: 'recalculate_schedule'; taskId?: string; }
  | { type: 'reparent_task'; taskId: string; newParentId: string | null; }
  | { type: 'reorder_tasks'; updates: Array<{ taskId: string; sortOrder: number; }>; };

/** Conflict detected during command execution */
export type Conflict = {
  entityType: 'task' | 'dependency';
  entityId: string;
  reason: string;
  detail?: string;
};

/** JSON-safe value type for patch before/after */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/** Patch describing a single entity change with attribution.
 *  Per D-12: reason is one of 5 fixed values. */
export type Patch = {
  entityType: 'task' | 'dependency';
  entityId: string;
  before: JsonValue;
  after: JsonValue;
  reason: 'direct_command' | 'dependency_cascade' | 'calendar_snap' | 'parent_rollup' | 'constraint_adjustment';
};

/** Actor type for event attribution */
export type ActorType = 'user' | 'agent' | 'system' | 'import';

/** Full execution result from scheduling core. Per D-08. */
export type ScheduleExecutionResult = {
  snapshot: ProjectSnapshot;
  changedTaskIds: string[];
  changedDependencyIds: string[];
  conflicts: Conflict[];
  patches: Patch[];
};

/** Request to commit a project command. Per D-07. */
export type CommitProjectCommandRequest = {
  projectId: string;
  clientRequestId: string;
  baseVersion: number;
  command: ProjectCommand;
};

/** Response from command commit — accepted or rejected. Per D-07. */
export type CommitProjectCommandResponse =
  | {
      clientRequestId: string;
      accepted: true;
      baseVersion: number;
      newVersion: number;
      result: ScheduleExecutionResult;
      snapshot: ProjectSnapshot;
    }
  | {
      clientRequestId: string;
      accepted: false;
      reason: 'version_conflict' | 'validation_error' | 'conflict';
      currentVersion: number;
      snapshot?: ProjectSnapshot;
      conflicts?: Conflict[];
    };

/** Persisted project event record — mirrors Prisma ProjectEvent model.
 *  Named ProjectEventRecord to avoid collision with Prisma generated type. */
export type ProjectEventRecord = {
  id: string;
  projectId: string;
  baseVersion: number;
  version: number;
  applied: boolean;
  actorType: ActorType;
  actorId?: string;
  coreVersion: string;
  command: ProjectCommand;
  result: {
    changedTaskIds: string[];
    changedDependencyIds: string[];
    conflicts: Conflict[];
  };
  patches: Patch[];
  executionTimeMs: number;
  createdAt: string;
};
