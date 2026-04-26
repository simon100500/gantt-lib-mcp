import { MCPServerStdio, tool, type MCPServer, type Tool } from '@openai/agents';
import { join } from 'node:path';
import {
  NORMALIZED_TOOL_CATALOG,
} from '@gantt/runtime-core/tool-core/catalog';
import { createToolContext } from '@gantt/runtime-core/tool-core/context';
import { executeToolCall } from '@gantt/runtime-core/tool-core/handlers';
import type {
  NormalizedToolInputMap,
  NormalizedToolName,
} from '@gantt/runtime-core/tool-core/types';

type JsonSchemaProperty = {
  type?: string;
  description?: string;
  enum?: readonly string[];
  pattern?: string;
  minimum?: number;
  maximum?: number;
  properties?: Record<string, JsonSchemaProperty>;
  items?: JsonSchemaProperty;
  required?: readonly string[];
};

export type OrdinaryAgentCompatibilityMode = 'embedded-direct' | 'legacy-subprocess';

export type BuildDirectToolDefinitionsInput = {
  projectId: string;
  runId: string;
  sessionId: string;
  attempt: number;
  historyGroupId?: string;
  requestContextId?: string;
  historyTitle?: string;
  userId?: string;
  onToolResult?: (toolCall: {
    toolUseId: string;
    toolName: NormalizedToolName;
    status: 'accepted' | 'rejected';
    reason?: string;
    changedTaskIds?: string[];
  }) => void;
};

export type ResolveOrdinaryAgentMcpServersInput = BuildDirectToolDefinitionsInput & {
  compatibilityMode?: OrdinaryAgentCompatibilityMode;
  mcpServerPath?: string;
  projectRoot: string;
  databaseUrl?: string;
};

type ToolInputJsonSchema = {
  type: 'object';
  properties: Record<string, JsonSchemaProperty>;
  required: string[];
  additionalProperties: true;
};

function buildOpenAIToolInputSchema(schema: {
  properties: Record<string, JsonSchemaProperty>;
  required?: readonly string[];
}): ToolInputJsonSchema {
  return {
    type: 'object',
    properties: schema.properties,
    required: [...(schema.required ?? [])],
    additionalProperties: true,
  };
}

export function buildDirectToolDefinitions(input: BuildDirectToolDefinitionsInput): Tool[] {
  return NORMALIZED_TOOL_CATALOG.map((definition) => tool({
    name: definition.name,
    description: definition.description,
    parameters: buildOpenAIToolInputSchema(definition.inputSchema),
    strict: false,
    execute: async (args, _context, details) => {
      const context = createToolContext({
        actorType: 'agent',
        actorId: input.userId,
        defaultProjectId: input.projectId,
        history: input.historyGroupId
          ? {
              groupId: input.historyGroupId,
              requestContextId: input.requestContextId ?? input.runId,
              title: input.historyTitle ?? 'AI mutation',
              origin: 'agent_run',
              finalizeGroup: true,
              undoable: true,
            }
          : undefined,
      });
      const result = await executeToolCall(
        definition.name as NormalizedToolName,
        args as NormalizedToolInputMap[typeof definition.name],
        context,
      );
      const payload = result.ok
        ? result.data
        : {
            status: 'rejected',
            reason: result.error.code,
            message: result.error.message,
            changedTaskIds: [],
            changedTasks: [],
            changedDependencyIds: [],
            conflicts: [],
          };
      const status = result.ok ? 'accepted' : 'rejected';
      input.onToolResult?.({
        toolUseId: details?.toolCall?.callId ?? `${definition.name}-${Date.now()}`,
        toolName: definition.name as NormalizedToolName,
        status,
        reason: result.ok ? undefined : result.error.code,
        changedTaskIds: Array.isArray((payload as { changedTaskIds?: unknown }).changedTaskIds)
          ? (payload as { changedTaskIds: string[] }).changedTaskIds
          : [],
      });

      return JSON.stringify(payload);
    },
  }));
}

export function resolveOrdinaryAgentCompatibilityMode(mode?: OrdinaryAgentCompatibilityMode): OrdinaryAgentCompatibilityMode {
  if (mode) {
    return mode;
  }

  return process.env.GANTT_AGENT_COMPATIBILITY_MODE === 'legacy-subprocess'
    ? 'legacy-subprocess'
    : 'embedded-direct';
}

export function resolveOrdinaryAgentToolRuntime(input: ResolveOrdinaryAgentMcpServersInput): {
  tools: Tool[];
  mcpServers: MCPServer[];
} {
  const compatibilityMode = resolveOrdinaryAgentCompatibilityMode(input.compatibilityMode);

  if (compatibilityMode === 'legacy-subprocess') {
    const mcpServerPath = input.mcpServerPath ?? join(input.projectRoot, 'packages/mcp/dist/index.js');
    return {
      tools: [],
      mcpServers: [
        new MCPServerStdio({
          name: 'gantt',
          command: 'node',
          args: [mcpServerPath],
          env: {
          DATABASE_URL: input.databaseUrl ?? process.env.DATABASE_URL ?? '',
          PROJECT_ID: input.projectId,
          AI_USER_ID: input.userId ?? '',
          AI_RUN_ID: input.runId,
          AI_SESSION_ID: input.sessionId,
          AI_MUTATION_SOURCE: 'agent',
          AI_ATTEMPT: String(input.attempt),
          },
        }),
      ],
    };
  }

  return {
    tools: buildDirectToolDefinitions(input),
    mcpServers: [],
  };
}
