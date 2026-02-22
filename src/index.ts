import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { taskStore } from './store.js';
import type { Task, CreateTaskInput, UpdateTaskInput } from './types.js';

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

    const task = taskStore.create(input);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(task, null, 2),
        },
      ],
    };
  }

  // get_tasks tool
  if (name === 'get_tasks') {
    const tasks = taskStore.list();
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

    const task = taskStore.get(id);
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
    const existingTask = taskStore.get(id);
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

    const updatedTask = taskStore.update(id, input);
    if (!updatedTask) {
      throw new Error(`Task not found: ${id}`);
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

    const deleted = taskStore.delete(id);
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
