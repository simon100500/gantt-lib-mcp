import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildMutationFailureMessage,
  buildMutationSuccessMessage,
} from './messages.js';
import { runStagedMutation } from './orchestrator.js';
import type { MutationPlanOperation } from './types.js';

function semanticPayloadFor(userMessage: string): string {
  switch (userMessage) {
    case 'сдвинь штукатурку на 2 дня':
      return JSON.stringify({
        route: 'fast_path',
        intentFamily: 'task_edit',
        intentType: 'shift_relative',
        confidence: 0.92,
        riskLevel: 'S1',
        params: { deltaDays: 2 },
        ambiguities: [],
        entitiesMentioned: ['штукатурка'],
        deltaDays: 2,
      });
    case 'добавь сдачу технадзору':
      return JSON.stringify({
        route: 'fast_path',
        intentFamily: 'task_edit',
        intentType: 'add_single_task',
        confidence: 0.93,
        riskLevel: 'S1',
        params: {
          taskTitle: 'Сдача технадзору',
          durationDays: 1,
        },
        ambiguities: [],
        entitiesMentioned: ['сдача технадзору'],
        taskTitle: 'Сдача технадзору',
        durationDays: 1,
      });
    case 'добавь покраску обоев на каждый этаж':
      return JSON.stringify({
        route: 'fast_path',
        intentFamily: 'task_edit',
        intentType: 'add_repeated_fragment',
        confidence: 0.9,
        riskLevel: 'S1',
        params: {
          groupScopeHint: 'этаж',
        },
        ambiguities: [],
        entitiesMentioned: ['покраска обоев'],
        groupScopeHint: 'этаж',
        fragmentPlan: {
          title: 'Покраска обоев',
          nodes: [{ nodeKey: 'wallpaper-paint', title: 'Покраска обоев', durationDays: 2, dependsOnNodeKeys: [] }],
        },
      });
    case 'на каждом этаже добавь работу (веху) сдача технадзору':
      return JSON.stringify({
        route: 'fast_path',
        intentFamily: 'task_edit',
        intentType: 'add_repeated_fragment',
        confidence: 0.94,
        riskLevel: 'S1',
        params: {
          groupScopeHint: 'этаж',
        },
        ambiguities: [],
        entitiesMentioned: ['Сдача технадзору'],
        groupScopeHint: 'этаж',
      });
    case 'распиши подробнее пункт "Инженерные системы"':
      return JSON.stringify({
        route: 'specialized_fast_path',
        intentFamily: 'structure',
        intentType: 'expand_wbs',
        confidence: 0.91,
        riskLevel: 'S2',
        params: {},
        ambiguities: [],
        entitiesMentioned: ['Инженерные системы'],
        fragmentPlan: {
          title: 'Инженерные системы',
          nodes: [
            { nodeKey: 'prep', title: 'Подготовка', durationDays: 2, dependsOnNodeKeys: [] },
            { nodeKey: 'core', title: 'Основные работы', durationDays: 3, dependsOnNodeKeys: ['prep'] },
          ],
        },
      });
    case 'перенеси фундамент на 2026-05-10':
      return JSON.stringify({
        route: 'fast_path',
        intentFamily: 'task_edit',
        intentType: 'move_to_date',
        confidence: 0.94,
        riskLevel: 'S1',
        params: {
          targetDate: '2026-05-10',
        },
        ambiguities: [],
        entitiesMentioned: ['фундамент'],
        targetDate: '2026-05-10',
      });
    case 'Разбей Бетонирование перекрытий 12-17 этажей поэтажно':
      return JSON.stringify({
        route: 'specialized_fast_path',
        intentFamily: 'structure',
        intentType: 'decompose_task',
        confidence: 0.94,
        riskLevel: 'S2',
        params: {
          executor: 'split_task',
          mode: 'by_floor',
          range: { from: 12, to: 17 },
        },
        ambiguities: [],
        entitiesMentioned: ['Бетонирование перекрытий 12-17 этажей'],
      });
    case 'сделай что-нибудь получше':
      return JSON.stringify({
        route: 'clarify',
        intentFamily: 'clarification',
        intentType: 'unsupported_or_ambiguous',
        confidence: 0.25,
        riskLevel: 'S2',
        params: {},
        ambiguities: ['request_goal'],
        entitiesMentioned: [],
      });
    default:
      return JSON.stringify({
        route: 'clarify',
        intentFamily: 'clarification',
        intentType: 'unsupported_or_ambiguous',
        confidence: 0.2,
        riskLevel: 'S2',
        params: {},
        ambiguities: ['request_goal'],
        entitiesMentioned: [],
      });
  }
}

function semanticIntentQueryFor(userMessage: string) {
  return async () => ({ content: semanticPayloadFor(userMessage) });
}

const env = {
  OPENAI_API_KEY: '',
  OPENAI_BASE_URL: 'https://example.test',
  OPENAI_MODEL: 'gpt-main',
};

