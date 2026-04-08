import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import type { ActorType, CommitProjectCommandRequest, CommitProjectCommandResponse } from '@gantt/mcp/types';

import { compileInitialProjectPlan } from './compiler.js';
import { executeInitialProjectPlan } from './executor.js';
import type { ProjectPlan } from './types.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const PLAN: ProjectPlan = {
  projectType: 'private_residential_house',
  assumptions: ['RF production calendar defaults'],
  nodes: [
    {
      nodeKey: 'phase-foundation',
      title: 'Foundation',
      kind: 'phase',
      durationDays: 1,
      dependsOn: [],
    },
    {
      nodeKey: 'task-excavation',
      title: 'Excavation',
      parentNodeKey: 'phase-foundation',
      kind: 'task',
      durationDays: 3,
      dependsOn: [],
    },
    {
      nodeKey: 'task-concrete',
      title: 'Concrete pour',
      parentNodeKey: 'phase-foundation',
      kind: 'task',
      durationDays: 2,
      dependsOn: [{ nodeKey: 'task-excavation', type: 'FS', lagDays: 1 }],
    },
    {
      nodeKey: 'phase-shell',
      title: 'Shell',
      kind: 'phase',
      durationDays: 1,
      dependsOn: [],
    },
    {
      nodeKey: 'task-framing',
      title: 'Framing',
      parentNodeKey: 'phase-shell',
      kind: 'task',
      durationDays: 4,
      dependsOn: [{ nodeKey: 'task-concrete', type: 'SS', lagDays: 0 }],
    },
    {
      nodeKey: 'task-roof',
      title: 'Roofing',
      parentNodeKey: 'phase-shell',
      kind: 'task',
      durationDays: 2,
      dependsOn: [{ nodeKey: 'task-framing', type: 'FF', lagDays: 1 }],
    },
    {
      nodeKey: 'phase-interiors',
      title: 'Interiors',
      kind: 'phase',
      durationDays: 1,
      dependsOn: [],
    },
    {
      nodeKey: 'task-electrical',
      title: 'Electrical rough-in',
      parentNodeKey: 'phase-interiors',
      kind: 'task',
      durationDays: 3,
      dependsOn: [{ nodeKey: 'task-roof', type: 'SF', lagDays: 0 }],
    },
  ],
};

function taskByName(name: string, tasks: Array<{ name: string; startDate: string; endDate: string; dependencies?: Array<{ type: string; lag?: number }> }>) {
  const task = tasks.find((entry) => entry.name === name);
  assert.ok(task, `expected task ${name}`);
  return task;
}

