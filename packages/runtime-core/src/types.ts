/**
 * gantt-lib compatible type definitions for shared runtime services.
 *
 * These types match the gantt-lib specification for Gantt chart task management.
 * All dates are stored as ISO string format 'YYYY-MM-DD' per DATA-03 requirement.
 */

export type DependencyType = 'FS' | 'SS' | 'FF' | 'SF';
export type TaskType = 'task' | 'milestone';

export interface TaskDependency {
  taskId: string;
  type: DependencyType;
  lag?: number;
}

export interface Task {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  type?: TaskType;
  color?: string;
  parentId?: string;
  progress?: number;
  dependencies?: TaskDependency[];
  sortOrder?: number;
  children?: Task[];
  locked?: boolean;
  accepted?: boolean;
  divider?: 'top' | 'bottom';
}

export interface CreateTaskInput {
  id?: string;
  name: string;
  startDate: string;
  endDate: string;
  type?: TaskType;
  color?: string;
  parentId?: string;
  progress?: number;
  dependencies?: TaskDependency[];
  sortOrder?: number;
  projectId?: string;
}

export interface UpdateTaskInput {
  id: string;
  name?: string;
  startDate?: string;
  endDate?: string;
  type?: TaskType;
  color?: string | null;
  parentId?: string;
  progress?: number;
  dependencies?: TaskDependency[];
  sortOrder?: number;
}

export interface WorkType {
  name: string;
  duration: number;
}

export interface RepeatBy {
  sections?: number[];
  floors?: number[];
  [key: string]: number[] | undefined;
}

export interface CreateTasksBatchInput {
  baseStartDate: string;
  workTypes: WorkType[];
  repeatBy: RepeatBy;
  streams?: number;
  nameTemplate?: string;
}

export interface BatchCreateResult {
  created: number;
  taskIds: string[];
  failed?: Array<{ index: number; error: string }>;
}

export interface Message {
  id: string;
  projectId?: string;
  role: 'user' | 'assistant';
  content: string;
  requestContextId?: string | null;
  historyGroupId?: string | null;
  deletedAt?: string | null;
  createdAt: string;
}

export interface GetConversationHistoryInput {
  projectId?: string;
  limit?: number;
}

export interface AddMessageInput {
  content: string;
  projectId?: string;
}

export type NormalizedMutationStatus = 'accepted' | 'rejected';
export type NormalizedMutationReason =
  | 'version_conflict'
  | 'validation_error'
  | 'conflict'
  | 'not_found'
  | 'invalid_request'
  | 'unsupported_operation'
  | 'limit_reached';

export type EnforcementPlanId = 'free' | 'start' | 'team' | 'enterprise';
export type EnforcementLimitKey = 'projects' | 'ai_queries' | 'archive' | 'resource_pool' | 'export';

export interface MutationEnforcementPayload {
  code: string;
  limitKey: EnforcementLimitKey | null;
  remaining: number | 'unlimited' | null;
  plan: EnforcementPlanId;
  planLabel: string;
  upgradeHint: string;
}

export interface NormalizedMutationResult {
  status: NormalizedMutationStatus;
  baseVersion: number;
  reason?: NormalizedMutationReason;
  newVersion?: number;
  changedTaskIds: string[];
  changedTasks: Task[];
  changedDependencyIds: string[];
  conflicts: Conflict[];
  snapshot?: ProjectSnapshot;
  enforcement?: MutationEnforcementPayload;
}

export interface GetProjectSummaryInput {
  projectId?: string;
}

export interface ProjectSummary {
  projectId: string;
  version: number;
  dayMode: GanttDayMode;
  effectiveDateRange: {
    startDate: string | null;
    endDate: string | null;
  };
  rootTaskCount: number;
  totalTaskCount: number;
  healthFlags: string[];
}

export interface GetTaskContextInput {
  taskId: string;
  projectId?: string;
}

