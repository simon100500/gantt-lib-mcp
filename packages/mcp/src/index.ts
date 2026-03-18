import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { taskService } from './services/task.service.js';
import { messageService } from './services/message.service.js';
import type { CreateTaskInput, UpdateTaskInput, CreateTasksBatchInput, BatchCreateResult, TaskDependency, GetConversationHistoryInput, AddMessageInput } from './types.js';
import { writeMcpDebugLog } from './debug-log.js';

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
      description: 'List tasks with compact mode by default (id, name, dates, parentId, progress). Use full=true for complete data with dependencies. Supports pagination (limit/offset) and parentId filtering. For single task, use get_task.',
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
            description: 'Return full task data with all dependencies (default: false). Compact mode returns essential fields only.',
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
      description: 'Update task by id. All fields optional except id. Returns updated task with cascade info if dates/dependencies changed. Pass parentId=null to remove from parent. Use get_task to fetch current state first.',
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
      throw new Error(`Invalid startDate format: ${input.startDate}. Expected format: YYYY-MM-DD`);
    }
    if (!isValidDateFormat(input.endDate)) {
      throw new Error(`Invalid endDate format: ${input.endDate}. Expected format: YYYY-MM-DD`);
    }

    // Validate date range
    if (!isValidDateRange(input.startDate, input.endDate)) {
      throw new Error(`Invalid date range: startDate (${input.startDate}) must be before or equal to endDate (${input.endDate})`);
    }

    // Validate dependencies
    if (input.dependencies) {
      for (let i = 0; i < input.dependencies.length; i++) {
        const dep = input.dependencies[i];
        if (!isValidDependencyType(dep.type)) {
          throw new Error(`Invalid dependency type at index ${i}: ${dep.type}. Must be one of: FS, SS, FF, SF`);
        }
      }
    }

    const task = await taskService.create(input, resolvedProjectId, 'agent');

    // Return the task with cascade info (scoped to same project)
    const allTasksResult = await taskService.list(resolvedProjectId);
    const dependentTasks = allTasksResult.tasks.filter(t =>
      t.dependencies?.some(d => d.taskId === task.id) ||
      task.dependencies?.some(d => d.taskId === t.id)
    );
    await writeMcpDebugLog('tool_call_completed', {
      tool: name,
      resolvedProjectId,
      createdTaskId: task.id,
      createdTaskName: task.name,
      visibleTaskCount: allTasksResult.tasks.length,
      affectedTasks: dependentTasks.map((t) => ({ id: t.id, name: t.name })),
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            task,
            message: 'Task created successfully',
            affectedTasks: dependentTasks.length
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
    const result = await taskService.list(resolvedProjectId, parentId, limit, offset, full);

    console.error('[GET_TASKS DEBUG] argProjectId:', argProjectId, 'env.PROJECT_ID:', process.env.PROJECT_ID, 'resolvedProjectId:', resolvedProjectId, 'parentId:', parentId, 'tasks found:', result.tasks.length);
    await writeMcpDebugLog('tool_call_completed', {
      tool: name,
      argProjectId,
      resolvedProjectId,
      parentId,
      limit,
      offset,
      full,
      taskCount: result.tasks.length,
      hasMore: result.hasMore,
      total: result.total,
      tasks: result.tasks.map((task) => ({ id: task.id, name: task.name, startDate: task.startDate, endDate: task.endDate })),
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }

  // get_task tool
  if (name === 'get_task') {
    const { id, includeChildren = false } = args as any;
    if (!id) {
      throw new Error('Missing required parameter: id');
    }

    const task = await taskService.get(id, includeChildren);
    if (!task) {
      throw new Error(`Task not found: ${id}`);
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
      throw new Error('Missing required parameter: id');
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
      throw new Error('At least one field to update must be provided');
    }

    // Validate date format if dates are provided
    if (input.startDate && !isValidDateFormat(input.startDate)) {
      throw new Error(`Invalid startDate format: ${input.startDate}. Expected format: YYYY-MM-DD`);
    }
    if (input.endDate && !isValidDateFormat(input.endDate)) {
      throw new Error(`Invalid endDate format: ${input.endDate}. Expected format: YYYY-MM-DD`);
    }

    // Validate date range if both dates are provided
    const existingTask = await taskService.get(id);
    if (existingTask) {
      const startDate = input.startDate ?? existingTask.startDate;
      const endDate = input.endDate ?? existingTask.endDate;
      if (!isValidDateRange(startDate, endDate)) {
        throw new Error(`Invalid date range: startDate (${startDate}) must be before or equal to endDate (${endDate})`);
      }
    }

    // Validate dependencies if provided
    if (input.dependencies) {
      for (let i = 0; i < input.dependencies.length; i++) {
        const dep = input.dependencies[i];
        if (!isValidDependencyType(dep.type)) {
          throw new Error(`Invalid dependency type at index ${i}: ${dep.type}. Must be one of: FS, SS, FF, SF`);
        }
      }
    }

    const hasDateChanges = input.startDate !== undefined || input.endDate !== undefined;
    const hasDependencyChanges = input.dependencies !== undefined;

    const updatedTask = await taskService.update(id, input, 'agent');
    if (!updatedTask) {
      throw new Error(`Task not found: ${id}`);
    }
    await writeMcpDebugLog('update_task_completed', {
      id,
      input,
      updatedTask,
      projectId: process.env.PROJECT_ID,
    });

    // If dates or dependencies changed, show what was affected
    if (hasDateChanges || hasDependencyChanges) {
      const allTasksResult = await taskService.list(process.env.PROJECT_ID);

      // Find all tasks that were affected by the cascade
      const affectedTasks = allTasksResult.tasks.filter(t => {
        if (t.id === id) return false;
        return t.dependencies?.some(d => {
          const depTaskId = d.taskId;
          return depTaskId === id ||
            allTasksResult.tasks.find(x => x.id === depTaskId)?.dependencies?.some(dd => dd.taskId === id);
        });
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              task: updatedTask,
              message: 'Task updated successfully',
              affectedTasks: affectedTasks.length,
              affectedTaskIds: affectedTasks.map(t => t.id),
              allTasks: allTasksResult.tasks
            }, null, 2),
          },
        ],
      };
    }
    await writeMcpDebugLog('tool_call_completed', {
      tool: name,
      updatedTask,
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(updatedTask, null, 2),
        },
      ],
    };
  }

  // delete_task tool
  if (name === 'delete_task') {
    const { id } = args as { id: string };
    if (!id) {
      throw new Error('Missing required parameter: id');
    }

    const deleted = await taskService.delete(id, 'agent');
    if (!deleted) {
      throw new Error(`Task not found: ${id}`);
    }
    await writeMcpDebugLog('tool_call_completed', {
      tool: name,
      deletedTaskId: id,
      projectId: process.env.PROJECT_ID,
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ success: true, deleted: id }, null, 2),
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
      throw new Error(`Invalid baseStartDate format: ${input.baseStartDate}. Expected format: YYYY-MM-DD`);
    }

    // Validate workTypes
    if (!input.workTypes || input.workTypes.length === 0) {
      throw new Error('workTypes must be a non-empty array');
    }

    // Validate repeatBy has at least one repeat parameter
    const repeatKeys = Object.keys(input.repeatBy);
    if (repeatKeys.length === 0) {
      throw new Error('repeatBy must contain at least one repeat parameter (e.g., sections, floors)');
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

            // Create the task
            const task = await taskService.create({
              name: taskName,
              startDate,
              endDate,
              dependencies,
            }, resolvedProjectId, 'agent');

            createdTasks.push(task.id);
            previousTaskIds[currentStream] = task.id;

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
      throw new Error('Project ID is required. Provide projectId parameter or set PROJECT_ID environment variable.');
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
      throw new Error('Project ID is required. Provide projectId parameter or set PROJECT_ID environment variable.');
    }

    // Validate content
    if (!input.content || input.content.trim().length === 0) {
      throw new Error('content is required and must be non-empty');
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

  await writeMcpDebugLog('tool_call_failed', {
    tool: name,
    error: `Unknown tool: ${name}`,
  });
  throw new Error(`Unknown tool: ${name}`);
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
