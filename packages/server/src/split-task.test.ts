import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('runDirectSplitTask', () => {
  it('parses explicit split lists from lines and semicolons', async () => {
    const { parseExplicitSplitList } = await import('./split-task.js');

    assert.deepEqual(parseExplicitSplitList('1. Подготовка\n2. Монтаж\n- Пусконаладка'), [
      { key: 'item-1', text: 'Подготовка' },
      { key: 'item-2', text: 'Монтаж' },
      { key: 'item-3', text: 'Пусконаладка' },
    ]);

    assert.deepEqual(parseExplicitSplitList('Подготовка; Монтаж; Пусконаладка'), [
      { key: 'item-1', text: 'Подготовка' },
      { key: 'item-2', text: 'Монтаж' },
      { key: 'item-3', text: 'Пусконаладка' },
    ]);
  });

  it('executes split-task plans through authoritative mutation commands', async () => {
    process.env.DATABASE_URL ??= 'postgresql://user:pass@localhost:5432/test';
    const { runDirectSplitTask } = await import('./split-task.js');
    const committedCommands: Array<{ type: string; tasks?: Array<{ id?: string; parentId?: string }> }> = [];
    const broadcasts: string[] = [];
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    let listCallCount = 0;

    const result = await runDirectSplitTask({
      projectId: 'project-1',
      sessionId: 'session-1',
      runId: 'run-1',
      taskId: 'task-slab',
      details: 'Разбей по этажам 12-17.',
      handoff: {
        executor: 'split_task',
        targetTaskId: 'task-slab',
        targetTaskName: 'Бетонирование перекрытий 12-17 этажей',
        mode: 'by_floor',
        rangeFrom: 12,
        rangeTo: 17,
        confidence: 0.96,
        ready: true,
      },
      env: {
        OPENAI_API_KEY: '',
        OPENAI_BASE_URL: 'https://example.test',
        OPENAI_MODEL: 'gpt-main',
      },
      services: {
        messageService: {
          add: async (role, content) => {
            messages.push({ role, content });
            return {} as never;
          },
        },
        taskService: {
          list: async () => {
            listCallCount += 1;
            if (listCallCount === 1) {
              return {
                tasks: [{
                  id: 'task-slab',
                  name: 'Бетонирование перекрытий 12-17 этажей',
                  startDate: '2026-04-01',
                  endDate: '2026-04-12',
                }],
                hasMore: false,
                total: 1,
              };
            }

            return {
              tasks: [
                {
                  id: 'task-slab',
                  name: 'Бетонирование перекрытий 12-17 этажей',
                  startDate: '2026-04-01',
                  endDate: '2026-04-12',
                },
                {
                  id: 'task-slab:setup',
                  name: 'Подготовка к бетонированию',
                  parentId: 'task-slab',
                  startDate: '2026-04-01',
                  endDate: '2026-04-02',
                },
                {
                  id: 'task-slab:pour',
                  name: 'Бетонирование захватки',
                  parentId: 'task-slab',
                  startDate: '2026-04-03',
                  endDate: '2026-04-05',
                },
              ],
              hasMore: false,
              total: 3,
            };
          },
          get: async () => ({
            id: 'task-slab',
            name: 'Бетонирование перекрытий 12-17 этажей',
            startDate: '2026-04-01',
            endDate: '2026-04-12',
            children: [],
          }),
        },
        commandService: {
          commitCommand: async (request: {
            baseVersion: number;
            command: { type: string; tasks?: Array<{ id?: string; parentId?: string }> };
          }) => {
            committedCommands.push(request.command);
            return {
              accepted: true,
              clientRequestId: 'req-1',
              baseVersion: request.baseVersion,
              newVersion: request.baseVersion + 1,
              result: {
                snapshot: { tasks: [], dependencies: [] },
                changedTaskIds: ['task-slab', 'task-slab:setup', 'task-slab:pour'],
                changedDependencyIds: [],
                conflicts: [],
                patches: [],
              },
              snapshot: { tasks: [], dependencies: [] },
            };
          },
        },
      },
      broadcastToSession: (_sessionId, message) => {
        broadcasts.push(message.type);
      },
      plannerQuery: async () => JSON.stringify({
        title: 'Бетонирование перекрытий 12-17 этажей',
        why: 'Split by floor work package',
        nodes: [
          {
            nodeKey: 'setup',
            title: 'Подготовка к бетонированию',
            taskType: 'task',
            durationDays: 2,
            dependsOnNodeKeys: [],
          },
          {
            nodeKey: 'pour',
            title: 'Бетонирование захватки',
            taskType: 'task',
            durationDays: 3,
            dependsOnNodeKeys: ['setup'],
          },
        ],
      }),
      loadProjectVersion: async () => 7,
      writeDebugLog: async () => undefined,
      getLatestVisibleGroupId: async () => 'history-1',
    });

    assert.equal(result.execution.status, 'completed');
    assert.deepEqual(result.execution.committedCommandTypes, ['create_tasks_batch', 'create_dependency']);
    assert.equal(committedCommands[0]?.type, 'create_tasks_batch');
    assert.equal(committedCommands[0]?.tasks?.[0]?.parentId, 'task-slab');
    assert.equal(committedCommands[1]?.type, 'create_dependency');
    assert.match(result.assistantResponse, /детализирована на 2 подзадач/i);
    assert.deepEqual(broadcasts, ['token', 'tasks', 'history_changed', 'done']);
    assert.deepEqual(messages.map((entry) => entry.role), ['user', 'assistant']);
  });

  it('keeps explicit split lists strict and ordered', async () => {
    process.env.DATABASE_URL ??= 'postgresql://user:pass@localhost:5432/test';
    const { runDirectSplitTask } = await import('./split-task.js');
    let plannerPrompt = '';
    let plannerSystemPrompt = '';
    let plannerMaxSessionTurns = 0;
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    let listCallCount = 0;

    const result = await runDirectSplitTask({
      projectId: 'project-1',
      sessionId: 'session-1',
      runId: 'run-explicit',
      taskId: 'task-fitout',
      details: '1. Черновая электрика\n2. Чистовая электрика\n3. Пусконаладка',
      explicitListMode: true,
      env: {
        OPENAI_API_KEY: '',
        OPENAI_BASE_URL: 'https://example.test',
        OPENAI_MODEL: 'gpt-main',
      },
      services: {
        messageService: {
          add: async (role, content) => {
            messages.push({ role, content });
            return {} as never;
          },
        },
        taskService: {
          list: async () => {
            listCallCount += 1;
            if (listCallCount === 1) {
              return {
                tasks: [{
                  id: 'task-fitout',
                  name: 'Электромонтаж',
                  startDate: '2026-04-01',
                  endDate: '2026-04-08',
                }],
                hasMore: false,
                total: 1,
              };
            }

            return {
              tasks: [
                {
                  id: 'task-fitout',
                  name: 'Электромонтаж',
                  startDate: '2026-04-01',
                  endDate: '2026-04-08',
                },
                {
                  id: 'task-fitout:rough',
                  name: 'Черновая электрика',
                  parentId: 'task-fitout',
                  startDate: '2026-04-01',
                  endDate: '2026-04-03',
                },
                {
                  id: 'task-fitout:clean',
                  name: 'Чистовая электрика',
                  parentId: 'task-fitout',
                  startDate: '2026-04-04',
                  endDate: '2026-04-05',
                },
                {
                  id: 'task-fitout:finish',
                  name: 'Пусконаладочные работы',
                  parentId: 'task-fitout',
                  startDate: '2026-04-06',
                  endDate: '2026-04-06',
                },
              ],
              hasMore: false,
              total: 4,
            };
          },
          get: async () => ({
            id: 'task-fitout',
            name: 'Электромонтаж',
            startDate: '2026-04-01',
            endDate: '2026-04-08',
            children: [],
          }),
        },
        commandService: {
          commitCommand: async (request: { baseVersion: number; command: { type: string } }) => ({
            accepted: true,
            clientRequestId: 'req-1',
            baseVersion: request.baseVersion,
            newVersion: request.baseVersion + 1,
            result: {
              snapshot: { tasks: [], dependencies: [] },
              changedTaskIds: ['task-fitout', 'task-fitout:rough', 'task-fitout:clean', 'task-fitout:finish'],
              changedDependencyIds: ['dep-1', 'dep-2'],
              conflicts: [],
              patches: [],
            },
            snapshot: { tasks: [], dependencies: [] },
          }),
        },
      },
      broadcastToSession: () => undefined,
      plannerQuery: async (prompt, _env, options) => {
        plannerPrompt = prompt;
        plannerSystemPrompt = options?.systemPrompt ?? '';
        plannerMaxSessionTurns = options?.maxSessionTurns ?? 0;
        return JSON.stringify({
          title: 'Электромонтаж',
          why: 'Strict explicit split',
          nodes: [
            {
              nodeKey: 'finish',
              sourceItemKey: 'item-3',
              title: 'Пусконаладочные работы',
              taskType: 'task',
              durationDays: 1,
              dependsOnNodeKeys: ['clean'],
            },
            {
              nodeKey: 'rough',
              sourceItemKey: 'item-1',
              title: 'Черновая электрика',
              taskType: 'task',
              durationDays: 3,
              dependsOnNodeKeys: [],
            },
            {
              nodeKey: 'clean',
              sourceItemKey: 'item-2',
              title: 'Чистовая электрика',
              taskType: 'task',
              durationDays: 2,
              dependsOnNodeKeys: ['rough'],
            },
          ],
        });
      },
      loadProjectVersion: async () => 7,
      writeDebugLog: async () => undefined,
      getLatestVisibleGroupId: async () => 'history-1',
    });

    assert.doesNotMatch(plannerPrompt, /Черновая электрика/i);
    assert.doesNotMatch(plannerPrompt, /Use exactly the explicit user-supplied worklist below/i);
    assert.match(plannerSystemPrompt, /Use exactly the explicit user-supplied worklist below/i);
    assert.match(plannerSystemPrompt, /item-1: Черновая электрика/i);
    assert.match(plannerSystemPrompt, /item-2: Чистовая электрика/i);
    assert.match(plannerSystemPrompt, /item-3: Пусконаладка/i);
    assert.equal(plannerMaxSessionTurns, 1);
    assert.match(messages[0]?.content ?? '', /Используй только этот явный список подзадач/i);
    assert.doesNotMatch(messages[0]?.content ?? '', /Уточнения:/i);
    assert.deepEqual(result.fragmentPlan.nodes.map((node) => node.title), [
      'Черновая электрика',
      'Чистовая электрика',
      'Пусконаладочные работы',
    ]);
  });
});
