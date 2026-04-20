import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { compileSemanticMutationPlan } from './semantic-compiler.js';

describe('semantic compiler', () => {
  it('compiles duration multiplier operations into authoritative change_duration plans', () => {
    const compiled = compileSemanticMutationPlan({
      projectId: 'project-1',
      tasksBefore: [{
        id: 'task-plaster',
        name: 'Штукатурка',
        startDate: '2026-04-01',
        endDate: '2026-04-05',
      }],
      resolvedPlan: {
        ambiguity: 'none',
        confidence: 0.97,
        operations: [{
          action: 'change_duration',
          targetHint: 'Штукатурка',
          targetId: 'task-plaster',
          durationMode: 'multiplier',
          durationValue: 2,
          anchor: 'end',
        }],
      },
    });

    assert.equal(compiled.ambiguity, 'none');
    if (compiled.ambiguity !== 'none') {
      return;
    }
    assert.deepEqual(compiled.plan.operations, [{
      kind: 'change_task_duration',
      taskId: 'task-plaster',
      durationDays: 10,
      anchor: 'end',
    }]);
    assert.equal(compiled.plan.skipChangedSetVerification, true);
  });

  it('compiles semantic add_task placement into append-after operations', () => {
    const compiled = compileSemanticMutationPlan({
      projectId: 'project-1',
      tasksBefore: [],
      resolvedPlan: {
        ambiguity: 'none',
        confidence: 0.9,
        operations: [{
          action: 'add_task',
          title: 'Сдача ГАСН',
          taskType: 'milestone',
          durationDays: 1,
          placement: {
            mode: 'inside_tail',
            anchorTaskId: 'task-permit',
            parentId: 'container-closeout',
          },
        }],
      },
    });

    assert.equal(compiled.ambiguity, 'none');
    if (compiled.ambiguity !== 'none') {
      return;
    }
    assert.equal(compiled.plan.operations[0]?.kind, 'append_task_after');
    assert.equal(compiled.plan.operations[0]?.taskType, 'milestone');
    assert.equal(compiled.plan.expectedChangedTaskIds.length, 1);
  });
});