export interface TaskContextResult {
  version: number;
  task: Task;
  parents: Task[];
  children: Task[];
  siblings: Task[];
  predecessors: Array<TaskDependency & { task?: Task }>;
  successors: Array<{ taskId: string; type: DependencyType; lag: number; task?: Task }>;
}

export interface GetScheduleSliceInput {
  projectId?: string;
  taskIds?: string[];
  branchRootId?: string;
  startDate?: string;
  endDate?: string;
}

export interface ScheduleSliceResult {
  version: number;
  scope: {
    mode: 'task_ids' | 'branch_root' | 'date_window';
    taskIds?: string[];
    branchRootId?: string;
    startDate?: string;
    endDate?: string;
    returnedTaskCount: number;
  };
  tasks: Task[];
}

export interface CreateTasksInput {
  projectId?: string;
  tasks: CreateTaskInput[];
  includeSnapshot?: boolean;
}

export interface UpdateTasksInput {
  projectId?: string;
  updates: Array<{
    id: string;
    name?: string;
    color?: string | null;
    progress?: number;
  }>;
  includeSnapshot?: boolean;
}

export interface MoveTasksInput {
  projectId?: string;
  moves: Array<{
    taskId: string;
    parentId?: string | null;
    sortOrder?: number;
  }>;
  includeSnapshot?: boolean;
}

export interface DeleteTasksInput {
  projectId?: string;
  taskIds: string[];
  includeSnapshot?: boolean;
}

export interface LinkTasksInput {
  projectId?: string;
  links: Array<{
    predecessorTaskId: string;
    successorTaskId: string;
    type?: DependencyType;
    lag?: number;
  }>;
  includeSnapshot?: boolean;
}

export interface UnlinkTasksInput {
  projectId?: string;
  links: Array<{
    predecessorTaskId: string;
    successorTaskId: string;
  }>;
  includeSnapshot?: boolean;
}

export interface ShiftTasksInput {
  projectId?: string;
  shifts: Array<{
    taskId: string;
    delta: number;
    mode?: 'calendar' | 'working';
  }>;
  includeSnapshot?: boolean;
}

export interface RecalculateProjectInput {
  projectId?: string;
  includeSnapshot?: boolean;
}

export interface ValidateScheduleInput {
  projectId?: string;
}

export interface ValidateScheduleResult {
  version: number;
  isValid: boolean;
  errors: Array<{
    type: 'cycle' | 'constraint' | 'missing-task';
    taskId: string;
    message: string;
    relatedTaskIds?: string[];
  }>;
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
  businessDays?: boolean;
  weekendPredicate?: (date: Date) => boolean;
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
  changedTasks: Task[];
  changedIds: string[];
  snapshot?: Task[];
}

export interface TaskMutationResult extends ScheduleCommandResult {
  task?: Task;
}

export interface User {
  id: string;
  email: string;
  createdAt: string;
}

