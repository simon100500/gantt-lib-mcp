import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { resolveMutationContext } from './resolver.js';
import type { MutationIntent } from './types.js';

type SearchMatch = {
  taskId: string;
  name: string;
  parentId: string | null;
  path: string[];
  startDate: string;
  endDate: string;
  matchType: 'exact' | 'includes' | 'token';
  score: number;
};

type GroupScope = {
  key: string;
  label: string;
  rootTaskId: string;
  memberTaskIds: string[];
  memberNames: string[];
};

function buildIntent(overrides: Partial<MutationIntent> = {}): MutationIntent {
  return {
    intentType: 'add_single_task',
    confidence: 0.9,
    rawRequest: 'добавь сдачу технадзору',
    normalizedRequest: 'добавь сдачу технадзору',
    entitiesMentioned: ['сдачу технадзору'],
    requiresResolution: true,
    requiresSchedulingPlacement: true,
    executionMode: 'deterministic',
    taskTitle: 'Сдача технадзору',
    durationDays: 1,
    ...overrides,
  };
}

describe('resolveMutationContext', () => {
  it('prefers exact task matches before fuzzy matches for anchor resolution', async () => {
    const result = await resolveMutationContext({
      projectId: 'project-1',
      projectVersion: 3,
      userMessage: 'сдвинь штукатурку на 2 дня',
      intent: buildIntent({
        intentType: 'shift_relative',
        rawRequest: 'сдвинь штукатурку на 2 дня',
        normalizedRequest: 'сдвинь штукатурку на 2 дня',
        entitiesMentioned: ['штукатурку'],
        requiresSchedulingPlacement: false,
      }),
      taskService: {
        list: async () => ({ tasks: [] }),
        findTasksByName: async () => ([
          {
            taskId: 'task-exact',
            name: 'Штукатурку',
            parentId: null,
            path: ['Отделка', 'Штукатурку'],
            startDate: '2026-04-01',
            endDate: '2026-04-03',
            matchType: 'exact',
            score: 1,
          },
          {
            taskId: 'task-fuzzy',
            name: 'Штукатурка стен',
            parentId: null,
            path: ['Отделка', 'Штукатурка стен'],
            startDate: '2026-04-04',
            endDate: '2026-04-06',
            matchType: 'includes',
            score: 0.82,
          },
        ] satisfies SearchMatch[]),
        findContainerCandidates: async () => [],
        listBranchTasks: async () => [],
        findGroupScopes: async () => [],
      },
    });

    assert.equal(result.selectedPredecessorTaskId, 'task-exact');
    assert.equal(result.tasks[0]?.id, 'task-exact');
    assert.equal(result.confidence, 1);
    assert.equal(result.placementPolicy, 'no_placement_required');
  });

  it('resolves closeout add intents to matching container candidates and selects tail placement', async () => {
    const result = await resolveMutationContext({
      projectId: 'project-1',
      projectVersion: 7,
      userMessage: 'добавь сдачу технадзору',
      intent: buildIntent(),
      taskService: {
        list: async () => ({ tasks: [] }),
        findTasksByName: async () => [],
        findContainerCandidates: async () => ([
          {
            taskId: 'container-closeout',
            name: 'Сдача и приемка',
            parentId: null,
            path: ['Финиш', 'Сдача и приемка'],
            startDate: '2026-05-01',
            endDate: '2026-05-10',
            matchType: 'includes',
            score: 0.92,
          },
        ] satisfies SearchMatch[]),
        listBranchTasks: async () => [],
        findGroupScopes: async () => [],
      },
    });

    assert.equal(result.selectedContainerId, 'container-closeout');
    assert.equal(result.placementPolicy, 'tail_of_container');
    assert.equal(result.confidence, 0.92);
  });

  it('resolves tail-of-container additions to the latest leaf task as predecessor when branch tasks exist', async () => {
    const result = await resolveMutationContext({
      projectId: 'project-1',
      projectVersion: 7,
      userMessage: 'добавь сдачу гасн в конце работ',
      intent: buildIntent({
        rawRequest: 'добавь сдачу гасн в конце работ',
        normalizedRequest: 'добавь сдачу гасн в конце работ',
        entitiesMentioned: ['сдача гасн'],
        taskTitle: 'Сдача ГАСН',
      }),
      taskService: {
        list: async () => ({ tasks: [] }),
        findTasksByName: async () => [],
        findContainerCandidates: async () => ([
          {
            taskId: 'container-closeout',
            name: 'Благоустройство и сдача',
            parentId: null,
            path: ['Благоустройство и сдача'],
            startDate: '2026-12-27',
            endDate: '2027-05-04',
            matchType: 'includes',
            score: 0.72,
          },
        ] satisfies SearchMatch[]),
        listBranchTasks: async () => ([
          {
            taskId: 'container-closeout',
            name: 'Благоустройство и сдача',
            parentId: null,
            path: ['Благоустройство и сдача'],
            startDate: '2026-12-27',
            endDate: '2027-05-04',
            matchType: 'exact',
            score: 1,
          },
          {
            taskId: 'task-landscaping',
            name: 'Озеленение',
            parentId: 'container-closeout',
            path: ['Благоустройство и сдача', 'Озеленение'],
            startDate: '2027-04-01',
            endDate: '2027-04-10',
            matchType: 'includes',
            score: 0.8,
          },
          {
            taskId: 'task-handover-docs',
            name: 'Исполнительная документация',
            parentId: 'container-closeout',
            path: ['Благоустройство и сдача', 'Исполнительная документация'],
            startDate: '2027-04-20',
            endDate: '2027-04-28',
            matchType: 'includes',
            score: 0.82,
          },
          {
            taskId: 'task-acceptance',
            name: 'Акт приемки',
            parentId: 'container-closeout',
            path: ['Благоустройство и сдача', 'Акт приемки'],
            startDate: '2027-04-29',
            endDate: '2027-05-04',
            matchType: 'includes',
            score: 0.83,
          },
        ] satisfies SearchMatch[]),
        findGroupScopes: async () => [],
      },
    });

    assert.equal(result.selectedContainerId, 'container-closeout');
    assert.equal(result.selectedPredecessorTaskId, 'task-acceptance');
    assert.equal(result.predecessors[0]?.id, 'task-acceptance');
    assert.equal(result.placementPolicy, 'after_predecessor');
    assert.equal(result.confidence, 0.72);
  });

  it('resolves repeated group fan-out intents through group scopes', async () => {
    const result = await resolveMutationContext({
      projectId: 'project-1',
      projectVersion: 11,
      userMessage: 'добавь покраску обоев на каждый этаж',
      intent: buildIntent({
        intentType: 'add_repeated_fragment',
        rawRequest: 'добавь покраску обоев на каждый этаж',
        normalizedRequest: 'добавь покраску обоев на каждый этаж',
        entitiesMentioned: ['покраску обоев'],
        groupScopeHint: 'этаж',
      }),
      taskService: {
        list: async () => ({ tasks: [] }),
        findTasksByName: async () => [],
        findContainerCandidates: async () => [],
        listBranchTasks: async () => [],
        findGroupScopes: async () => ([
          {
            key: 'floor',
            label: 'Этаж',
            rootTaskId: 'floors-root',
            memberTaskIds: ['floor-1', 'floor-2'],
            memberNames: ['Этаж 1', 'Этаж 2'],
          },
        ] satisfies GroupScope[]),
      },
    });

    assert.equal(result.selectedContainerId, 'floors-root');
    assert.equal(result.placementPolicy, 'group_tail');
    assert.deepEqual(result.containers.map((item) => item.id), ['floors-root']);
    assert.deepEqual(result.groupMemberIds, ['floor-1', 'floor-2']);
    assert.equal(result.confidence, 0.9);
  });

  it('aggregates repeated group fan-out across multiple sibling roots', async () => {
    const result = await resolveMutationContext({
      projectId: 'project-1',
      projectVersion: 11,
      userMessage: 'добавь сдачу технадзору на каждый этаж',
      intent: buildIntent({
        intentType: 'add_repeated_fragment',
        rawRequest: 'добавь сдачу технадзору на каждый этаж',
        normalizedRequest: 'добавь сдачу технадзору на каждый этаж',
        entitiesMentioned: ['сдачу технадзору'],
        groupScopeHint: 'этаж',
      }),
      taskService: {
        list: async () => ({ tasks: [] }),
        findTasksByName: async () => [],
        findContainerCandidates: async () => [],
        listBranchTasks: async () => [],
        findGroupScopes: async () => ([
          {
            key: 'floor',
            label: 'Штукатурные работы: Секция 1',
            rootTaskId: 'section-1',
            memberTaskIds: ['section-1-floor-1', 'section-1-floor-2', 'section-1-floor-3'],
            memberNames: ['Секция 1, 1 этаж', 'Секция 1, 2 этаж', 'Секция 1, 3 этаж'],
          },
          {
            key: 'floor',
            label: 'Штукатурные работы: Секция 2',
            rootTaskId: 'section-2',
            memberTaskIds: ['section-2-floor-1', 'section-2-floor-2', 'section-2-floor-3'],
            memberNames: ['Секция 2, 1 этаж', 'Секция 2, 2 этаж', 'Секция 2, 3 этаж'],
          },
        ] satisfies GroupScope[]),
      },
    });

    assert.equal(result.selectedContainerId, null);
    assert.equal(result.placementPolicy, 'group_tail');
    assert.deepEqual(result.containers.map((item) => item.id), ['section-1', 'section-2']);
    assert.deepEqual(result.groupMemberIds, [
      'section-1-floor-1',
      'section-1-floor-2',
      'section-1-floor-3',
      'section-2-floor-1',
      'section-2-floor-2',
      'section-2-floor-3',
    ]);
    assert.equal(result.confidence, 0.9);
  });

  it('leaves add intents unresolved when no container candidate is found for container_not_resolved handling', async () => {
    const result = await resolveMutationContext({
      projectId: 'project-1',
      projectVersion: 1,
      userMessage: 'добавь сдачу технадзору',
      intent: buildIntent(),
      taskService: {
        list: async () => ({ tasks: [] }),
        findTasksByName: async () => [],
        findContainerCandidates: async () => [],
        listBranchTasks: async () => [],
        findGroupScopes: async () => [],
      },
    });

    assert.equal(result.selectedContainerId, null);
    assert.equal(result.confidence, 0);
  });

  it('leaves missing task anchors unresolved for anchor_not_found handling', async () => {
    const result = await resolveMutationContext({
      projectId: 'project-1',
      projectVersion: 1,
      userMessage: 'сдвинь штукатурку на 2 дня',
      intent: buildIntent({
        intentType: 'shift_relative',
        rawRequest: 'сдвинь штукатурку на 2 дня',
        normalizedRequest: 'сдвинь штукатурку на 2 дня',
        entitiesMentioned: ['штукатурку'],
        requiresSchedulingPlacement: false,
      }),
      taskService: {
        list: async () => ({ tasks: [] }),
        findTasksByName: async () => [],
        findContainerCandidates: async () => [],
        listBranchTasks: async () => [],
        findGroupScopes: async () => [],
      },
    });

    assert.equal(result.selectedPredecessorTaskId, null);
    assert.equal(result.confidence, 0);
  });

  it('leaves repeated fragment requests unresolved when group_scope_not_resolved applies', async () => {
    const result = await resolveMutationContext({
      projectId: 'project-1',
      projectVersion: 1,
      userMessage: 'добавь покраску обоев на каждый этаж',
      intent: buildIntent({
        intentType: 'add_repeated_fragment',
        rawRequest: 'добавь покраску обоев на каждый этаж',
        normalizedRequest: 'добавь покраску обоев на каждый этаж',
        entitiesMentioned: ['покраску обоев'],
        groupScopeHint: 'этаж',
      }),
      taskService: {
        list: async () => ({ tasks: [] }),
        findTasksByName: async () => [],
        findContainerCandidates: async () => [],
        listBranchTasks: async () => [],
        findGroupScopes: async () => [],
      },
    });

    assert.equal(result.selectedContainerId, null);
    assert.equal(result.placementPolicy, 'unresolved');
  });

  it('uses the direct container search query before applying a generic fallback', async () => {
    const queries: string[] = [];
    const result = await resolveMutationContext({
      projectId: 'project-1',
      projectVersion: 7,
      userMessage: 'добавь сдачу технадзору',
      intent: buildIntent(),
      taskService: {
        list: async () => ({ tasks: [] }),
        findTasksByName: async () => [],
        findContainerCandidates: async (_projectId, query) => {
          queries.push(query);
          return query === 'сдачу технадзору'
            ? [{
                taskId: 'container-closeout',
                name: 'Клининг и сдача',
                parentId: null,
                path: ['Финиш', 'Клининг и сдача'],
                startDate: '2026-05-01',
                endDate: '2026-05-10',
                matchType: 'includes',
                score: 0.88,
              }]
            : [];
        },
        listBranchTasks: async () => [],
        findGroupScopes: async () => [],
      },
    });

    assert.deepEqual(queries, ['сдачу технадзору']);
    assert.equal(result.selectedContainerId, 'container-closeout');
    assert.equal(result.placementPolicy, 'tail_of_container');
    assert.equal(result.confidence, 0.88);
  });

  it('falls back to the latest top-level section when direct container search finds nothing', async () => {
    const result = await resolveMutationContext({
      projectId: 'project-1',
      projectVersion: 7,
      userMessage: 'добавь сдачу технадзору',
      intent: buildIntent(),
      taskService: {
        list: async () => ({
          tasks: [
            { id: 'phase-1', name: 'Демонтаж', parentId: undefined, startDate: '2026-04-01', endDate: '2026-04-10' },
            { id: 'phase-2', name: 'Меблировка и сдача объекта', parentId: undefined, startDate: '2026-04-11', endDate: '2026-04-25' },
          ],
        }),
        findTasksByName: async () => [],
        findContainerCandidates: async () => [],
        listBranchTasks: async () => [],
        findGroupScopes: async () => [],
      },
    });

    assert.equal(result.selectedContainerId, 'phase-2');
    assert.equal(result.placementPolicy, 'tail_of_container');
    assert.equal(result.confidence, 0.72);
  });
});
