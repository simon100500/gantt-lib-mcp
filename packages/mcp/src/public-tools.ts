import { NORMALIZED_TOOL_CATALOG } from '@gantt/runtime-core/tool-core';

const EXTRA_MCP_TOOLS = [
  {
    name: 'ping',
    description: 'Test MCP server connectivity. Returns "pong".',
    inputSchema: {
      type: 'object',
      properties: {},
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

export const PUBLIC_MCP_TOOLS = [
  EXTRA_MCP_TOOLS[0],
  ...NORMALIZED_TOOL_CATALOG.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  })),
  ...EXTRA_MCP_TOOLS.slice(1),
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
