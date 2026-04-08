import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { CommitProjectCommandResponse } from '@gantt/mcp/types';

import { runInitialGeneration } from './orchestrator.js';

function createCommitResponse(newVersion: number): Extract<CommitProjectCommandResponse, { accepted: true }> {
  return {
    clientRequestId: `client-${newVersion}`,
    accepted: true,
    baseVersion: newVersion - 1,
    newVersion,
    result: {
      snapshot: { tasks: [], dependencies: [] },
      changedTaskIds: [],
      changedDependencyIds: [],
      conflicts: [],
      patches: [],
    },
    snapshot: { tasks: [], dependencies: [] },
  };
}

function createHarness(options?: {
  plannerQuery?: (input: { stage: string; prompt: string }) => Promise<string | { content?: string }>;
  commitRejectAtCall?: number;
}) {
  const events: Array<{ event: string; payload: Record<string, unknown> }> = [];
  const messages: Array<{ role: string; content: string }> = [];
  const broadcasts: Array<{ type: string; payload: unknown }> = [];
  const committedCommands: Array<{ type: string }> = [];
  let commitCall = 0;

  return {
    events,
    messages,
    broadcasts,
    committedCommands,
    input: {
      projectId: 'project-41',
      sessionId: 'session-41',
      runId: 'run-41',
      userMessage: 'График строительства жилого дома на 3 этажа + гараж',
      tasksBefore: [],
      baseVersion: 7,
      serverDate: '2026-04-08',
      modelRoutingDecision: {
        route: 'initial_generation' as const,
        tier: 'strong' as const,
        selectedModel: 'gpt-strong',
        reason: 'initial_generation_requires_strong_model' as const,
      },
      plannerQuery: options?.plannerQuery ?? (async ({ stage }) => {
        if (stage === 'skeleton') {
          return JSON.stringify({
            projectType: 'private_house',
            assumptions: ['baseline'],
            phases: [
              { phaseKey: 'prep', title: 'Подготовка', orderHint: 1, workPackages: [{ workPackageKey: 'a', title: 'Разбивка' }, { workPackageKey: 'b', title: 'Площадка' }, { workPackageKey: 'c', title: 'Ограждение' }] },
              { phaseKey: 'foundation', title: 'Фундамент', orderHint: 2, dependsOnPhaseKeys: ['prep'], workPackages: [{ workPackageKey: 'a', title: 'Котлован' }, { workPackageKey: 'b', title: 'Армирование' }, { workPackageKey: 'c', title: 'Бетон' }] },
              { phaseKey: 'shell', title: 'Коробка дома и гаража', orderHint: 3, dependsOnPhaseKeys: ['foundation'], workPackages: [{ workPackageKey: 'a', title: 'Дом' }, { workPackageKey: 'b', title: 'Гараж' }, { workPackageKey: 'c', title: 'Кровля' }] },
              { phaseKey: 'finish', title: 'Инженерия и отделка', orderHint: 4, dependsOnPhaseKeys: ['shell'], workPackages: [{ workPackageKey: 'a', title: 'Инженерия' }, { workPackageKey: 'b', title: 'Отделка' }, { workPackageKey: 'c', title: 'Сдача' }] },
            ],
          });
        }

        const phaseTitle = /Current phase: (.+)/.exec(stage === 'phase_expansion' ? '' : '')?.[1];
        void phaseTitle;

        if (stage === 'phase_expansion') {
          return JSON.stringify({
            phaseKey: 'ignored-by-server',
            tasks: [
              { nodeKey: `task-${commitCall + 1}-1`, title: 'Старт этапа', durationDays: 2, dependsOnWithinPhase: [], sequenceRole: 'entry' },
              { nodeKey: `task-${commitCall + 1}-2`, title: 'Основные работы этапа', durationDays: 3, dependsOnWithinPhase: [{ nodeKey: `task-${commitCall + 1}-1`, type: 'FS', lagDays: 0 }] },
              { nodeKey: `task-${commitCall + 1}-3`, title: 'Завершение этапа', durationDays: 1, dependsOnWithinPhase: [{ nodeKey: `task-${commitCall + 1}-2`, type: 'FS', lagDays: 0 }], sequenceRole: 'exit' },
            ],
          });
        }

        throw new Error(`Unexpected stage ${stage}`);
      }),
      services: {
        commandService: {
          async commitCommand(request: { command: { type: string } }) {
            commitCall += 1;
            committedCommands.push({ type: request.command.type });
            if (options?.commitRejectAtCall === commitCall) {
              return {
                clientRequestId: `client-${commitCall}`,
                accepted: false as const,
                reason: 'conflict' as const,
                currentVersion: 8,
              };
            }
            return createCommitResponse(7 + commitCall);
          },
        },
        messageService: {
          async add(role: 'user' | 'assistant', content: string) {
            messages.push({ role, content });
            return { id: crypto.randomUUID(), projectId: 'project-41', role, content, createdAt: '2026-04-08T00:00:00.000Z' };
          },
        },
        taskService: {
          async list() {
            return {
              tasks: [
                { id: 'prep', name: 'Подготовка', startDate: '2026-04-08', endDate: '2026-04-08' },
                { id: 'foundation', name: 'Фундамент', startDate: '2026-04-09', endDate: '2026-04-09' },
              ],
            };
          },
        },
      },
      logger: {
        debug(event: string, payload: Record<string, unknown>) {
          events.push({ event, payload });
        },
      },
      broadcastToSession(sessionId: string, message: { type: string }) {
        broadcasts.push({ type: sessionId, payload: message });
      },
    },
  };
}

