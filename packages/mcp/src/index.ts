import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { taskStore } from './store.js';
import { getDb } from './db.js';
import type { Task, CreateTaskInput, UpdateTaskInput, CreateTasksBatchInput, BatchCreateResult, TaskDependency } from './types.js';

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
      description: 'A simple ping tool to test MCP server connectivity',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'create_task',
      description: 'Create a new Gantt chart task with name, dates, and optional properties',
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
      description: 'Get a list of all Gantt chart tasks',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'get_task',
      description: 'Get a single task by ID',
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
      name: 'update_task',
      description: 'Update task properties (all fields optional except id)',
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
      description: 'Delete a task by ID',
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
      name: 'export_tasks',
      description: 'Export all tasks to JSON format',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'import_tasks',
      description: 'Import tasks from JSON data (replaces all existing tasks)',
      inputSchema: {
        type: 'object',
        properties: {
          jsonData: {
            type: 'string',
            description: 'JSON string containing array of tasks to import',
          },
        },
        required: ['jsonData'],
      },
    },
    {
      name: 'set_autosave_path',
      description: 'No-op (kept for backward compatibility). Tasks are now persisted automatically via SQLite.',
      inputSchema: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: 'Ignored — SQLite persistence is always active',
          },
        },
      },
    },
    {
      name: 'create_tasks_batch',
      description: 'Create multiple Gantt chart tasks from a template with repeat parameters. Automatically generates task names, dates, and sequential FS dependencies within streams.',
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
  ],
}));

// Register call tool handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  // Ping tool for connectivity testing
  if (name === 'ping') {
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
    const resolvedProjectId = argProjectId ?? process.env.PROJECT_ID;

    // DEBUG: Log projectId resolution
    console.error('[CREATE_TASK DEBUG] argProjectId:', argProjectId, 'env.PROJECT_ID:', process.env.PROJECT_ID, 'resolvedProjectId:', resolvedProjectId);

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

    const task = await taskStore.create(input, resolvedProjectId);

    // Return the task with cascade info
    const allTasks = await taskStore.list();
    const dependentTasks = allTasks.filter(t =>
      t.dependencies?.some(d => d.taskId === task.id) ||
      task.dependencies?.some(d => d.taskId === t.id)
    );

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
    const tasks = await taskStore.list();
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(tasks, null, 2),
        },
      ],
    };
  }

  // get_task tool
  if (name === 'get_task') {
    const { id } = args as { id: string };
    if (!id) {
      throw new Error('Missing required parameter: id');
    }

    const task = await taskStore.get(id);
    if (!task) {
      throw new Error(`Task not found: ${id}`);
    }

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
    const existingTask = await taskStore.get(id);
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

    const updatedTask = await taskStore.update(id, input);
    if (!updatedTask) {
      throw new Error(`Task not found: ${id}`);
    }

    // If dates or dependencies changed, show what was affected
    if (hasDateChanges || hasDependencyChanges) {
      const allTasks = await taskStore.list();

      // Find all tasks that were affected by the cascade
      const affectedTasks = allTasks.filter(t => {
        if (t.id === id) return false;
        return t.dependencies?.some(d => {
          const depTaskId = d.taskId;
          return depTaskId === id ||
            allTasks.find(x => x.id === depTaskId)?.dependencies?.some(dd => dd.taskId === id);
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
              allTasks
            }, null, 2),
          },
        ],
      };
    }

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

    const deleted = await taskStore.delete(id);
    if (!deleted) {
      throw new Error(`Task not found: ${id}`);
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ success: true, deleted: id }, null, 2),
        },
      ],
    };
  }

  // export_tasks tool
  if (name === 'export_tasks') {
    const json = await taskStore.exportTasks();
    return {
      content: [
        {
          type: 'text',
          text: json,
        },
      ],
    };
  }

  // import_tasks tool
  if (name === 'import_tasks') {
    const { jsonData } = args as { jsonData: string };
    if (!jsonData) {
      throw new Error('Missing required parameter: jsonData');
    }

    try {
      const count = await taskStore.importTasks(jsonData);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ success: true, imported: count, message: `Imported ${count} tasks successfully` }, null, 2),
          },
        ],
      };
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  }

  // set_autosave_path tool — no-op for backward compatibility
  // Tasks are now persisted automatically via SQLite
  if (name === 'set_autosave_path') {
    const { filePath } = args as { filePath?: string };
    const path = filePath || './gantt-data.json';
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            autoSavePath: path,
            message: 'Note: SQLite persistence is always active. set_autosave_path is a no-op kept for backward compatibility.',
          }, null, 2),
        },
      ],
    };
  }

  // create_tasks_batch tool
  if (name === 'create_tasks_batch') {
    const input = args as unknown as CreateTasksBatchInput;
    const { projectId: argProjectId } = args as { projectId?: string };
    const resolvedProjectId = argProjectId ?? process.env.PROJECT_ID;

    console.error('[CREATE_TASKS_BATCH DEBUG] argProjectId:', argProjectId, 'env.PROJECT_ID:', process.env.PROJECT_ID, 'resolvedProjectId:', resolvedProjectId);

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
              const prevTask = await taskStore.get(previousTaskIds[currentStream]!);
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
            const task = await taskStore.create({
              name: taskName,
              startDate,
              endDate,
              dependencies,
            }, resolvedProjectId);

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

  throw new Error(`Unknown tool: ${name}`);
});

// Start server with stdio transport
async function main() {
  // Initialize the SQLite database (creates tables if needed)
  await getDb();

  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Server runs via stdio, no explicit listen needed
  // Process will stay alive as long as stdio is open
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
