import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { NORMALIZED_TOOL_CATALOG } from '@gantt/runtime-core/tool-core';
import { handleCallToolRequest, handleListToolsRequest } from './index.js';
import { LEGACY_SCHEDULING_TOOL_NAMES, PUBLIC_MCP_TOOLS } from './public-tools.js';

function parseJsonContent(response: Awaited<ReturnType<typeof handleCallToolRequest>>) {
  assert.equal(response.content.length, 1);
  assert.equal(response.content[0]?.type, 'text');
  return JSON.parse(response.content[0]!.text);
}

function createDeps(
  executeToolCallImpl: (name: string, input: unknown) => Promise<{ ok: true; data: unknown }>,
) {
  return {
    writeMcpDebugLog: async () => {},
    commitNormalizedCommand: async () => {
      throw new Error('unexpected commitNormalizedCommand call');
    },
    getProjectSnapshotSummary: async () => {
      throw new Error('unexpected getProjectSnapshotSummary call');
    },
    listAllProjectTasks: async () => {
      throw new Error('unexpected listAllProjectTasks call');
    },
    resolveProjectId: (projectId: unknown) => typeof projectId === 'string' ? projectId : 'project-1',
    taskService: {
      get: async () => undefined,
    },
    getPrisma: () => ({}) as never,
    getProjectScheduleOptionsForProject: async () => ({
      businessDays: false,
      weekendPredicate: undefined,
    }),
    enforcementService: {
      evaluateMutationAccess: async () => ({ allowed: true as const }),
    },
    executeToolCall: executeToolCallImpl,
  };
}

describe('MCP adapter surface', () => {
  it('derives normalized public tools from the shared catalog', async () => {
    const result = await handleListToolsRequest();
    const normalizedExpectedNames = NORMALIZED_TOOL_CATALOG.map((tool) => tool.name);
    const normalizedActualNames = result.tools
      .map((tool) => tool.name as string)
      .filter((toolName) => normalizedExpectedNames.includes(toolName as typeof normalizedExpectedNames[number]));

    assert.deepEqual(normalizedActualNames, normalizedExpectedNames);
    assert.equal(PUBLIC_MCP_TOOLS.find((tool) => tool.name === 'find_tasks')?.description, NORMALIZED_TOOL_CATALOG.find((tool) => tool.name === 'find_tasks')?.description);

    for (const legacyName of LEGACY_SCHEDULING_TOOL_NAMES) {
      assert.ok(!normalizedActualNames.includes(legacyName as typeof normalizedActualNames[number]), `legacy tool leaked into runtime list handler: ${legacyName}`);
    }
  });

  it('delegates normalized tools to the shared runtime handler and wraps the result as MCP content', async () => {
    const delegatedCalls: Array<{ name: string; input: unknown }> = [];
    const payload = parseJsonContent(await handleCallToolRequest(
      {
        params: {
          name: 'find_tasks',
          arguments: {
            projectId: 'project-1',
            query: 'paint',
          },
        },
      },
      createDeps(async (name, input) => {
        delegatedCalls.push({ name, input });
        return {
          ok: true as const,
          data: {
            version: 11,
            query: 'paint',
            matches: [{ taskId: 'paint-1', name: 'Paint walls', score: 900, parentPath: [], startDate: '2026-04-01', endDate: '2026-04-02' }],
          },
        };
      }) as Parameters<typeof handleCallToolRequest>[1],
    ));

    assert.deepEqual(delegatedCalls, [{
      name: 'find_tasks',
      input: {
        projectId: 'project-1',
        query: 'paint',
      },
    }]);
    assert.equal(payload.version, 11);
    assert.equal(payload.query, 'paint');
    assert.deepEqual(payload.matches.map((match: { taskId: string }) => match.taskId), ['paint-1']);
  });

  it('wraps get_project_summary and create_tasks payloads without changing their normalized semantics', async () => {
    const directPayloads = {
      get_project_summary: {
        projectId: 'project-1',
        version: 11,
        dayMode: 'calendar',
        effectiveDateRange: { startDate: '2026-04-01', endDate: '2026-04-30' },
        rootTaskCount: 1,
        totalTaskCount: 3,
        healthFlags: [],
      },
      create_tasks: {
        status: 'accepted',
        baseVersion: 4,
        newVersion: 5,
        changedTaskIds: ['task-1'],
        changedTasks: [{ id: 'task-1', name: 'Task 1', startDate: '2026-04-01', endDate: '2026-04-02', dependencies: [] }],
        changedDependencyIds: [],
        conflicts: [],
      },
    } as const;

    const readPayload = parseJsonContent(await handleCallToolRequest(
      {
        params: {
          name: 'get_project_summary',
          arguments: { projectId: 'project-1' },
        },
      },
      createDeps(async (name) => ({ ok: true as const, data: directPayloads[name as keyof typeof directPayloads] })) as Parameters<typeof handleCallToolRequest>[1],
    ));
    const mutationPayload = parseJsonContent(await handleCallToolRequest(
      {
        params: {
          name: 'create_tasks',
          arguments: {
            projectId: 'project-1',
            tasks: [{ name: 'Task 1', startDate: '2026-04-01', endDate: '2026-04-02' }],
          },
        },
      },
      createDeps(async (name) => ({ ok: true as const, data: directPayloads[name as keyof typeof directPayloads] })) as Parameters<typeof handleCallToolRequest>[1],
    ));

    assert.deepEqual(readPayload, directPayloads.get_project_summary);
    assert.deepEqual(mutationPayload, directPayloads.create_tasks);
  });

  it('wraps validate_schedule results as MCP content while preserving the direct validation payload', async () => {
    const directPayload = {
      version: 11,
      isValid: false,
      errors: [{ type: 'missing-task', message: 'Dependency references missing task', taskId: 'task-1', dependencyTaskId: 'missing' }],
    };

    const payload = parseJsonContent(await handleCallToolRequest(
      {
        params: {
          name: 'validate_schedule',
          arguments: { projectId: 'project-1' },
        },
      },
      createDeps(async () => ({ ok: true as const, data: directPayload })) as Parameters<typeof handleCallToolRequest>[1],
    ));

    assert.deepEqual(payload, directPayload);
  });
});
