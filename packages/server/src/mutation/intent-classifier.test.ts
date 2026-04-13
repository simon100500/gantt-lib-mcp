import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { classifyMutationIntent } from './intent-classifier.js';
import { selectMutationExecutionMode } from './execution-routing.js';

describe('mutation intent classification', () => {
  it('classifies the locked Russian prompt set', () => {
    assert.deepEqual(classifyMutationIntent('добавь сдачу технадзору'), {
      intentType: 'add_single_task',
      confidence: 0.93,
      rawRequest: 'добавь сдачу технадзору',
      normalizedRequest: 'добавь сдачу технадзору',
      entitiesMentioned: ['сдачу технадзору'],
      requiresResolution: true,
      requiresSchedulingPlacement: true,
      executionMode: 'deterministic',
    });

    assert.equal(classifyMutationIntent('сдвинь штукатурку на 2 дня').intentType, 'shift_relative');
    assert.equal(classifyMutationIntent('перенеси фундамент на 2026-05-10').intentType, 'move_to_date');
    assert.equal(classifyMutationIntent('добавь покраску обоев на каждый этаж').intentType, 'add_repeated_fragment');
    assert.equal(classifyMutationIntent('сделай эту задачу красной').intentType, 'update_metadata');
    assert.equal(classifyMutationIntent('распиши подробнее пункт "Инженерные системы"').intentType, 'expand_wbs');
  });
});

describe('mutation execution routing', () => {
  it('selects deterministic, hybrid, and full_agent modes explicitly', () => {
    assert.equal(
      selectMutationExecutionMode(classifyMutationIntent('добавь сдачу технадзору')),
      'deterministic',
    );
    assert.equal(
      selectMutationExecutionMode(classifyMutationIntent('добавь покраску обоев на каждый этаж')),
      'hybrid',
    );
    assert.equal(
      selectMutationExecutionMode(classifyMutationIntent('полностью перестрой эту ветку')),
      'full_agent',
    );
  });
});
