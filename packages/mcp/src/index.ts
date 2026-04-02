// Load environment variables BEFORE importing services
// Use explicit path to .env relative to this file's location (__dirname = packages/mcp/dist)
// so that DATABASE_URL is available regardless of the process working directory.
import { config as dotenvConfig } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dotenvDir = dirname(__filename);
dotenvConfig({ path: resolve(__dotenvDir, '../../../.env') });
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import {
  parseDateOnly,
  shiftBusinessDayOffset,
  validateDependencies,
} from 'gantt-lib/core/scheduling';
import { writeMcpDebugLog } from './debug-log.js';

// Import services AFTER dotenv is configured
import { taskService } from './services/task.service.js';
import { commandService } from './services/command.service.js';
import { messageService } from './services/message.service.js';
import { getProjectScheduleOptionsForProject } from './services/projectScheduleOptions.js';
import { getPrisma } from './prisma.js';
import type {
  AddMessageInput,
  CreateTasksInput,
  DeleteTasksInput,
  GetConversationHistoryInput,
  GetProjectSummaryInput,
  GetScheduleSliceInput,
  GetTaskContextInput,
  LinkTasksInput,
  MoveTasksInput,
  NormalizedMutationReason,
  NormalizedMutationResult,
  ProjectCommand,
  ProjectSummary,
  RecalculateProjectInput,
  ShiftTasksInput,
  Task,
  TaskContextResult,
  UnlinkTasksInput,
  UpdateTasksInput,
  ValidateScheduleInput,
  ValidateScheduleResult,
} from './types.js';
import { randomUUID } from 'node:crypto';
import { LEGACY_SCHEDULING_TOOL_NAMES, PUBLIC_MCP_TOOLS } from './public-tools.js';

// Create MCP server instance
const server = new Server(
  {
    name: 'gantt-lib-mcp-server',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Date validation regex for YYYY-MM-DD format
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// Valid dependency types
const VALID_DEPENDENCY_TYPES = ['FS', 'SS', 'FF', 'SF'];

function normalizeProjectId(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function resolveProjectId(argProjectId: unknown): string | undefined {
  return normalizeProjectId(argProjectId) ?? normalizeProjectId(process.env.PROJECT_ID);
}

/**
 * Validate date format (YYYY-MM-DD)
 */
function isValidDateFormat(dateStr: string): boolean {
  return DATE_REGEX.test(dateStr);
}

/**
 * Validate date range (startDate <= endDate)
 */
function isValidDateRange(startDate: string, endDate: string): boolean {
  return startDate <= endDate;
}

/**
 * Validate dependency type
 */
function isValidDependencyType(type: string): type is 'FS' | 'SS' | 'FF' | 'SF' {
  return VALID_DEPENDENCY_TYPES.includes(type);
}

/**
 * Get current project version for optimistic concurrency
 */
async function getProjectVersion(projectId: string): Promise<number> {
  const prisma = getPrisma();
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { version: true },
  });
  return project?.version ?? 0;
}

async function commitNormalizedCommand(
  projectId: string | undefined,
  command: ProjectCommand,
): Promise<{ baseVersion: number; response: import('./types.js').CommitProjectCommandResponse }> {
  if (!projectId) {
    throw new Error(`[Permanent] Project ID is required.
Reason: All task mutations must go through the authoritative command pipeline.
Fix: Provide projectId parameter or set PROJECT_ID environment variable.`);
  }

  const baseVersion = await getProjectVersion(projectId);
  const response = await commandService.commitCommand({
    projectId,
    clientRequestId: randomUUID(),
    baseVersion,
    command,
  }, 'agent');

  return { baseVersion, response };
}

function jsonResult(payload: unknown) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(payload, null, 2),
      },
    ],
  };
}

function normalizeRejectionReason(reason: string | undefined): NormalizedMutationReason {
  switch (reason) {
    case 'version_conflict':
    case 'validation_error':
    case 'conflict':
    case 'not_found':
    case 'invalid_request':
    case 'unsupported_operation':
      return reason;
    default:
      return 'validation_error';
  }
}

