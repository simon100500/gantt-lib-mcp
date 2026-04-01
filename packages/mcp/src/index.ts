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
import { writeMcpDebugLog } from './debug-log.js';

// Import services AFTER dotenv is configured
import { taskService } from './services/task.service.js';
import { commandService } from './services/command.service.js';
import { messageService } from './services/message.service.js';
import { dependencyService } from './services/dependency.service.js';
import { getPrisma } from './prisma.js';
import type {
  CreateTaskInput,
  UpdateTaskInput,
  CreateTasksBatchInput,
  BatchCreateResult,
  TaskDependency,
  GetConversationHistoryInput,
  AddMessageInput,
  ProjectCommand,
  CommitProjectCommandRequest,
} from './types.js';
import { randomUUID } from 'node:crypto';

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

// Register list tools handler
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'ping',
      description: 'Test MCP server connectivity. Returns "pong". Use for debugging connection issues.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'create_task',
      description: 'Create a Gantt task with name, dates, dependencies. Returns created task with cascade info. Supports parentId for hierarchy. Use get_tasks to list existing tasks before creating.',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Task name',
          },
          startDate: {
            type: 'string',
            description: 'Start date in ISO format: YYYY-MM-DD',
            pattern: '^\\d{4}-\\d{2}-\\d{2}$',
          },
          endDate: {
            type: 'string',
            description: 'End date in ISO format: YYYY-MM-DD',
            pattern: '^\\d{4}-\\d{2}-\\d{2}$',
          },
          color: {
            type: 'string',
            description: 'Optional display color (e.g., #ff0000)',
          },
          parentId: {
            type: 'string',
            description: 'Optional parent task ID for hierarchy nesting',
          },
          progress: {
            type: 'number',
            description: 'Optional progress percentage (0-100)',
            minimum: 0,
            maximum: 100,
          },
          dependencies: {
            type: 'array',
            description: 'Optional task dependencies',
            items: {
              type: 'object',
              properties: {
                taskId: {
                  type: 'string',
                  description: 'ID of the dependent task',
                },
                type: {
                  type: 'string',
                  description: 'Dependency type: FS, SS, FF, or SF',
                  enum: ['FS', 'SS', 'FF', 'SF'],
                },
                lag: {
                  type: 'number',
                  description: 'Optional lag in days (default: 0)',
                },
              },
              required: ['taskId', 'type'],
            },
          },
          projectId: {
            type: 'string',
            description: 'Optional project ID to associate the task with. If not provided, task will be global (visible to all projects)',
          },
        },
        required: ['name', 'startDate', 'endDate'],
      },
    },
    {
      name: 'get_tasks',
      description: 'List tasks in compact mode by default (id, name, dates, parentId, progress — no dependencies). Use full=true to include dependencies and sortOrder. Supports pagination (limit/offset) and parentId filtering. For a single task use get_task.',
      inputSchema: {
        type: 'object',
        properties: {
          projectId: {
            type: 'string',
            description: 'Optional project ID to filter tasks by. If not provided, uses the current session project (PROJECT_ID env var). Pass null to get all tasks across all projects.',
          },
          parentId: {
            type: 'string',
            description: 'Optional filter by parent task ID. null = root tasks only (tasks without a parent), string = direct children of that parent task. Omit to get all tasks (default behavior).',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of tasks to return (default: 100, max: 1000). Use pagination for large projects.',
            default: 100,
          },
          offset: {
            type: 'number',
            description: 'Number of tasks to skip for pagination (default: 0). Increment by limit to fetch next page.',
            default: 0,
          },
          full: {
            type: 'boolean',
            description: 'Return full task data including dependencies and sortOrder (default: false). Compact mode omits these fields to save tokens.',
            default: false,
          },
        },
      },
    },
    {
      name: 'get_task',
      description: 'Get single task by id with optional child loading. includeChildren: false (default), "shallow" (direct children), "deep" (all descendants). Use get_tasks for listing multiple tasks.',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'Task ID',
          },
          includeChildren: {
            type: 'string',
            enum: ['false', 'shallow', 'deep'],
            description: 'Include child tasks in response: false (no children, default), shallow (direct children only), deep (all descendants recursively).',
          },
        },
        required: ['id'],
      },
    },
    {
      name: 'update_task',
      description: 'Update task by id. Linked date and dependency edits route through the server scheduling engine and return changedTasks/changedIds instead of a full snapshot. Pass parentId=null to remove from parent. Use get_task to fetch current state first.',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'Task ID',
          },
          name: {
            type: 'string',
            description: 'Task name',
          },
          startDate: {
            type: 'string',
            description: 'Start date in ISO format: YYYY-MM-DD',
            pattern: '^\\d{4}-\\d{2}-\\d{2}$',
          },
          endDate: {
            type: 'string',
            description: 'End date in ISO format: YYYY-MM-DD',
            pattern: '^\\d{4}-\\d{2}-\\d{2}$',
          },
          color: {
            type: 'string',
            description: 'Optional display color (e.g., #ff0000)',
          },
          parentId: {
            type: 'string',
            description: 'Optional parent task ID for hierarchy nesting. Pass empty string to remove nesting.',
          },
          progress: {
            type: 'number',
            description: 'Optional progress percentage (0-100)',
            minimum: 0,
            maximum: 100,
          },
          dependencies: {
            type: 'array',
            description: 'Optional task dependencies',
            items: {
              type: 'object',
              properties: {
                taskId: {
                  type: 'string',
                  description: 'ID of the dependent task',
                },
                type: {
                  type: 'string',
                  description: 'Dependency type: FS, SS, FF, or SF',
                  enum: ['FS', 'SS', 'FF', 'SF'],
                },
                lag: {
                  type: 'number',
                  description: 'Optional lag in days (default: 0)',
                },
              },
              required: ['taskId', 'type'],
            },
          },
        },
        required: ['id'],
      },
    },
    {
      name: 'move_task',
      description: 'Move a task to a new start date and let the server apply the authoritative dependency cascade. Returns task, changedTasks, and changedIds.',
      inputSchema: {
        type: 'object',
        properties: {
          taskId: {
            type: 'string',
            description: 'Task ID to move',
          },
          startDate: {
            type: 'string',
            description: 'New start date in ISO format: YYYY-MM-DD',
            pattern: '^\\d{4}-\\d{2}-\\d{2}$',
          },
          projectId: {
            type: 'string',
            description: 'Optional project ID. If omitted, uses the current session project (PROJECT_ID env var).',
          },
        },
        required: ['taskId', 'startDate'],
      },
    },
    {
      name: 'resize_task',
      description: 'Resize a task from the start or end anchor and let the server apply the authoritative dependency cascade. Returns task, changedTasks, and changedIds.',
      inputSchema: {
        type: 'object',
        properties: {
          taskId: {
            type: 'string',
            description: 'Task ID to resize',
          },
          anchor: {
            type: 'string',
            enum: ['start', 'end'],
            description: 'Which edge to move. start = keep end fixed, end = keep start fixed.',
          },
          date: {
            type: 'string',
            description: 'New anchor date in ISO format: YYYY-MM-DD',
            pattern: '^\\d{4}-\\d{2}-\\d{2}$',
          },
          projectId: {
            type: 'string',
            description: 'Optional project ID. If omitted, uses the current session project (PROJECT_ID env var).',
          },
        },
        required: ['taskId', 'anchor', 'date'],
      },
    },
    {
      name: 'recalculate_schedule',
      description: 'Recalculate one task or the full project schedule on the server and return the authoritative changed set.',
      inputSchema: {
        type: 'object',
        properties: {
          taskId: {
            type: 'string',
            description: 'Optional task ID. Omit to recalculate the whole project.',
          },
          projectId: {
            type: 'string',
            description: 'Optional project ID. If omitted, uses the current session project (PROJECT_ID env var).',
          },
        },
      },
    },
    {
      name: 'delete_task',
      description: 'Delete task by id. Returns success confirmation. Task removal triggers cascade recalculation of dependent tasks. Use get_tasks to verify deletion.',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'Task ID',
          },
        },
        required: ['id'],
      },
    },
    {
      name: 'create_tasks_batch',
      description: 'Create multiple tasks from template with repeat parameters (sections, floors). Auto-generates names, dates, sequential FS dependencies within streams. Returns created tasks array. Alternative: use create_task for single tasks.',
      inputSchema: {
        type: 'object',
        properties: {
          baseStartDate: {
            type: 'string',
            description: 'Base start date for the first task in each stream (YYYY-MM-DD)',
            pattern: '^\\d{4}-\\d{2}-\\d{2}$',
          },
          workTypes: {
            type: 'array',
            description: 'Array of work types with their durations',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'Name of the work type' },
                duration: { type: 'number', description: 'Duration in days' },
              },
              required: ['name', 'duration'],
            },
          },
          repeatBy: {
            type: 'object',
            description: 'Parameters for repeating tasks (sections, floors, etc.)',
            properties: {
              sections: {
                type: 'array',
                items: { type: 'number' },
                description: 'Array of section numbers',
              },
              floors: {
                type: 'array',
                items: { type: 'number' },
                description: 'Array of floor numbers',
              },
            },
          },
          streams: {
            type: 'number',
            description: 'Number of parallel streams (default: 1)',
            minimum: 1,
          },
          nameTemplate: {
            type: 'string',
            description: 'Optional name template with placeholders: {workType}, {section}, {floor}',
          },
          projectId: {
            type: 'string',
            description: 'Optional project ID to associate the tasks with. If not provided, tasks will be global (visible to all projects)',
          },
        },
        required: ['baseStartDate', 'workTypes', 'repeatBy'],
      },
    },
    {
      name: 'get_conversation_history',
      description: 'Get recent messages for context awareness. Call before responding to understand previous dialogue. Limit: default 20, max 50. Use add_message to record your response.',
      inputSchema: {
        type: 'object',
        properties: {
          projectId: {
            type: 'string',
            description: 'Optional project ID to filter messages by. If not provided, uses the current session project (PROJECT_ID env var)',
          },
          limit: {
            type: 'number',
            description: 'Number of recent messages to return (default: 20, max: 50)',
            minimum: 1,
            maximum: 50,
          },
        },
      },
    },
    {
      name: 'add_message',
      description: 'Record assistant message to conversation history. Use after responding to user for future context. Call get_conversation_history to read previous messages.',
      inputSchema: {
        type: 'object',
        properties: {
          content: {
            type: 'string',
            description: 'Message content to add to the conversation history',
          },
          projectId: {
            type: 'string',
            description: 'Optional project ID to associate the message with. If not provided, uses the current session project (PROJECT_ID env var)',
          },
        },
        required: ['content'],
      },
    },
    {
      name: 'set_dependency',
      description: 'Create a dependency (link) between two tasks. The successor task depends on the predecessor task. For example, to make task B start after task A finishes, set taskId=B (successor) and dependsOnTaskId=A (predecessor) with type=FS. Returns created dependency.',
      inputSchema: {
        type: 'object',
        properties: {
          taskId: {
            type: 'string',
            description: 'ID of the successor task (the task that depends on the other)',
          },
          dependsOnTaskId: {
            type: 'string',
            description: 'ID of the predecessor task (the task that the successor depends on)',
          },
          type: {
            type: 'string',
            description: 'Dependency type: FS (Finish-to-Start, default), SS (Start-to-Start), FF (Finish-to-Finish), SF (Start-to-Finish)',
            enum: ['FS', 'SS', 'FF', 'SF'],
          },
          lag: {
            type: 'number',
            description: 'Optional lag in days (default: 0). Positive values delay the successor, negative values allow overlap.',
          },
        },
        required: ['taskId', 'dependsOnTaskId'],
      },
    },
    {
      name: 'remove_dependency',
      description: 'Remove a dependency between two tasks. Requires both task IDs to identify the specific dependency link. Returns success confirmation.',
      inputSchema: {
        type: 'object',
        properties: {
          taskId: {
            type: 'string',
            description: 'ID of the successor task (the task that has the dependency)',
          },
          dependsOnTaskId: {
            type: 'string',
            description: 'ID of the predecessor task (the task that the successor depends on)',
          },
        },
        required: ['taskId', 'dependsOnTaskId'],
      },
    },
  ],
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

    const updatedTask = await taskService.update(taskId, { id: taskId, dependencies: updatedDependencies }, 'agent');

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
    const updatedTask = await taskService.update(taskId, { id: taskId, dependencies: updatedDependencies }, 'agent');

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
Fix: Check available tools via tools/list request. Valid tools: ping, create_task, get_tasks, get_task, update_task, delete_task, create_tasks_batch, get_conversation_history, add_message, set_dependency, remove_dependency.`);
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
