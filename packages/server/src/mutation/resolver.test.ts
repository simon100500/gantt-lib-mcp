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
      }),
      taskService: {
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
    assert.equal(result.confidence, 0.9);
  });
});