describe('runInitialGeneration', () => {
  it('commits skeleton first and then expands phases progressively', async () => {
    const harness = createHarness();

    const result = await runInitialGeneration(harness.input);

    assert.equal(result.ok, true);
    assert.equal(result.outcome, 'complete');
    assert.equal(harness.committedCommands.length, 5);
    assert.deepEqual(harness.events.map((entry) => entry.event).slice(0, 4), [
      'object_type_inference',
      'model_routing_decision',
      'wbs_skeleton_output',
      'wbs_skeleton_verdict',
    ]);
    assert.equal(harness.events[4]?.event, 'tasks_broadcast');
    assert.ok(harness.events.some((entry) => entry.event === 'phase_expansion_output'));
    assert.ok(harness.events.some((entry) => entry.event === 'phase_expansion_verdict'));
    assert.ok(harness.events.some((entry) => entry.event === 'cross_phase_linking_verdict'));
    assert.ok(harness.events.some((entry) => entry.event === 'compile_verdict'));
    assert.equal(harness.events.filter((entry) => entry.event === 'tasks_broadcast').length, 6);
  });

  it('returns planning failure before any commit when skeleton is weak', async () => {
    const harness = createHarness({
      plannerQuery: async ({ stage }) => {
        if (stage === 'skeleton') {
          return JSON.stringify({
            projectType: 'private_house',
            assumptions: [],
            phases: [
              { phaseKey: 'phase-1', title: 'Подготовка', orderHint: 1, workPackages: [{ workPackageKey: 'a', title: 'Разбивка' }] },
            ],
          });
        }
        throw new Error('unexpected stage');
      },
    });

    const result = await runInitialGeneration(harness.input);

    assert.equal(result.ok, false);
    assert.equal(harness.committedCommands.length, 0);
    assert.equal(harness.events.some((entry) => entry.event === 'compile_verdict'), false);
  });

  it('returns partial success if a later phase commit is rejected after skeleton commit', async () => {
    const harness = createHarness({ commitRejectAtCall: 3 });

    const result = await runInitialGeneration(harness.input);

    assert.equal(result.ok, true);
    assert.equal(result.outcome, 'partial');
    assert.ok(harness.committedCommands.length >= 2);
    assert.ok(harness.events.some((entry) => entry.event === 'compile_verdict'));
    assert.ok(harness.events.filter((entry) => entry.event === 'tasks_broadcast').length >= 2);
  });
});
