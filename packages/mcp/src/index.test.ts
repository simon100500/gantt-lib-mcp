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

function createDeps() {
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
    executeToolCall: async (_name: string, _input: unknown) => ({
      ok: true as const,
      data: {
        version: 11,
        query: 'paint',
        matches: [{ taskId: 'paint-1', name: 'Paint walls', score: 900, parentPath: [], startDate: '2026-04-01', endDate: '2026-04-02' }],
      },
    }),
  };
}

describe('MCP adapter surface', () => {
  it('derives normalized public tools from the shared catalog', async () => {
    const result = await handleListToolsRequest();
    const normalizedExpectedNames = NORMALIZED_TOOL_CATALOG.map((tool) => tool.name);
    const normalizedActualNames = result.tools
      .map((tool) => tool.name as string)
      .filter((toolName) => normalizedExpectedNames.includes(toolName));

    assert.deepEqual(normalizedActualNames, normalizedExpectedNames);
    assert.equal(PUBLIC_MCP_TOOLS.find((tool) => tool.name === 'find_tasks')?.description, NORMALIZED_TOOL_CATALOG.find((tool) => tool.name === 'find_tasks')?.description);

    for (const legacyName of LEGACY_SCHEDULING_TOOL_NAMES) {
      assert.ok(!normalizedActualNames.includes(legacyName), `legacy tool leaked into runtime list handler: ${legacyName}`);
    }
  });

  it('delegates normalized tools to the shared runtime handler and wraps the result as MCP content', async () => {
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
      createDeps() as Parameters<typeof handleCallToolRequest>[1],
    ));

    assert.equal(payload.version, 11);
    assert.equal(payload.query, 'paint');
    assert.deepEqual(payload.matches.map((match: { taskId: string }) => match.taskId), ['paint-1']);
  });
});
