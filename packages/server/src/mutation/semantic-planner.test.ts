import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { planSemanticMutation } from './semantic-planner.js';

const env = {
  OPENAI_API_KEY: '',
  OPENAI_BASE_URL: 'https://example.test',
  OPENAI_MODEL: 'gpt-main',
};

describe('semantic planner', () => {
  it('parses multiplier duration mutations', async () => {
    const plan = await planSemanticMutation({
      userMessage: 'увеличь срок штукатурки в 2 раза',
      env,
      semanticPlannerQuery: async () => ({
        content: JSON.stringify({
          ambiguity: 'none',
          operations: [{
            action: 'change_duration',
            targetHint: 'штукатурка',
            durationMode: 'multiplier',
            durationValue: 2,
          }],
        }),
      }),
    });

    assert.equal(plan.ambiguity, 'none');
    assert.deepEqual(plan.operations, [{
      action: 'change_duration',
      targetHint: 'штукатурка',
      durationMode: 'multiplier',
      durationValue: 2,
      anchor: undefined,
    }]);
  });

  it('parses additive duration deltas distinctly from absolute duration', async () => {
    const plan = await planSemanticMutation({
      userMessage: 'увеличь Покраска стен в МОП на 20 дней',
      env,
      semanticPlannerQuery: async () => ({
        content: JSON.stringify({
          ambiguity: 'none',
          operations: [{
            action: 'change_duration',
            targetHint: 'Покраска стен в МОП',
            durationMode: 'delta_days',
            durationValue: 20,
            anchor: 'end',
          }],
        }),
      }),
    });

    assert.equal(plan.ambiguity, 'none');
    assert.equal(plan.operations[0]?.action, 'change_duration');
    assert.equal(plan.operations[0]?.durationMode, 'delta_days');
    assert.equal(plan.operations[0]?.durationValue, 20);
  });

  it('parses semantic placement for add_task requests at the end of work', async () => {
    const plan = await planSemanticMutation({
      userMessage: 'добавь сдачу ГАСН в конце работ',
      env,
      semanticPlannerQuery: async () => ({
        content: JSON.stringify({
          ambiguity: 'none',
          operations: [{
            action: 'add_task',
            title: 'Сдача ГАСН',
            taskType: 'milestone',
            durationDays: 1,
            placement: {
              mode: 'inside_tail',
              parentHint: 'работы',
            },
          }],
        }),
      }),
    });

    assert.equal(plan.ambiguity, 'none');
    assert.equal(plan.operations[0]?.action, 'add_task');
    assert.equal(plan.operations[0]?.title, 'Сдача ГАСН');
    assert.equal(plan.operations[0]?.taskType, 'milestone');
    assert.equal(plan.operations[0]?.durationDays, 1);
    assert.equal(plan.operations[0]?.placement.mode, 'inside_tail');
    assert.equal(plan.operations[0]?.placement.parentHint, 'работы');
  });
});
