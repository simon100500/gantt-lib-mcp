/**
 * SDK-embedded MCP tools for Gantt chart management.
 *
 * These tools run in the same process as the SDK and communicate via in-memory transport,
 * which ensures proper tool discovery and exposure to the AI model.
 */

import { tool } from '@qwen-code/sdk';
import { z } from 'zod';
import { taskStore } from '@gantt/mcp/store';
import type { CreateTaskInput, UpdateTaskInput, CreateTasksBatchInput, BatchCreateResult, TaskDependency } from '@gantt/mcp/types';

// Type assertion helper to bypass TypeScript strict checking for ZodRawShape
type ZodRawShape = Record<string, any>;

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

/**
 * Get the project ID from args or environment
 */
function getProjectId(argProjectId: string | null | undefined): string | undefined {
  if (argProjectId === null) return undefined;
  return argProjectId ?? process.env.PROJECT_ID;
}

// Ping tool for connectivity testing
export const pingTool = tool(
  'ping',
  'A simple ping tool to test MCP server connectivity',
  {} as ZodRawShape,
  async () => {
    return { content: [{ type: 'text', text: 'pong' }] };
  }
);

// get_tasks tool
export const getTasksTool = tool(
  'get_tasks',
  'Get a list of Gantt chart tasks for the current project. Always call this before modifying tasks so you know what tasks exist and their IDs.',
  {
    projectId: z.string().optional(),
  } as ZodRawShape,
  async (args) => {
    const resolvedProjectId = args.projectId === null ? undefined : (args.projectId ?? process.env.PROJECT_ID);
    const tasks = await taskStore.list(resolvedProjectId, false);

    console.error('[GET_TASKS SDK] argProjectId:', args.projectId, 'env.PROJECT_ID:', process.env.PROJECT_ID, 'resolvedProjectId:', resolvedProjectId, 'tasks found:', tasks.length);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(tasks, null, 2),
      }],
    };
  }
);

// get_task tool
export const getTaskTool = tool(
  'get_task',
  'Get a single task by ID',
  {
    id: z.string(),
  } as ZodRawShape,
  async (args) => {
    const task = await taskStore.get(args.id);
    if (!task) {
      throw new Error(`Task not found: ${args.id}`);
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(task, null, 2),
      }],
    };
  }
);

// create_task tool
export const createTaskTool = tool(
  'create_task',
  'Create a new Gantt chart task with name, dates, and optional properties',
  {
    name: z.string(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    color: z.string().optional(),
    progress: z.number().min(0).max(100).optional(),
    dependencies: z.array(z.object({
      taskId: z.string(),
      type: z.enum(['FS', 'SS', 'FF', 'SF']),
      lag: z.number().optional(),
    })).optional(),
    projectId: z.string().optional(),
  } as ZodRawShape,
  async (args) => {
    const input = args as unknown as CreateTaskInput;
    const resolvedProjectId = getProjectId(args.projectId);

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

    // Return the task with cascade info (scoped to same project)
    const allTasks = await taskStore.list(resolvedProjectId, false);
    const dependentTasks = allTasks.filter(t =>
      t.dependencies?.some(d => d.taskId === task.id) ||
      task.dependencies?.some(d => d.taskId === t.id)
    );

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          task,
          message: 'Task created successfully',
          affectedTasks: dependentTasks.length
        }, null, 2),
      }],
    };
  }
);

// update_task tool
export const updateTaskTool = tool(
  'update_task',
  'Update task properties (all fields optional except id)',
  {
    id: z.string(),
    name: z.string().optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    color: z.string().optional(),
    progress: z.number().min(0).max(100).optional(),
    dependencies: z.array(z.object({
      taskId: z.string(),
      type: z.enum(['FS', 'SS', 'FF', 'SF']),
      lag: z.number().optional(),
    })).optional(),
  } as ZodRawShape,
  async (args) => {
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

    const updatedTask = await taskStore.update(id, input);
    if (!updatedTask) {
      throw new Error(`Task not found: ${id}`);
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(updatedTask, null, 2),
      }],
    };
  }
);

// delete_task tool
export const deleteTaskTool = tool(
  'delete_task',
  'Delete a task by ID',
  {
    id: z.string(),
  } as ZodRawShape,
  async (args) => {
    const deleted = await taskStore.delete(args.id);
    if (!deleted) {
      throw new Error(`Task not found: ${args.id}`);
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ success: true, deleted: args.id }, null, 2),
      }],
    };
  }
);

// export_tasks tool
export const exportTasksTool = tool(
  'export_tasks',
  'Export all tasks to JSON format',
  {} as ZodRawShape,
  async () => {
    const json = await taskStore.exportTasks();
    return {
      content: [{
        type: 'text',
        text: json,
      }],
    };
  }
);

// import_tasks tool
export const importTasksTool = tool(
  'import_tasks',
  'Import tasks from JSON data (replaces all existing tasks)',
  {
    jsonData: z.string(),
  } as ZodRawShape,
  async (args) => {
    const resolvedProjectId = process.env.PROJECT_ID;

    try {
      const count = await taskStore.importTasks(args.jsonData, resolvedProjectId);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ success: true, imported: count, message: `Imported ${count} tasks successfully` }, null, 2),
        }],
      };
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      return {
        content: [{
          type: 'text',
          text: `Error: ${errorMessage}`,
        }],
        isError: true,
      };
    }
  }
);

// create_tasks_batch tool
export const createTasksBatchTool = tool(
  'create_tasks_batch',
  'Create multiple Gantt chart tasks from a template with repeat parameters. Automatically generates task names, dates, and sequential FS dependencies within streams.',
  {
    baseStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    workTypes: z.array(z.object({
      name: z.string(),
      duration: z.number(),
    })),
    repeatBy: z.object({
      sections: z.array(z.number()).optional(),
      floors: z.array(z.number()).optional(),
    }),
    streams: z.number().min(1).optional(),
    nameTemplate: z.string().optional(),
    projectId: z.string().optional(),
  } as ZodRawShape,
  async (args) => {
    const input = args as unknown as CreateTasksBatchInput;
    const resolvedProjectId = getProjectId(args.projectId);

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
      content: [{
        type: 'text',
        text: JSON.stringify({
          ...result,
          message: `Batch creation complete: ${createdTasks.length} tasks created${failedTasks.length > 0 ? `, ${failedTasks.length} failed` : ''}`,
        }, null, 2),
      }],
    };
  }
);

// Export all tools for use with createSdkMcpServer
export const ganttTools = [
  pingTool,
  getTasksTool,
  getTaskTool,
  createTaskTool,
  updateTaskTool,
  deleteTaskTool,
  exportTasksTool,
  importTasksTool,
  createTasksBatchTool,
];
