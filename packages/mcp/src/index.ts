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
  CreateTaskInput,
  UpdateTaskInput,
  CreateTasksBatchInput,
  BatchCreateResult,
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
  TaskDependency,
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

async function commitAgentCommand(
  projectId: string | undefined,
  command: ProjectCommand,
): Promise<import('./types.js').CommitProjectCommandResponse> {
  if (!projectId) {
    throw new Error(`[Permanent] Project ID is required.
Reason: All task mutations must go through the authoritative command pipeline.
Fix: Provide projectId parameter or set PROJECT_ID environment variable.`);
  }

  const version = await getProjectVersion(projectId);
  return commandService.commitCommand({
    projectId,
    clientRequestId: randomUUID(),
    baseVersion: version,
    command,
  }, 'agent');
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
): NormalizedMutationResult {
  return {
    status: 'rejected',
    reason,
    baseVersion,
    changedTaskIds: [],
    changedTasks: [],
    changedDependencyIds: [],
    conflicts: [],
    ...(snapshot ? { snapshot } : {}),
  };
}

function buildMutationResult(
  baseVersion: number,
  response: import('./types.js').CommitProjectCommandResponse,
  includeSnapshot: boolean = false,
): NormalizedMutationResult {
  if (!response.accepted) {
    return buildRejectedResult(
      baseVersion,
      normalizeRejectionReason(response.reason),
      includeSnapshot ? response.snapshot : undefined,
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

// Register list tools handler
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: PUBLIC_MCP_TOOLS,
}));

