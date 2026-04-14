import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { executeMutationPlan } from './execution.js';
import type { MutationPlan, MutationTaskSnapshot } from './types.js';

function buildTask(id: string, name: string, startDate: string, endDate: string): MutationTaskSnapshot {
  return { id, name, startDate, endDate };
}

describe('executeMutationPlan', () => {
  it('commits deterministic add plans through commandService and verifies authoritative changed ids', async () => {
    const commitRequests: Array<{ commandType: string; baseVersion: number }> = [];
    const result = await executeMutationPlan({
      projectId: 'project-1',
      projectVersion: 12,
      tasksBefore: [buildTask('task-tech-supervision', 'Технадзор', '2026-05-01', '2026-05-01')],
      plan: {
        planType: 'add_single_task',
        operations: [{
          kind: 'append_task_after',
          taskId: 'new-closeout',
          title: 'Сдача',
          predecessorTaskId: 'task-tech-supervision',
          parentId: null,
          durationDays: 1,
        }],
        why: 'closeout append',
        expectedChangedTaskIds: ['new-closeout', 'task-tech-supervision'],
        canExecuteDeterministically: true,
        needsAgentExecution: false,
      } satisfies MutationPlan,
      commandService: {
        commitCommand: async (request: { baseVersion: number; command: { type: string } }) => {
          commitRequests.push({ commandType: request.command.type, baseVersion: request.baseVersion });

          if (request.command.type === 'create_task') {
            return {
              accepted: true,
              clientRequestId: 'req-1',
              baseVersion: request.baseVersion,
              newVersion: request.baseVersion + 1,
              result: {
                snapshot: { tasks: [], dependencies: [] },
                changedTaskIds: ['new-closeout'],
                changedDependencyIds: [],
                conflicts: [],
                patches: [],
              },
              snapshot: { tasks: [], dependencies: [] },
            };
          }

          return {
            accepted: true,
            clientRequestId: 'req-2',
            baseVersion: request.baseVersion,
            newVersion: request.baseVersion + 1,
            result: {
              snapshot: { tasks: [], dependencies: [] },
              changedTaskIds: ['task-tech-supervision'],
              changedDependencyIds: ['dep-1'],
              conflicts: [],
              patches: [],
            },
            snapshot: { tasks: [], dependencies: [] },
          };
        },
      },
    });

    assert.deepEqual(commitRequests, [
      { commandType: 'create_task', baseVersion: 12 },
      { commandType: 'create_dependency', baseVersion: 13 },
    ]);
    assert.equal(result.status, 'completed');
    assert.equal(result.verificationVerdict, 'accepted');
    assert.deepEqual(result.committedCommandTypes, ['create_task', 'create_dependency']);
    assert.deepEqual(result.changedTaskIds, ['new-closeout', 'task-tech-supervision']);
  });

  it('fails verification when authoritative changed ids do not match the plan expectation', async () => {
    const result = await executeMutationPlan({
      projectId: 'project-1',
      projectVersion: 4,
      tasksBefore: [buildTask('task-foundation', 'Фундамент', '2026-04-01', '2026-04-05')],
      plan: {
        planType: 'move_to_date',
        operations: [{
          kind: 'move_task_to_date',
          taskId: 'task-foundation',
          targetDate: '2026-05-10',
        }],
        why: 'move foundation',
        expectedChangedTaskIds: ['task-foundation'],
        canExecuteDeterministically: true,
        needsAgentExecution: false,
      } satisfies MutationPlan,
      commandService: {
        commitCommand: async (request: { baseVersion: number }) => ({
          accepted: true,
          clientRequestId: 'req-1',
          baseVersion: request.baseVersion,
          newVersion: request.baseVersion + 1,
          result: {
            snapshot: { tasks: [], dependencies: [] },
            changedTaskIds: ['unexpected-task'],
            changedDependencyIds: [],
            conflicts: [],
            patches: [],
          },
          snapshot: { tasks: [], dependencies: [] },
        }),
      },
    });

    assert.equal(result.status, 'failed');
    assert.equal(result.verificationVerdict, 'failed');
    assert.equal(result.failureReason, 'verification_failed');
    assert.deepEqual(result.changedTaskIds, ['unexpected-task']);
  });

  it('preserves milestone type when compiling repeated fragment fan-out', async () => {
    const committedCommands: Array<{ type: string; tasks?: Array<{ id?: string; type?: string }> }> = [];
    const result = await executeMutationPlan({
      projectId: 'project-1',
      projectVersion: 4,
      tasksBefore: [buildTask('floor-1', 'Секция 1, 1 этаж', '2026-04-01', '2026-04-05')],
      plan: {
        planType: 'add_repeated_fragment',
        operations: [{
          kind: 'fanout_fragment_to_groups',
          groupIds: ['floor-1'],
          fragmentPlan: {
            title: 'Сдача технадзору',
            nodes: [{
              nodeKey: 'sdacha-tehnadzoru',
              title: 'Сдача технадзору',
              taskType: 'milestone',
              durationDays: 1,
              dependsOnNodeKeys: [],
            }],
            why: 'test',
          },
        }],
        why: 'fanout repeated milestone',
        expectedChangedTaskIds: ['floor-1:sdacha-tehnadzoru'],
        canExecuteDeterministically: false,
        needsAgentExecution: false,
      } satisfies MutationPlan,
      commandService: {
        commitCommand: async (request: { baseVersion: number; command: { type: string; tasks?: Array<{ id?: string; type?: string }> } }) => {
          committedCommands.push(request.command);
          return {
            accepted: true,
            clientRequestId: 'req-1',
            baseVersion: request.baseVersion,
            newVersion: request.baseVersion + 1,
            result: {
              snapshot: { tasks: [], dependencies: [] },
              changedTaskIds: ['floor-1:sdacha-tehnadzoru'],
              changedDependencyIds: [],
              conflicts: [],
              patches: [],
            },
            snapshot: { tasks: [], dependencies: [] },
          };
        },
      },
    });

    assert.equal(result.status, 'completed');
    assert.equal(committedCommands[0]?.type, 'create_tasks_batch');
    assert.equal(committedCommands[0]?.tasks?.[0]?.type, 'milestone');
  });
});
