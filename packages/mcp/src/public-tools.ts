export const PUBLIC_MCP_TOOLS = [
  {
    name: 'ping',
    description: 'Test MCP server connectivity. Returns "pong".',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_project_summary',
    description: 'Return compact project routing context: version, day mode, range, task counts, and high-level health flags.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Optional project ID. Defaults to PROJECT_ID.' },
      },
    },
  },
  {
    name: 'get_task_context',
    description: 'Return one task plus its parents, children, siblings, predecessors, successors, and project version.',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Task ID.' },
        projectId: { type: 'string', description: 'Optional project ID. Defaults to PROJECT_ID.' },
      },
      required: ['taskId'],
    },
  },
  {
    name: 'get_schedule_slice',
    description: 'Return a scoped task slice by task IDs, branch root, or date window with explicit scope metadata.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Optional project ID. Defaults to PROJECT_ID.' },
        taskIds: { type: 'array', items: { type: 'string' }, description: 'Explicit task IDs to load.' },
        branchRootId: { type: 'string', description: 'Branch root task ID for subtree loading.' },
        startDate: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'Inclusive slice start date.' },
        endDate: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'Inclusive slice end date.' },
      },
    },
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
              startDate: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
              endDate: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
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
  },
  {
    name: 'get_conversation_history',
    description: 'Get recent messages for the current project conversation history.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        limit: { type: 'number', minimum: 1, maximum: 50 },
      },
    },
  },
  {
    name: 'add_message',
    description: 'Append an assistant message to project conversation history.',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string' },
        projectId: { type: 'string' },
      },
      required: ['content'],
    },
  },
] as const;

export const LEGACY_SCHEDULING_TOOL_NAMES = new Set([
  'create_task',
  'update_task',
  'delete_task',
  'set_dependency',
  'remove_dependency',
  'move_task',
  'resize_task',
  'recalculate_schedule',
  'get_tasks',
  'get_task',
  'create_tasks_batch',
]);
