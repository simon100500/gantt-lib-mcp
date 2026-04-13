import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { runStagedMutation } from './orchestrator.js';

describe('staged mutation orchestrator', () => {
  it('classifies intent, selects execution mode, and defers to the legacy path for now', async () => {
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
      services: {
        messageService: {
          add: async () => undefined,
        },
        taskService: {
          list: async () => ({ tasks: [] }),
        },
        commandService: {
          commitCommand: async () => {
            throw new Error('not expected');
          },
        },
      },
      broadcastToSession: () => undefined,
      logger: {
        debug: (event) => {
          loggedEvents.push(event);
        },
      },
    });

    assert.equal(result.handled, false);
    assert.equal(result.status, 'deferred_to_legacy');
    assert.equal(result.legacyFallbackAllowed, true);
    assert.equal(result.intent.intentType, 'add_single_task');
    assert.equal(result.executionMode, 'deterministic');
    assert.equal(result.result.status, 'deferred_to_legacy');
    assert.deepEqual(loggedEvents, ['intent_classified', 'execution_mode_selected']);
  });
});
