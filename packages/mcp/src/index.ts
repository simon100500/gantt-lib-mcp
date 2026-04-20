// Load environment variables BEFORE importing services
// Use explicit path to .env relative to this file's location (__dirname = packages/mcp/dist)
// so that DATABASE_URL is available regardless of the process working directory.
import { config as dotenvConfig } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dotenvDir = dirname(__filename);
dotenvConfig({ path: resolve(__dotenvDir, '../../../.env') });

import { randomUUID } from 'node:crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import {
  executeToolCall,
  getToolDefinition,
  type NormalizedToolInputMap,
  type NormalizedToolName,
  type ToolCallContext,
} from '@gantt/runtime-core/tool-core';
import { validateDependencies } from 'gantt-lib/core/scheduling';
import { writeMcpDebugLog } from './debug-log.js';
import { commandService } from './services/command.service.js';
import { createLimitReachedRejection, enforcementService } from './services/enforcement.service.js';
import { messageService } from './services/message.service.js';
import { getProjectScheduleOptionsForProject } from './services/projectScheduleOptions.js';
import { taskService } from './services/task.service.js';
import { getPrisma } from './prisma.js';
import type {
  AddMessageInput,
  CommitProjectCommandResponse,
  GetConversationHistoryInput,
  NormalizedMutationReason,
  NormalizedMutationResult,
  ProjectCommand,
  ProjectSummary,
  ProjectSnapshot,
  Task,
} from './types.js';
import { LEGACY_SCHEDULING_TOOL_NAMES, PUBLIC_MCP_TOOLS } from './public-tools.js';

const server = new Server(
  {
    name: 'gantt-lib-mcp-server',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

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
): Promise<{ baseVersion: number; response: CommitProjectCommandResponse }> {
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

function buildRejectedResult(
  baseVersion: number,
  reason: NormalizedMutationReason,
  snapshot?: ProjectSnapshot,
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

type McpHandlerDeps = {
  writeMcpDebugLog: typeof writeMcpDebugLog;
  commitNormalizedCommand: typeof commitNormalizedCommand;
  getProjectSnapshotSummary: typeof getProjectSnapshotSummary;
  listAllProjectTasks: typeof listAllProjectTasks;
  resolveProjectId: typeof resolveProjectId;
  taskService: Pick<typeof taskService, 'get'>;
  getPrisma: typeof getPrisma;
  getProjectScheduleOptionsForProject: typeof getProjectScheduleOptionsForProject;
  enforcementService: Pick<typeof enforcementService, 'evaluateMutationAccess'>;
  executeToolCall: typeof executeToolCall;
};

const defaultMcpHandlerDeps: McpHandlerDeps = {
  writeMcpDebugLog,
  commitNormalizedCommand,
  getProjectSnapshotSummary,
  listAllProjectTasks,
  resolveProjectId,
  taskService,
  getPrisma,
  getProjectScheduleOptionsForProject,
  enforcementService,
  executeToolCall,
};

function createToolContext(deps: McpHandlerDeps): ToolCallContext {
  return {
    actorType: 'agent',
    getProjectSummary: deps.getProjectSnapshotSummary,
    listAllProjectTasks: deps.listAllProjectTasks,
    getTask: async (_projectId: string, taskId: string) => deps.taskService.get(taskId),
    getProjectScheduleOptions: async (projectId: string) => deps.getProjectScheduleOptionsForProject(deps.getPrisma(), projectId),
    commitCommand: async (projectId: string, command: ProjectCommand) => deps.commitNormalizedCommand(projectId, command),
    resolveProjectId: (projectId?: string | null) => deps.resolveProjectId(projectId),
  };
}

export async function handleListToolsRequest() {
  return {
    tools: PUBLIC_MCP_TOOLS,
  };
}

export async function handleCallToolRequest(
  request: { params: { name: string; arguments?: unknown } },
  deps: McpHandlerDeps = defaultMcpHandlerDeps,
) {
  const { name, arguments: args } = request.params;
  await deps.writeMcpDebugLog('tool_call_received', {
    tool: name,
    args,
    envProjectId: process.env.PROJECT_ID,
  });

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

  const definition = getToolDefinition(name);
  if (definition) {
    if (definition.mutating) {
      const argProjectId = typeof args === 'object' && args !== null && 'projectId' in args
        ? (args as { projectId?: unknown }).projectId
        : undefined;
      const resolvedProjectId = deps.resolveProjectId(argProjectId);
      const enforcementDecision = await deps.enforcementService.evaluateMutationAccess({
        toolName: name,
        projectId: resolvedProjectId,
      });

      if (!enforcementDecision.allowed) {
        return jsonResult(createLimitReachedRejection(
          buildRejectedResult(0, 'limit_reached'),
          enforcementDecision.enforcement,
        ));
      }
    }

    const result = await deps.executeToolCall(
      name as NormalizedToolName,
      (args ?? {}) as NormalizedToolInputMap[NormalizedToolName],
      createToolContext(deps),
    );
    const payload = result.ok ? result.data : (result.data ?? result.error);
    await deps.writeMcpDebugLog('tool_call_completed', {
      tool: name,
      delegatedTo: 'runtime-core',
      ok: result.ok,
    });
    return jsonResult(payload);
  }

  if (name === 'get_conversation_history') {
    const input = (args ?? {}) as GetConversationHistoryInput;
    const resolvedProjectId = deps.resolveProjectId(input.projectId);

    if (!resolvedProjectId) {
      throw new Error(`[Permanent] Project ID is required.
Reason: Conversation history is scoped to one project.
Fix: Provide projectId or set PROJECT_ID.`);
    }

    const limit = typeof input.limit === 'number' ? Math.min(Math.max(Math.trunc(input.limit), 1), 50) : 20;
    const messages = await messageService.list(resolvedProjectId, limit);

    await deps.writeMcpDebugLog('tool_call_completed', {
      tool: name,
      resolvedProjectId,
      messageCount: messages.length,
    });

    return jsonResult({
      messages,
      success: true,
    });
  }

  if (name === 'add_message') {
    const input = (args ?? {}) as AddMessageInput;
    const resolvedProjectId = deps.resolveProjectId(input.projectId);

    if (!resolvedProjectId) {
      throw new Error(`[Permanent] Project ID is required.
Reason: Conversation history is scoped to one project.
Fix: Provide projectId or set PROJECT_ID.`);
    }
    if (typeof input.content !== 'string' || input.content.trim().length === 0) {
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

server.setRequestHandler(ListToolsRequestSchema, handleListToolsRequest);
server.setRequestHandler(CallToolRequestSchema, (request) => handleCallToolRequest(request, defaultMcpHandlerDeps));

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (process.argv[1] && resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    console.error('Server error:', error);
    process.exit(1);
  });
}
