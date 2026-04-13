import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildMutationFailureMessage,
  buildMutationSuccessMessage,
} from './messages.js';
import { runStagedMutation } from './orchestrator.js';

describe('staged mutation orchestrator', () => {
  it('maps typed user-facing failure and success messages', () => {
    assert.match(
      buildMutationFailureMessage('anchor_not_found'),
      /не удалось надежно определить целевую задачу/i,
    );
    assert.match(
      buildMutationFailureMessage('container_not_resolved'),
      /не удалось определить контейнер/i,
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
    });

    assert.equal(result.handled, true);
    assert.equal(result.status, 'failed');
    assert.equal(result.legacyFallbackAllowed, false);
    assert.equal(result.intent.intentType, 'add_single_task');
    assert.equal(result.executionMode, 'deterministic');
    assert.equal(result.result.status, 'failed');
    assert.equal(result.result.failureReason, 'container_not_resolved');
    assert.match(result.assistantResponse ?? '', /контейнер/i);
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
    });

    assert.equal(result.executionMode, 'hybrid');
    assert.equal(result.result.failureReason, 'group_scope_not_resolved');
    assert.doesNotMatch(result.assistantResponse ?? '', /не выполнила ни одного валидного mutation tool call/i);
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
    });

    assert.equal(result.status, 'failed');
    assert.equal(result.result.failureReason, 'multiple_low_confidence_targets');
  });
});
