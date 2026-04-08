import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { CommitProjectCommandResponse } from '@gantt/mcp/types';

import { runInitialGeneration } from './orchestrator.js';
import type { ExecuteInitialProjectPlanResult } from './executor.js';
import type { PlanQualityVerdict, ProjectPlan } from './types.js';

const BASE_PLAN: ProjectPlan = {
  projectType: 'private_residential_house',
  assumptions: ['RF production calendar defaults'],
  nodes: [
    { nodeKey: 'phase-site', title: 'Подготовка площадки', kind: 'phase', durationDays: 1, dependsOn: [] },
    { nodeKey: 'task-site', title: 'Геодезическая разбивка', parentNodeKey: 'phase-site', kind: 'task', durationDays: 2, dependsOn: [] },
    { nodeKey: 'task-access', title: 'Временные дороги и бытовой городок', parentNodeKey: 'phase-site', kind: 'task', durationDays: 2, dependsOn: [{ nodeKey: 'task-site', type: 'FS', lagDays: 0 }] },
    { nodeKey: 'phase-foundation', title: 'Фундамент и подземная часть', kind: 'phase', durationDays: 1, dependsOn: [] },
    { nodeKey: 'task-excavation', title: 'Разработка котлована', parentNodeKey: 'phase-foundation', kind: 'task', durationDays: 4, dependsOn: [{ nodeKey: 'task-access', type: 'FS', lagDays: 0 }] },
    { nodeKey: 'task-foundation', title: 'Армирование и бетонирование фундамента', parentNodeKey: 'phase-foundation', kind: 'task', durationDays: 5, dependsOn: [{ nodeKey: 'task-excavation', type: 'FS', lagDays: 1 }] },
    { nodeKey: 'phase-shell', title: 'Коробка и кровля', kind: 'phase', durationDays: 1, dependsOn: [] },
    { nodeKey: 'task-frame', title: 'Возведение стен и перекрытий', parentNodeKey: 'phase-shell', kind: 'task', durationDays: 8, dependsOn: [{ nodeKey: 'task-foundation', type: 'FS', lagDays: 0 }] },
    { nodeKey: 'task-roof', title: 'Монтаж кровли и закрытие контура', parentNodeKey: 'phase-shell', kind: 'task', durationDays: 4, dependsOn: [{ nodeKey: 'task-frame', type: 'FS', lagDays: 0 }] },
    { nodeKey: 'phase-finish', title: 'Инженерия и отделка', kind: 'phase', durationDays: 1, dependsOn: [] },
    { nodeKey: 'task-mep', title: 'Черновой монтаж инженерных систем', parentNodeKey: 'phase-finish', kind: 'task', durationDays: 6, dependsOn: [{ nodeKey: 'task-frame', type: 'SS', lagDays: 1 }] },
    { nodeKey: 'task-finish', title: 'Чистовая отделка и сдача', parentNodeKey: 'phase-finish', kind: 'task', durationDays: 5, dependsOn: [{ nodeKey: 'task-mep', type: 'FS', lagDays: 0 }, { nodeKey: 'task-roof', type: 'FS', lagDays: 0 }] },
  ],
};

const BASE_METRICS = {
  phaseCount: 4,
  taskNodeCount: 8,
  dependencyCount: 7,
  crossPhaseDependencyCount: 5,
  genericTitleCount: 0,
  genericTitleRatio: 0,
  objectTypeSignalCoverage: 0.18,
  passesProductAdequacyFloor: true,
};

function createVerdict(overrides?: Partial<PlanQualityVerdict>): PlanQualityVerdict {
  return {
    accepted: true,
    reasons: [],
    score: 94,
    metrics: BASE_METRICS,
    ...overrides,
  };
}

