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
  plannerQuery?: (input: { stage: string; prompt: string; model: string }) => Promise<string | { content?: string }>;
  commitReject?: boolean;
}) {
  const events: Array<{ event: string; payload: Record<string, unknown> }> = [];
  const messages: Array<{ role: string; content: string }> = [];
  const broadcasts: Array<{ sessionId: string; message: { type: string; tasks?: unknown[]; provisional?: boolean } }> = [];
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
      structureModelRoutingDecision: {
        route: 'initial_generation' as const,
        tier: 'strong' as const,
        selectedModel: 'gpt-strong',
        reason: 'initial_generation_requires_strong_model' as const,
      },
      schedulingModelRoutingDecision: {
        route: 'mutation' as const,
        tier: 'cheap' as const,
        selectedModel: 'gpt-cheap',
        reason: 'mutation_prefers_cheap_model' as const,
      },
      plannerQuery: options?.plannerQuery ?? (async ({ stage }) => {
        if (stage === 'structure_planning') {
          return JSON.stringify({
            projectType: 'private_house',
            assumptions: ['baseline'],
            phases: [
              {
                phaseKey: 'prep',
                title: 'Подготовка участка',
                subphases: [
                  {
                    subphaseKey: 'prep-layout',
                    title: 'Разбивка и ограждение',
                    tasks: [
                      { taskKey: 'task-survey', title: 'Геодезическая разбивка' },
                      { taskKey: 'task-fence', title: 'Монтаж ограждения' },
                    ],
                  },
                  {
                    subphaseKey: 'prep-temp',
                    title: 'Временная инфраструктура',
                    tasks: [
                      { taskKey: 'task-roads', title: 'Временные дороги' },
                      { taskKey: 'task-camp', title: 'Бытовой городок' },
                    ],
                  },
                ],
              },
              {
                phaseKey: 'foundation',
                title: 'Фундамент',
                subphases: [
                  {
                    subphaseKey: 'foundation-earth',
                    title: 'Земляные работы',
                    tasks: [
                      { taskKey: 'task-pit', title: 'Разработка котлована' },
                      { taskKey: 'task-base', title: 'Подготовка основания' },
                    ],
                  },
                  {
                    subphaseKey: 'foundation-concrete',
                    title: 'Бетонные работы',
                    tasks: [
                      { taskKey: 'task-rebar', title: 'Армирование' },
                      { taskKey: 'task-concrete', title: 'Бетонирование' },
                    ],
                  },
                ],
              },
              {
                phaseKey: 'shell',
                title: 'Коробка дома',
                subphases: [
                  {
                    subphaseKey: 'shell-house',
                    title: 'Стены и перекрытия',
                    tasks: [
                      { taskKey: 'task-walls', title: 'Возведение стен' },
                      { taskKey: 'task-slabs', title: 'Устройство перекрытий' },
                    ],
                  },
                  {
                    subphaseKey: 'shell-roof',
                    title: 'Гараж и кровля',
                    tasks: [
                      { taskKey: 'task-garage', title: 'Возведение гаража' },
                      { taskKey: 'task-roof', title: 'Монтаж кровли' },
                    ],
                  },
                ],
              },
              {
                phaseKey: 'finish',
                title: 'Внутренние работы',
                subphases: [
                  {
                    subphaseKey: 'finish-mep',
                    title: 'Инженерные системы',
                    tasks: [
                      { taskKey: 'task-mep-rough', title: 'Черновой монтаж инженерии' },
                      { taskKey: 'task-mep-final', title: 'Чистовой монтаж инженерии' },
                    ],
                  },
                  {
                    subphaseKey: 'finish-fitout',
                    title: 'Отделка и сдача',
                    tasks: [
                      { taskKey: 'task-finish', title: 'Чистовая отделка' },
                      { taskKey: 'task-handover', title: 'Подготовка к сдаче' },
                    ],
                  },
                ],
              },
            ],
          });
        }

        if (stage === 'schedule_metadata') {
          return JSON.stringify({
            projectType: 'private_house',
            assumptions: ['baseline'],
            phases: [
              {
                phaseKey: 'prep',
                title: 'Подготовка участка',
                subphases: [
                  {
                    subphaseKey: 'prep-layout',
                    title: 'Разбивка и ограждение',
                    tasks: [
                      { taskKey: 'task-survey', title: 'Геодезическая разбивка', durationDays: 2, dependsOn: [] },
                      { taskKey: 'task-fence', title: 'Монтаж ограждения', durationDays: 2, dependsOn: [{ nodeKey: 'task-survey', type: 'FS', lagDays: 0 }] },
                    ],
                  },
                  {
                    subphaseKey: 'prep-temp',
                    title: 'Временная инфраструктура',
                    tasks: [
                      { taskKey: 'task-roads', title: 'Временные дороги', durationDays: 2, dependsOn: [{ nodeKey: 'task-fence', type: 'FS', lagDays: 0 }] },
                      { taskKey: 'task-camp', title: 'Бытовой городок', durationDays: 2, dependsOn: [{ nodeKey: 'task-roads', type: 'FS', lagDays: 0 }] },
                    ],
                  },
                ],
              },
              {
                phaseKey: 'foundation',
                title: 'Фундамент',
                subphases: [
                  {
                    subphaseKey: 'foundation-earth',
                    title: 'Земляные работы',
                    tasks: [
                      { taskKey: 'task-pit', title: 'Разработка котлована', durationDays: 3, dependsOn: [{ nodeKey: 'task-camp', type: 'FS', lagDays: 0 }] },
                      { taskKey: 'task-base', title: 'Подготовка основания', durationDays: 2, dependsOn: [{ nodeKey: 'task-pit', type: 'FS', lagDays: 0 }] },
                    ],
                  },
                  {
                    subphaseKey: 'foundation-concrete',
                    title: 'Бетонные работы',
                    tasks: [
                      { taskKey: 'task-rebar', title: 'Армирование', durationDays: 2, dependsOn: [{ nodeKey: 'task-base', type: 'FS', lagDays: 0 }] },
                      { taskKey: 'task-concrete', title: 'Бетонирование', durationDays: 3, dependsOn: [{ nodeKey: 'task-rebar', type: 'FS', lagDays: 0 }] },
                    ],
                  },
                ],
              },
              {
                phaseKey: 'shell',
                title: 'Коробка дома',
                subphases: [
                  {
                    subphaseKey: 'shell-house',
                    title: 'Стены и перекрытия',
                    tasks: [
                      { taskKey: 'task-walls', title: 'Возведение стен', durationDays: 5, dependsOn: [{ nodeKey: 'task-concrete', type: 'FS', lagDays: 1 }] },
                      { taskKey: 'task-slabs', title: 'Устройство перекрытий', durationDays: 4, dependsOn: [{ nodeKey: 'task-walls', type: 'SS', lagDays: 1 }] },
                    ],
                  },
                  {
                    subphaseKey: 'shell-roof',
                    title: 'Гараж и кровля',
                    tasks: [
                      { taskKey: 'task-garage', title: 'Возведение гаража', durationDays: 4, dependsOn: [{ nodeKey: 'task-walls', type: 'SS', lagDays: 1 }] },
                      { taskKey: 'task-roof', title: 'Монтаж кровли', durationDays: 3, dependsOn: [{ nodeKey: 'task-slabs', type: 'FS', lagDays: 0 }] },
                    ],
                  },
                ],
              },
              {
                phaseKey: 'finish',
                title: 'Внутренние работы',
                subphases: [
                  {
                    subphaseKey: 'finish-mep',
                    title: 'Инженерные системы',
                    tasks: [
                      { taskKey: 'task-mep-rough', title: 'Черновой монтаж инженерии', durationDays: 4, dependsOn: [{ nodeKey: 'task-roof', type: 'FS', lagDays: 0 }] },
                      { taskKey: 'task-mep-final', title: 'Чистовой монтаж инженерии', durationDays: 3, dependsOn: [{ nodeKey: 'task-mep-rough', type: 'FS', lagDays: 0 }] },
                    ],
                  },
                  {
                    subphaseKey: 'finish-fitout',
                    title: 'Отделка и сдача',
                    tasks: [
                      { taskKey: 'task-finish', title: 'Чистовая отделка', durationDays: 5, dependsOn: [{ nodeKey: 'task-mep-final', type: 'FS', lagDays: 0 }] },
                      { taskKey: 'task-handover', title: 'Подготовка к сдаче', durationDays: 2, dependsOn: [{ nodeKey: 'task-finish', type: 'FS', lagDays: 0 }] },
                    ],
                  },
                ],
              },
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
            if (options?.commitReject) {
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
                { id: 'prep', name: 'Подготовка участка', startDate: '2026-04-08', endDate: '2026-04-10' },
                { id: 'prep-layout', name: 'Разбивка и ограждение', startDate: '2026-04-08', endDate: '2026-04-09', parentId: 'prep' },
                { id: 'task-survey', name: 'Геодезическая разбивка', startDate: '2026-04-08', endDate: '2026-04-08', parentId: 'prep-layout' },
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
      broadcastToSession(sessionId: string, message: { type: string; tasks?: unknown[]; provisional?: boolean }) {
        broadcasts.push({ sessionId, message });
      },
    },
  };
}

describe('runInitialGeneration', () => {
  it('uses exactly two model calls and commits only the final compiled result', async () => {
    const plannerCalls: Array<{ stage: string; model: string }> = [];
    const harness = createHarness({
      plannerQuery: async (input) => {
        plannerCalls.push({ stage: input.stage, model: input.model });
        return createHarness().input.plannerQuery(input);
      },
    });

    const result = await runInitialGeneration(harness.input);

    assert.equal(result.ok, true);
    assert.equal(result.outcome, 'complete');
    assert.equal(harness.committedCommands.length, 1);
    assert.deepEqual(plannerCalls, [
      { stage: 'structure_planning', model: 'gpt-strong' },
      { stage: 'schedule_metadata', model: 'gpt-cheap' },
    ]);
    assert.deepEqual(harness.events.map((entry) => entry.event).slice(0, 3), [
      'object_type_inference',
      'model_routing_decision',
      'model_routing_decision',
    ]);
    assert.ok(harness.events.some((entry) => entry.event === 'planner_query_request' && entry.payload.stage === 'structure_planning'));
    assert.ok(harness.events.some((entry) => entry.event === 'planner_query_response' && entry.payload.stage === 'schedule_metadata'));
    assert.ok(harness.events.some((entry) => entry.event === 'structure_plan_output'));
    assert.equal(harness.events.some((entry) => entry.event === 'structure_gate_verdict'), true);
    assert.ok(harness.events.some((entry) => entry.event === 'schedule_metadata_output'));
    assert.ok(harness.events.some((entry) => entry.event === 'scheduling_gate_verdict'));
    assert.equal(harness.events.some((entry) => entry.event === 'preview_tasks_broadcast'), true);
    assert.equal(harness.broadcasts.some((entry) => entry.message.type === 'preview_tasks'), true);
    assert.equal(harness.events.filter((entry) => entry.event === 'tasks_broadcast').length, 1);
  });

  it('continues to compile even when structure gate remains negative after repair', async () => {
    const harness = createHarness({
      plannerQuery: async ({ stage }) => {
        if (stage === 'structure_planning') {
          return JSON.stringify({
            projectType: 'private_house',
            assumptions: [],
            phases: [
              {
                phaseKey: 'phase-1',
                title: 'Этап 1',
                subphases: [
                  { subphaseKey: 'subphase-1', title: 'Подэтап 1', tasks: [{ taskKey: 'task-1', title: 'Задача 1' }] },
                ],
              },
            ],
          });
        }
        if (stage === 'structure_planning_repair') {
          return JSON.stringify({
            projectType: 'private_house',
            assumptions: [],
            phases: [
              {
                phaseKey: 'phase-1',
                title: 'Этап 1',
                subphases: [
                  { subphaseKey: 'subphase-1', title: 'Подэтап 1', tasks: [{ taskKey: 'task-1', title: 'Задача 1' }] },
                ],
              },
            ],
          });
        }
        if (stage === 'schedule_metadata' || stage === 'schedule_metadata_repair') {
          return JSON.stringify({
            projectType: 'private_house',
            assumptions: [],
            phases: [
              {
                phaseKey: 'phase-1',
                title: 'Этап 1',
                subphases: [
                  {
                    subphaseKey: 'subphase-1',
                    title: 'Подэтап 1',
                    tasks: [
                      { taskKey: 'task-1', title: 'Задача 1', durationDays: 2, dependsOn: [] },
                    ],
                  },
                ],
              },
            ],
          });
        }
        throw new Error('unexpected stage');
      },
    });

    const result = await runInitialGeneration(harness.input);

    assert.equal(result.ok, true);
    assert.equal(result.outcome, 'complete');
    assert.equal(harness.committedCommands.length, 1);
    assert.equal(harness.events.some((entry) => entry.event === 'compile_verdict'), true);
    assert.equal(harness.events.filter((entry) => entry.event === 'planner_query_request').length, 4);
    assert.equal(harness.events.filter((entry) => entry.event === 'planner_query_response').length, 4);
    assert.equal(harness.events.find((entry) => entry.event === 'structure_gate_verdict')?.payload.accepted, false);
  });

  it('returns compile failure if the final commit is rejected', async () => {
    const harness = createHarness({ commitReject: true });

    const result = await runInitialGeneration(harness.input);

    assert.equal(result.ok, false);
    assert.equal(result.failureStage, 'compile');
    assert.equal(harness.committedCommands.length, 1);
    assert.ok(harness.events.some((entry) => entry.event === 'compile_verdict'));
    assert.equal(harness.events.filter((entry) => entry.event === 'planner_query_request').length, 2);
    assert.equal(harness.events.filter((entry) => entry.event === 'planner_query_response').length, 2);
    assert.equal(harness.events.filter((entry) => entry.event === 'tasks_broadcast').length, 0);
  });
});