function buildRejectedResult(
  baseVersion: number,
  reason: NormalizedMutationReason,
  snapshot?: import('./types.js').ProjectSnapshot,
  partial?: Pick<NormalizedMutationResult, 'changedTaskIds' | 'changedTasks' | 'changedDependencyIds' | 'conflicts'>,
): NormalizedMutationResult {
  return {
    status: 'rejected',
    reason,
    baseVersion,
    changedTaskIds: partial?.changedTaskIds ?? [],
    changedTasks: partial?.changedTasks ?? [],
    changedDependencyIds: partial?.changedDependencyIds ?? [],
    conflicts: partial?.conflicts ?? [],
    ...(snapshot ? { snapshot } : {}),
  };
}

function buildMutationResult(
  baseVersion: number,
  response: import('./types.js').CommitProjectCommandResponse,
  includeSnapshot: boolean = false,
  partial?: Pick<NormalizedMutationResult, 'changedTaskIds' | 'changedTasks' | 'changedDependencyIds' | 'conflicts'>,
): NormalizedMutationResult {
  if (!response.accepted) {
    return buildRejectedResult(
      baseVersion,
      normalizeRejectionReason(response.reason),
      includeSnapshot ? response.snapshot : undefined,
      partial,
    );
  }

  const changedTaskIds = response.result.changedTaskIds;
  const changedTasks = changedTaskIds
    .map((taskId) => response.snapshot.tasks.find((task) => task.id === taskId))
    .filter((task): task is Task => Boolean(task));

  return {
    status: 'accepted',
    baseVersion,
    newVersion: response.newVersion,
    changedTaskIds,
    changedTasks,
    changedDependencyIds: response.result.changedDependencyIds,
    conflicts: response.result.conflicts,
    ...(includeSnapshot ? { snapshot: response.snapshot } : {}),
  };
}

type MutationAggregationState = {
  initialBaseVersion?: number;
  latestVersion?: number;
  latestSnapshot?: import('./types.js').ProjectSnapshot;
  changedTaskIds: Set<string>;
  changedDependencyIds: Set<string>;
  conflicts: import('./types.js').Conflict[];
};

function createMutationAggregationState(): MutationAggregationState {
  return {
    changedTaskIds: new Set<string>(),
    changedDependencyIds: new Set<string>(),
    conflicts: [],
  };
}

function mergeConflicts(
  existing: import('./types.js').Conflict[],
  incoming: import('./types.js').Conflict[],
): import('./types.js').Conflict[] {
  const byKey = new Map<string, import('./types.js').Conflict>();
  for (const conflict of [...existing, ...incoming]) {
    byKey.set(`${conflict.entityType}:${conflict.entityId}:${conflict.reason}:${conflict.detail ?? ''}`, conflict);
  }
  return [...byKey.values()];
}

function addMutationResultToAggregation(
  aggregation: MutationAggregationState,
  baseVersion: number,
  response: import('./types.js').CommitProjectCommandResponse,
): void {
  if (aggregation.initialBaseVersion === undefined) {
    aggregation.initialBaseVersion = baseVersion;
  }

  if (!response.accepted) {
    aggregation.latestSnapshot = response.snapshot ?? aggregation.latestSnapshot;
    return;
  }

  aggregation.latestVersion = response.newVersion;
  aggregation.latestSnapshot = response.snapshot;
  for (const taskId of response.result.changedTaskIds) {
    aggregation.changedTaskIds.add(taskId);
  }
  for (const dependencyId of response.result.changedDependencyIds) {
    aggregation.changedDependencyIds.add(dependencyId);
  }
  aggregation.conflicts = mergeConflicts(aggregation.conflicts, response.result.conflicts);
}