function createCompiledSchedule(overrides?: Partial<ExecuteInitialProjectPlanResult & { compiledSchedule: Record<string, unknown> }>) {
  return {
    projectId: 'project-41',
    baseVersion: 7,
    serverDate: '2026-04-08',
    command: {
      type: 'create_tasks_batch' as const,
      tasks: [
        {
          id: 'phase-site',
          projectId: 'project-41',
          name: 'Подготовка площадки',
          startDate: '2026-04-08',
          endDate: '2026-04-09',
          sortOrder: 0,
        },
      ],
    },
    nodeKeyToTaskId: { 'phase-site': 'phase-site' },
    retainedNodeCount: BASE_PLAN.nodes.length,
    compiledTaskCount: 8,
    compiledDependencyCount: 7,
    topLevelPhaseCount: 4,
    crossPhaseDependencyCount: 5,
    diagnostics: [{
      level: 'info' as const,
      code: 'compiled_schedule' as const,
      message: 'ok',
      retainedNodeCount: BASE_PLAN.nodes.length,
      compiledTaskCount: 8,
      compiledDependencyCount: 7,
      topLevelPhaseCount: 4,
    }],
    ...(overrides?.compiledSchedule ?? {}),
  };
}

function createCommitResponse(): Extract<CommitProjectCommandResponse, { accepted: true }> {
  return {
    clientRequestId: 'client-1',
    accepted: true,
    baseVersion: 7,
    newVersion: 8,
    result: {
      snapshot: { tasks: [], dependencies: [] },
      changedTaskIds: ['task-1', 'task-2'],
      changedDependencyIds: [],
      conflicts: [],
      patches: [],
    },
    snapshot: { tasks: [], dependencies: [] },
  };
}

