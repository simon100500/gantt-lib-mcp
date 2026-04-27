import type {
  ActorType,
  CommitProjectCommandResponse,
  Conflict,
  CreateTasksInput,
  DeleteTasksInput,
  DependencyType,
  GetProjectSummaryInput,
  GetScheduleSliceInput,
  GetTaskContextInput,
  LinkTasksInput,
  MoveTasksInput,
  NormalizedMutationReason,
  NormalizedMutationResult,
  ProjectCommand,
  ProjectSnapshot,
  ProjectSummary,
  RecalculateProjectInput,
  ScheduleSliceResult,
  ShiftTasksInput,
  Task,
  TaskContextResult,
  UnlinkTasksInput,
  UpdateTasksInput,
  ValidateScheduleInput,
  ValidateScheduleResult,
} from '../types.js';

export type ToolJsonSchema = {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
};

export type NormalizedToolInputMap = {
  get_project_summary: GetProjectSummaryInput;
  get_schedule_slice: GetScheduleSliceInput;
  find_tasks: {
    projectId?: string;
    query: string;
    limit?: number;
  };
  get_task_context: GetTaskContextInput;
  create_tasks: CreateTasksInput;
  update_tasks: UpdateTasksInput;
  move_tasks: MoveTasksInput;
  shift_tasks: ShiftTasksInput;
  delete_tasks: DeleteTasksInput;
  link_tasks: LinkTasksInput;
  unlink_tasks: UnlinkTasksInput;
  recalculate_project: RecalculateProjectInput;
  validate_schedule: ValidateScheduleInput;
};

export type FindTasksResult = {
  version: number;
  query: string;
  matches: Array<{
    taskId: string;
    name: string;
    score: number;
    parentPath: string[];
    startDate: string;
    endDate: string;
  }>;
};

export type NormalizedToolResultMap = {
  get_project_summary: ProjectSummary;
  get_schedule_slice: ScheduleSliceResult | NormalizedMutationResult;
  find_tasks: FindTasksResult;
  get_task_context: TaskContextResult | NormalizedMutationResult;
  create_tasks: NormalizedMutationResult;
  update_tasks: NormalizedMutationResult;
  move_tasks: NormalizedMutationResult;
  shift_tasks: NormalizedMutationResult;
  delete_tasks: NormalizedMutationResult;
  link_tasks: NormalizedMutationResult;
  unlink_tasks: NormalizedMutationResult;
  recalculate_project: NormalizedMutationResult;
  validate_schedule: ValidateScheduleResult;
};

export type NormalizedToolName = keyof NormalizedToolInputMap;

export type ToolHandlerKey =
  | 'getProjectSummary'
  | 'getScheduleSlice'
  | 'findTasks'
  | 'getTaskContext'
  | 'createTasks'
  | 'updateTasks'
  | 'moveTasks'
  | 'shiftTasks'
  | 'deleteTasks'
  | 'linkTasks'
  | 'unlinkTasks'
  | 'recalculateProject'
  | 'validateSchedule';

export type ToolDefinition<TName extends NormalizedToolName = NormalizedToolName> = {
  name: TName;
  description: string;
  inputSchema: ToolJsonSchema;
  handler: ToolHandlerKey;
  mutating: boolean;
};

export type ToolCommandCommit = {
  baseVersion: number;
  response: CommitProjectCommandResponse;
};

export type ToolCallContext = {
  actorType: ActorType;
  actorId?: string;
  defaultProjectId?: string;
  getProjectSummary(projectId: string): Promise<ProjectSummary>;
  listAllProjectTasks(projectId: string): Promise<Task[]>;
  getTask(projectId: string, taskId: string): Promise<Task | undefined>;
  getProjectScheduleOptions(projectId: string): Promise<{
    businessDays?: boolean;
    weekendPredicate?: (date: Date) => boolean;
  }>;
  commitCommand(projectId: string, command: ProjectCommand): Promise<ToolCommandCommit>;
  resolveProjectId(projectId?: string | null): string | undefined;
};

export type ToolCallResult<TData = unknown> =
  | {
      ok: true;
      data: TData;
    }
  | {
      ok: false;
      error: {
        code: 'invalid_request' | 'not_found' | 'unsupported_tool';
        message: string;
      };
      data?: TData;
    };

export type MutationAggregation = {
  baseVersion: number;
  newVersion?: number;
  changedTaskIds: string[];
  changedTasks: Task[];
  changedDependencyIds: string[];
  conflicts: Conflict[];
  snapshot?: ProjectSnapshot;
  reason?: NormalizedMutationReason;
};
