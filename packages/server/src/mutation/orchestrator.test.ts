import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildMutationFailureMessage,
  buildMutationSuccessMessage,
} from './messages.js';
import { runStagedMutation } from './orchestrator.js';

function semanticPayloadFor(userMessage: string): string {
  switch (userMessage) {
    case 'сдвинь штукатурку на 2 дня':
      return JSON.stringify({
        intentType: 'shift_relative',
        confidence: 0.92,
        entitiesMentioned: ['штукатурка'],
        deltaDays: 2,
      });
    case 'добавь сдачу технадзору':
      return JSON.stringify({
        intentType: 'add_single_task',
        confidence: 0.93,
        entitiesMentioned: ['сдача технадзору'],
        taskTitle: 'Сдача технадзору',
        durationDays: 1,
      });
    case 'добавь покраску обоев на каждый этаж':
      return JSON.stringify({
        intentType: 'add_repeated_fragment',
        confidence: 0.9,
        entitiesMentioned: ['покраска обоев'],
        groupScopeHint: 'этаж',
        fragmentPlan: {
          title: 'Покраска обоев',
          nodes: [{ nodeKey: 'wallpaper-paint', title: 'Покраска обоев', durationDays: 2, dependsOnNodeKeys: [] }],
        },
      });
    case 'на каждом этаже добавь работу (веху) сдача технадзору':
      return JSON.stringify({
        intentType: 'add_repeated_fragment',
        confidence: 0.94,
        entitiesMentioned: ['Сдача технадзору'],
        groupScopeHint: 'этаж',
      });
    case 'распиши подробнее пункт "Инженерные системы"':
      return JSON.stringify({
        intentType: 'expand_wbs',
        confidence: 0.91,
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
        intentType: 'move_to_date',
        confidence: 0.94,
        entitiesMentioned: ['фундамент'],
        targetDate: '2026-05-10',
      });
    case 'сделай что-нибудь получше':
      return JSON.stringify({
        intentType: 'unsupported_or_ambiguous',
        confidence: 0.25,
        entitiesMentioned: [],
      });
    default:
      return JSON.stringify({
        intentType: 'unsupported_or_ambiguous',
        confidence: 0.2,
        entitiesMentioned: [],
      });
  }
}

function semanticIntentQueryFor(userMessage: string) {
  return async () => ({ content: semanticPayloadFor(userMessage) });
}

describe('staged mutation orchestrator', () => {
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
      }),
      /Штукатурк/i,
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
      'execution_mode_selected',
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
      'execution_mode_selected',
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

  it('keeps unsupported intents on the legacy fallback path', async () => {
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

    assert.equal(result.handled, false);
    assert.equal(result.status, 'deferred_to_legacy');
    assert.equal(result.legacyFallbackAllowed, true);
    assert.equal(result.intent.intentType, 'unsupported_or_ambiguous');
    assert.equal(result.executionMode, 'full_agent');
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
