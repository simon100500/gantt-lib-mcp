import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { runStagedMutation } from './orchestrator.js';

describe('staged mutation orchestrator', () => {
  it('returns a typed controlled failure when add intents cannot resolve a container', async () => {
    const loggedEvents: string[] = [];
    const result = await runStagedMutation({
      userMessage: 'добавь сдачу технадзору',
      projectId: 'project-1',
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
        debug: (event) => {
          loggedEvents.push(event);
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
    assert.deepEqual(loggedEvents, [
      'intent_classified',
      'execution_mode_selected',
      'resolution_started',
      'resolution_result',
    ]);
  });

  it('keeps unsupported intents on the legacy fallback path', async () => {
    const result = await runStagedMutation({
      userMessage: 'сделай что-нибудь получше',
      projectId: 'project-1',
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
  });

  it('returns multiple_low_confidence_targets for ambiguous equal-score anchors', async () => {
    const result = await runStagedMutation({
      userMessage: 'сдвинь штукатурку на 2 дня',
      projectId: 'project-1',
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