function createHarness(overrides?: {
  verdict?: PlanQualityVerdict;
  repairAttempted?: boolean;
  compileResult?: ExecuteInitialProjectPlanResult;
}) {
  const events: Array<{ event: string; payload: Record<string, unknown> }> = [];
  const messages: Array<{ role: string; content: string }> = [];
  const broadcasts: Array<{ type: string; payload: unknown }> = [];

  const compileResult = overrides?.compileResult ?? {
    ok: true as const,
    outcome: 'complete' as const,
    message: 'Built the starter schedule.',
    compiledSchedule: createCompiledSchedule(),
    commitResponse: createCommitResponse(),
    droppedNodeKeys: [],
    droppedDependencyNodeKeys: [],
  };

  return {
    events,
    messages,
    broadcasts,
    input: {
      projectId: 'project-41',
      sessionId: 'session-41',
      runId: 'run-41',
      userMessage: 'Построй график строительства детского садика',
      tasksBefore: [],
      baseVersion: 7,
      serverDate: '2026-04-08',
      plannerQuery: async () => ({ content: JSON.stringify(BASE_PLAN) }),
      services: {
        commandService: {
          async commitCommand() {
            return createCommitResponse();
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
                { id: 'phase-site', name: 'Подготовка площадки', startDate: '2026-04-08', endDate: '2026-04-09' },
                { id: 'task-site', name: 'Геодезическая разбивка', startDate: '2026-04-08', endDate: '2026-04-09', parentId: 'phase-site' },
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
      deps: {
        resolveDomainReference() {
          return {
            referenceKey: 'kindergarten' as const,
            projectType: 'kindergarten' as const,
            defaultInterpretation: null,
            stageHints: ['Подготовка', 'Коробка', 'Пусконаладка'],
            parallelWorkstreams: ['Инженерия + отделка'],
            domainContextSummary: 'Kindergarten baseline',
            source: 'construction-work-intent-map-v3' as const,
          };
        },
        buildGenerationBrief() {
          return {
            objectType: 'kindergarten',
            scopeSignals: ['broad_request'],
            starterScheduleExpectation: 'Return a full starter schedule baseline.',
            namingBan: 'No filler titles.',
            domainContextSummary: 'Kindergarten baseline',
            serverInferencePolicy: 'Infer the baseline server-side.',
          };
        },
        resolveModelRoutingDecision() {
          return {
            route: 'initial_generation' as const,
            tier: 'strong' as const,
            selectedModel: 'gpt-strong',
            reason: 'initial_generation_requires_strong_model' as const,
          };
        },
        async planProject() {
          return {
            plan: BASE_PLAN,
            verdict: overrides?.verdict ?? createVerdict(),
            repairAttempted: overrides?.repairAttempted ?? false,
          };
        },
        async executePlan() {
          return compileResult;
        },
      },
    },
  };
}

describe('runInitialGeneration', () => {
  it('injects the recognized domain reference into the planning prompt', async () => {
    const harness = createHarness();
    const prompts: string[] = [];

    const result = await runInitialGeneration({
      ...harness.input,
      userMessage: 'Построй график строительства детского садика',
      routingEnv: { OPENAI_MODEL: 'gpt-strong' },
      deps: {
        executePlan: harness.input.deps.executePlan,
      },
      plannerQuery: async (queryInput) => {
        prompts.push(queryInput.prompt);
        return { content: JSON.stringify(BASE_PLAN) };
      },
    });

    assert.equal(result.ok, true);
    assert.ok(prompts[0]?.includes('Object type: kindergarten'));
    assert.ok(prompts[0]?.includes('Kindergarten / детский сад'));
  });

  it('injects the fallback private-house baseline for broad prompts', async () => {
    const harness = createHarness();
    const prompts: string[] = [];

    const result = await runInitialGeneration({
      ...harness.input,
      userMessage: 'Построй график',
      routingEnv: { OPENAI_MODEL: 'gpt-strong' },
      deps: {
        executePlan: harness.input.deps.executePlan,
      },
      plannerQuery: async (queryInput) => {
        prompts.push(queryInput.prompt);
        return { content: JSON.stringify(BASE_PLAN) };
      },
    });

    assert.equal(result.ok, true);
    assert.ok(prompts[0]?.includes('Object type: private_residential_house'));
    assert.ok(prompts[0]?.includes('Generic construction fallback'));
  });

  it('turns ProjectPlan schema rejection into a controlled planning failure', async () => {
    const harness = createHarness();

    const result = await runInitialGeneration({
      ...harness.input,
      routingEnv: { OPENAI_MODEL: 'gpt-strong' },
      deps: {
        executePlan: async () => {
          throw new Error('executePlan should not run after schema rejection');
        },
      },
      plannerQuery: async () => ({
        content: JSON.stringify({
          projectType: 'private_residential_house',
          assumptions: [],
          nodes: [
            {
              nodeKey: 'task-root',
              title: 'Task 1',
              kind: 'task',
              durationDays: 2,
              dependsOn: [],
            },
          ],
        }),
      }),
    });

    assert.equal(result.ok, false);
    assert.equal(result.failureStage, 'planning');
    assert.match(result.assistantResponse, /Не удалось подготовить надежный стартовый график/i);
    assert.equal(harness.events.some((entry) => entry.event === 'compile_verdict'), false);
  });

  it('runs planning through compile, saves the assistant reply, broadcasts tasks, and logs the lifecycle', async () => {
    const harness = createHarness();

    const result = await runInitialGeneration(harness.input);

    assert.equal(result.ok, true);
    assert.equal(result.outcome, 'complete');
    assert.match(result.assistantResponse, /стартовый график/i);
    assert.deepEqual(harness.messages.map((entry) => entry.role), ['assistant']);
    assert.deepEqual(
      harness.events.map((entry) => entry.event),
      [
        'object_type_inference',
        'model_routing_decision',
        'planning_output',
        'plan_quality_verdict',
        'compile_verdict',
        'initial_generation_result',
        'tasks_broadcast',
        'agent_run_completed',
      ],
    );
    assert.equal(harness.broadcasts.length, 3);
  });

  it('logs repair reasons and returns a controlled planning failure when the repaired plan stays below the floor', async () => {
    const harness = createHarness({
      verdict: createVerdict({
        accepted: false,
        reasons: ['placeholder_titles'],
        score: 42,
      }),
      repairAttempted: true,
    });

    const result = await runInitialGeneration(harness.input);

    assert.equal(result.ok, false);
    assert.equal(result.repairAttempted, true);
    assert.ok(harness.events.some((entry) => entry.event === 'plan_repair_requested'));
    assert.deepEqual(
      harness.events.find((entry) => entry.event === 'plan_repair_requested')?.payload.reasons,
      ['placeholder_titles'],
    );
    assert.equal(harness.events.some((entry) => entry.event === 'compile_verdict'), false);
  });

  it('records compile verdict payloads for complete, partial salvage, and controlled failure outcomes', async () => {
    const completeHarness = createHarness();
    const partialHarness = createHarness({
      compileResult: {
        ok: true,
        outcome: 'partial',
        message: 'Built a partial starter schedule and skipped a few invalid plan references.',
        compiledSchedule: createCompiledSchedule({
          compiledSchedule: {
            command: { type: 'create_tasks_batch', tasks: [] },
            nodeKeyToTaskId: {},
            retainedNodeCount: 12,
            compiledTaskCount: 8,
            compiledDependencyCount: 3,
            topLevelPhaseCount: 4,
            crossPhaseDependencyCount: 2,
            diagnostics: [],
          },
        }),
        commitResponse: createCommitResponse(),
        droppedNodeKeys: ['task-finish'],
        droppedDependencyNodeKeys: ['missing-task'],
      },
    });
    const rejectedHarness = createHarness({
      compileResult: {
        ok: false,
        reason: 'controlled_rejection',
        message: 'We could not build a reliable starter schedule from this request.',
        droppedNodeKeys: ['task-finish'],
        droppedDependencyNodeKeys: ['missing-task'],
        retainedNodeCount: 3,
        retainedNodeRatio: 0.5,
        retainedTopLevelPhaseCount: 2,
        compiledTaskCount: 4,
        compiledDependencyCount: 0,
        crossPhaseDependencyCount: 0,
        everyRetainedPhaseHasAChildTask: false,
        hasBrokenReferences: false,
      },
    });

    await runInitialGeneration(completeHarness.input);
    await runInitialGeneration(partialHarness.input);
    await runInitialGeneration(rejectedHarness.input);

    const completeVerdict = completeHarness.events.find((entry) => entry.event === 'compile_verdict');
    const partialVerdict = partialHarness.events.find((entry) => entry.event === 'compile_verdict');
    const rejectedVerdict = rejectedHarness.events.find((entry) => entry.event === 'compile_verdict');

    assert.equal(completeVerdict?.payload.outcome, 'complete');
    assert.equal(partialVerdict?.payload.outcome, 'partial');
    assert.equal(rejectedVerdict?.payload.outcome, 'controlled_rejection');
  });

  it('communicates partial salvage without exposing compiler jargon', async () => {
    const harness = createHarness({
      compileResult: {
        ok: true,
        outcome: 'partial',
        message: 'Built a partial starter schedule and skipped a few invalid plan references.',
        compiledSchedule: createCompiledSchedule({
          compiledSchedule: {
            command: { type: 'create_tasks_batch', tasks: [] },
            nodeKeyToTaskId: {},
            retainedNodeCount: 12,
            compiledTaskCount: 8,
            compiledDependencyCount: 3,
            topLevelPhaseCount: 4,
            crossPhaseDependencyCount: 2,
            diagnostics: [],
          },
        }),
        commitResponse: createCommitResponse(),
        droppedNodeKeys: ['task-finish'],
        droppedDependencyNodeKeys: ['missing-task'],
      },
    });

    const result = await runInitialGeneration(harness.input);

    assert.equal(result.ok, true);
    assert.equal(result.outcome, 'partial');
    assert.match(result.assistantResponse, /partial starter schedule|частично/i);
    assert.doesNotMatch(result.assistantResponse, /compile|compiler|schema/i);
  });

  it('returns a controlled rejection when compile or commit fails and does not broadcast tasks', async () => {
    const harness = createHarness({
      compileResult: {
        ok: false,
        reason: 'controlled_rejection',
        message: 'We could not build a reliable starter schedule from this request.',
        droppedNodeKeys: ['task-finish'],
        droppedDependencyNodeKeys: ['missing-task'],
        retainedNodeCount: 3,
        retainedNodeRatio: 0.5,
        retainedTopLevelPhaseCount: 2,
        compiledTaskCount: 4,
        compiledDependencyCount: 0,
        crossPhaseDependencyCount: 0,
        everyRetainedPhaseHasAChildTask: false,
        hasBrokenReferences: false,
      },
    });

    const result = await runInitialGeneration(harness.input);

    assert.equal(result.ok, false);
    assert.match(result.assistantResponse, /не удалось|could not build/i);
    assert.equal(harness.broadcasts.some((entry) => (entry.payload as { type: string }).type === 'tasks'), false);
    assert.equal(harness.messages.length, 1);
    assert.deepEqual(
      harness.events.map((entry) => entry.event),
      [
        'object_type_inference',
        'model_routing_decision',
        'planning_output',
        'plan_quality_verdict',
        'compile_verdict',
        'initial_generation_result',
        'agent_run_completed',
      ],
    );
  });
});