describe('staged mutation orchestrator', () => {
  it('uses the semantic planner path under feature flag and skips changed-set verification as a separate stage', async () => {
    const loggedEvents: Array<{ event: string; payload: Record<string, unknown> }> = [];
    const committedCommands: Array<{ type: string; task?: { dependencies?: Array<{ taskId: string; type: string }> } }> = [];
    const result = await runStagedMutation({
      userMessage: 'Добавь сдачу ГАСН в конце работ',
      projectId: 'project-1',
      projectVersion: 8,
      sessionId: 'session-1',
      runId: 'run-semantic-1',
      tasksBefore: [
        {
          id: 'container-closeout',
          name: 'Благоустройство и сдача',
          startDate: '2027-04-01',
          endDate: '2027-05-04',
        },
        {
          id: 'task-permit',
          name: 'Получение разрешения на ввод объекта в эксплуатацию',
          parentId: 'container-closeout',
          startDate: '2027-04-29',
          endDate: '2027-05-04',
        },
      ],
      env: {
        OPENAI_API_KEY: '',
        OPENAI_BASE_URL: 'https://example.test',
        OPENAI_MODEL: 'gpt-main',
        USE_SEMANTIC_PLANNER: 'true',
      },
      messageService: {
        add: async () => undefined,
      },
      taskService: {
        list: async () => ({
          tasks: [
            {
              id: 'container-closeout',
              name: 'Благоустройство и сдача',
              startDate: '2027-04-01',
              endDate: '2027-05-05',
            },
            {
              id: 'task-permit',
              name: 'Получение разрешения на ввод объекта в эксплуатацию',
              parentId: 'container-closeout',
              startDate: '2027-04-29',
              endDate: '2027-05-04',
            },
            {
              id: 'task-permit:sdacha-gasn',
              name: 'Сдача ГАСН',
              parentId: 'container-closeout',
              startDate: '2027-05-05',
              endDate: '2027-05-05',
              type: 'milestone',
              dependencies: [{ taskId: 'task-permit', type: 'FS' }],
            },
          ],
        }),
        findTasksByName: async () => ([
          {
            taskId: 'task-permit',
            name: 'Получение разрешения на ввод объекта в эксплуатацию',
            parentId: 'container-closeout',
            path: ['Благоустройство и сдача', 'Получение разрешения на ввод объекта в эксплуатацию'],
            startDate: '2027-04-29',
            endDate: '2027-05-04',
            matchType: 'exact',
            score: 0.96,
          },
        ]),
        findContainerCandidates: async () => ([
          {
            taskId: 'container-closeout',
            name: 'Благоустройство и сдача',
            parentId: null,
            path: ['Благоустройство и сдача'],
            startDate: '2027-04-01',
            endDate: '2027-05-04',
            matchType: 'exact',
            score: 0.9,
          },
        ]),
        listBranchTasks: async () => ([
          {
            taskId: 'container-closeout',
            name: 'Благоустройство и сдача',
            parentId: null,
            path: ['Благоустройство и сдача'],
            startDate: '2027-04-01',
            endDate: '2027-05-04',
            matchType: 'exact',
            score: 1,
          },
          {
            taskId: 'task-permit',
            name: 'Получение разрешения на ввод объекта в эксплуатацию',
            parentId: 'container-closeout',
            path: ['Благоустройство и сдача', 'Получение разрешения на ввод объекта в эксплуатацию'],
            startDate: '2027-04-29',
            endDate: '2027-05-04',
            matchType: 'exact',
            score: 0.96,
          },
        ]),
        findGroupScopes: async () => [],
      },
      commandService: {
        commitCommand: async (request: { baseVersion: number; command: { type: string; task?: { dependencies?: Array<{ taskId: string; type: string }> } } }) => {
          committedCommands.push(request.command);
          return {
            accepted: true,
            clientRequestId: 'req-1',
            baseVersion: request.baseVersion,
            newVersion: request.baseVersion + 1,
            result: {
              snapshot: { tasks: [], dependencies: [] },
              changedTaskIds: ['task-permit:sdacha-gasn'],
              changedDependencyIds: [],
              conflicts: [],
              patches: [],
            },
            snapshot: { tasks: [], dependencies: [] },
          };
        },
      },
      broadcastToSession: () => undefined,
      logger: {
        debug: (event, payload) => {
          loggedEvents.push({ event, payload });
        },
      },
      semanticIntentQuery: async () => ({
        content: JSON.stringify({
          ambiguity: 'none',
          operations: [{
            action: 'add_task',
            title: 'Сдача ГАСН',
            taskType: 'milestone',
            durationDays: 1,
            placement: {
              mode: 'inside_tail',
              parentHint: 'Благоустройство и сдача',
            },
          }],
        }),
      }),
    });

    assert.equal(result.handled, true);
    assert.equal(result.status, 'completed');
    assert.equal(result.result.verificationVerdict, 'accepted');
    assert.equal(committedCommands[0]?.type, 'create_task');
    assert.deepEqual(committedCommands[0]?.task?.dependencies, [{ taskId: 'task-permit', type: 'FS' }]);
    assert.deepEqual(loggedEvents.map((entry) => entry.event), [
      'semantic_plan_created',
      'semantic_resolution_started',
      'semantic_resolution_result',
      'semantic_compile_result',
      'final_outcome',
    ]);
  });

  it('falls back from semantic planner failure into the classifier path instead of deferring to legacy CLI', async () => {
    const loggedEvents: Array<{ event: string; payload: Record<string, unknown> }> = [];

    const result = await runStagedMutation({
      userMessage: 'Увелись длительность штукатурки в 2 раза',
      projectId: 'project-1',
      projectVersion: 5,
      sessionId: 'session-1',
      runId: 'run-semantic-fallback-1',
      tasksBefore: [{
        id: 'task-plaster',
        name: 'Штукатурка',
        startDate: '2026-04-01',
        endDate: '2026-04-03',
      }],
      env: {
        OPENAI_API_KEY: '',
        OPENAI_BASE_URL: 'https://example.test',
        OPENAI_MODEL: 'gpt-main',
        USE_SEMANTIC_PLANNER: 'true',
      },
      messageService: {
        add: async () => undefined,
      },
      taskService: {
        list: async () => ({
          tasks: [{
            id: 'task-plaster',
            name: 'Штукатурка',
            startDate: '2026-04-01',
            endDate: '2026-04-06',
          }],
          hasMore: false,
          total: 1,
        }),
        findTasksByName: async () => ([{
          taskId: 'task-plaster',
          name: 'Штукатурка',
          parentId: null,
          path: ['Отделка', 'Штукатурка'],
          startDate: '2026-04-01',
          endDate: '2026-04-03',
          matchType: 'exact',
          score: 0.96,
        }]),
        findContainerCandidates: async () => [],
        listBranchTasks: async () => [],
        findGroupScopes: async () => [],
      },
      commandService: {
        commitCommand: async (request: { baseVersion: number; command: { type: string; duration?: number } }) => ({
          accepted: true,
          clientRequestId: 'req-semantic-fallback-1',
          baseVersion: request.baseVersion,
          newVersion: request.baseVersion + 1,
          result: {
            snapshot: { tasks: [], dependencies: [] },
            changedTaskIds: ['task-plaster'],
            changedDependencyIds: [],
            conflicts: [],
            patches: [],
          },
          snapshot: { tasks: [], dependencies: [] },
        }),
      },
      broadcastToSession: () => undefined,
      logger: {
        debug: (event, payload) => {
          loggedEvents.push({ event, payload });
        },
      },
      semanticPlannerQuery: async () => ({
        content: JSON.stringify({
          ambiguity: 'unsupported',
          operations: [],
        }),
      }),
      semanticIntentQuery: async () => ({
        content: JSON.stringify({
          route: 'fast_path',
          intentFamily: 'task_edit',
          intentType: 'change_duration',
          confidence: 0.82,
          riskLevel: 'S1',
          params: {},
          ambiguities: [],
          entitiesMentioned: ['штукатурка'],
          durationMultiplier: 2,
        }),
      }),
    });

    assert.equal(result.handled, true);
    assert.equal(result.status, 'completed');
    assert.equal(result.legacyFallbackAllowed, false);
    assert.equal(result.intent.intentType, 'change_duration');
    assert.equal(result.executionMode, 'deterministic');
    assert.equal(loggedEvents.some((entry) => entry.event === 'semantic_planner_fallback_to_classifier'), true);
    assert.equal(loggedEvents.some((entry) => entry.event === 'intent_classified'), true);
    assert.equal(loggedEvents.some((entry) => entry.event === 'route_selected'), true);
    assert.equal(loggedEvents.some((entry) => entry.event === 'resolution_started'), true);
    assert.equal(loggedEvents.some((entry) => entry.event === 'resolution_result'), true);
    assert.equal(loggedEvents.some((entry) => entry.event === 'mutation_plan_built'), true);
    assert.match(result.assistantResponse ?? '', /Штукатурк/i);
  });

  it('maps typed user-facing failure and success messages', () => {
    assert.match(
      buildMutationFailureMessage('anchor_not_found'),
      /не удалось надежно определить целевую задачу/i,
    );
    assert.match(
      buildMutationFailureMessage('container_not_resolved'),
      /в какой раздел графика добавить/i,
    );
    assert.match(
      buildMutationFailureMessage('group_scope_not_resolved'),
      /повторяющиеся группы/i,
    );
    assert.match(
      buildMutationFailureMessage('verification_failed'),
      /изменени.*не подтверд/i,
    );
    assert.match(
      buildMutationSuccessMessage({
        changedTaskIds: ['task-plaster'],
        changedTasks: [{ id: 'task-plaster', name: 'Штукатурка' }],
        route: 'fast_path',
        intentType: 'shift_relative',
      }),
      /Штукатурк/i,
    );
    assert.match(
      buildMutationSuccessMessage({
        changedTaskIds: ['task-plaster'],
        changedTasks: [{ id: 'task-plaster', name: 'Штукатурка' }],
        route: 'fast_path',
        intentType: 'shift_relative',
      }),
      /распознано/i,
    );
    assert.match(
      buildMutationSuccessMessage({
        changedTaskIds: ['container-facade:cleaning', 'container-facade'],
        changedTasks: [
          { id: 'container-facade', name: 'Фасадные системы' },
          { id: 'container-facade:cleaning', name: 'Клининг' },
        ],
        createdTasks: [{ id: 'container-facade:cleaning', name: 'Клининг' }],
        route: 'fast_path',
        intentType: 'add_single_task',
      }),
      /добавлена задача «Клининг»/i,
    );
    const worklistArtifactMessage = buildMutationSuccessMessage({
      changedTaskIds: ['aggregate', 'roof', 'windows', 'facade'],
      changedTasks: [
        {
          id: 'aggregate',
          name: '1. Демонтаж сэндвич панелей (кровля) – 110,04 м2- 220 чел/час 2. Демонтаж окон – 18,35 м2 – 16 чел/час 3. Демонтаж витражей – 47,81 м2 – 38 чел/час 4. Демонтаж металлокаркаса – 4 тн – 192 чел/час',
        },
        { id: 'roof', name: 'Демонтаж сэндвич панелей (кровля)' },
        { id: 'windows', name: 'Демонтаж окон' },
        { id: 'facade', name: 'Демонтаж витражей' },
      ],
      route: 'fast_path',
      intentType: 'add_repeated_fragment',
    });
    assert.doesNotMatch(worklistArtifactMessage, /220 чел\/час 2\./i);
    assert.match(worklistArtifactMessage, /Демонтаж сэндвич панелей \(кровля\)/i);
    assert.match(
      buildMutationSuccessMessage({
        changedTaskIds: ['task-slab:12', 'task-slab:13', 'task-slab'],
        changedTasks: [
          { id: 'task-slab', name: 'Бетонирование перекрытий 12-17 этажей' },
          { id: 'task-slab:12', name: '12 этаж' },
          { id: 'task-slab:13', name: '13 этаж' },
        ],
        route: 'specialized_fast_path',
        intentType: 'decompose_task',
        warnings: ['Проверьте зависимости между новыми этапами.'],
        specializedTargetName: 'Бетонирование перекрытий 12-17 этажей',
      }),
      /детализир/i,
    );
    assert.match(
      buildMutationFailureMessage('anchor_not_found', {
        route: 'specialized_fast_path',
        intentType: 'decompose_task',
        failedStep: 'resolution',
      }),
      /specialized_fast_path/i,
    );
  });

  it('builds and executes deterministic plans for resolved ordinary edits', async () => {
    const loggedEvents: Array<{ event: string; payload: Record<string, unknown> }> = [];
    const result = await runStagedMutation({
      userMessage: 'сдвинь штукатурку на 2 дня',
      projectId: 'project-1',
      projectVersion: 5,
      sessionId: 'session-1',
      runId: 'run-1',
      tasksBefore: [{
        id: 'task-plaster',
        name: 'Штукатурка',
        startDate: '2026-04-01',
        endDate: '2026-04-03',
      }],
      env: {
        OPENAI_API_KEY: '',
        OPENAI_BASE_URL: 'https://example.test',
        OPENAI_MODEL: 'gpt-main',
      },
      messageService: {
        add: async () => undefined,
      },
      taskService: {
        list: async () => ({ tasks: [] }),
        findTasksByName: async () => ([
          {
            taskId: 'task-plaster',
            name: 'Штукатурка',
            parentId: null,
            path: ['Отделка', 'Штукатурка'],
            startDate: '2026-04-01',
            endDate: '2026-04-03',
            matchType: 'exact',
            score: 0.96,
          },
        ]),
        findContainerCandidates: async () => [],
        listBranchTasks: async () => [],
        findGroupScopes: async () => [],
      },
      commandService: {
        commitCommand: async (request: { baseVersion: number; command: { type: string } }) => ({
          accepted: true,
          clientRequestId: 'req-1',
          baseVersion: request.baseVersion,
          newVersion: request.baseVersion + 1,
          result: {
            snapshot: { tasks: [], dependencies: [] },
            changedTaskIds: ['task-plaster'],
            changedDependencyIds: [],
            conflicts: [],
            patches: [],
          },
          snapshot: { tasks: [], dependencies: [] },
        }),
      },
      broadcastToSession: () => undefined,
      logger: {
        debug: (event, payload) => {
          loggedEvents.push({ event, payload });
        },
      },
      semanticIntentQuery: semanticIntentQueryFor('сдвинь штукатурку на 2 дня'),
    });

    assert.equal(result.handled, true);
    assert.equal(result.status, 'completed');
    assert.equal(result.result.verificationVerdict, 'accepted');
    assert.deepEqual(loggedEvents.map((entry) => entry.event), [
      'intent_classified',
      'route_selected',
      'resolution_started',
      'resolution_result',
      'mutation_plan_built',
      'deterministic_execution_started',
      'execution_committed',
      'verification_result',
      'final_outcome',
    ]);
    const finalOutcome = loggedEvents.at(-1)?.payload ?? {};
    assert.equal(finalOutcome.status, 'completed');
    assert.equal(finalOutcome.executionMode, 'deterministic');
    assert.deepEqual(finalOutcome.changedTaskIds, ['task-plaster']);
    assert.equal(finalOutcome.verificationVerdict, 'accepted');
    assert.equal(finalOutcome.failureReason, undefined);
    assert.match(result.assistantResponse ?? '', /Штукатурк/i);
  });

  it('loads all task pages after add_single_task so the created task appears in the response and broadcast snapshot', async () => {
    const tasksBefore = Array.from({ length: 100 }, (_, index) => ({
      id: `task-${index + 1}`,
      name: index === 40 ? 'Фасадные системы' : `Задача ${index + 1}`,
      startDate: '2026-04-01',
      endDate: '2026-04-02',
      parentId: index === 40 ? 'phase-facade' : undefined,
    }));
    const tasksAfter = [
      ...tasksBefore,
      {
        id: 'task-41:klining',
        name: 'Клининг',
        startDate: '2026-04-03',
        endDate: '2026-04-03',
        parentId: 'task-41',
      },
    ];
    const listCalls: Array<{ limit?: number; offset?: number }> = [];

    const result = await runStagedMutation({
      userMessage: 'Добавь клининг в фасадные системы',
      projectId: 'project-1',
      projectVersion: 8,
      sessionId: 'session-1',
      runId: 'run-pagination-1',
      tasksBefore,
      env: {
        OPENAI_API_KEY: '',
        OPENAI_BASE_URL: 'https://example.test',
        OPENAI_MODEL: 'gpt-main',
        USE_SEMANTIC_PLANNER: 'true',
      },
      messageService: {
        add: async () => undefined,
      },
      taskService: {
        list: async (_projectId, _parentId, limit = 100, offset = 0) => {
          listCalls.push({ limit, offset });
          const pageTasks = tasksAfter.slice(offset, offset + limit);
          return {
            tasks: pageTasks,
            hasMore: offset + pageTasks.length < tasksAfter.length,
            total: tasksAfter.length,
          };
        },
        findTasksByName: async () => [],
        findContainerCandidates: async () => ([
          {
            taskId: 'task-41',
            name: 'Фасадные системы',
            parentId: 'phase-facade',
            path: ['Контур и фасады', 'Фасадные системы'],
            startDate: '2026-04-01',
            endDate: '2026-04-02',
            matchType: 'exact',
            score: 1,
          },
        ]),
        listBranchTasks: async () => [],
        findGroupScopes: async () => [],
      },
      commandService: {
        commitCommand: async (request: { baseVersion: number }) => ({
          accepted: true,
          clientRequestId: 'req-pagination-1',
          baseVersion: request.baseVersion,
          newVersion: request.baseVersion + 1,
          result: {
            snapshot: { tasks: [], dependencies: [] },
            changedTaskIds: ['task-41:klining', 'task-41'],
            changedDependencyIds: [],
            conflicts: [],
            patches: [],
          },
          snapshot: { tasks: [], dependencies: [] },
        }),
      },
      broadcastToSession: () => undefined,
      logger: {
        debug: () => undefined,
      },
      semanticIntentQuery: async () => ({
        content: JSON.stringify({
          ambiguity: 'none',
          operations: [{
            action: 'add_task',
            title: 'клининг',
            taskType: 'task',
            durationDays: 1,
            placement: {
              mode: 'inside_tail',
              parentHint: 'фасадные системы',
            },
          }],
        }),
      }),
    });

    assert.equal(result.status, 'completed');
    assert.equal(result.tasksAfter?.length, 101);
    assert.match(result.assistantResponse ?? '', /добавлена задача «Клининг»/i);
    assert.deepEqual(listCalls, [
      { limit: 1000, offset: 0 },
    ]);
  });

  it('returns a typed controlled failure when add intents cannot resolve a container', async () => {
    const loggedEvents: Array<{ event: string; payload: Record<string, unknown> }> = [];
    const result = await runStagedMutation({
      userMessage: 'добавь сдачу технадзору',
      projectId: 'project-1',
      projectVersion: 3,
      sessionId: 'session-1',
      runId: 'run-1',
      tasksBefore: [],
      env: {
        OPENAI_API_KEY: '',
        OPENAI_BASE_URL: 'https://example.test',
        OPENAI_MODEL: 'gpt-main',
      },
      messageService: {
        add: async () => undefined,
      },
      taskService: {
        list: async () => ({ tasks: [] }),
        findTasksByName: async () => [],
        findContainerCandidates: async () => [],
        listBranchTasks: async () => [],
        findGroupScopes: async () => [],
      },
      commandService: {
        commitCommand: async () => {
          throw new Error('not expected');
        },
      },
      broadcastToSession: () => undefined,
      logger: {
        debug: (event, payload) => {
          loggedEvents.push({ event, payload });
        },
      },
      semanticIntentQuery: semanticIntentQueryFor('добавь сдачу технадзору'),
    });

    assert.equal(result.handled, true);
    assert.equal(result.status, 'failed');
    assert.equal(result.legacyFallbackAllowed, false);
    assert.equal(result.intent.intentType, 'add_single_task');
    assert.equal(result.executionMode, 'deterministic');
    assert.equal(result.result.status, 'failed');
    assert.equal(result.result.failureReason, 'container_not_resolved');
    assert.match(result.assistantResponse ?? '', /раздел графика/i);
    assert.deepEqual(loggedEvents.map((entry) => entry.event), [
      'intent_classified',
      'route_selected',
      'resolution_started',
      'resolution_result',
      'final_outcome',
    ]);
    const finalOutcome = loggedEvents.at(-1)?.payload ?? {};
    assert.equal(finalOutcome.status, 'failed');
    assert.equal(finalOutcome.executionMode, 'deterministic');
    assert.equal(finalOutcome.failureReason, 'container_not_resolved');
    assert.deepEqual(finalOutcome.changedTaskIds, []);
    assert.equal(finalOutcome.verificationVerdict, 'not_run');
  });

  it('returns group_scope_not_resolved for unresolved repeated-fragment prompts without generic fallback UX', async () => {
    const result = await runStagedMutation({
      userMessage: 'добавь покраску обоев на каждый этаж',
      projectId: 'project-1',
      projectVersion: 3,
      sessionId: 'session-1',
      runId: 'run-1',
      tasksBefore: [],
      env: {
        OPENAI_API_KEY: '',
        OPENAI_BASE_URL: 'https://example.test',
        OPENAI_MODEL: 'gpt-main',
      },
      messageService: {
        add: async () => undefined,
      },
      taskService: {
        list: async () => ({ tasks: [] }),
        findTasksByName: async () => [],
        findContainerCandidates: async () => [],
        listBranchTasks: async () => [],
        findGroupScopes: async () => [],
      },
      commandService: {
        commitCommand: async () => {
          throw new Error('not expected');
        },
      },
      broadcastToSession: () => undefined,
      logger: {
        debug: () => undefined,
      },
      semanticIntentQuery: semanticIntentQueryFor('добавь покраску обоев на каждый этаж'),
    });

    assert.equal(result.executionMode, 'hybrid');
    assert.equal(result.result.failureReason, 'group_scope_not_resolved');
    assert.doesNotMatch(result.assistantResponse ?? '', /не выполнила ни одного валидного mutation tool call/i);
  });

  it('executes simple repeated milestone fan-out without deferring to legacy fallback', async () => {
    const committed: Array<{ type: string; tasks?: Array<{ id?: string; type?: string }> }> = [];
    const result = await runStagedMutation({
      userMessage: 'на каждом этаже добавь работу (веху) сдача технадзору',
      projectId: 'project-1',
      projectVersion: 3,
      sessionId: 'session-1',
      runId: 'run-1',
      tasksBefore: [
        { id: 'section-1-floor-1', name: 'Секция 1, 1 этаж', startDate: '2026-04-01', endDate: '2026-04-03' },
        { id: 'section-2-floor-1', name: 'Секция 2, 1 этаж', startDate: '2026-04-02', endDate: '2026-04-04' },
      ],
      env: {
        OPENAI_API_KEY: '',
        OPENAI_BASE_URL: 'https://example.test',
        OPENAI_MODEL: 'gpt-main',
      },
      messageService: {
        add: async () => undefined,
      },
      taskService: {
        list: async () => ({
          tasks: [
            { id: 'section-1-floor-1', name: 'Секция 1, 1 этаж', startDate: '2026-04-01', endDate: '2026-04-03' },
            { id: 'section-2-floor-1', name: 'Секция 2, 1 этаж', startDate: '2026-04-02', endDate: '2026-04-04' },
            { id: 'section-1-floor-1:sdacha-tehnadzoru', name: 'Сдача технадзору', startDate: '2026-04-02', endDate: '2026-04-02', parentId: 'section-1-floor-1', type: 'milestone' },
            { id: 'section-2-floor-1:sdacha-tehnadzoru', name: 'Сдача технадзору', startDate: '2026-04-03', endDate: '2026-04-03', parentId: 'section-2-floor-1', type: 'milestone' },
          ],
        }),
        findTasksByName: async () => [],
        findContainerCandidates: async () => [],
        listBranchTasks: async () => [],
        findGroupScopes: async () => ([
          {
            key: 'floor',
            label: 'Штукатурные работы: Секция 1',
            rootTaskId: 'section-1',
            memberTaskIds: ['section-1-floor-1'],
            memberNames: ['Секция 1, 1 этаж'],
          },
          {
            key: 'floor',
            label: 'Штукатурные работы: Секция 2',
            rootTaskId: 'section-2',
            memberTaskIds: ['section-2-floor-1'],
            memberNames: ['Секция 2, 1 этаж'],
          },
        ]),
      },
      commandService: {
        commitCommand: async (request: { baseVersion: number; command: { type: string; tasks?: Array<{ id?: string; type?: string }> } }) => {
          committed.push(request.command);
          return {
            accepted: true,
            clientRequestId: 'req-1',
            baseVersion: request.baseVersion,
            newVersion: request.baseVersion + 1,
            result: {
              snapshot: { tasks: [], dependencies: [] },
              changedTaskIds: ['section-1-floor-1:sdacha-tehnadzoru', 'section-2-floor-1:sdacha-tehnadzoru'],
              changedDependencyIds: [],
              conflicts: [],
              patches: [],
            },
            snapshot: { tasks: [], dependencies: [] },
          };
        },
      },
      broadcastToSession: () => undefined,
      logger: {
        debug: () => undefined,
      },
      semanticIntentQuery: semanticIntentQueryFor('на каждом этаже добавь работу (веху) сдача технадзору'),
    });

    assert.equal(result.handled, true);
    assert.equal(result.status, 'completed');
    assert.equal(result.legacyFallbackAllowed, false);
    assert.equal(committed.length, 1);
    assert.equal(committed[0]?.type, 'create_tasks_batch');
    assert.deepEqual(committed[0]?.tasks?.map((task) => task.type), ['milestone', 'milestone']);
    assert.deepEqual(result.result.changedTaskIds, [
      'section-1-floor-1:sdacha-tehnadzoru',
      'section-2-floor-1:sdacha-tehnadzoru',
    ]);
  });

  it('executes repeated fragments deterministically across multiple matched group roots', async () => {
    const loggedEvents: Array<{ event: string; payload: Record<string, unknown> }> = [];
    const result = await runStagedMutation({
      userMessage: 'добавь сдачу технадзору на каждый этаж',
      projectId: 'project-1',
      projectVersion: 3,
      sessionId: 'session-1',
      runId: 'run-1',
      tasksBefore: [
        { id: 'section-1-floor-1', name: 'Секция 1, 1 этаж' },
        { id: 'section-1-floor-2', name: 'Секция 1, 2 этаж' },
        { id: 'section-2-floor-1', name: 'Секция 2, 1 этаж' },
        { id: 'section-2-floor-2', name: 'Секция 2, 2 этаж' },
      ],
      env: {
        OPENAI_API_KEY: '',
        OPENAI_BASE_URL: 'https://example.test',
        OPENAI_MODEL: 'gpt-main',
      },
      messageService: {
        add: async () => undefined,
      },
      taskService: {
        list: async () => ({
          tasks: [
            { id: 'section-1-floor-1', name: 'Секция 1, 1 этаж' },
            { id: 'section-1-floor-2', name: 'Секция 1, 2 этаж' },
            { id: 'section-2-floor-1', name: 'Секция 2, 1 этаж' },
            { id: 'section-2-floor-2', name: 'Секция 2, 2 этаж' },
            { id: 'section-1-floor-1:tech-review', name: 'Сдача технадзору' },
            { id: 'section-1-floor-2:tech-review', name: 'Сдача технадзору' },
            { id: 'section-2-floor-1:tech-review', name: 'Сдача технадзору' },
            { id: 'section-2-floor-2:tech-review', name: 'Сдача технадзору' },
          ],
        }),
        findTasksByName: async () => [],
        findContainerCandidates: async () => [],
        listBranchTasks: async () => [],
        findGroupScopes: async () => ([
          {
            key: 'floor',
            label: 'Штукатурные работы: Секция 1',
            rootTaskId: 'section-1',
            memberTaskIds: ['section-1-floor-1', 'section-1-floor-2'],
            memberNames: ['Секция 1, 1 этаж', 'Секция 1, 2 этаж'],
          },
          {
            key: 'floor',
            label: 'Штукатурные работы: Секция 2',
            rootTaskId: 'section-2',
            memberTaskIds: ['section-2-floor-1', 'section-2-floor-2'],
            memberNames: ['Секция 2, 1 этаж', 'Секция 2, 2 этаж'],
          },
        ]),
      },
      commandService: {
        commitCommand: async (request: { baseVersion: number; command: { type: string } }) => ({
          accepted: true,
          clientRequestId: 'req-1',
          baseVersion: request.baseVersion,
          newVersion: request.baseVersion + 1,
          result: {
            snapshot: { tasks: [], dependencies: [] },
            changedTaskIds: [
              'section-1-floor-1:tech-review',
              'section-1-floor-2:tech-review',
              'section-2-floor-1:tech-review',
              'section-2-floor-2:tech-review',
            ],
            changedDependencyIds: [],
            conflicts: [],
            patches: [],
          },
          snapshot: { tasks: [], dependencies: [] },
        }),
      },
      broadcastToSession: () => undefined,
      logger: {
        debug: (event, payload) => {
          loggedEvents.push({ event, payload });
        },
      },
      semanticIntentQuery: async () => ({
        content: JSON.stringify({
          intentType: 'add_repeated_fragment',
          confidence: 0.91,
          entitiesMentioned: ['сдача технадзору'],
          taskTitle: 'Сдача технадзору',
          groupScopeHint: 'этаж',
          fragmentPlan: {
            title: 'Сдача технадзору',
            nodes: [{ nodeKey: 'tech-review', title: 'Сдача технадзору', durationDays: 1, dependsOnNodeKeys: [] }],
          },
        }),
      }),
    });

    assert.equal(result.handled, true);
    assert.equal(result.status, 'completed');
    assert.equal(result.legacyFallbackAllowed, false);
    assert.equal(result.result.verificationVerdict, 'accepted');
    assert.deepEqual(result.plan?.operations.map((operation) => operation.kind), ['fanout_fragment_to_groups']);
    assert.deepEqual(result.resolutionContext?.groupMemberIds, [
      'section-1-floor-1',
      'section-1-floor-2',
      'section-2-floor-1',
      'section-2-floor-2',
    ]);
    assert.ok(loggedEvents.some((entry) => entry.event === 'deterministic_execution_started'));
  });

  it('returns expansion_anchor_not_resolved for unresolved WBS expansion prompts', async () => {
    const result = await runStagedMutation({
      userMessage: 'распиши подробнее пункт "Инженерные системы"',
      projectId: 'project-1',
      projectVersion: 3,
      sessionId: 'session-1',
      runId: 'run-1',
      tasksBefore: [],
      env: {
        OPENAI_API_KEY: '',
        OPENAI_BASE_URL: 'https://example.test',
        OPENAI_MODEL: 'gpt-main',
      },
      messageService: {
        add: async () => undefined,
      },
      taskService: {
        list: async () => ({ tasks: [] }),
        findTasksByName: async () => [],
        findContainerCandidates: async () => [],
        listBranchTasks: async () => [],
        findGroupScopes: async () => [],
      },
      commandService: {
        commitCommand: async () => {
          throw new Error('not expected');
        },
      },
      broadcastToSession: () => undefined,
      logger: {
        debug: () => undefined,
      },
      semanticIntentQuery: semanticIntentQueryFor('распиши подробнее пункт \"Инженерные системы\"'),
    });

    assert.equal(result.executionMode, 'hybrid');
    assert.equal(result.result.failureReason, 'expansion_anchor_not_resolved');
  });

  it('surfaces verification_failed for move-to-date requests when the changed set does not match', async () => {
    const result = await runStagedMutation({
      userMessage: 'перенеси фундамент на 2026-05-10',
      projectId: 'project-1',
      projectVersion: 5,
      sessionId: 'session-1',
      runId: 'run-1',
      tasksBefore: [{
        id: 'task-foundation',
        name: 'Фундамент',
        startDate: '2026-04-01',
        endDate: '2026-04-05',
      }],
      env: {
        OPENAI_API_KEY: '',
        OPENAI_BASE_URL: 'https://example.test',
        OPENAI_MODEL: 'gpt-main',
      },
      messageService: {
        add: async () => undefined,
      },
      taskService: {
        list: async () => ({ tasks: [] }),
        findTasksByName: async () => ([
          {
            taskId: 'task-foundation',
            name: 'Фундамент',
            parentId: null,
            path: ['Основание', 'Фундамент'],
            startDate: '2026-04-01',
            endDate: '2026-04-05',
            matchType: 'exact',
            score: 0.97,
          },
        ]),
        findContainerCandidates: async () => [],
        listBranchTasks: async () => [],
        findGroupScopes: async () => [],
      },
      commandService: {
        commitCommand: async (request: { baseVersion: number }) => ({
          accepted: true,
          clientRequestId: 'req-1',
          baseVersion: request.baseVersion,
          newVersion: request.baseVersion + 1,
          result: {
            snapshot: { tasks: [], dependencies: [] },
            changedTaskIds: ['unexpected-task'],
            changedDependencyIds: [],
            conflicts: [],
            patches: [],
          },
          snapshot: { tasks: [], dependencies: [] },
        }),
      },
      broadcastToSession: () => undefined,
      logger: {
        debug: () => undefined,
      },
      semanticIntentQuery: semanticIntentQueryFor('перенеси фундамент на 2026-05-10'),
    });

    assert.equal(result.status, 'failed');
    assert.equal(result.result.failureReason, 'verification_failed');
    assert.match(result.assistantResponse ?? '', /не подтверд/i);
  });

  it('stops ambiguous intents at the clarify gate instead of silently deferring to legacy', async () => {
    const result = await runStagedMutation({
      userMessage: 'сделай что-нибудь получше',
      projectId: 'project-1',
      projectVersion: 3,
      sessionId: 'session-1',
      runId: 'run-1',
      tasksBefore: [],
      env: {
        OPENAI_API_KEY: '',
        OPENAI_BASE_URL: 'https://example.test',
        OPENAI_MODEL: 'gpt-main',
      },
      messageService: {
        add: async () => undefined,
      },
      taskService: {
        list: async () => ({ tasks: [] }),
        findTasksByName: async () => [],
        findContainerCandidates: async () => [],
        listBranchTasks: async () => [],
        findGroupScopes: async () => [],
      },
      commandService: {
        commitCommand: async () => {
          throw new Error('not expected');
        },
      },
      broadcastToSession: () => undefined,
      logger: {
        debug: () => undefined,
      },
      semanticIntentQuery: semanticIntentQueryFor('сделай что-нибудь получше'),
    });

    assert.equal(result.handled, true);
    assert.equal(result.status, 'failed');
    assert.equal(result.legacyFallbackAllowed, false);
    assert.equal(result.intent.intentType, 'unsupported_or_ambiguous');
    assert.equal(result.executionMode, 'full_agent');
    assert.equal(result.intent.routeEnvelope.route, 'clarify');
  });

  it('keeps low-confidence structural decomposition prompts on typed clarify failure instead of legacy fallback', async () => {
    const result = await runStagedMutation({
      userMessage: 'Разбей это по этажам как лучше',
      projectId: 'project-1',
      projectVersion: 3,
      sessionId: 'session-1',
      runId: 'run-clarify-structural-1',
      tasksBefore: [],
      env,
      messageService: {
        add: async () => undefined,
      },
      taskService: {
        list: async () => ({ tasks: [] }),
        findTasksByName: async () => [],
        findContainerCandidates: async () => [],
        listBranchTasks: async () => [],
        findGroupScopes: async () => [],
      },
      commandService: {
        commitCommand: async () => {
          throw new Error('not expected');
        },
      },
      broadcastToSession: () => undefined,
      logger: {
        debug: () => undefined,
      },
      semanticIntentQuery: async () => ({
        content: JSON.stringify({
          route: 'clarify',
          intentFamily: 'structure',
          intentType: 'unsupported_or_ambiguous',
          confidence: 0.28,
          riskLevel: 'S2',
          params: {
            requestedExecutor: 'split_task',
          },
          ambiguities: ['target_task', 'decomposition_mode'],
          entitiesMentioned: [],
        }),
      }),
    });

    assert.equal(result.status, 'failed');
    assert.equal(result.legacyFallbackAllowed, false);
    assert.equal(result.intent.routeEnvelope.route, 'clarify');
    assert.equal(result.result.failureReason, 'unsupported_mutation_shape');
  });

  it('logs route_selected before resolution and execution', async () => {
    const loggedEvents: Array<{ event: string; payload: Record<string, unknown> }> = [];

    await runStagedMutation({
      userMessage: 'сдвинь штукатурку на 2 дня',
      projectId: 'project-1',
      projectVersion: 5,
      sessionId: 'session-1',
      runId: 'run-route-1',
      tasksBefore: [{
        id: 'task-plaster',
        name: 'Штукатурка',
        startDate: '2026-04-01',
        endDate: '2026-04-03',
      }],
      env,
      messageService: { add: async () => undefined },
      taskService: {
        list: async () => ({ tasks: [] }),
        findTasksByName: async () => ([{
          taskId: 'task-plaster',
          name: 'Штукатурка',
          parentId: null,
          path: ['Отделка', 'Штукатурка'],
          startDate: '2026-04-01',
          endDate: '2026-04-03',
          matchType: 'exact',
          score: 0.96,
        }]),
        findContainerCandidates: async () => [],
        listBranchTasks: async () => [],
        findGroupScopes: async () => [],
      },
      commandService: {
        commitCommand: async (request: { baseVersion: number; command: { type: string } }) => ({
          accepted: true,
          clientRequestId: 'req-1',
          baseVersion: request.baseVersion,
          newVersion: request.baseVersion + 1,
          result: {
            snapshot: { tasks: [], dependencies: [] },
            changedTaskIds: ['task-plaster'],
            changedDependencyIds: [],
            conflicts: [],
            patches: [],
          },
          snapshot: { tasks: [], dependencies: [] },
        }),
      },
      broadcastToSession: () => undefined,
      logger: {
        debug: (event, payload) => {
          loggedEvents.push({ event, payload });
        },
      },
      semanticIntentQuery: semanticIntentQueryFor('сдвинь штукатурку на 2 дня'),
    });

    assert.equal(loggedEvents[0]?.event, 'intent_classified');
    assert.equal(loggedEvents[1]?.event, 'route_selected');
    assert.equal(loggedEvents[1]?.payload.route, 'fast_path');
    assert.equal(loggedEvents[1]?.payload.executionMode, 'deterministic');
    assert.equal(loggedEvents[2]?.event, 'resolution_started');
  });

  it('blocks specialized decompose_task routes behind typed gating instead of deferring to legacy', async () => {
    const loggedEvents: Array<{ event: string; payload: Record<string, unknown> }> = [];

    const result = await runStagedMutation({
      userMessage: 'Разбей Бетонирование перекрытий 12-17 этажей поэтажно',
      projectId: 'project-1',
      projectVersion: 3,
      sessionId: 'session-1',
      runId: 'run-decompose-1',
      tasksBefore: [],
      env,
      messageService: { add: async () => undefined },
      taskService: {
        list: async () => ({ tasks: [] }),
        findTasksByName: async () => [],
        findContainerCandidates: async () => [],
        listBranchTasks: async () => [],
        findGroupScopes: async () => [],
      },
      commandService: {
        commitCommand: async () => {
          throw new Error('not expected');
        },
      },
      broadcastToSession: () => undefined,
      logger: {
        debug: (event, payload) => {
          loggedEvents.push({ event, payload });
        },
      },
      semanticIntentQuery: semanticIntentQueryFor('Разбей Бетонирование перекрытий 12-17 этажей поэтажно'),
    });

    assert.equal(result.intent.intentType, 'decompose_task');
    assert.equal(result.intent.routeEnvelope.route, 'specialized_fast_path');
    assert.notEqual(result.status, 'deferred_to_legacy');
    assert.equal(result.legacyFallbackAllowed, false);
    assert.notEqual(result.result.failureReason, undefined);
    assert.equal(loggedEvents.some((entry) => entry.event === 'route_selected'), true);
  });

  it('resolves decompose_task into explicit split-task executor metadata', async () => {
    const result = await runStagedMutation({
      userMessage: 'Разбей Бетонирование перекрытий 12-17 этажей поэтажно',
      projectId: 'project-1',
      projectVersion: 3,
      sessionId: 'session-1',
      runId: 'run-decompose-2',
      tasksBefore: [],
      env,
      messageService: { add: async () => undefined },
      taskService: {
        list: async () => ({ tasks: [] }),
        findTasksByName: async () => ([
          {
            taskId: 'task-slab',
            name: 'Бетонирование перекрытий 12-17 этажей',
            parentId: null,
            path: ['Бетонирование перекрытий 12-17 этажей'],
            startDate: '2026-04-01',
            endDate: '2026-04-12',
            matchType: 'exact',
            score: 0.96,
          },
        ]),
        findContainerCandidates: async () => [],
        listBranchTasks: async () => [],
        findGroupScopes: async () => [],
      },
      commandService: {
        commitCommand: async () => {
          throw new Error('not expected');
        },
      },
      broadcastToSession: () => undefined,
      logger: {
        debug: () => undefined,
      },
      semanticIntentQuery: semanticIntentQueryFor('Разбей Бетонирование перекрытий 12-17 этажей поэтажно'),
    });

    assert.equal(result.intent.intentType, 'decompose_task');
    assert.equal(result.resolutionContext?.specializedExecutor?.executor, 'split_task');
    assert.equal(result.resolutionContext?.specializedExecutor?.targetTaskId, 'task-slab');
    assert.equal(result.resolutionContext?.specializedExecutor?.targetTaskName, 'Бетонирование перекрытий 12-17 этажей');
    assert.equal(result.resolutionContext?.specializedExecutor?.mode, 'by_floor');
    assert.equal(result.resolutionContext?.specializedExecutor?.rangeFrom, 12);
    assert.equal(result.resolutionContext?.specializedExecutor?.rangeTo, 17);
    assert.equal(result.resolutionContext?.specializedExecutor?.confidence, 0.96);
  });

  it('fails low-confidence decompose_task resolution without legacy fallback', async () => {
    const result = await runStagedMutation({
      userMessage: 'Разбей Бетонирование перекрытий 12-17 этажей поэтажно',
      projectId: 'project-1',
      projectVersion: 3,
      sessionId: 'session-1',
      runId: 'run-decompose-3',
      tasksBefore: [],
      env,
      messageService: { add: async () => undefined },
      taskService: {
        list: async () => ({ tasks: [] }),
        findTasksByName: async () => ([
          {
            taskId: 'task-slab',
            name: 'Бетонирование перекрытий 12-17 этажей',
            parentId: null,
            path: ['Бетонирование перекрытий 12-17 этажей'],
            startDate: '2026-04-01',
            endDate: '2026-04-12',
            matchType: 'includes',
            score: 0.61,
          },
        ]),
        findContainerCandidates: async () => [],
        listBranchTasks: async () => [],
        findGroupScopes: async () => [],
      },
      commandService: {
        commitCommand: async () => {
          throw new Error('not expected');
        },
      },
      broadcastToSession: () => undefined,
      logger: {
        debug: () => undefined,
      },
      semanticIntentQuery: semanticIntentQueryFor('Разбей Бетонирование перекрытий 12-17 этажей поэтажно'),
    });

    assert.equal(result.intent.intentType, 'decompose_task');
    assert.equal(result.status, 'failed');
    assert.equal(result.legacyFallbackAllowed, false);
    assert.notEqual(result.result.failureReason, undefined);
    assert.ok(
      result.result.failureReason === 'multiple_low_confidence_targets'
        || result.result.failureReason === 'unsupported_mutation_shape'
        || result.result.failureReason === 'anchor_not_found',
    );
  });

  it('hands high-confidence decompose_task routes to the direct split-task executor', async () => {
    const loggedEvents: Array<{ event: string; payload: Record<string, unknown> }> = [];
    const directSplitCalls: Array<{ taskId: string; details?: string; mode?: string; rangeFrom?: number; rangeTo?: number }> = [];
    const result = await runStagedMutation({
      userMessage: 'Разбей Бетонирование перекрытий 12-17 этажей поэтажно',
      projectId: 'project-1',
      projectVersion: 3,
      sessionId: 'session-1',
      runId: 'run-decompose-4',
      tasksBefore: [],
      env,
      messageService: { add: async () => undefined },
      taskService: {
        list: async () => ({
          tasks: [{ id: 'task-slab:12', name: '12 этаж' }],
        }),
        get: async () => ({
          id: 'task-slab',
          name: 'Бетонирование перекрытий 12-17 этажей',
          startDate: '2026-04-01',
          endDate: '2026-04-12',
          children: [],
        }),
        findTasksByName: async () => ([
          {
            taskId: 'task-slab',
            name: 'Бетонирование перекрытий 12-17 этажей',
            parentId: null,
            path: ['Бетонирование перекрытий 12-17 этажей'],
            startDate: '2026-04-01',
            endDate: '2026-04-12',
            matchType: 'exact',
            score: 0.96,
          },
        ]),
        findContainerCandidates: async () => [],
        listBranchTasks: async () => [],
        findGroupScopes: async () => [],
      },
      commandService: {
        commitCommand: async () => {
          throw new Error('not expected');
        },
      },
      broadcastToSession: () => undefined,
      logger: {
        debug: (event, payload) => {
          loggedEvents.push({ event, payload });
        },
      },
      directSplitTaskRunner: async (input) => {
        directSplitCalls.push({
          taskId: input.taskId,
          details: input.details,
          mode: input.handoff?.mode,
          rangeFrom: input.handoff?.rangeFrom,
          rangeTo: input.handoff?.rangeTo,
        });
        return {
          execution: {
            status: 'completed',
            executionMode: 'hybrid',
            committedCommandTypes: ['create_tasks_batch'],
            changedTaskIds: ['task-slab:12'],
            verificationVerdict: 'accepted',
            userFacingMessage: 'Задача «Бетонирование перекрытий 12-17 этажей» детализирована на 6 подзадач.',
          },
          assistantResponse: 'Задача «Бетонирование перекрытий 12-17 этажей» детализирована на 6 подзадач.',
          tasksAfter: [{ id: 'task-slab:12', name: '12 этаж' }],
          plan: {
            planType: 'expand_wbs',
            operations: [],
            why: 'stub split result',
            expectedChangedTaskIds: ['task-slab:12'],
            canExecuteDeterministically: false,
            needsAgentExecution: false,
          },
          fragmentPlan: {
            title: 'Бетонирование перекрытий 12-17 этажей',
            why: 'stub split result',
            nodes: [],
          },
        };
      },
      semanticIntentQuery: semanticIntentQueryFor('Разбей Бетонирование перекрытий 12-17 этажей поэтажно'),
    });

    assert.deepEqual(directSplitCalls, [{
      taskId: 'task-slab',
      details: 'Разбей Бетонирование перекрытий 12-17 этажей поэтажно',
      mode: 'by_floor',
      rangeFrom: 12,
      rangeTo: 17,
    }]);
    assert.equal(result.status, 'completed');
    assert.equal(result.handled, true);
    assert.equal(result.legacyFallbackAllowed, false);
    assert.equal(result.result.status, 'completed');
    assert.equal(result.result.userFacingMessage, 'Задача «Бетонирование перекрытий 12-17 этажей» детализирована на 6 подзадач.');
    assert.deepEqual(result.result.changedTaskIds, ['task-slab:12']);
    assert.equal(result.assistantResponse, 'Задача «Бетонирование перекрытий 12-17 этажей» детализирована на 6 подзадач.');
    assert.deepEqual(loggedEvents.map((entry) => entry.event), [
      'intent_classified',
      'route_selected',
      'resolution_started',
      'resolution_result',
      'specialized_executor_started',
      'specialized_executor_completed',
      'final_outcome',
    ]);
    assert.equal(loggedEvents[4]?.payload.route, 'specialized_fast_path');
    assert.equal(loggedEvents[4]?.payload.intentType, 'decompose_task');
    assert.equal(loggedEvents[4]?.payload.riskLevel, 'S2');
  });

  it('emits agent_escalation_selected for explicit S3 agent-path routing', async () => {
    const loggedEvents: Array<{ event: string; payload: Record<string, unknown> }> = [];
    const result = await runStagedMutation({
      userMessage: 'Полностью переразложи весь график по двум бригадам и критическому пути',
      projectId: 'project-1',
      projectVersion: 3,
      sessionId: 'session-1',
      runId: 'run-agent-path-1',
      tasksBefore: [],
      env,
      messageService: { add: async () => undefined },
      taskService: {
        list: async () => ({ tasks: [] }),
        findTasksByName: async () => [],
        findContainerCandidates: async () => [],
        listBranchTasks: async () => [],
        findGroupScopes: async () => [],
      },
      commandService: {
        commitCommand: async () => {
          throw new Error('not expected');
        },
      },
      broadcastToSession: () => undefined,
      logger: {
        debug: (event, payload) => {
          loggedEvents.push({ event, payload });
        },
      },
      semanticIntentQuery: async () => ({
        content: JSON.stringify({
          route: 'agent_path',
          intentFamily: 'planning',
          intentType: 'restructure_branch',
          confidence: 0.41,
          riskLevel: 'S3',
          params: {
            scope: 'whole_project',
          },
          ambiguities: ['resource_constraints'],
          entitiesMentioned: [],
        }),
      }),
    });

    assert.equal(result.status, 'failed');
    assert.equal(result.intent.routeEnvelope.route, 'agent_path');
    assert.equal(loggedEvents.some((entry) => entry.event === 'agent_escalation_selected'), true);
    const escalationEvent = loggedEvents.find((entry) => entry.event === 'agent_escalation_selected');
    assert.equal(escalationEvent?.payload.route, 'agent_path');
    assert.equal(escalationEvent?.payload.intentType, 'restructure_branch');
    assert.equal(escalationEvent?.payload.riskLevel, 'S3');
  });

  it('keeps decompose_task out of low-level mutation plan operations', () => {
    const operationKinds = new Set<MutationPlanOperation['kind']>([
      'append_task_after',
      'append_task_before',
      'append_task_to_container',
      'change_task_duration',
      'shift_task_by_delta',
      'move_task_to_date',
      'move_task_in_hierarchy',
      'link_tasks',
      'unlink_tasks',
      'delete_task',
      'rename_task',
      'update_task_metadata',
      'fanout_fragment_to_groups',
      'expand_branch_from_plan',
    ]);

    assert.equal(operationKinds.has('decompose_task' as MutationPlanOperation['kind']), false);
  });

  it('returns multiple_low_confidence_targets for ambiguous equal-score anchors', async () => {
    const result = await runStagedMutation({
      userMessage: 'сдвинь штукатурку на 2 дня',
      projectId: 'project-1',
      projectVersion: 3,
      sessionId: 'session-1',
      runId: 'run-1',
      tasksBefore: [],
      env: {
        OPENAI_API_KEY: '',
        OPENAI_BASE_URL: 'https://example.test',
        OPENAI_MODEL: 'gpt-main',
      },
      messageService: {
        add: async () => undefined,
      },
      taskService: {
        list: async () => ({ tasks: [] }),
        findTasksByName: async () => ([
          {
            taskId: 'task-1',
            name: 'Штукатурка стен',
            parentId: null,
            path: ['Отделка', 'Штукатурка стен'],
            startDate: '2026-04-01',
            endDate: '2026-04-02',
            matchType: 'includes',
            score: 0.74,
          },
          {
            taskId: 'task-2',
            name: 'Штукатурка потолка',
            parentId: null,
            path: ['Отделка', 'Штукатурка потолка'],
            startDate: '2026-04-03',
            endDate: '2026-04-04',
            matchType: 'includes',
            score: 0.74,
          },
        ]),
        findContainerCandidates: async () => [],
        listBranchTasks: async () => [],
        findGroupScopes: async () => [],
      },
      commandService: {
        commitCommand: async () => {
          throw new Error('not expected');
        },
      },
      broadcastToSession: () => undefined,
      logger: {
        debug: () => undefined,
      },
      semanticIntentQuery: semanticIntentQueryFor('сдвинь штукатурку на 2 дня'),
    });

    assert.equal(result.status, 'failed');
    assert.equal(result.result.failureReason, 'multiple_low_confidence_targets');
  });
});
