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
  deps?: Record<string, unknown>;
}) {
  const events: Array<{ event: string; payload: Record<string, unknown> }> = [];
  const messages: Array<{ role: string; content: string }> = [];
  const broadcasts: Array<{ sessionId: string; message: { type: string; tasks?: unknown[]; provisional?: boolean; message?: string; chatMessage?: { requestContextId?: string | null; historyGroupId?: string | null; systemMessage?: string | null } } }> = [];
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
      deps: options?.deps,
      broadcastToSession(sessionId: string, message: { type: string; tasks?: unknown[]; provisional?: boolean; message?: string; chatMessage?: { requestContextId?: string | null; historyGroupId?: string | null; systemMessage?: string | null } }) {
        broadcasts.push({ sessionId, message });
      },
    },
  };
}

function getEvent(
  harness: ReturnType<typeof createHarness>,
  event: string,
): { event: string; payload: Record<string, unknown> } {
  const entry = harness.events.find((candidate) => candidate.event === event);
  assert.ok(entry, `Expected event ${event} to be logged`);
  return entry;
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
    assert.deepEqual(harness.events.map((entry) => entry.event).slice(0, 2), [
      'model_routing_decision',
      'model_routing_decision',
    ]);
    assert.equal(harness.events.some((entry) => entry.event === 'initial_generation_intake_normalized'), true);
    assert.equal(harness.events.some((entry) => entry.event === 'initial_generation_classification'), true);
    assert.equal(harness.events.some((entry) => entry.event === 'initial_generation_clarification'), true);
    assert.equal(harness.events.some((entry) => entry.event === 'initial_generation_domain_skeleton'), true);
    assert.ok(harness.events.some((entry) => entry.event === 'planner_query_request' && entry.payload.stage === 'structure_planning'));
    assert.ok(harness.events.some((entry) => entry.event === 'planner_query_response' && entry.payload.stage === 'schedule_metadata'));
    assert.ok(harness.events.some((entry) => entry.event === 'structure_plan_output'));
    assert.equal(harness.events.some((entry) => entry.event === 'structure_gate_verdict'), true);
    assert.ok(harness.events.some((entry) => entry.event === 'schedule_metadata_output'));
    assert.ok(harness.events.some((entry) => entry.event === 'scheduling_gate_verdict'));
    assert.equal(harness.events.some((entry) => entry.event === 'preview_tasks_broadcast'), true);
    assert.equal(harness.broadcasts.some((entry) => entry.message.type === 'preview_tasks'), true);
    assert.equal(harness.events.filter((entry) => entry.event === 'tasks_broadcast').length, 1);
    const doneBroadcast = harness.broadcasts.find((entry) => entry.message.type === 'done');
    assert.equal(doneBroadcast?.message.chatMessage?.systemMessage, 'Стартовый график составлен в календарных днях. Изменить режим можно в меню проекта.');
  });

  it('logs the structured interpretation lifecycle and normalized downstream decisions', async () => {
    const harness = createHarness({
      deps: {
        async interpretRequest() {
          return {
            interpretation: {
              route: 'initial_generation',
              confidence: 0.91,
              requestKind: 'whole_project',
              planningMode: 'whole_project_bootstrap',
              scopeMode: 'full_project',
              objectProfile: 'residential_multi_section',
              projectArchetype: 'new_building',
              locationScope: {
                sections: ['A'],
                floors: ['1', '2', '3'],
                zones: ['garage'],
              },
              worklistPolicy: 'worklist_plus_inferred_supporting_tasks',
              clarification: {
                needed: false,
                reason: 'none',
              },
              signals: ['broad bootstrap request', 'garage included'],
            },
            usedModelDecision: true,
            repairAttempted: false,
            fallbackReason: 'none',
          };
        },
      },
    });

    await runInitialGeneration(harness.input);

    const interpretation = getEvent(harness, 'initial_generation_interpretation');
    const validation = getEvent(harness, 'initial_generation_interpretation_validation');
    const normalizedDecisions = getEvent(harness, 'initial_generation_normalized_decisions');

    assert.equal(interpretation.payload.route, 'initial_generation');
    assert.equal(interpretation.payload.requestKind, 'whole_project');
    assert.equal(interpretation.payload.planningMode, 'whole_project_bootstrap');
    assert.equal(interpretation.payload.scopeMode, 'full_project');
    assert.equal(interpretation.payload.objectProfile, 'residential_multi_section');
    assert.equal(interpretation.payload.projectArchetype, 'new_building');
    assert.equal(interpretation.payload.worklistPolicy, 'worklist_plus_inferred_supporting_tasks');
    assert.deepEqual(interpretation.payload.locationScope, {
      sections: ['A'],
      floors: ['1', '2', '3'],
      zones: ['garage'],
    });
    assert.deepEqual(interpretation.payload.signals, ['broad bootstrap request', 'garage included']);
    assert.equal(interpretation.payload.usedModelDecision, true);
    assert.equal(interpretation.payload.repairAttempted, false);
    assert.equal(interpretation.payload.fallbackReason, 'none');
    assert.deepEqual(interpretation.payload.clarification, {
      needed: false,
      reason: 'none',
    });

    assert.equal(validation.payload.route, 'initial_generation');
    assert.equal(validation.payload.requestKind, 'whole_project');
    assert.equal(validation.payload.validationVerdict, 'accepted');
    assert.equal(validation.payload.usedModelDecision, true);
    assert.equal(validation.payload.repairAttempted, false);
    assert.equal(validation.payload.fallbackReason, 'none');

    assert.equal(normalizedDecisions.payload.route, 'initial_generation');
    assert.equal(normalizedDecisions.payload.requestKind, 'whole_project');
    assert.equal(normalizedDecisions.payload.planningMode, 'whole_project_bootstrap');
    assert.equal(normalizedDecisions.payload.scopeMode, 'full_project');
    assert.equal(normalizedDecisions.payload.objectProfile, 'residential_multi_section');
    assert.equal(normalizedDecisions.payload.projectArchetype, 'new_building');
    assert.equal(normalizedDecisions.payload.worklistPolicy, 'worklist_plus_inferred_supporting_tasks');
    assert.deepEqual(normalizedDecisions.payload.locationScope, {
      sections: ['A'],
      floors: ['1', '2', '3'],
      zones: ['garage'],
    });
    assert.ok(normalizedDecisions.payload.classification);
    assert.ok(normalizedDecisions.payload.clarificationDecision);
    assert.ok(normalizedDecisions.payload.domainSkeleton);
    assert.ok(normalizedDecisions.payload.brief);
  });

  it('logs repair telemetry on the validation event when interpretation required repair', async () => {
    const harness = createHarness({
      deps: {
        async interpretRequest() {
          return {
            interpretation: {
              route: 'initial_generation',
              confidence: 0.54,
              requestKind: 'partial_scope',
              planningMode: 'partial_scope_bootstrap',
              scopeMode: 'partial_scope',
              objectProfile: 'unknown',
              projectArchetype: 'renovation',
              locationScope: {
                sections: ['5.1'],
                floors: ['2'],
                zones: [],
              },
              worklistPolicy: 'strict_worklist',
              clarification: {
                needed: true,
                reason: 'missing_scope',
              },
              signals: ['repair output accepted'],
            },
            usedModelDecision: true,
            repairAttempted: true,
            fallbackReason: 'none',
          };
        },
      },
    });

    await runInitialGeneration(harness.input);

    const validation = getEvent(harness, 'initial_generation_interpretation_validation');
    assert.equal(validation.payload.validationVerdict, 'accepted');
    assert.equal(validation.payload.repairAttempted, true);
    assert.equal(validation.payload.usedModelDecision, true);
    assert.equal(validation.payload.fallbackReason, 'none');
    assert.deepEqual(validation.payload.clarification, {
      needed: true,
      reason: 'missing_scope',
    });
  });

  it('logs conservative fallback telemetry when interpretation falls back after schema failure', async () => {
    const harness = createHarness({
      deps: {
        async interpretRequest() {
          return {
            interpretation: {
              route: 'initial_generation',
              confidence: 0.2,
              requestKind: 'explicit_worklist',
              planningMode: 'worklist_bootstrap',
              scopeMode: 'explicit_worklist',
              objectProfile: 'unknown',
              projectArchetype: 'unknown',
              locationScope: {
                sections: [],
                floors: [],
                zones: [],
              },
              worklistPolicy: 'strict_worklist',
              clarification: {
                needed: false,
                reason: 'none',
              },
              signals: ['fallback_from_project_state'],
            },
            usedModelDecision: false,
            repairAttempted: true,
            fallbackReason: 'schema_invalid',
          };
        },
      },
    });

    await runInitialGeneration(harness.input);

    const fallback = getEvent(harness, 'initial_generation_interpretation_fallback');
    const validation = getEvent(harness, 'initial_generation_interpretation_validation');
    const normalizedDecisions = getEvent(harness, 'initial_generation_normalized_decisions');

    assert.equal(fallback.payload.route, 'initial_generation');
    assert.equal(fallback.payload.requestKind, 'explicit_worklist');
    assert.equal(fallback.payload.usedModelDecision, false);
    assert.equal(fallback.payload.repairAttempted, true);
    assert.equal(fallback.payload.fallbackReason, 'schema_invalid');
    assert.deepEqual(fallback.payload.signals, ['fallback_from_project_state']);

    assert.equal(validation.payload.validationVerdict, 'fallback_applied');
    assert.equal(validation.payload.fallbackReason, 'schema_invalid');
    assert.equal(validation.payload.usedModelDecision, false);
    assert.equal(normalizedDecisions.payload.fallbackReason, 'schema_invalid');
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
    assert.equal(harness.broadcasts.filter((entry) => entry.message.type === 'preview_tasks').length, 1);
    assert.equal(harness.broadcasts.filter((entry) => entry.message.type === 'preview_failed').length, 1);
    assert.equal(harness.broadcasts.filter((entry) => entry.message.type === 'done').length, 1);
    const previewBroadcastIndex = harness.broadcasts.findIndex((entry) => entry.message.type === 'preview_tasks');
    const previewFailedBroadcastIndex = harness.broadcasts.findIndex((entry) => entry.message.type === 'preview_failed');
    const doneBroadcastIndex = harness.broadcasts.findIndex((entry) => entry.message.type === 'done');
    assert.notEqual(previewBroadcastIndex, -1);
    assert.notEqual(previewFailedBroadcastIndex, -1);
    assert.notEqual(doneBroadcastIndex, -1);
    assert.ok(previewBroadcastIndex < previewFailedBroadcastIndex);
    assert.ok(previewFailedBroadcastIndex < doneBroadcastIndex);
    assert.match(harness.broadcasts[previewFailedBroadcastIndex]?.message.message ?? '', /не был сохранён/i);
    assert.ok(previewBroadcastIndex < doneBroadcastIndex);
  });
});
