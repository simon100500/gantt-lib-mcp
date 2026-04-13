import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildMutationPlan } from './plan-builder.js';
import type { MutationIntent, ResolvedMutationContext } from './types.js';

function buildIntent(overrides: Partial<MutationIntent> = {}): MutationIntent {
  return {
    intentType: 'add_single_task',
    confidence: 0.92,
    rawRequest: 'добавь сдачу технадзору',
    normalizedRequest: 'добавь сдачу технадзору',
    entitiesMentioned: ['сдача'],
    requiresResolution: true,
    requiresSchedulingPlacement: true,
    executionMode: 'deterministic',
    ...overrides,
  };
}

function buildContext(overrides: Partial<ResolvedMutationContext> = {}): ResolvedMutationContext {
  return {
    projectId: 'project-1',
    projectVersion: 7,
    resolutionQuery: 'добавь сдачу технадзору',
    containers: [],
    tasks: [],
    predecessors: [],
    successors: [],
    selectedContainerId: 'container-closeout',
    selectedPredecessorTaskId: null,
    selectedSuccessorTaskId: null,
    placementPolicy: 'tail_of_container',
    confidence: 0.91,
    ...overrides,
  };
}

describe('buildMutationPlan', () => {
  it('maps add intents to append_task_to_container with server-side defaults', async () => {
    const plan = await buildMutationPlan({
      intent: buildIntent(),
      resolutionContext: buildContext(),
      userMessage: 'добавь сдачу технадзору',
      tasksBefore: [],
    });

    assert.equal(plan.planType, 'add_single_task');
    assert.equal(plan.canExecuteDeterministically, true);
    assert.equal(plan.needsAgentExecution, false);
    assert.equal(plan.expectedChangedTaskIds.length, 1);
    assert.equal(plan.operations[0]?.kind, 'append_task_to_container');
    assert.equal(plan.operations[0]?.durationDays, 1);
    assert.equal(plan.operations[0]?.containerId, 'container-closeout');
  });

  it('maps date moves and metadata edits to deterministic semantic operations', async () => {
    const movePlan = await buildMutationPlan({
      intent: buildIntent({
        intentType: 'move_to_date',
        rawRequest: 'перенеси фундамент на 2026-05-10',
        normalizedRequest: 'перенеси фундамент на 2026-05-10',
        entitiesMentioned: ['фундамент'],
        requiresSchedulingPlacement: false,
      }),
      resolutionContext: buildContext({
        tasks: [{ id: 'task-foundation', name: 'Фундамент', score: 0.99 }],
        selectedPredecessorTaskId: 'task-foundation',
        placementPolicy: 'no_placement_required',
      }),
      userMessage: 'перенеси фундамент на 2026-05-10',
      tasksBefore: [],
    });

    assert.equal(movePlan.operations[0]?.kind, 'move_task_to_date');
    assert.equal(movePlan.operations[0]?.targetDate, '2026-05-10');
    assert.deepEqual(movePlan.expectedChangedTaskIds, ['task-foundation']);

    const metadataPlan = await buildMutationPlan({
      intent: buildIntent({
        intentType: 'update_metadata',
        rawRequest: 'сделай эту задачу красной',
        normalizedRequest: 'сделай эту задачу красной',
        entitiesMentioned: ['эту задачу'],
        requiresSchedulingPlacement: false,
      }),
      resolutionContext: buildContext({
        tasks: [{ id: 'task-cleaning', name: 'Клининг', score: 0.99 }],
        selectedPredecessorTaskId: 'task-cleaning',
        placementPolicy: 'no_placement_required',
      }),
      userMessage: 'сделай эту задачу красной',
      tasksBefore: [],
    });

    assert.equal(metadataPlan.operations[0]?.kind, 'update_task_metadata');
    assert.deepEqual(metadataPlan.operations[0]?.fields, { color: '#ff4d4f' });
    assert.deepEqual(metadataPlan.expectedChangedTaskIds, ['task-cleaning']);
  });

  it('uses structured fragment plans for hybrid fan-out and WBS expansion', async () => {
    const fanoutPlan = await buildMutationPlan({
      intent: buildIntent({
        intentType: 'add_repeated_fragment',
        rawRequest: 'добавь покраску обоев на каждый этаж',
        normalizedRequest: 'добавь покраску обоев на каждый этаж',
        entitiesMentioned: ['покраска обоев'],
        executionMode: 'hybrid',
      }),
      resolutionContext: buildContext({
        selectedContainerId: 'floors-root',
        placementPolicy: 'group_tail',
        containers: [{ id: 'floors-root', name: 'Этажи', score: 0.9 }],
      }),
      userMessage: 'добавь покраску обоев на каждый этаж',
      tasksBefore: [],
    });

    assert.equal(fanoutPlan.canExecuteDeterministically, false);
    assert.equal(fanoutPlan.needsAgentExecution, false);
    assert.equal(fanoutPlan.operations[0]?.kind, 'fanout_fragment_to_groups');
    assert.equal(fanoutPlan.operations[0]?.fragmentPlan.nodes[0]?.durationDays, 2);

    const expansionPlan = await buildMutationPlan({
      intent: buildIntent({
        intentType: 'expand_wbs',
        rawRequest: 'распиши подробнее пункт "Инженерные системы"',
        normalizedRequest: 'распиши подробнее пункт "Инженерные системы"',
        entitiesMentioned: ['Инженерные системы'],
        executionMode: 'hybrid',
      }),
      resolutionContext: buildContext({
        tasks: [{ id: 'task-engineering', name: 'Инженерные системы', score: 0.97 }],
        selectedPredecessorTaskId: 'task-engineering',
        placementPolicy: 'no_placement_required',
      }),
      userMessage: 'распиши подробнее пункт "Инженерные системы"',
      tasksBefore: [],
    });

    assert.equal(expansionPlan.operations[0]?.kind, 'expand_branch_from_plan');
    assert.equal(expansionPlan.operations[0]?.fragmentPlan.nodes.length, 3);
    assert.deepEqual(expansionPlan.expectedChangedTaskIds, [
      'task-engineering',
      'task-engineering:engineering-systems-preparation',
      'task-engineering:engineering-systems-core-work',
      'task-engineering:engineering-systems-handover',
    ]);
  });
});
