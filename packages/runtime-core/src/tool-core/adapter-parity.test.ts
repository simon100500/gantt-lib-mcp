import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { executeToolCall, NORMALIZED_TOOL_CATALOG } from './index.js';
import type { ToolCallContext } from './types.js';

type TestTask = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  parentId?: string;
  dependencies: Array<{ taskId: string; type: 'FS' | 'SS' | 'FF' | 'SF'; lag?: number }>;
};

async function loadMcpModule() {
  return import(new URL('../../../mcp/src/index.js', import.meta.url).href);
}

function parseAdapterPayload(response: { content: Array<{ type?: string; text: string }> }) {
  assert.equal(response.content.length, 1);
  assert.equal(response.content[0]?.type, 'text');
  return JSON.parse(response.content[0]!.text);
}

function createTask(id: string, name: string, startDate: string, endDate: string, parentId?: string): TestTask {
  return {
    id,
    name,
    startDate,
    endDate,
    parentId,
    dependencies: [],
  };
}

function createContext(): ToolCallContext {
  const tasks = [
    createTask('root', 'Root Phase', '2026-04-01', '2026-04-20'),
    createTask('paint-1', 'Paint walls floor 1', '2026-04-02', '2026-04-05', 'root'),
    createTask('paint-2', 'Paint ceiling floor 2', '2026-04-06', '2026-04-08', 'root'),
  ];

  return {
    actorType: 'agent',
    defaultProjectId: 'project-1',
    getProjectSummary: async (projectId: string) => ({
      projectId,
      version: 11,
      dayMode: 'calendar',
      effectiveDateRange: { startDate: '2026-04-01', endDate: '2026-04-30' },
      rootTaskCount: 1,
      totalTaskCount: tasks.length,
      healthFlags: [],
    }),
    listAllProjectTasks: async () => tasks,
    getTask: async (_projectId: string, taskId: string) => tasks.find((task) => task.id === taskId),
    getProjectScheduleOptions: async () => ({
      businessDays: false,
      weekendPredicate: undefined,
    }),
    commitCommand: async (_projectId, command) => {
      if (command.type === 'create_task') {
        const createdTask = {
          id: command.task.id ?? 'created-1',
          name: command.task.name,
          startDate: command.task.startDate,
          endDate: command.task.endDate,
          parentId: command.task.parentId,
          dependencies: command.task.dependencies ?? [],
        };
        return {
          baseVersion: 11,
          response: {
            clientRequestId: 'req-1',
            accepted: true as const,
            baseVersion: 11,
            newVersion: 12,
            result: {
              changedTaskIds: [createdTask.id],
              changedDependencyIds: [],
              conflicts: [],
              snapshot: {
                tasks: [...tasks, createdTask],
                dependencies: [],
              },
              patches: [],
            },
            snapshot: {
              tasks: [...tasks, createdTask],
              dependencies: [],
            },
          },
        };
      }

      throw new Error(`Unexpected command in adapter parity test: ${command.type}`);
    },
    resolveProjectId: (projectId?: string | null) => projectId ?? 'project-1',
  };
}

function createAdapterDeps(context: ToolCallContext) {
  return {
    writeMcpDebugLog: async () => {},
    commitNormalizedCommand: context.commitCommand,
    getProjectSnapshotSummary: context.getProjectSummary,
    listAllProjectTasks: context.listAllProjectTasks,
    resolveProjectId: context.resolveProjectId,
    taskService: {
      get: async (taskId: string) => context.getTask('project-1', taskId),
    },
    getPrisma: () => ({}) as never,
    getProjectScheduleOptionsForProject: async () => ({
      businessDays: false,
      weekendPredicate: undefined,
    }),
    enforcementService: {
      evaluateMutationAccess: async () => ({ allowed: true as const }),
    },
    executeToolCall,
  };
}

describe('adapter parity', () => {
  it('exposes the same tool catalog names as the shared normalized tool catalog', async () => {
    const { handleListToolsRequest } = await loadMcpModule();
    const adapterTools = await handleListToolsRequest();
    const adapterNormalizedNames = adapterTools.tools
      .map((tool) => tool.name as string)
      .filter((name) => NORMALIZED_TOOL_CATALOG.some((tool) => tool.name === name));

    assert.deepEqual(adapterNormalizedNames, NORMALIZED_TOOL_CATALOG.map((tool) => tool.name));
  });

  it('returns the same normalized result for get_project_summary via adapter and direct handlers', async () => {
    const { handleCallToolRequest } = await loadMcpModule();
    const context = createContext();
    const directResult = await executeToolCall('get_project_summary', { projectId: 'project-1' }, context);
    const adapterResult = parseAdapterPayload(await handleCallToolRequest(
      { params: { name: 'get_project_summary', arguments: { projectId: 'project-1' } } },
      createAdapterDeps(context),
    ));

    assert.equal(directResult.ok, true);
    if (!directResult.ok) {
      return;
    }

    assert.deepEqual(adapterResult, JSON.parse(JSON.stringify(directResult.data)));
  });

  it('returns the same normalized result for find_tasks via adapter and direct handlers', async () => {
    const { handleCallToolRequest } = await loadMcpModule();
    const context = createContext();
    const directResult = await executeToolCall('find_tasks', { projectId: 'project-1', query: 'paint floor', limit: 2 }, context);
    const adapterResult = parseAdapterPayload(await handleCallToolRequest(
      { params: { name: 'find_tasks', arguments: { projectId: 'project-1', query: 'paint floor', limit: 2 } } },
      createAdapterDeps(context),
    ));

    assert.equal(directResult.ok, true);
    if (!directResult.ok) {
      return;
    }

    assert.deepEqual(adapterResult, JSON.parse(JSON.stringify(directResult.data)));
  });

  it('returns the same normalized result for create_tasks via adapter and direct handlers', async () => {
    const { handleCallToolRequest } = await loadMcpModule();
    const context = createContext();
    const input = {
      projectId: 'project-1',
      includeSnapshot: true,
      tasks: [{ name: 'Created from parity test', startDate: '2026-04-10', endDate: '2026-04-11' }],
    };
    const directResult = await executeToolCall('create_tasks', input, context);
    const adapterResult = parseAdapterPayload(await handleCallToolRequest(
      { params: { name: 'create_tasks', arguments: input } },
      createAdapterDeps(context),
    ));

    assert.equal(directResult.ok, true);
    if (!directResult.ok) {
      return;
    }

    assert.equal(adapterResult.status, 'accepted');
    assert.equal(directResult.data.status, 'accepted');
    assert.deepEqual(adapterResult, JSON.parse(JSON.stringify(directResult.data)));
  });

  it('returns the same normalized result for validate_schedule via adapter and direct handlers', async () => {
    const { handleCallToolRequest } = await loadMcpModule();
    const context = createContext();
    const directResult = await executeToolCall('validate_schedule', { projectId: 'project-1' }, context);
    const adapterResult = parseAdapterPayload(await handleCallToolRequest(
      { params: { name: 'validate_schedule', arguments: { projectId: 'project-1' } } },
      createAdapterDeps(context),
    ));

    assert.equal(directResult.ok, true);
    if (!directResult.ok) {
      return;
    }

    assert.deepEqual(adapterResult, JSON.parse(JSON.stringify(directResult.data)));
  });
});
