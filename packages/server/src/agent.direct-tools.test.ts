import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Check } from 'typebox/value';

import { NORMALIZED_TOOL_CATALOG } from '@gantt/runtime-core/tool-core/catalog';

import {
  buildPiAgentTools,
  buildPiOpenAICompletionsModel,
  convertToolInputSchemaToTypeBox,
} from './agent/pi-agent-runner.js';

describe('pi ordinary agent tool adapter', () => {
  it('exposes exactly the normalized catalog tool names', () => {
    const tools = buildPiAgentTools({
      projectId: 'project-1',
      runId: 'run-1',
      historyGroupId: 'group-1',
      requestContextId: 'run-1',
      historyTitle: 'AI - test',
    });

    assert.deepEqual(
      tools.map((tool) => tool.name),
      NORMALIZED_TOOL_CATALOG.map((tool) => tool.name),
    );
  });

  it('converts JSON schema primitives, arrays, objects, enums, and optional fields to TypeBox', () => {
    const schema = convertToolInputSchemaToTypeBox({
      type: 'object',
      properties: {
        name: { type: 'string' },
        progress: { type: 'number', minimum: 0, maximum: 100 },
        dryRun: { type: 'boolean' },
        tags: { type: 'array', items: { type: 'string' } },
        nested: {
          type: 'object',
          properties: {
            mode: { type: 'string', enum: ['calendar', 'working'] },
          },
          required: ['mode'],
        },
      },
      required: ['name', 'nested'],
    } as any);

    assert.equal(Check(schema, {
      name: 'Task',
      progress: 50,
      dryRun: false,
      tags: ['a'],
      nested: { mode: 'calendar' },
    }), true);
    assert.equal(Check(schema, { nested: { mode: 'calendar' } }), false);
    assert.equal(Check(schema, { name: 'Task', nested: { mode: 'absolute' } }), false);
    assert.equal(Check(schema, { name: 'Task', nested: { mode: 'working' } }), true);
  });

  it('passes one historyGroupId and requestContextId to every mutating tool and none to reads', async () => {
    const contexts: Array<Record<string, any>> = [];
    const tools = buildPiAgentTools({
      projectId: 'project-1',
      runId: 'run-1',
      historyGroupId: 'group-shared',
      requestContextId: 'request-shared',
      historyTitle: 'AI - grouped',
      createContext: ((options: Record<string, any>) => {
        contexts.push(options);
        return {};
      }) as any,
      executeTool: (async (name: string) => ({
        ok: true,
        data: name === 'find_tasks'
          ? { version: 1, query: 'x', matches: [] }
          : {
              status: 'accepted',
              changedTaskIds: ['task-1'],
              changedDependencyIds: [],
              conflicts: [],
            },
      })) as any,
    });

    await tools.find((tool) => tool.name === 'shift_tasks')!.execute('tool-1', {
      shifts: [{ taskId: 'task-1', delta: 2 }],
    }, undefined);
    await tools.find((tool) => tool.name === 'update_tasks')!.execute('tool-2', {
      updates: [{ id: 'task-1', name: 'Updated' }],
    }, undefined);
    await tools.find((tool) => tool.name === 'find_tasks')!.execute('tool-3', {
      query: 'task',
    }, undefined);

    assert.equal(contexts[0]?.history?.groupId, 'group-shared');
    assert.equal(contexts[1]?.history?.groupId, 'group-shared');
    assert.equal(contexts[0]?.history?.requestContextId, 'request-shared');
    assert.equal(contexts[1]?.history?.requestContextId, 'request-shared');
    assert.equal(contexts[0]?.history?.undoable, true);
    assert.equal(contexts[1]?.history?.finalizeGroup, true);
    assert.equal(contexts[2]?.history, undefined);
  });

  it('builds the configured openai-completions model from current env values', () => {
    const model = buildPiOpenAICompletionsModel({
      OPENAI_API_KEY: 'secret',
      OPENAI_BASE_URL: 'https://llm.example/v1',
      OPENAI_MODEL: 'gpt-test',
    });

    assert.equal(model.api, 'openai-completions');
    assert.equal(model.baseUrl, 'https://llm.example/v1');
    assert.equal(model.id, 'gpt-test');
    assert.equal(model.reasoning, false);
  });
});
