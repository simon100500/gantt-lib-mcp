import { createSdkMcpServer, tool } from '@qwen-code/sdk';
import { join } from 'node:path';
import { z } from 'zod';
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
  userId?: string;
};

export type ResolveOrdinaryAgentMcpServersInput = BuildDirectToolDefinitionsInput & {
  compatibilityMode?: OrdinaryAgentCompatibilityMode;
  mcpServerPath?: string;
  projectRoot: string;
  databaseUrl?: string;
};

function convertJsonSchemaPropertyToZodSchema(
  property: JsonSchemaProperty | undefined,
  required: boolean,
): z.ZodTypeAny {
  let schema: z.ZodTypeAny;

  switch (property?.type) {
    case 'string': {
      schema = z.string();
      if (property.pattern) {
        schema = (schema as z.ZodString).regex(new RegExp(property.pattern));
      }
      if (Array.isArray(property.enum) && property.enum.length > 0) {
        const [first, ...rest] = property.enum;
        schema = z.enum([first, ...rest] as [string, ...string[]]);
      }
      break;
    }
    case 'number': {
      schema = z.number();
      if (typeof property.minimum === 'number') {
        schema = (schema as z.ZodNumber).min(property.minimum);
      }
      if (typeof property.maximum === 'number') {
        schema = (schema as z.ZodNumber).max(property.maximum);
      }
      break;
    }
    case 'boolean':
      schema = z.boolean();
      break;
    case 'array':
      schema = z.array(convertJsonSchemaPropertyToZodSchema(property.items, true));
      break;
    case 'object':
    default: {
      const shape: Record<string, z.ZodTypeAny> = {};
      const objectRequired = new Set(property?.required ?? []);
      for (const [key, value] of Object.entries(property?.properties ?? {})) {
        shape[key] = convertJsonSchemaPropertyToZodSchema(value, objectRequired.has(key));
      }
      schema = z.object(shape);
      break;
    }
  }

  return required ? schema : schema.optional();
}

function convertToolInputSchemaToZodShape(schema: { properties: Record<string, JsonSchemaProperty>; required?: readonly string[] }): Record<string, z.ZodTypeAny> {
  const required = new Set(schema.required ?? []);
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const [key, value] of Object.entries(schema.properties)) {
    shape[key] = convertJsonSchemaPropertyToZodSchema(value, required.has(key));
  }

  return shape;
}

export function buildDirectToolDefinitions(input: BuildDirectToolDefinitionsInput) {
  return NORMALIZED_TOOL_CATALOG.map((definition) => tool(
    definition.name,
    definition.description,
    convertToolInputSchemaToZodShape(definition.inputSchema),
    async (args) => {
      const context = createToolContext({
        actorType: 'agent',
        actorId: input.userId,
        defaultProjectId: input.projectId,
      });
      const result = await executeToolCall(
        definition.name as NormalizedToolName,
        args as NormalizedToolInputMap[typeof definition.name],
        context,
      );

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(
            result.ok
              ? result.data
              : {
                  status: 'rejected',
                  reason: result.error.code,
                  message: result.error.message,
                  changedTaskIds: [],
                  changedTasks: [],
                  changedDependencyIds: [],
                  conflicts: [],
                },
          ),
        }],
        ...(result.ok ? {} : { isError: true }),
      };
    },
  ));
}

export function resolveOrdinaryAgentCompatibilityMode(mode?: OrdinaryAgentCompatibilityMode): OrdinaryAgentCompatibilityMode {
  if (mode) {
    return mode;
  }

  return process.env.GANTT_AGENT_COMPATIBILITY_MODE === 'legacy-subprocess'
    ? 'legacy-subprocess'
    : 'embedded-direct';
}

export function resolveOrdinaryAgentMcpServers(input: ResolveOrdinaryAgentMcpServersInput) {
  const compatibilityMode = resolveOrdinaryAgentCompatibilityMode(input.compatibilityMode);

  if (compatibilityMode === 'legacy-subprocess') {
    const mcpServerPath = input.mcpServerPath ?? join(input.projectRoot, 'packages/mcp/dist/index.js');
    return {
      gantt: {
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
      },
    };
  }

  return {
    gantt: createSdkMcpServer({
      name: 'gantt',
      tools: buildDirectToolDefinitions(input),
    }),
  };
}
