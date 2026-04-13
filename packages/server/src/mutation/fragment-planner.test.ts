import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { planStructuredFragment } from './fragment-planner.js';

describe('planStructuredFragment', () => {
  it('builds a constrained fragment plan for repeated closeout fan-out', async () => {
    const plan = await planStructuredFragment({
      intentType: 'add_repeated_fragment',
      userMessage: 'добавь покраску обоев на каждый этаж',
      anchorTaskId: 'floors-root',
      hint: 'покраска обоев',
    });

    assert.equal(plan.title, 'Покраска обоев');
    assert.equal(plan.nodes.length, 1);
    assert.deepEqual(plan.nodes[0], {
      nodeKey: 'paint-wallpaper',
      title: 'Покраска обоев',
      durationDays: 2,
      dependsOnNodeKeys: [],
    });
    assert.match(plan.why, /покраск/i);
  });

  it('builds a deterministic WBS expansion skeleton instead of freeform payloads', async () => {
    const plan = await planStructuredFragment({
      intentType: 'expand_wbs',
      userMessage: 'распиши подробнее пункт "Инженерные системы"',
      anchorTaskId: 'task-engineering',
      hint: 'Инженерные системы',
    });

    assert.equal(plan.title, 'Инженерные системы');
    assert.deepEqual(plan.nodes.map((node) => node.nodeKey), [
      'engineering-systems-preparation',
      'engineering-systems-core-work',
      'engineering-systems-handover',
    ]);
    assert.deepEqual(plan.nodes.map((node) => node.dependsOnNodeKeys), [
      [],
      ['engineering-systems-preparation'],
      ['engineering-systems-core-work'],
    ]);
  });
});