describe('compileInitialProjectPlan', () => {
  it('builds one create_tasks_batch command with working day scheduling, rollup containers, and every dependency type', () => {
    const compiled = compileInitialProjectPlan({
      projectId: 'project-41',
      baseVersion: 12,
      serverDate: '2026-04-04',
      plan: PLAN,
    });

    assert.equal(compiled.command.type, 'create_tasks_batch');
    assert.equal(compiled.retainedNodeCount, PLAN.nodes.length);
    assert.equal(Object.keys(compiled.nodeKeyToTaskId).length, PLAN.nodes.length);

    const excavation = taskByName('Excavation', compiled.command.tasks);
    const concrete = taskByName('Concrete pour', compiled.command.tasks);
    const framing = taskByName('Framing', compiled.command.tasks);
    const roofing = taskByName('Roofing', compiled.command.tasks);
    const electrical = taskByName('Electrical rough-in', compiled.command.tasks);
    const foundation = taskByName('Foundation', compiled.command.tasks);
    const shell = taskByName('Shell', compiled.command.tasks);
    const interiors = taskByName('Interiors', compiled.command.tasks);

    assert.deepEqual(
      { startDate: excavation.startDate, endDate: excavation.endDate },
      { startDate: '2026-04-06', endDate: '2026-04-08' },
      'durationDays is interpreted as a working day span and aligns weekend serverDate to Monday',
    );
    assert.deepEqual(
      { startDate: concrete.startDate, endDate: concrete.endDate },
      { startDate: '2026-04-10', endDate: '2026-04-13' },
    );
    assert.deepEqual(
      { startDate: framing.startDate, endDate: framing.endDate },
      { startDate: '2026-04-10', endDate: '2026-04-15' },
    );
    assert.deepEqual(
      { startDate: roofing.startDate, endDate: roofing.endDate },
      { startDate: '2026-04-15', endDate: '2026-04-16' },
    );
    assert.deepEqual(
      { startDate: electrical.startDate, endDate: electrical.endDate },
      { startDate: '2026-04-10', endDate: '2026-04-14' },
    );

    assert.deepEqual(
      { startDate: foundation.startDate, endDate: foundation.endDate },
      { startDate: '2026-04-06', endDate: '2026-04-13' },
      'rollup parent ranges come only from child tasks',
    );
    assert.deepEqual(
      { startDate: shell.startDate, endDate: shell.endDate },
      { startDate: '2026-04-10', endDate: '2026-04-16' },
    );
    assert.deepEqual(
      { startDate: interiors.startDate, endDate: interiors.endDate },
      { startDate: '2026-04-10', endDate: '2026-04-14' },
    );

    assert.deepEqual(concrete.dependencies, [
      {
        taskId: compiled.nodeKeyToTaskId['task-excavation'],
        type: 'FS',
        lag: 1,
      },
    ]);
    assert.deepEqual(framing.dependencies, [
      {
        taskId: compiled.nodeKeyToTaskId['task-concrete'],
        type: 'SS',
        lag: 0,
      },
    ]);
    assert.deepEqual(roofing.dependencies, [
      {
        taskId: compiled.nodeKeyToTaskId['task-framing'],
        type: 'FF',
        lag: 1,
      },
    ]);
    assert.deepEqual(electrical.dependencies, [
      {
        taskId: compiled.nodeKeyToTaskId['task-roof'],
        type: 'SF',
        lag: 0,
      },
    ]);
  });

  it('emits a deterministic structure for the same serverDate', () => {
    const first = compileInitialProjectPlan({
      projectId: 'project-41',
      baseVersion: 12,
      serverDate: '2026-04-04',
      plan: PLAN,
    });
    const second = compileInitialProjectPlan({
      projectId: 'project-41',
      baseVersion: 12,
      serverDate: '2026-04-04',
      plan: PLAN,
    });

    assert.deepEqual(second, first);
  });
});

