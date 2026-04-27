import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { resolveSemanticMutationPlan } from './semantic-resolver.js';

describe('semantic resolver', () => {
  it('resolves target tasks for duration changes', async () => {
    const resolved = await resolveSemanticMutationPlan({
      projectId: 'project-1',
      plan: {
        ambiguity: 'none',
        operations: [{
          action: 'change_duration',
          targetHint: 'Штукатурка',
          durationMode: 'multiplier',
          durationValue: 2,
        }],
      },
      taskService: {
        list: async () => ({ tasks: [] }),
        findTasksByName: async () => ([
          {
            taskId: 'task-plaster',
            name: 'Штукатурка',
            parentId: 'phase-finishing',
            path: ['Отделка', 'Штукатурка'],
            startDate: '2026-04-01',
            endDate: '2026-04-04',
            matchType: 'exact',
            score: 0.97,
          },
        ]),
        findContainerCandidates: async () => [],
        listBranchTasks: async () => [],
      },
    });

    assert.equal(resolved.ambiguity, 'none');
    assert.equal(resolved.operations[0]?.action, 'change_duration');
    assert.equal(resolved.operations[0]?.targetId, 'task-plaster');
  });

  it('resolves inside_tail placement to parent container and tail anchor', async () => {
    const resolved = await resolveSemanticMutationPlan({
      projectId: 'project-1',
      plan: {
        ambiguity: 'none',
        operations: [{
          action: 'add_task',
          title: 'Сдача ГАСН',
          taskType: 'milestone',
          durationDays: 1,
          placement: {
            mode: 'inside_tail',
            parentHint: 'Благоустройство и сдача',
          },
        }],
      },
      taskService: {
        list: async () => ({ tasks: [] }),
        findTasksByName: async () => [],
        findContainerCandidates: async () => ([
          {
            taskId: 'container-closeout',
            name: 'Благоустройство и сдача',
            parentId: null,
            path: ['Благоустройство и сдача'],
            startDate: '2027-04-01',
            endDate: '2027-05-04',
            matchType: 'exact',
            score: 0.91,
          },
        ]),
        listBranchTasks: async () => ([
          {
            taskId: 'container-closeout',
            name: 'Благоустройство и сдача',
            parentId: null,
            path: ['Благоустройство и сдача'],
            startDate: '2027-04-01',
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
            taskId: 'task-permit',
            name: 'Получение разрешения на ввод объекта в эксплуатацию',
            parentId: 'container-closeout',
            path: ['Благоустройство и сдача', 'Получение разрешения на ввод объекта в эксплуатацию'],
            startDate: '2027-04-29',
            endDate: '2027-05-04',
            matchType: 'includes',
            score: 0.82,
          },
        ]),
      },
    });

    assert.equal(resolved.ambiguity, 'none');
    assert.equal(resolved.operations[0]?.action, 'add_task');
    assert.deepEqual(resolved.operations[0]?.placement, {
      mode: 'inside_tail',
      anchorTaskId: 'task-permit',
      parentId: 'container-closeout',
    });
  });
});

