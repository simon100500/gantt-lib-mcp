import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { classifyMutationIntent } from './intent-classifier.js';
import { selectMutationExecutionMode } from './execution-routing.js';

function buildSemanticIntentQuery(content: string) {
  return async () => ({ content });
}

const env = {
  OPENAI_API_KEY: '',
  OPENAI_BASE_URL: 'https://example.test',
  OPENAI_MODEL: 'gpt-main',
};

describe('mutation intent classification', () => {
  it('parses structured semantic payloads from the model', async () => {
    const addIntent = await classifyMutationIntent({
      userMessage: 'добавь сдачу технадзору',
      env,
      semanticIntentQuery: buildSemanticIntentQuery(JSON.stringify({
        intentType: 'add_single_task',
        confidence: 0.93,
        entitiesMentioned: ['сдача технадзору'],
        taskTitle: 'Сдача технадзору',
        durationDays: 1,
      })),
    });

    assert.equal(addIntent.intentType, 'add_single_task');
    assert.equal(addIntent.confidence, 0.93);
    assert.equal(addIntent.rawRequest, 'добавь сдачу технадзору');
    assert.equal(addIntent.normalizedRequest, 'добавь сдачу технадзору');
    assert.deepEqual(addIntent.entitiesMentioned, ['сдача технадзору']);
    assert.equal(addIntent.requiresResolution, true);
    assert.equal(addIntent.requiresSchedulingPlacement, true);
    assert.equal(addIntent.executionMode, 'deterministic');
    assert.equal(addIntent.taskTitle, 'Сдача технадзору');
    assert.equal(addIntent.durationDays, 1);

    const shiftIntent = await classifyMutationIntent({
      userMessage: 'сдвинь штукатурку на 2 дня',
      env,
      semanticIntentQuery: buildSemanticIntentQuery(JSON.stringify({
        intentType: 'shift_relative',
        confidence: 0.9,
        entitiesMentioned: ['штукатурка'],
        deltaDays: 2,
      })),
    });
    assert.equal(shiftIntent.intentType, 'shift_relative');
    assert.equal(shiftIntent.deltaDays, 2);

    const repeatedIntent = await classifyMutationIntent({
      userMessage: 'добавь покраску обоев на каждый этаж',
      env,
      semanticIntentQuery: buildSemanticIntentQuery(JSON.stringify({
        intentType: 'add_repeated_fragment',
        confidence: 0.88,
        entitiesMentioned: ['покраска обоев'],
        groupScopeHint: 'этаж',
        fragmentPlan: {
          title: 'Покраска обоев',
          nodes: [{ nodeKey: 'wallpaper-paint', title: 'Покраска обоев', durationDays: 2, dependsOnNodeKeys: [] }],
        },
      })),
    });
    assert.equal(repeatedIntent.intentType, 'add_repeated_fragment');
    assert.equal(repeatedIntent.groupScopeHint, 'этаж');

    const metadataIntent = await classifyMutationIntent({
      userMessage: 'сделай эту задачу красной',
      env,
      semanticIntentQuery: buildSemanticIntentQuery(JSON.stringify({
        intentType: 'update_metadata',
        confidence: 0.84,
        entitiesMentioned: ['эта задача'],
        metadataFields: { color: '#ff4d4f' },
      })),
    });
    assert.equal(metadataIntent.intentType, 'update_metadata');
    assert.deepEqual(metadataIntent.metadataFields, { color: '#ff4d4f', progress: undefined, parentId: undefined });

    const expandIntent = await classifyMutationIntent({
      userMessage: 'распиши подробнее пункт "Инженерные системы"',
      env,
      semanticIntentQuery: buildSemanticIntentQuery(JSON.stringify({
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
      })),
    });
    assert.equal(expandIntent.intentType, 'expand_wbs');
    assert.equal(expandIntent.fragmentPlan?.nodes.length, 2);
  });
});

describe('mutation execution routing', () => {
  it('selects deterministic, hybrid, and full_agent modes explicitly', () => {
    assert.equal(
      selectMutationExecutionMode({
        intentType: 'add_single_task',
        confidence: 0.9,
        rawRequest: 'x',
        normalizedRequest: 'x',
        entitiesMentioned: ['x'],
        requiresResolution: true,
        requiresSchedulingPlacement: true,
        executionMode: 'deterministic',
      }),
      'deterministic',
    );
    assert.equal(
      selectMutationExecutionMode({
        intentType: 'add_repeated_fragment',
        confidence: 0.9,
        rawRequest: 'x',
        normalizedRequest: 'x',
        entitiesMentioned: ['x'],
        requiresResolution: true,
        requiresSchedulingPlacement: true,
        executionMode: 'deterministic',
      }),
      'hybrid',
    );
    assert.equal(
      selectMutationExecutionMode({
        intentType: 'restructure_branch',
        confidence: 0.9,
        rawRequest: 'x',
        normalizedRequest: 'x',
        entitiesMentioned: [],
        requiresResolution: true,
        requiresSchedulingPlacement: true,
        executionMode: 'deterministic',
      }),
      'full_agent',
    );
  });
});