describe('executeInitialProjectPlan', () => {
  it('commits a partial initial schedule after dropping only broken references and reports a partial outcome', async () => {
    const partialPlan: ProjectPlan = {
      projectType: 'private_residential_house',
      assumptions: [],
      nodes: [
        { nodeKey: 'phase-a', title: 'Site prep', kind: 'phase', durationDays: 1, dependsOn: [] },
        { nodeKey: 'task-a', title: 'Survey', parentNodeKey: 'phase-a', kind: 'task', durationDays: 2, dependsOn: [] },
        { nodeKey: 'phase-b', title: 'Foundation', kind: 'phase', durationDays: 1, dependsOn: [] },
        { nodeKey: 'task-b', title: 'Footings', parentNodeKey: 'phase-b', kind: 'task', durationDays: 2, dependsOn: [{ nodeKey: 'task-a', type: 'FS' }] },
        { nodeKey: 'phase-c', title: 'Shell', kind: 'phase', durationDays: 1, dependsOn: [] },
        { nodeKey: 'task-c', title: 'Framing', parentNodeKey: 'phase-c', kind: 'task', durationDays: 3, dependsOn: [{ nodeKey: 'missing-task', type: 'FS' }] },
        { nodeKey: 'phase-d', title: 'Finishes', kind: 'phase', durationDays: 1, dependsOn: [] },
        { nodeKey: 'task-d', title: 'Painting', parentNodeKey: 'phase-d', kind: 'task', durationDays: 2, dependsOn: [{ nodeKey: 'task-c', type: 'SS' }] },
      ],
    };

    const committed: Array<{ request: CommitProjectCommandRequest; actorType: ActorType; actorId?: string }> = [];
    const commandService = {
      async commitCommand(request: CommitProjectCommandRequest, actorType: ActorType, actorId?: string): Promise<CommitProjectCommandResponse> {
        committed.push({ request, actorType, actorId });
        const changedTaskIds = request.command.type === 'create_tasks_batch'
          ? request.command.tasks.map((task) => task.name)
          : [];
        return {
          clientRequestId: 'client-1',
          accepted: true,
          baseVersion: 8,
          newVersion: 9,
          result: {
            snapshot: { tasks: [], dependencies: [] },
            changedTaskIds,
            changedDependencyIds: [],
            conflicts: [],
            patches: [],
          },
          snapshot: { tasks: [], dependencies: [] },
        };
      },
    };

    const result = await executeInitialProjectPlan({
      projectId: 'project-41',
      baseVersion: 8,
      clientRequestId: 'client-1',
      actorId: 'agent-7',
      serverDate: '2026-04-07',
      plan: partialPlan,
      commandService,
    });

    assert.equal(result.ok, true);
    assert.equal(result.outcome, 'partial');
    assert.match(result.message, /partial/i);
    assert.deepEqual(result.droppedNodeKeys, []);
    assert.deepEqual(result.droppedDependencyNodeKeys, ['missing-task']);
    assert.equal(committed.length, 1);
    assert.equal(committed[0]!.actorType, 'agent');
    assert.equal(committed[0]!.actorId, 'agent-7');
    assert.equal(committed[0]!.request.command.type, 'create_tasks_batch');
  });

  it('rejects a too-weak partial result instead of silently falling back', async () => {
    const weakPlan: ProjectPlan = {
      projectType: 'private_residential_house',
      assumptions: [],
      nodes: [
        { nodeKey: 'phase-a', title: 'Phase A', kind: 'phase', durationDays: 1, dependsOn: [] },
        { nodeKey: 'task-a', title: 'Task A', parentNodeKey: 'phase-a', kind: 'task', durationDays: 2, dependsOn: [] },
        { nodeKey: 'phase-b', title: 'Phase B', kind: 'phase', durationDays: 1, dependsOn: [] },
        { nodeKey: 'task-b', title: 'Task B', parentNodeKey: 'phase-b', kind: 'task', durationDays: 2, dependsOn: [] },
        { nodeKey: 'phase-c', title: 'Phase C', kind: 'phase', durationDays: 1, dependsOn: [] },
        { nodeKey: 'task-c', title: 'Task C', parentNodeKey: 'missing-phase-c', kind: 'task', durationDays: 2, dependsOn: [] },
        { nodeKey: 'phase-d', title: 'Phase D', kind: 'phase', durationDays: 1, dependsOn: [] },
        { nodeKey: 'task-d', title: 'Task D', parentNodeKey: 'missing-phase-d', kind: 'task', durationDays: 2, dependsOn: [] },
        { nodeKey: 'phase-e', title: 'Phase E', kind: 'phase', durationDays: 1, dependsOn: [] },
        { nodeKey: 'task-e', title: 'Task E', parentNodeKey: 'missing-phase-e', kind: 'task', durationDays: 2, dependsOn: [] },
      ],
    };

    let commitCalls = 0;
    const commandService = {
      async commitCommand() {
        commitCalls += 1;
        throw new Error('commit should not run');
      },
    };

    const result = await executeInitialProjectPlan({
      projectId: 'project-41',
      baseVersion: 8,
      clientRequestId: 'client-2',
      actorId: 'agent-7',
      serverDate: '2026-04-07',
      plan: weakPlan,
      commandService,
    });

    assert.equal(result.ok, false);
    assert.equal(result.reason, 'controlled_rejection');
    assert.equal(result.retainedTopLevelPhaseCount, 2);
    assert.equal(commitCalls, 0);
    assert.match(result.message, /could not build a reliable starter schedule/i);
  });

  it('does not reference mutation-agent fallback symbols in executor.ts', () => {
    const source = readFileSync(join(__dirname, 'executor.ts'), 'utf-8');

    assert.doesNotMatch(source, /runInitialGeneration|executeAgentAttempt|buildPrompt/);
  });
});
