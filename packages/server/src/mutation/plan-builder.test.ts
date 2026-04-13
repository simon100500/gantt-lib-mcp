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
    entitiesMentioned: ['сдача технадзору'],
    requiresResolution: true,
    requiresSchedulingPlacement: true,
    executionMode: 'deterministic',
    taskTitle: 'Сдача технадзору',
    durationDays: 1,
    ...overrides,
  };
}

function buildContext(overrides: Partial<ResolvedMutationContext> = {}): ResolvedMutationContext {
  return {
    projectId: 'project-1',
    projectVersion: 7,
    resolutionQuery: 'добавь сдачу технадзору',
    containers: [],
    groupMemberIds: [],
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
  it('maps add intents to append_task_to_container with model-provided semantics', async () => {
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
    assert.equal(plan.operations[0]?.title, 'Сдача технадзору');
    assert.equal(plan.operations[0]?.durationDays, 1);
    assert.equal(plan.operations[0]?.containerId, 'container-closeout');
  });

  it('adds a numeric suffix when the deterministic add-task id already exists', async () => {
    const plan = await buildMutationPlan({
      intent: buildIntent(),
      resolutionContext: buildContext(),
      userMessage: 'добавь сдачу технадзору',
      tasksBefore: [
        { id: 'container-closeout:sdacha-tehnadzoru', name: 'Сдача технадзору' },
        { id: 'container-closeout:sdacha-tehnadzoru-2', name: 'Сдача технадзору' },
      ],
    });

    assert.equal(plan.operations[0]?.kind, 'append_task_to_container');
    assert.equal(plan.operations[0]?.taskId, 'container-closeout:sdacha-tehnadzoru-3');
    assert.deepEqual(plan.expectedChangedTaskIds, ['container-closeout:sdacha-tehnadzoru-3']);
  });

  it('derives add-task title from the user phrase instead of hardcoded keywords', async () => {
    const plan = await buildMutationPlan({
      intent: buildIntent({
        rawRequest: 'добавь пусконаладку насосной станции',
        normalizedRequest: 'добавь пусконаладку насосной станции',
        entitiesMentioned: ['пусконаладку насосной станции'],
        taskTitle: 'Пусконаладка насосной станции',
        durationDays: 3,
      }),
      resolutionContext: buildContext(),
      userMessage: 'добавь пусконаладку насосной станции',
      tasksBefore: [],
    });

    assert.equal(plan.operations[0]?.kind, 'append_task_to_container');
    assert.equal(plan.operations[0]?.title, 'Пусконаладка насосной станции');
  });

  it('maps date moves and metadata edits to deterministic semantic operations', async () => {
    const movePlan = await buildMutationPlan({
      intent: buildIntent({
        intentType: 'move_to_date',
        rawRequest: 'перенеси фундамент на 2026-05-10',
        normalizedRequest: 'перенеси фундамент на 2026-05-10',
        entitiesMentioned: ['фундамент'],
        requiresSchedulingPlacement: false,
        targetDate: '2026-05-10',
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
        metadataFields: { color: '#ff4d4f' },
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
        groupScopeHint: 'этаж',
        fragmentPlan: {
          title: 'Покраска обоев',
          nodes: [{ nodeKey: 'wallpaper-paint', title: 'Покраска обоев', durationDays: 2, dependsOnNodeKeys: [] }],
          why: 'semantic fragment',
        },
      }),
      resolutionContext: buildContext({
        selectedContainerId: 'floors-root',
        placementPolicy: 'group_tail',
        containers: [{ id: 'floors-root', name: 'Этажи', score: 0.9 }],
        groupMemberIds: ['floor-1', 'floor-2'],
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
        fragmentPlan: {
          title: 'Инженерные системы',
          nodes: [
            { nodeKey: 'prep', title: 'Подготовка', durationDays: 2, dependsOnNodeKeys: [] },
            { nodeKey: 'core', title: 'Основные работы', durationDays: 3, dependsOnNodeKeys: ['prep'] },
            { nodeKey: 'handover', title: 'Сдача', durationDays: 1, dependsOnNodeKeys: ['core'] },
          ],
          why: 'semantic fragment',
        },
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
      'task-engineering:prep',
      'task-engineering:core',
      'task-engineering:handover',
    ]);
  });
});
