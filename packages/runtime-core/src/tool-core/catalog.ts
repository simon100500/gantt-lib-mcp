import type { ToolDefinition } from './types.js';

const PROJECT_ID_PROPERTY = {
  type: 'string',
  description: 'Optional project ID. Defaults to the configured project context.',
} as const;

const DATE_PROPERTY = {
  type: 'string',
  pattern: '^\\d{4}-\\d{2}-\\d{2}$',
} as const;

export const NORMALIZED_TOOL_CATALOG = [
  {
    name: 'get_project_summary',
    description: 'Return compact project routing context: version, day mode, range, task counts, and health flags.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: PROJECT_ID_PROPERTY,
      },
    },
    handler: 'getProjectSummary',
    mutating: false,
  },
  {
    name: 'get_schedule_slice',
    description: 'Return a scoped task slice by explicit IDs, a branch root, or an inclusive date window.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: PROJECT_ID_PROPERTY,
        taskIds: { type: 'array', items: { type: 'string' }, description: 'Explicit task IDs to load.' },
        branchRootId: { type: 'string', description: 'Branch root task ID for subtree loading.' },
        startDate: { ...DATE_PROPERTY, description: 'Inclusive slice start date.' },
        endDate: { ...DATE_PROPERTY, description: 'Inclusive slice end date.' },
      },
    },
    handler: 'getScheduleSlice',
    mutating: false,
  },
  {
    name: 'find_tasks',
    description: 'Search project tasks by normalized text and return compact ranked matches with ancestry and dates.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: PROJECT_ID_PROPERTY,
        query: { type: 'string', description: 'Search text to match against task names.' },
        limit: { type: 'number', minimum: 1, maximum: 50, description: 'Maximum number of matches to return.' },
      },
      required: ['query'],
    },
    handler: 'findTasks',
    mutating: false,
  },
  {
    name: 'get_task_context',
    description: 'Return one task plus its parents, children, siblings, predecessors, successors, and project version.',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Task ID.' },
        projectId: PROJECT_ID_PROPERTY,
      },
      required: ['taskId'],
    },
    handler: 'getTaskContext',
    mutating: false,
  },
  {
    name: 'create_tasks',
    description: 'Create one or more tasks through the authoritative command pipeline.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        includeSnapshot: { type: 'boolean' },
        tasks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              startDate: DATE_PROPERTY,
              endDate: DATE_PROPERTY,
              type: { type: 'string', enum: ['task', 'milestone'] },
              color: { type: 'string' },
              parentId: { type: 'string' },
              progress: { type: 'number', minimum: 0, maximum: 100 },
              dependencies: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    taskId: { type: 'string' },
                    type: { type: 'string', enum: ['FS', 'SS', 'FF', 'SF'] },
                    lag: { type: 'number' },
                  },
                  required: ['taskId', 'type'],
                },
              },
              sortOrder: { type: 'number' },
            },
            required: ['name', 'startDate', 'endDate'],
          },
        },
      },
      required: ['tasks'],
    },
    handler: 'createTasks',
    mutating: true,
  },
  {
    name: 'update_tasks',
    description: 'Update non-scheduling task metadata only. Scheduling and dependency edits are rejected at this surface.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        includeSnapshot: { type: 'boolean' },
        updates: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              color: { type: 'string' },
              progress: { type: 'number', minimum: 0, maximum: 100 },
            },
            required: ['id'],
          },
        },
      },
      required: ['updates'],
    },
    handler: 'updateTasks',
    mutating: true,
  },
  {
    name: 'move_tasks',
    description: 'Move tasks structurally by parent placement or sibling sort position.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        includeSnapshot: { type: 'boolean' },
        moves: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              taskId: { type: 'string' },
              parentId: { type: 'string' },
              sortOrder: { type: 'number' },
            },
            required: ['taskId'],
          },
        },
      },
      required: ['moves'],
    },
    handler: 'moveTasks',
    mutating: true,
  },
  {
    name: 'shift_tasks',
    description: 'Shift task dates by relative calendar or working-day deltas.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        includeSnapshot: { type: 'boolean' },
        shifts: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              taskId: { type: 'string' },
              delta: { type: 'number' },
              mode: { type: 'string', enum: ['calendar', 'working'] },
            },
            required: ['taskId', 'delta'],
          },
        },
      },
      required: ['shifts'],
    },
    handler: 'shiftTasks',
    mutating: true,
  },
  {
    name: 'delete_tasks',
    description: 'Delete one or more tasks through the authoritative command pipeline.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        includeSnapshot: { type: 'boolean' },
        taskIds: {
          type: 'array',
          items: { type: 'string' },
        },
      },
      required: ['taskIds'],
    },
    handler: 'deleteTasks',
    mutating: true,
  },
  {
    name: 'link_tasks',
    description: 'Create logical predecessor-successor links without exposing dependency-array rewrites.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        includeSnapshot: { type: 'boolean' },
        links: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              predecessorTaskId: { type: 'string' },
              successorTaskId: { type: 'string' },
              type: { type: 'string', enum: ['FS', 'SS', 'FF', 'SF'] },
              lag: { type: 'number' },
            },
            required: ['predecessorTaskId', 'successorTaskId'],
          },
        },
      },
      required: ['links'],
    },
    handler: 'linkTasks',
    mutating: true,
  },
  {
    name: 'unlink_tasks',
    description: 'Remove logical predecessor-successor links without dependency-array replacement input.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        includeSnapshot: { type: 'boolean' },
        links: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              predecessorTaskId: { type: 'string' },
              successorTaskId: { type: 'string' },
            },
            required: ['predecessorTaskId', 'successorTaskId'],
          },
        },
      },
      required: ['links'],
    },
    handler: 'unlinkTasks',
    mutating: true,
  },
  {
    name: 'recalculate_project',
    description: 'Recalculate the authoritative full-project schedule.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        includeSnapshot: { type: 'boolean' },
      },
    },
    handler: 'recalculateProject',
    mutating: true,
  },
  {
    name: 'validate_schedule',
    description: 'Return typed schedule validation issues for the current project snapshot.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
      },
    },
    handler: 'validateSchedule',
    mutating: false,
  },
] as const satisfies readonly ToolDefinition[];

export const NORMALIZED_TOOL_NAMES = NORMALIZED_TOOL_CATALOG.map((tool) => tool.name);

export function getToolDefinition(name: string): ToolDefinition | undefined {
  return NORMALIZED_TOOL_CATALOG.find((tool) => tool.name === name);
}