function buildPartialMutationAggregate(
  aggregation: MutationAggregationState,
): Pick<NormalizedMutationResult, 'changedTaskIds' | 'changedTasks' | 'changedDependencyIds' | 'conflicts'> {
  const changedTaskIds = [...aggregation.changedTaskIds].sort();
  const changedTasks = changedTaskIds
    .map((taskId) => aggregation.latestSnapshot?.tasks.find((task) => task.id === taskId))
    .filter((task): task is Task => Boolean(task));

  return {
    changedTaskIds,
    changedTasks,
    changedDependencyIds: [...aggregation.changedDependencyIds].sort(),
    conflicts: aggregation.conflicts,
  };
}

function finalizeAcceptedMutationAggregation(
  aggregation: MutationAggregationState,
  includeSnapshot: boolean = false,
): NormalizedMutationResult {
  const partial = buildPartialMutationAggregate(aggregation);
  return {
    status: 'accepted',
    baseVersion: aggregation.initialBaseVersion ?? 0,
    newVersion: aggregation.latestVersion,
    ...partial,
    ...(includeSnapshot && aggregation.latestSnapshot ? { snapshot: aggregation.latestSnapshot } : {}),
  };
}

function finalizeRejectedMutationAggregation(
  aggregation: MutationAggregationState,
  baseVersion: number,
  reason: NormalizedMutationReason,
  snapshot?: import('./types.js').ProjectSnapshot,
  includeSnapshot: boolean = false,
): NormalizedMutationResult {
  return buildRejectedResult(
    aggregation.initialBaseVersion ?? baseVersion,
    reason,
    includeSnapshot ? (snapshot ?? aggregation.latestSnapshot) : undefined,
    buildPartialMutationAggregate(aggregation),
  );
}

async function executeNormalizedMutationBatch(
  projectId: string | undefined,
  commands: ProjectCommand[],
  includeSnapshot: boolean = false,
  commitCommandImpl: typeof commitNormalizedCommand = commitNormalizedCommand,
): Promise<NormalizedMutationResult> {
  const aggregation = createMutationAggregationState();

  for (const command of commands) {
    const { baseVersion, response } = await commitCommandImpl(projectId, command);
    addMutationResultToAggregation(aggregation, baseVersion, response);

    if (!response.accepted) {
      return finalizeRejectedMutationAggregation(
        aggregation,
        baseVersion,
        normalizeRejectionReason(response.reason),
        response.snapshot,
        includeSnapshot,
      );
    }
  }

  return finalizeAcceptedMutationAggregation(aggregation, includeSnapshot);
}

async function listAllProjectTasks(projectId: string): Promise<Task[]> {
  const allTasks: Task[] = [];
  let offset = 0;
  const pageSize = 500;

  while (true) {
    const page = await taskService.list(projectId, undefined, pageSize, offset);
    allTasks.push(...page.tasks);
    if (!page.hasMore) {
      break;
    }
    offset += pageSize;
  }

  return allTasks;
}

async function getProjectSnapshotSummary(projectId: string): Promise<ProjectSummary> {
  const prisma = getPrisma();
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      version: true,
      ganttDayMode: true,
      tasks: {
        select: {
          id: true,
          parentId: true,
          startDate: true,
          endDate: true,
          dependencies: true,
        },
      },
    },
  });

  if (!project) {
    throw new Error(`[Permanent] Project not found: ${projectId}.
Reason: The requested project does not exist.
Fix: Provide an existing projectId or set PROJECT_ID correctly.`);
  }

  const tasks = project.tasks.map((task: any) => ({
    id: task.id,
    name: '',
    startDate: String(task.startDate).split('T')[0],
    endDate: String(task.endDate).split('T')[0],
    parentId: task.parentId ?? undefined,
    dependencies: (task.dependencies ?? []).map((dependency: any) => ({
      taskId: dependency.depTaskId,
      type: dependency.type,
      lag: dependency.lag,
    })),
  }));
  const validation = validateDependencies(tasks);
  const sortedByStart = [...tasks].sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)));
  const sortedByEnd = [...tasks].sort((a, b) => String(a.endDate).localeCompare(String(b.endDate)));
  const healthFlags: string[] = [];

  if (!validation.isValid) {
    healthFlags.push('dependency_errors');
  }
  if (tasks.some((task) => task.parentId && !tasks.find((candidate) => candidate.id === task.parentId))) {
    healthFlags.push('orphaned_hierarchy_refs');
  }
  if (tasks.length === 0) {
    healthFlags.push('empty_project');
  }

  return {
    projectId: project.id,
    version: project.version,
    dayMode: project.ganttDayMode,
    effectiveDateRange: {
      startDate: sortedByStart[0]?.startDate ?? null,
      endDate: sortedByEnd[sortedByEnd.length - 1]?.endDate ?? null,
    },
    rootTaskCount: tasks.filter((task) => !task.parentId).length,
    totalTaskCount: tasks.length,
    healthFlags,
  };
}