// Register call tool handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  await writeMcpDebugLog('tool_call_received', {
    tool: name,
    args,
    envProjectId: process.env.PROJECT_ID,
    dbPath: process.env.DB_PATH,
  });

  // Ping tool for connectivity testing
  if (name === 'ping') {
    await writeMcpDebugLog('tool_call_completed', {
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
    const resolvedProjectId = resolveProjectId(argProjectId);

    if (!resolvedProjectId) {
      throw new Error(`[Permanent] Project ID is required.
Reason: Project summary is scoped to one project.
Fix: Provide projectId or set PROJECT_ID.`);
    }

    return jsonResult(await getProjectSnapshotSummary(resolvedProjectId));
  }

  if (name === 'get_task_context') {
    const { taskId, projectId: argProjectId } = args as unknown as GetTaskContextInput;
    const resolvedProjectId = resolveProjectId(argProjectId);

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

    const summary = await getProjectSnapshotSummary(resolvedProjectId);
    const allTasks = await listAllProjectTasks(resolvedProjectId);
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
    const resolvedProjectId = resolveProjectId(input.projectId);

    if (!resolvedProjectId) {
      throw new Error(`[Permanent] Project ID is required.
Reason: Schedule slices are scoped to one project.
Fix: Provide projectId or set PROJECT_ID.`);
    }

    const summary = await getProjectSnapshotSummary(resolvedProjectId);
    const allTasks = await listAllProjectTasks(resolvedProjectId);
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
    const resolvedProjectId = resolveProjectId(input.projectId);

    if (!input.tasks || input.tasks.length === 0) {
      return jsonResult(buildRejectedResult(0, 'invalid_request'));
    }

    for (const task of input.tasks) {
      if (!isValidDateFormat(task.startDate) || !isValidDateFormat(task.endDate) || !isValidDateRange(task.startDate, task.endDate)) {
        return jsonResult(buildRejectedResult(0, 'invalid_request'));
      }
    }

    const { baseVersion, response } = await commitNormalizedCommand(
      resolvedProjectId,
      input.tasks.length === 1
        ? { type: 'create_task', task: input.tasks[0] }
        : { type: 'create_tasks_batch', tasks: input.tasks },
    );

    return jsonResult(buildMutationResult(baseVersion, response, input.includeSnapshot));
  }

  if (name === 'update_tasks') {
    const input = args as unknown as UpdateTasksInput;
    const resolvedProjectId = resolveProjectId(input.projectId);

    if (!input.updates || input.updates.length !== 1) {
      return jsonResult(buildRejectedResult(0, 'unsupported_operation'));
    }

    const update = input.updates[0];
    const hasMetadata = update.name !== undefined || update.color !== undefined || update.progress !== undefined;
    if (!update.id || !hasMetadata) {
      return jsonResult(buildRejectedResult(0, 'invalid_request'));
    }

    const { baseVersion, response } = await commitNormalizedCommand(resolvedProjectId, {
      type: 'update_task_fields',
      taskId: update.id,
      fields: {
        ...(update.name !== undefined ? { name: update.name } : {}),
        ...(update.color !== undefined ? { color: update.color } : {}),
        ...(update.progress !== undefined ? { progress: update.progress } : {}),
      },
    });

    return jsonResult(buildMutationResult(baseVersion, response, input.includeSnapshot));
  }

  if (name === 'move_tasks') {
    const input = args as unknown as MoveTasksInput;
    const resolvedProjectId = resolveProjectId(input.projectId);

    if (!input.moves || input.moves.length !== 1) {
      return jsonResult(buildRejectedResult(0, 'unsupported_operation'));
    }

    const move = input.moves[0];
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

    const { baseVersion, response } = await commitNormalizedCommand(resolvedProjectId, command);
    return jsonResult(buildMutationResult(baseVersion, response, input.includeSnapshot));
  }

  if (name === 'delete_tasks') {
    const input = args as unknown as DeleteTasksInput;
    const resolvedProjectId = resolveProjectId(input.projectId);

    if (!input.taskIds || input.taskIds.length === 0) {
      return jsonResult(buildRejectedResult(0, 'invalid_request'));
    }

    const { baseVersion, response } = await commitNormalizedCommand(resolvedProjectId, {
      type: input.taskIds.length === 1 ? 'delete_task' : 'delete_tasks',
      ...(input.taskIds.length === 1
        ? { taskId: input.taskIds[0] }
        : { taskIds: input.taskIds }),
    } as ProjectCommand);

    return jsonResult(buildMutationResult(baseVersion, response, input.includeSnapshot));
  }

  if (name === 'link_tasks') {
    const input = args as unknown as LinkTasksInput;
    const resolvedProjectId = resolveProjectId(input.projectId);

    if (!input.links || input.links.length !== 1) {
      return jsonResult(buildRejectedResult(0, 'unsupported_operation'));
    }

    const link = input.links[0];
    if (!link.predecessorTaskId || !link.successorTaskId) {
      return jsonResult(buildRejectedResult(0, 'invalid_request'));
    }
    if (link.type && !isValidDependencyType(link.type)) {
      return jsonResult(buildRejectedResult(0, 'invalid_request'));
    }

    const { baseVersion, response } = await commitNormalizedCommand(resolvedProjectId, {
      type: 'create_dependency',
      taskId: link.successorTaskId,
      dependency: {
        taskId: link.predecessorTaskId,
        type: link.type ?? 'FS',
        lag: link.lag ?? 0,
      },
    });

    return jsonResult(buildMutationResult(baseVersion, response, input.includeSnapshot));
  }

  if (name === 'unlink_tasks') {
    const input = args as unknown as UnlinkTasksInput;
    const resolvedProjectId = resolveProjectId(input.projectId);

    if (!input.links || input.links.length !== 1) {
      return jsonResult(buildRejectedResult(0, 'unsupported_operation'));
    }

    const link = input.links[0];
    if (!link.predecessorTaskId || !link.successorTaskId) {
      return jsonResult(buildRejectedResult(0, 'invalid_request'));
    }

    const { baseVersion, response } = await commitNormalizedCommand(resolvedProjectId, {
      type: 'remove_dependency',
      taskId: link.successorTaskId,
      depTaskId: link.predecessorTaskId,
    });

    return jsonResult(buildMutationResult(baseVersion, response, input.includeSnapshot));
  }

  if (name === 'shift_tasks') {
    const input = args as unknown as ShiftTasksInput;
    const resolvedProjectId = resolveProjectId(input.projectId);

    if (!resolvedProjectId) {
      throw new Error(`[Permanent] Project ID is required.
Reason: Shift operations are scoped to one project.
Fix: Provide projectId or set PROJECT_ID.`);
    }
    if (!input.shifts || input.shifts.length !== 1) {
      return jsonResult(buildRejectedResult(0, 'unsupported_operation'));
    }

    const shift = input.shifts[0];
    const task = await taskService.get(shift.taskId);
    if (!task) {
      const summary = await getProjectSnapshotSummary(resolvedProjectId);
      return jsonResult(buildRejectedResult(summary.version, 'not_found'));
    }

    const prisma = getPrisma();
    const opts = await getProjectScheduleOptionsForProject(prisma, resolvedProjectId);
    const startDate = parseDateOnly(task.startDate);
    const mode = shift.mode ?? (opts.businessDays ? 'working' : 'calendar');
    const nextStart = mode === 'working' && opts.weekendPredicate
      ? shiftBusinessDayOffset(startDate, shift.delta, opts.weekendPredicate)
      : new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate() + shift.delta));

    const { baseVersion, response } = await commitNormalizedCommand(resolvedProjectId, {
      type: 'move_task',
      taskId: shift.taskId,
      startDate: formatDateOnly(nextStart),
    });

    return jsonResult(buildMutationResult(baseVersion, response, input.includeSnapshot));
  }

  if (name === 'recalculate_project') {
    const input = args as RecalculateProjectInput;
    const resolvedProjectId = resolveProjectId(input.projectId);
    const { baseVersion, response } = await commitNormalizedCommand(resolvedProjectId, { type: 'recalculate_schedule' });
    return jsonResult(buildMutationResult(baseVersion, response, input.includeSnapshot));
  }

  if (name === 'validate_schedule') {
    const { projectId: argProjectId } = args as ValidateScheduleInput;
    const resolvedProjectId = resolveProjectId(argProjectId);

    if (!resolvedProjectId) {
      throw new Error(`[Permanent] Project ID is required.
Reason: Validation is scoped to one project.
Fix: Provide projectId or set PROJECT_ID.`);
    }

    const summary = await getProjectSnapshotSummary(resolvedProjectId);
    const allTasks = await listAllProjectTasks(resolvedProjectId);
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

  // create_task tool
  if (name === 'create_task') {
    const input = args as unknown as CreateTaskInput;
    const { projectId: argProjectId } = args as { projectId?: string };
    const resolvedProjectId = resolveProjectId(argProjectId);

    // DEBUG: Log projectId resolution
    console.error('[CREATE_TASK DEBUG] argProjectId:', argProjectId, 'env.PROJECT_ID:', process.env.PROJECT_ID, 'resolvedProjectId:', resolvedProjectId);
    await writeMcpDebugLog('create_task_resolved_project', {
      argProjectId,
      envProjectId: process.env.PROJECT_ID,
      resolvedProjectId,
      input,
    });

    // Validate date format
    if (!isValidDateFormat(input.startDate)) {
      throw new Error(`[Permanent] Invalid startDate format: ${input.startDate}.
Expected: YYYY-MM-DD (ISO date format).
Fix: Use format like 2026-03-18.`);
    }
    if (!isValidDateFormat(input.endDate)) {
      throw new Error(`[Permanent] Invalid endDate format: ${input.endDate}.
Expected: YYYY-MM-DD (ISO date format).
Fix: Use format like 2026-03-18.`);
    }

    // Validate date range
    if (!isValidDateRange(input.startDate, input.endDate)) {
      throw new Error(`[Permanent] Invalid date range: startDate (${input.startDate}) must be ≤ endDate (${input.endDate}).
Reason: End date cannot be before start date.
Fix: Adjust dates so startDate ≤ endDate.`);
    }

    // Validate dependencies
    if (input.dependencies) {
      for (let i = 0; i < input.dependencies.length; i++) {
        const dep = input.dependencies[i];
        if (!isValidDependencyType(dep.type)) {
          throw new Error(`[Permanent] Invalid dependency type at index ${i}: ${dep.type}.
Must be one of: FS, SS, FF, SF.
Fix: Use valid dependency type.`);
        }
      }
    }

    const response = await commitAgentCommand(resolvedProjectId, { type: 'create_task', task: input });
    if (!response.accepted) {
      return {
        content: [{ type: 'text', text: `Command rejected: ${response.reason}` }],
      };
    }

    const createdTask = response.result.snapshot.tasks.find(t =>
      response.result.changedTaskIds.includes(t.id),
    ) || response.snapshot.tasks[response.snapshot.tasks.length - 1];

    await writeMcpDebugLog('tool_call_completed', {
      tool: name,
      resolvedProjectId,
      createdTaskId: createdTask?.id,
      viaCommandService: true,
      newVersion: response.newVersion,
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            task: createdTask,
            message: 'Task created successfully',
            affectedTasks: response.result.changedTaskIds.length,
          }, null, 2),
        },
      ],
    };
  }

  // get_tasks tool
  if (name === 'get_tasks') {
    const { projectId: argProjectId, parentId, limit = 100, offset = 0, full = false } = args as any;
    // If caller explicitly passes null, return all tasks; otherwise default to PROJECT_ID env
    const resolvedProjectId = argProjectId === null
      ? undefined
      : resolveProjectId(argProjectId);
    const result = await taskService.list(resolvedProjectId, parentId, limit, offset);

    // Compact mode: strip dependencies and sortOrder to save tokens
    const tasks = full
      ? result.tasks
      : result.tasks.map(({ dependencies: _deps, sortOrder: _sort, ...compact }) => compact);

    await writeMcpDebugLog('tool_call_completed', {
      tool: name,
      resolvedProjectId,
      parentId,
      limit,
      offset,
      full,
      taskCount: result.tasks.length,
      hasMore: result.hasMore,
      total: result.total,
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ tasks, hasMore: result.hasMore, total: result.total }, null, 2),
        },
      ],
    };
  }

  // get_task tool
  if (name === 'get_task') {
    const { id, includeChildren = false } = args as any;
    if (!id) {
      throw new Error(`[Permanent] Missing required parameter: id.
Reason: Task ID is required to identify which task to retrieve.
Fix: Provide the task ID as a string parameter.`);
    }

    const task = await taskService.get(id, includeChildren);
    if (!task) {
      throw new Error(`[Permanent] Task not found: ${id}.
Reason: No task with this ID exists in the project.
Fix: Call get_tasks to list available task IDs.`);
    }
    await writeMcpDebugLog('tool_call_completed', {
      tool: name,
      taskId: id,
      includeChildren,
      task,
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(task, null, 2),
        },
      ],
    };
  }

  // update_task tool
  if (name === 'update_task') {
    const input = args as unknown as UpdateTaskInput;
    const { id } = input;

    if (!id) {
      throw new Error(`[Permanent] Missing required parameter: id.
Reason: Task ID is required to identify which task to update.
Fix: Provide the task ID as a string parameter.`);
    }

    // Check if at least one optional field is provided
    const hasUpdates =
      input.name !== undefined ||
      input.startDate !== undefined ||
      input.endDate !== undefined ||
      input.color !== undefined ||
      input.parentId !== undefined ||
      input.progress !== undefined ||
      input.dependencies !== undefined;

    if (!hasUpdates) {
      throw new Error(`[Permanent] No update fields provided.
Reason: At least one field (name, startDate, endDate, color, parentId, progress, dependencies) must be provided.
Fix: Include at least one field to update.`);
    }

    // Validate date format if dates are provided
    if (input.startDate && !isValidDateFormat(input.startDate)) {
      throw new Error(`[Permanent] Invalid startDate format: ${input.startDate}.
Expected: YYYY-MM-DD (ISO date format).
Fix: Use format like 2026-03-18.`);
    }
    if (input.endDate && !isValidDateFormat(input.endDate)) {
      throw new Error(`[Permanent] Invalid endDate format: ${input.endDate}.
Expected: YYYY-MM-DD (ISO date format).
Fix: Use format like 2026-03-18.`);
    }

    // Validate date range if both dates are provided
    const currentTask = await taskService.get(id);
    if (currentTask) {
      const startDate = input.startDate ?? currentTask.startDate;
      const endDate = input.endDate ?? currentTask.endDate;
      if (!isValidDateRange(startDate, endDate)) {
        throw new Error(`[Permanent] Invalid date range: startDate (${startDate}) must be ≤ endDate (${endDate}).
Reason: End date cannot be before start date.
Fix: Adjust dates so startDate ≤ endDate.`);
      }
    }

    // Validate dependencies if provided
    if (input.dependencies) {
      for (let i = 0; i < input.dependencies.length; i++) {
        const dep = input.dependencies[i];
        if (!isValidDependencyType(dep.type)) {
          throw new Error(`[Permanent] Invalid dependency type at index ${i}: ${dep.type}.
Must be one of: FS, SS, FF, SF.
Fix: Use valid dependency type.`);
        }
      }
    }

    const resolvedProjectId = resolveProjectId(undefined);
    if (!currentTask) {
      throw new Error(`[Permanent] Task not found: ${id}.
Reason: No task with this ID exists in the project.
Fix: Call get_tasks to list available task IDs.`);
    }

    let command: ProjectCommand;
    const hasDateChanges = input.startDate !== undefined || input.endDate !== undefined;

    if (hasDateChanges) {
      if (input.startDate !== undefined && input.endDate !== undefined) {
        command = { type: 'move_task', taskId: id, startDate: input.startDate };
      } else if (input.startDate !== undefined) {
        command = { type: 'resize_task', taskId: id, anchor: 'start', date: input.startDate };
      } else {
        command = { type: 'resize_task', taskId: id, anchor: 'end', date: input.endDate! };
      }
    } else {
      command = {
        type: 'update_task_fields',
        taskId: id,
        fields: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.color !== undefined ? { color: input.color } : {}),
          ...(input.parentId !== undefined ? { parentId: input.parentId ?? null } : {}),
          ...(input.progress !== undefined ? { progress: input.progress } : {}),
          ...(input.dependencies !== undefined ? { dependencies: input.dependencies } : {}),
          ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        },
      };
    }

    const response = await commitAgentCommand(resolvedProjectId, command);
    if (!response.accepted) {
      return {
        content: [{ type: 'text', text: `Command rejected: ${response.reason}` }],
      };
    }

    const updateResult = {
      task: response.result.snapshot.tasks.find(t => t.id === id),
      changedTasks: response.result.changedTaskIds
        .map(cid => response.result.snapshot.tasks.find(t => t.id === cid))
        .filter((t): t is NonNullable<typeof t> => t !== undefined),
      changedIds: response.result.changedTaskIds,
    };

    await writeMcpDebugLog('update_task_completed', {
      id,
      input,
      updateResult,
      viaCommandService: true,
      newVersion: response.newVersion,
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            task: updateResult.task,
            message: 'Task updated successfully',
            changedTasks: updateResult.changedTasks,
            changedIds: updateResult.changedIds,
          }, null, 2),
        },
      ],
    };
  }

  if (name === 'move_task') {
    const { taskId, startDate, projectId: argProjectId } = args as {
      taskId: string;
      startDate: string;
      projectId?: string;
    };
    const resolvedProjectId = resolveProjectId(argProjectId);

    if (!taskId) {
      throw new Error(`[Permanent] Missing required parameter: taskId.
Reason: Task ID is required to identify which task to move.
Fix: Provide the task ID as a string parameter.`);
    }
    if (!isValidDateFormat(startDate)) {
      throw new Error(`[Permanent] Invalid startDate format: ${startDate}.
Expected: YYYY-MM-DD (ISO date format).
Fix: Use format like 2026-03-18.`);
    }

    const response = await commitAgentCommand(resolvedProjectId, { type: 'move_task', taskId, startDate });
    if (!response.accepted) {
      return {
        content: [{ type: 'text', text: `Command rejected: ${response.reason}` }],
      };
    }

    const result = {
      task: response.result.snapshot.tasks.find(t => t.id === taskId),
      changedTasks: response.result.changedTaskIds
        .map(cid => response.result.snapshot.tasks.find(t => t.id === cid))
        .filter((t): t is NonNullable<typeof t> => t !== undefined),
      changedIds: response.result.changedTaskIds,
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  }

  if (name === 'resize_task') {
    const { taskId, anchor, date, projectId: argProjectId } = args as {
      taskId: string;
      anchor: 'start' | 'end';
      date: string;
      projectId?: string;
    };
    const resolvedProjectId = resolveProjectId(argProjectId);

    if (!taskId) {
      throw new Error(`[Permanent] Missing required parameter: taskId.
Reason: Task ID is required to identify which task to resize.
Fix: Provide the task ID as a string parameter.`);
    }
    if (anchor !== 'start' && anchor !== 'end') {
      throw new Error(`[Permanent] Invalid anchor: ${String(anchor)}.
Reason: Anchor must be either "start" or "end".
Fix: Use anchor="start" or anchor="end".`);
    }
    if (!isValidDateFormat(date)) {
      throw new Error(`[Permanent] Invalid date format: ${date}.
Expected: YYYY-MM-DD (ISO date format).
Fix: Use format like 2026-03-18.`);
    }

    const response = await commitAgentCommand(resolvedProjectId, { type: 'resize_task', taskId, anchor, date });
    if (!response.accepted) {
      return {
        content: [{ type: 'text', text: `Command rejected: ${response.reason}` }],
      };
    }

    const result = {
      task: response.result.snapshot.tasks.find(t => t.id === taskId),
      changedTasks: response.result.changedTaskIds
        .map(cid => response.result.snapshot.tasks.find(t => t.id === cid))
        .filter((t): t is NonNullable<typeof t> => t !== undefined),
      changedIds: response.result.changedTaskIds,
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  }

  if (name === 'recalculate_schedule') {
    const { taskId, projectId: argProjectId } = args as {
      taskId?: string;
      projectId?: string;
    };
    const resolvedProjectId = resolveProjectId(argProjectId);

    const response = await commitAgentCommand(resolvedProjectId, { type: 'recalculate_schedule', taskId });
    if (!response.accepted) {
      return {
        content: [{ type: 'text', text: `Command rejected: ${response.reason}` }],
      };
    }

    const result = {
      task: taskId ? response.result.snapshot.tasks.find(t => t.id === taskId) : undefined,
      changedTasks: response.result.changedTaskIds
        .map(cid => response.result.snapshot.tasks.find(t => t.id === cid))
        .filter((t): t is NonNullable<typeof t> => t !== undefined),
      changedIds: response.result.changedTaskIds,
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  }

  // delete_task tool
  if (name === 'delete_task') {
    const { id } = args as { id: string };
    if (!id) {
      throw new Error(`[Permanent] Missing required parameter: id.
Reason: Task ID is required to identify which task to delete.
Fix: Provide the task ID as a string parameter.`);
    }

    const resolvedProjectId = resolveProjectId(undefined);
    const response = await commitAgentCommand(resolvedProjectId, { type: 'delete_task', taskId: id });
    if (!response.accepted) {
      return {
        content: [{ type: 'text', text: `Command rejected: ${response.reason}` }],
      };
    }
    await writeMcpDebugLog('tool_call_completed', {
      tool: name,
      deletedTaskId: id,
      viaCommandService: true,
      changedIds: response.result.changedTaskIds,
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ success: true, deleted: id, changedIds: response.result.changedTaskIds }, null, 2),
        },
      ],
    };
  }

  // create_tasks_batch tool
  if (name === 'create_tasks_batch') {
    const input = args as unknown as CreateTasksBatchInput;
    const { projectId: argProjectId } = args as { projectId?: string };
    const resolvedProjectId = resolveProjectId(argProjectId);

    console.error('[CREATE_TASKS_BATCH DEBUG] argProjectId:', argProjectId, 'env.PROJECT_ID:', process.env.PROJECT_ID, 'resolvedProjectId:', resolvedProjectId);
    await writeMcpDebugLog('create_tasks_batch_resolved_project', {
      argProjectId,
      envProjectId: process.env.PROJECT_ID,
      resolvedProjectId,
      input,
    });

    // Validate baseStartDate format
    if (!isValidDateFormat(input.baseStartDate)) {
      throw new Error(`[Permanent] Invalid baseStartDate format: ${input.baseStartDate}.
Expected: YYYY-MM-DD (ISO date format).
Fix: Use format like 2026-03-18.`);
    }

    // Validate workTypes
    if (!input.workTypes || input.workTypes.length === 0) {
      throw new Error(`[Permanent] workTypes must be a non-empty array.
Reason: At least one work type is required to create tasks.
Fix: Provide workTypes array with at least one item (e.g., [{ name: "Foundation", duration: 5 }]).`);
    }

    // Validate repeatBy has at least one repeat parameter
    const repeatKeys = Object.keys(input.repeatBy);
    if (repeatKeys.length === 0) {
      throw new Error(`[Permanent] repeatBy must contain at least one repeat parameter.
Reason: Need at least one dimension to repeat tasks across (sections, floors, etc.).
Fix: Provide repeatBy object with at least one array (e.g., { sections: [1, 2, 3] }).`);
    }

    const streams = input.streams || 1;
    const nameTemplate = input.nameTemplate || '{workType} {section} секция {floor} этаж';

    // Calculate total combinations for stream distribution
    const sections = input.repeatBy.sections || [1];
    const floors = input.repeatBy.floors || [1];
    const totalCombinations = sections.length * floors.length * input.workTypes.length;
    const combinationsPerStream = Math.ceil(totalCombinations / streams);

    const createdTasks: string[] = [];
    const failedTasks: Array<{ index: number; error: string }> = [];
    let combinationIndex = 0;
    const previousTaskIds: (string | null)[] = new Array(streams).fill(null);

    // Generate all task combinations
    for (const section of sections) {
      for (const floor of floors) {
        for (const workType of input.workTypes) {
          const streamIndex = Math.floor(combinationIndex / combinationsPerStream);
          const currentStream = Math.min(streamIndex, streams - 1);

          try {
            // Calculate task dates
            let startDate: string;
            if (combinationIndex === 0 || previousTaskIds[currentStream] === null) {
              startDate = input.baseStartDate;
            } else {
              const prevTask = await taskService.get(previousTaskIds[currentStream]!);
              if (!prevTask) {
                startDate = input.baseStartDate;
              } else {
                const prevEnd = new Date(prevTask.endDate);
                prevEnd.setDate(prevEnd.getDate() + 1);
                startDate = prevEnd.toISOString().split('T')[0];
              }
            }

            // Calculate end date from duration
            const start = new Date(startDate);
            const end = new Date(start);
            end.setDate(start.getDate() + workType.duration - 1);
            const endDate = end.toISOString().split('T')[0];

            // Generate task name from template
            const taskName = nameTemplate
              .replace('{workType}', workType.name)
              .replace('{section}', String(section))
              .replace('{floor}', String(floor));

            // Create dependencies (FS link to previous task in same stream)
            const dependencies: TaskDependency[] = [];
            if (previousTaskIds[currentStream]) {
              dependencies.push({
                taskId: previousTaskIds[currentStream]!,
                type: 'FS',
              });
            }

            const response = await commitAgentCommand(resolvedProjectId, {
              type: 'create_task',
              task: {
                name: taskName,
                startDate,
                endDate,
                dependencies,
              },
            });

            if (!response.accepted) {
              throw new Error(`Command rejected: ${response.reason}`);
            }

            const createdTask = response.result.snapshot.tasks.find((task) =>
              response.result.changedTaskIds.includes(task.id),
            );

            if (!createdTask) {
              throw new Error('Created task missing from authoritative snapshot');
            }

            createdTasks.push(createdTask.id);
            previousTaskIds[currentStream] = createdTask.id;

          } catch (error) {
            failedTasks.push({
              index: combinationIndex,
              error: error instanceof Error ? error.message : String(error),
            });
          }

          combinationIndex++;
        }
      }
    }

    const result: BatchCreateResult = {
      created: createdTasks.length,
      taskIds: createdTasks,
    };

    if (failedTasks.length > 0) {
      result.failed = failedTasks;
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ...result,
            message: `Batch creation complete: ${createdTasks.length} tasks created${failedTasks.length > 0 ? `, ${failedTasks.length} failed` : ''}`,
          }, null, 2),
        },
      ],
    };
  }

  // get_conversation_history tool
  if (name === 'get_conversation_history') {
    const { projectId: argProjectId, limit } = args as GetConversationHistoryInput & { limit?: number };
    const resolvedProjectId = resolveProjectId(argProjectId);

    // Validate projectId is available
    if (!resolvedProjectId) {
      throw new Error(`[Permanent] Project ID is required.
Reason: Conversation history is scoped to a project.
Fix: Provide projectId parameter or set PROJECT_ID environment variable.`);
    }

    // Validate and clamp limit parameter
    const defaultLimit = 20;
    const maxLimit = 50;
    const messageLimit = Math.min(Math.max(limit ?? defaultLimit, 1), maxLimit);

    // Fetch all messages for the project
    const allMessages = await messageService.list(resolvedProjectId);

    // Return the last N messages (most recent first)
    const recentMessages = allMessages.slice(-messageLimit).reverse();

    await writeMcpDebugLog('tool_call_completed', {
      tool: name,
      resolvedProjectId,
      totalMessages: allMessages.length,
      returnedMessages: recentMessages.length,
      limit: messageLimit,
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            messages: recentMessages,
            total: allMessages.length,
            returned: recentMessages.length,
            limit: messageLimit,
          }, null, 2),
        },
      ],
    };
  }

  // add_message tool
  if (name === 'add_message') {
    const input = args as unknown as AddMessageInput;
    const { projectId: argProjectId } = args as { projectId?: string };
    const resolvedProjectId = resolveProjectId(argProjectId);

    // Validate projectId is available
    if (!resolvedProjectId) {
      throw new Error(`[Permanent] Project ID is required.
Reason: Conversation history is scoped to a project.
Fix: Provide projectId parameter or set PROJECT_ID environment variable.`);
    }

    // Validate content
    if (!input.content || input.content.trim().length === 0) {
      throw new Error(`[Permanent] content is required and must be non-empty.
Reason: Empty messages cannot be recorded to conversation history.
Fix: Provide a non-empty content string with your response.`);
    }

    // Add the message (always as 'assistant' role)
    const message = await messageService.add('assistant', input.content.trim(), resolvedProjectId);

    await writeMcpDebugLog('tool_call_completed', {
      tool: name,
      resolvedProjectId,
      messageId: message.id,
      contentLength: message.content.length,
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            message,
            success: true,
          }, null, 2),
        },
      ],
    };
  }

  // set_dependency tool
  if (name === 'set_dependency') {
    const { taskId, dependsOnTaskId, type = 'FS', lag = 0 } = args as {
      taskId: string;
      dependsOnTaskId: string;
      type?: 'FS' | 'SS' | 'FF' | 'SF';
      lag?: number;
    };

    if (!taskId) {
      throw new Error(`[Permanent] Missing required parameter: taskId.
Reason: Task ID is required to identify which task should have the dependency.
Fix: Provide the successor task ID as a string parameter.`);
    }

    if (!dependsOnTaskId) {
      throw new Error(`[Permanent] Missing required parameter: dependsOnTaskId.
Reason: Dependency task ID is required to identify which task this one depends on.
Fix: Provide the predecessor task ID as a string parameter.`);
    }

    if (!isValidDependencyType(type)) {
      throw new Error(`[Permanent] Invalid dependency type: ${type}.
Must be one of: FS, SS, FF, SF.
Fix: Use valid dependency type.`);
    }

    // Verify both tasks exist
    const tasks = await taskService.list(undefined, undefined, 1000, 0);
    const taskExists = tasks.tasks.find(t => t.id === taskId);
    const depTaskExists = tasks.tasks.find(t => t.id === dependsOnTaskId);

    if (!taskExists) {
      throw new Error(`[Permanent] Task not found: ${taskId}.
Reason: The successor task does not exist.
Fix: Call get_tasks to list available task IDs.`);
    }

    if (!depTaskExists) {
      throw new Error(`[Permanent] Dependency task not found: ${dependsOnTaskId}.
Reason: The predecessor task does not exist.
Fix: Call get_tasks to list available task IDs.`);
    }

    // Validate dependency doesn't already exist (get with full=true to load existing dependencies)
    const existingTask = await taskService.get(taskId, true);
    const existingDep = existingTask?.dependencies?.find(d => d.taskId === dependsOnTaskId);
    if (existingDep) {
      throw new Error(`[Permanent] Dependency already exists: task ${taskId} already depends on ${dependsOnTaskId}.
Reason: Duplicate dependencies are not allowed.
Fix: Check existing dependencies with get_task(id="${taskId}", full=true).`);
    }

    // Create the dependency by updating the task with new dependencies array
    const currentDependencies = existingTask?.dependencies || [];
    const updatedDependencies = [
      ...currentDependencies.filter(d => d.taskId !== dependsOnTaskId),
      { taskId: dependsOnTaskId, type, lag }
    ];

    const response = await commitAgentCommand(resolveProjectId(undefined), {
      type: 'create_dependency',
      taskId,
      dependency: {
        taskId: dependsOnTaskId,
        type,
        lag,
      },
    });
    if (!response.accepted) {
      return {
        content: [{ type: 'text', text: `Command rejected: ${response.reason}` }],
      };
    }

    const updatedTask = response.result.snapshot.tasks.find((task) => task.id === taskId);

    await writeMcpDebugLog('tool_call_completed', {
      tool: name,
      taskId,
      dependsOnTaskId,
      type,
      lag,
      updatedTask,
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            dependency: {
              taskId,
              dependsOnTaskId,
              type,
              lag,
            },
            message: `Dependency created: task ${taskId} now depends on ${dependsOnTaskId} (${type}${lag !== 0 ? ` with ${lag}d lag` : ''})`,
          }, null, 2),
        },
      ],
    };
  }

  // remove_dependency tool
  if (name === 'remove_dependency') {
    const { taskId, dependsOnTaskId } = args as {
      taskId: string;
      dependsOnTaskId: string;
    };

    if (!taskId) {
      throw new Error(`[Permanent] Missing required parameter: taskId.
Reason: Task ID is required to identify which task has the dependency.
Fix: Provide the task ID as a string parameter.`);
    }

    if (!dependsOnTaskId) {
      throw new Error(`[Permanent] Missing required parameter: dependsOnTaskId.
Reason: Dependency task ID is required to identify which dependency to remove.
Fix: Provide the dependency task ID as a string parameter.`);
    }

    // Get current task with full dependencies
    const existingTask = await taskService.get(taskId, true);
    if (!existingTask) {
      throw new Error(`[Permanent] Task not found: ${taskId}.
Reason: The task does not exist.
Fix: Call get_tasks to list available task IDs.`);
    }

    // Check if dependency exists
    const existingDep = existingTask?.dependencies?.find(d => d.taskId === dependsOnTaskId);
    if (!existingDep) {
      throw new Error(`[Permanent] Dependency not found: task ${taskId} does not depend on ${dependsOnTaskId}.
Reason: The dependency to remove does not exist.
Fix: Check existing dependencies with get_task(id="${taskId}", full=true).`);
    }

    // Remove the dependency by updating the task without this dependency
    const updatedDependencies = (existingTask.dependencies || []).filter(d => d.taskId !== dependsOnTaskId);
    const response = await commitAgentCommand(resolveProjectId(undefined), {
      type: 'remove_dependency',
      taskId,
      depTaskId: dependsOnTaskId,
    });
    if (!response.accepted) {
      return {
        content: [{ type: 'text', text: `Command rejected: ${response.reason}` }],
      };
    }

    const updatedTask = response.result.snapshot.tasks.find((task) => task.id === taskId);

    await writeMcpDebugLog('tool_call_completed', {
      tool: name,
      taskId,
      dependsOnTaskId,
      updatedTask,
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            removed: {
              taskId,
              dependsOnTaskId,
            },
            message: `Dependency removed: task ${taskId} no longer depends on ${dependsOnTaskId}`,
          }, null, 2),
        },
      ],
    };
  }

  await writeMcpDebugLog('tool_call_failed', {
    tool: name,
    error: `Unknown tool: ${name}`,
  });
  throw new Error(`[Permanent] Unknown tool: ${name}.
Reason: Tool name not found in MCP server registry.
Fix: Check available tools via tools/list request and use only the published normalized surface.`);
});

// Start server with stdio transport
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Server runs via stdio, no explicit listen needed
  // Process will stay alive as long as stdio is open
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