export interface Project {
  id: string;
  userId: string;
  name: string;
  status: ProjectStatus;
  ganttDayMode: GanttDayMode;
  calendarId: string | null;
  calendarDays: EffectiveCalendarDay[];
  archivedAt: string | null;
  deletedAt: string | null;
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

export interface Session {
  id: string;
  userId: string;
  projectId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  createdAt: string;
}

export interface OtpEntry {
  id: string;
  email: string;
  code: string;
  expiresAt: string;
  used: boolean;
}

export interface AuthToken {
  accessToken: string;
  refreshToken: string;
}

export type ProjectSnapshot = {
  tasks: Task[];
  dependencies: Array<{ id: string; taskId: string; depTaskId: string; type: DependencyType; lag: number }>;
};

export type ProjectCommand =
  | { type: 'switch_gantt_day_mode'; ganttDayMode: GanttDayMode }
  | { type: 'move_task'; taskId: string; startDate: string }
  | { type: 'resize_task'; taskId: string; anchor: 'start' | 'end'; date: string }
  | { type: 'set_task_start'; taskId: string; startDate: string }
  | { type: 'set_task_end'; taskId: string; endDate: string }
  | { type: 'change_duration'; taskId: string; duration: number; anchor?: 'start' | 'end' }
  | {
      type: 'update_task_fields';
      taskId: string;
      fields: {
        name?: string;
        type?: TaskType;
        color?: string | null;
        parentId?: string | null;
        progress?: number;
        dependencies?: TaskDependency[];
      };
    }
  | {
      type: 'update_tasks_fields_batch';
      updates: Array<{
        taskId: string;
        fields: {
          name?: string;
          type?: TaskType;
          color?: string | null;
          parentId?: string | null;
          progress?: number;
          dependencies?: TaskDependency[];
        };
      }>;
    }
  | { type: 'create_task'; task: CreateTaskInput }
  | { type: 'create_tasks_batch'; tasks: CreateTaskInput[] }
  | { type: 'delete_task'; taskId: string }
  | { type: 'delete_tasks'; taskIds: string[] }
  | { type: 'create_dependency'; taskId: string; dependency: TaskDependency }
  | { type: 'remove_dependency'; taskId: string; depTaskId: string }
  | { type: 'change_dependency_lag'; taskId: string; depTaskId: string; lag: number }
  | { type: 'recalculate_schedule'; taskId?: string }
  | { type: 'reparent_task'; taskId: string; newParentId: string | null }
  | { type: 'reorder_tasks'; updates: Array<{ taskId: string; sortOrder: number }> };

export type Conflict = {
  entityType: 'task' | 'dependency';
  entityId: string;
  reason: string;
  detail?: string;
};

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type Patch = {
  entityType: 'task' | 'dependency';
  entityId: string;
  before: JsonValue;
  after: JsonValue;
  reason: 'direct_command' | 'dependency_cascade' | 'calendar_snap' | 'parent_rollup' | 'constraint_adjustment';
};

export type ActorType = 'user' | 'agent' | 'system' | 'import';

export type MutationGroupOrigin = 'user_ui' | 'agent_run' | 'system' | 'undo' | 'redo';
export type MutationGroupStatus = 'applied' | 'undone';
export type HistoryGroupContext = {
  groupId: string;
  origin: MutationGroupOrigin;
  title: string;
  requestContextId?: string;
  finalizeGroup: boolean;
  undoable?: boolean;
  redoOfGroupId?: string | null;
  targetGroupId?: string | null;
};
export type ProjectEventInverseCommand = ProjectCommand | null;
export type MutationGroupRecord = {
  id: string;
  projectId: string;
  baseVersion: number;
  newVersion: number | null;
  actorType: ActorType;
  actorId?: string;
  origin: MutationGroupOrigin;
  title: string;
  status: MutationGroupStatus;
  undoable: boolean;
  undoneByGroupId?: string | null;
  redoOfGroupId?: string | null;
  createdAt: string;
};

export type HistoryGroupSnapshotResponse = {
  groupId: string;
  isCurrent: boolean;
  currentVersion: number;
  snapshot: ProjectSnapshot;
};

export type RestoreHistoryGroupResponse = {
  groupId: string;
  targetGroupId: string;
  version: number;
  snapshot: ProjectSnapshot;
};

export type ScheduleExecutionResult = {
  snapshot: ProjectSnapshot;
  changedTaskIds: string[];
  changedDependencyIds: string[];
  conflicts: Conflict[];
  patches: Patch[];
};

export type CommitProjectCommandRequest = {
  projectId: string;
  clientRequestId: string;
  baseVersion: number;
  command: ProjectCommand;
  history?: HistoryGroupContext;
};

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
      error?: string;
    };

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
  groupId?: string;
  ordinal?: number;
  inverseCommand?: ProjectEventInverseCommand;
  metadata?: JsonValue;
  requestContextId?: string;
  executionTimeMs: number;
  createdAt: string;
};