function formatDateOnly(date: Date): string {
  return date.toISOString().split('T')[0];
}

type MpcHandlerDeps = {
  writeMcpDebugLog: typeof writeMcpDebugLog;
  commitNormalizedCommand: typeof commitNormalizedCommand;
  getProjectSnapshotSummary: typeof getProjectSnapshotSummary;
  listAllProjectTasks: typeof listAllProjectTasks;
  resolveProjectId: typeof resolveProjectId;
  taskService: Pick<typeof taskService, 'get'>;
  getPrisma: typeof getPrisma;
  getProjectScheduleOptionsForProject: typeof getProjectScheduleOptionsForProject;
};

const defaultMcpHandlerDeps: MpcHandlerDeps = {
  writeMcpDebugLog,
  commitNormalizedCommand,
  getProjectSnapshotSummary,
  listAllProjectTasks,
  resolveProjectId,
  taskService,
  getPrisma,
  getProjectScheduleOptionsForProject,
};

export async function handleListToolsRequest() {
  return {
    tools: PUBLIC_MCP_TOOLS,
  };
}

export async function handleCallToolRequest(
  request: { params: { name: string; arguments?: unknown } },
  deps: MpcHandlerDeps = defaultMcpHandlerDeps,
) {
  const { name, arguments: args } = request.params;
  await deps.writeMcpDebugLog('tool_call_received', {
    tool: name,
    args,
    envProjectId: process.env.PROJECT_ID,
    dbPath: process.env.DB_PATH,
  });

  // Ping tool for connectivity testing
  if (name === 'ping') {
    await deps.writeMcpDebugLog('tool_call_completed', {
      tool: name,
      result: 'pong',
    });
    return {
      content: [
        {
          type: 'text',
          text: 'pong',
        },
      ],
    };
  }

  if (LEGACY_SCHEDULING_TOOL_NAMES.has(name)) {
    return jsonResult(buildRejectedResult(0, 'unsupported_operation'));
  }

  if (name === 'get_project_summary') {
    const { projectId: argProjectId } = args as GetProjectSummaryInput;
    const resolvedProjectId = deps.resolveProjectId(argProjectId);

    if (!resolvedProjectId) {
      throw new Error(`[Permanent] Project ID is required.
Reason: Project summary is scoped to one project.
Fix: Provide projectId or set PROJECT_ID.`);
    }

    return jsonResult(await deps.getProjectSnapshotSummary(resolvedProjectId));
  }

  if (name === 'get_task_context') {
    const { taskId, projectId: argProjectId } = args as unknown as GetTaskContextInput;
    const resolvedProjectId = deps.resolveProjectId(argProjectId);

    if (!resolvedProjectId) {
      throw new Error(`[Permanent] Project ID is required.
Reason: Task context is scoped to one project.
Fix: Provide projectId or set PROJECT_ID.`);
    }
    if (!taskId) {
      throw new Error(`[Permanent] Missing required parameter: taskId.
Reason: Task context requires an exact task ID.
Fix: Provide taskId.`);
    }

    const summary = await deps.getProjectSnapshotSummary(resolvedProjectId);
    const allTasks = await deps.listAllProjectTasks(resolvedProjectId);
    const task = allTasks.find((candidate) => candidate.id === taskId);

    if (!task) {
      return jsonResult(buildRejectedResult(summary.version, 'not_found'));
    }

    const byId = new Map(allTasks.map((candidate) => [candidate.id, candidate]));
    const parents: Task[] = [];
    let currentParentId = task.parentId;
    while (currentParentId) {
      const parent = byId.get(currentParentId);
      if (!parent) {
        break;
      }
      parents.unshift(parent);
      currentParentId = parent.parentId;
    }

    const result: TaskContextResult = {
      version: summary.version,
      task,
      parents,
      children: allTasks.filter((candidate) => candidate.parentId === taskId),
      siblings: allTasks.filter((candidate) => candidate.parentId === task.parentId && candidate.id !== task.id),
      predecessors: (task.dependencies ?? []).map((dependency) => ({
        ...dependency,
        lag: dependency.lag ?? 0,
        task: byId.get(dependency.taskId),
      })),
      successors: allTasks
        .flatMap((candidate) => (candidate.dependencies ?? []).map((dependency) => ({
          taskId: candidate.id,
          type: dependency.type,
          lag: dependency.lag ?? 0,
          predecessorTaskId: dependency.taskId,
        })))
        .filter((dependency) => dependency.predecessorTaskId === taskId)
        .map((dependency) => ({
          taskId: dependency.taskId,
          type: dependency.type,
          lag: dependency.lag,
          task: byId.get(dependency.taskId),
        })),
    };

    return jsonResult(result);
  }

  if (name === 'get_schedule_slice') {
    const input = args as GetScheduleSliceInput;
    const resolvedProjectId = deps.resolveProjectId(input.projectId);

    if (!resolvedProjectId) {
      throw new Error(`[Permanent] Project ID is required.
Reason: Schedule slices are scoped to one project.
Fix: Provide projectId or set PROJECT_ID.`);
    }

    const summary = await deps.getProjectSnapshotSummary(resolvedProjectId);
    const allTasks = await deps.listAllProjectTasks(resolvedProjectId);
    let tasks: Task[] = [];
    let scope: import('./types.js').ScheduleSliceResult['scope'];

    if (input.taskIds && input.taskIds.length > 0) {
      const taskIdSet = new Set(input.taskIds);
      tasks = allTasks.filter((task) => taskIdSet.has(task.id));
      scope = {
        mode: 'task_ids',
        taskIds: input.taskIds,
        returnedTaskCount: tasks.length,
      };
    } else if (input.branchRootId) {
      const descendants = new Set<string>([input.branchRootId]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const task of allTasks) {
          if (task.parentId && descendants.has(task.parentId) && !descendants.has(task.id)) {
            descendants.add(task.id);
            changed = true;
          }
        }
      }
      tasks = allTasks.filter((task) => descendants.has(task.id));
      scope = {
        mode: 'branch_root',
        branchRootId: input.branchRootId,
        returnedTaskCount: tasks.length,
      };
    } else if (input.startDate || input.endDate) {
      const startDate = input.startDate ?? '0000-01-01';
      const endDate = input.endDate ?? '9999-12-31';
      tasks = allTasks.filter((task) => task.startDate <= endDate && task.endDate >= startDate);
      scope = {
        mode: 'date_window',
        startDate: input.startDate,
        endDate: input.endDate,
        returnedTaskCount: tasks.length,
      };
    } else {
      return jsonResult(buildRejectedResult(summary.version, 'invalid_request'));
    }

    return jsonResult({
      version: summary.version,
      scope,
      tasks,
    });
  }

  if (name === 'create_tasks') {
    const input = args as unknown as CreateTasksInput;
    const resolvedProjectId = deps.resolveProjectId(input.projectId);

    if (!input.tasks || input.tasks.length === 0) {
      return jsonResult(buildRejectedResult(0, 'invalid_request'));
    }

    for (const task of input.tasks) {
      if (!isValidDateFormat(task.startDate) || !isValidDateFormat(task.endDate) || !isValidDateRange(task.startDate, task.endDate)) {
        return jsonResult(buildRejectedResult(0, 'invalid_request'));
      }
    }

    const { baseVersion, response } = await deps.commitNormalizedCommand(
      resolvedProjectId,
      input.tasks.length === 1
        ? { type: 'create_task', task: input.tasks[0] }
        : { type: 'create_tasks_batch', tasks: input.tasks },
    );

    return jsonResult(buildMutationResult(baseVersion, response, input.includeSnapshot));
  }

  if (name === 'update_tasks') {
    const input = args as unknown as UpdateTasksInput;
    const resolvedProjectId = deps.resolveProjectId(input.projectId);

    if (!input.updates || input.updates.length === 0) {
      return jsonResult(buildRejectedResult(0, 'invalid_request'));
    }

    const commands: ProjectCommand[] = [];
    for (const update of input.updates) {
      const hasMetadata = update.name !== undefined || update.color !== undefined || update.progress !== undefined;
      if (!update.id || !hasMetadata) {
        return jsonResult(buildRejectedResult(0, 'invalid_request'));
      }

      commands.push({
        type: 'update_task_fields',
        taskId: update.id,
        fields: {
          ...(update.name !== undefined ? { name: update.name } : {}),
          ...(update.color !== undefined ? { color: update.color } : {}),
          ...(update.progress !== undefined ? { progress: update.progress } : {}),
        },
      });
    }

    return jsonResult(await executeNormalizedMutationBatch(resolvedProjectId, commands, input.includeSnapshot, deps.commitNormalizedCommand));
  }

  if (name === 'move_tasks') {
    const input = args as unknown as MoveTasksInput;
    const resolvedProjectId = deps.resolveProjectId(input.projectId);

    if (!input.moves || input.moves.length === 0) {
      return jsonResult(buildRejectedResult(0, 'invalid_request'));
    }

    const commands: ProjectCommand[] = [];
    for (const move of input.moves) {
      if (!move.taskId) {
        return jsonResult(buildRejectedResult(0, 'invalid_request'));
      }
      if (move.parentId !== undefined && move.sortOrder !== undefined) {
        return jsonResult(buildRejectedResult(0, 'unsupported_operation'));
      }

      const command: ProjectCommand | null = move.parentId !== undefined
        ? { type: 'reparent_task', taskId: move.taskId, newParentId: move.parentId ?? null }
        : move.sortOrder !== undefined
          ? { type: 'reorder_tasks', updates: [{ taskId: move.taskId, sortOrder: move.sortOrder }] }
          : null;

      if (!command) {
        return jsonResult(buildRejectedResult(0, 'invalid_request'));
      }

      commands.push(command);
    }

    return jsonResult(await executeNormalizedMutationBatch(resolvedProjectId, commands, input.includeSnapshot, deps.commitNormalizedCommand));
  }

  if (name === 'delete_tasks') {
    const input = args as unknown as DeleteTasksInput;
    const resolvedProjectId = deps.resolveProjectId(input.projectId);

    if (!input.taskIds || input.taskIds.length === 0) {
      return jsonResult(buildRejectedResult(0, 'invalid_request'));
    }

    const { baseVersion, response } = await deps.commitNormalizedCommand(resolvedProjectId, {
      type: input.taskIds.length === 1 ? 'delete_task' : 'delete_tasks',
      ...(input.taskIds.length === 1
        ? { taskId: input.taskIds[0] }
        : { taskIds: input.taskIds }),
    } as ProjectCommand);

    return jsonResult(buildMutationResult(baseVersion, response, input.includeSnapshot));
  }

  if (name === 'link_tasks') {
    const input = args as unknown as LinkTasksInput;
    const resolvedProjectId = deps.resolveProjectId(input.projectId);

    if (!input.links || input.links.length === 0) {
      return jsonResult(buildRejectedResult(0, 'invalid_request'));
    }

    const commands: ProjectCommand[] = [];
    for (const link of input.links) {
      if (!link.predecessorTaskId || !link.successorTaskId) {
        return jsonResult(buildRejectedResult(0, 'invalid_request'));
      }
      if (link.type && !isValidDependencyType(link.type)) {
        return jsonResult(buildRejectedResult(0, 'invalid_request'));
      }

      commands.push({
        type: 'create_dependency',
        taskId: link.successorTaskId,
        dependency: {
          taskId: link.predecessorTaskId,
          type: link.type ?? 'FS',
          lag: link.lag ?? 0,
        },
      });
    }

    return jsonResult(await executeNormalizedMutationBatch(resolvedProjectId, commands, input.includeSnapshot, deps.commitNormalizedCommand));
  }

  if (name === 'unlink_tasks') {
    const input = args as unknown as UnlinkTasksInput;
    const resolvedProjectId = deps.resolveProjectId(input.projectId);

    if (!input.links || input.links.length === 0) {
      return jsonResult(buildRejectedResult(0, 'invalid_request'));
    }

    const commands: ProjectCommand[] = [];
    for (const link of input.links) {
      if (!link.predecessorTaskId || !link.successorTaskId) {
        return jsonResult(buildRejectedResult(0, 'invalid_request'));
      }

      commands.push({
        type: 'remove_dependency',
        taskId: link.successorTaskId,
        depTaskId: link.predecessorTaskId,
      });
    }

    return jsonResult(await executeNormalizedMutationBatch(resolvedProjectId, commands, input.includeSnapshot, deps.commitNormalizedCommand));
  }

  if (name === 'shift_tasks') {
    const input = args as unknown as ShiftTasksInput;
    const resolvedProjectId = deps.resolveProjectId(input.projectId);

    if (!resolvedProjectId) {
      throw new Error(`[Permanent] Project ID is required.
Reason: Shift operations are scoped to one project.
Fix: Provide projectId or set PROJECT_ID.`);
    }
    if (!input.shifts || input.shifts.length === 0) {
      return jsonResult(buildRejectedResult(0, 'invalid_request'));
    }

    const aggregation = createMutationAggregationState();

    for (const shift of input.shifts) {
      const task = await deps.taskService.get(shift.taskId);
      if (!task) {
        const summary = await deps.getProjectSnapshotSummary(resolvedProjectId);
        return jsonResult(finalizeRejectedMutationAggregation(
          aggregation,
          summary.version,
          'not_found',
          undefined,
          input.includeSnapshot,
        ));
      }

      const prisma = deps.getPrisma();
      const opts = await deps.getProjectScheduleOptionsForProject(prisma, resolvedProjectId);
      const startDate = parseDateOnly(task.startDate);
      const mode = shift.mode ?? (opts.businessDays ? 'working' : 'calendar');
      const nextStart = mode === 'working' && opts.weekendPredicate
        ? shiftBusinessDayOffset(startDate, shift.delta, opts.weekendPredicate)
        : new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate() + shift.delta));

      const { baseVersion, response } = await deps.commitNormalizedCommand(resolvedProjectId, {
        type: 'move_task',
        taskId: shift.taskId,
        startDate: formatDateOnly(nextStart),
      });
      addMutationResultToAggregation(aggregation, baseVersion, response);

      if (!response.accepted) {
        return jsonResult(finalizeRejectedMutationAggregation(
          aggregation,
          baseVersion,
          normalizeRejectionReason(response.reason),
          response.snapshot,
          input.includeSnapshot,
        ));
      }
    }

    return jsonResult(finalizeAcceptedMutationAggregation(aggregation, input.includeSnapshot));
  }

  if (name === 'recalculate_project') {
    const input = args as RecalculateProjectInput;
    const resolvedProjectId = deps.resolveProjectId(input.projectId);
    const { baseVersion, response } = await deps.commitNormalizedCommand(resolvedProjectId, { type: 'recalculate_schedule' });
    return jsonResult(buildMutationResult(baseVersion, response, input.includeSnapshot));
  }

  if (name === 'validate_schedule') {
    const { projectId: argProjectId } = args as ValidateScheduleInput;
    const resolvedProjectId = deps.resolveProjectId(argProjectId);

    if (!resolvedProjectId) {
      throw new Error(`[Permanent] Project ID is required.
Reason: Validation is scoped to one project.
Fix: Provide projectId or set PROJECT_ID.`);
    }

    const summary = await deps.getProjectSnapshotSummary(resolvedProjectId);
    const allTasks = await deps.listAllProjectTasks(resolvedProjectId);
    const validation = validateDependencies(allTasks.map((task) => ({
      ...task,
      dependencies: (task.dependencies ?? []).map((dependency) => ({
        ...dependency,
        lag: dependency.lag ?? 0,
      })),
    })));

    const result: ValidateScheduleResult = {
      version: summary.version,
      isValid: validation.isValid,
      errors: validation.errors,
    };

    return jsonResult(result);
  }

  if (name === 'get_conversation_history') {
    const { projectId: argProjectId, limit } = args as GetConversationHistoryInput & { limit?: number };
    const resolvedProjectId = deps.resolveProjectId(argProjectId);

    if (!resolvedProjectId) {
      throw new Error(`[Permanent] Project ID is required.
Reason: Conversation history is scoped to a project.
Fix: Provide projectId parameter or set PROJECT_ID environment variable.`);
    }

    const defaultLimit = 20;
    const maxLimit = 50;
    const messageLimit = Math.min(Math.max(limit ?? defaultLimit, 1), maxLimit);
    const allMessages = await messageService.list(resolvedProjectId);
    const recentMessages = allMessages.slice(-messageLimit).reverse();

    await deps.writeMcpDebugLog('tool_call_completed', {
      tool: name,
      resolvedProjectId,
      totalMessages: allMessages.length,
      returnedMessages: recentMessages.length,
      limit: messageLimit,
    });

    return jsonResult({
      messages: recentMessages,
      total: allMessages.length,
      returned: recentMessages.length,
      limit: messageLimit,
    });
  }

  if (name === 'add_message') {
    const input = args as unknown as AddMessageInput;
    const { projectId: argProjectId } = args as { projectId?: string };
    const resolvedProjectId = deps.resolveProjectId(argProjectId);

    if (!resolvedProjectId) {
      throw new Error(`[Permanent] Project ID is required.
Reason: Conversation history is scoped to a project.
Fix: Provide projectId parameter or set PROJECT_ID environment variable.`);
    }

    if (!input.content || input.content.trim().length === 0) {
      throw new Error(`[Permanent] content is required and must be non-empty.
Reason: Empty messages cannot be recorded to conversation history.
Fix: Provide a non-empty content string with your response.`);
    }

    const message = await messageService.add('assistant', input.content.trim(), resolvedProjectId);

    await deps.writeMcpDebugLog('tool_call_completed', {
      tool: name,
      resolvedProjectId,
      messageId: message.id,
      contentLength: message.content.length,
    });

    return jsonResult({
      message,
      success: true,
    });
  }

  await deps.writeMcpDebugLog('tool_call_failed', {
    tool: name,
    error: `Unknown tool: ${name}`,
  });
  throw new Error(`[Permanent] Unknown tool: ${name}.
Reason: Tool name not found in MCP server registry.
Fix: Check available tools via tools/list request and use only the published normalized surface.`);
}

// Register list tools handler
server.setRequestHandler(ListToolsRequestSchema, handleListToolsRequest);

// Register call tool handler
server.setRequestHandler(CallToolRequestSchema, (request) => handleCallToolRequest(request, defaultMcpHandlerDeps));

// Start server with stdio transport
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Server runs via stdio, no explicit listen needed
  // Process will stay alive as long as stdio is open
}

if (process.argv[1] && resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    console.error('Server error:', error);
    process.exit(1);
  });
}
