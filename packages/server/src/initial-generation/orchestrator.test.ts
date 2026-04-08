import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { CommitProjectCommandResponse } from '@gantt/mcp/types';

import { runInitialGeneration } from './orchestrator.js';
import type { ExecuteInitialProjectPlanResult } from './executor.js';
import type {
  ExpandedPhasePlan,
  PhaseExpansionQualityVerdict,
  PlanQualityVerdict,
  ProjectWbsSkeleton,
  SkeletonQualityVerdict,
} from './types.js';

const SKELETON: ProjectWbsSkeleton = {
  projectType: 'private_residential_house',
  assumptions: ['RF production calendar defaults'],
  phases: [
    {
      phaseKey: 'phase-site',
      title: 'Подготовка площадки',
      orderHint: 1,
      workPackages: [
        { workPackageKey: 'survey', title: 'Геодезическая подготовка' },
        { workPackageKey: 'site-camp', title: 'Организация бытового городка' },
        { workPackageKey: 'access', title: 'Временные подъезды и ограждение' },
      ],
    },
    {
      phaseKey: 'phase-foundation',
      title: 'Фундамент и подземная часть',
      orderHint: 2,
      dependsOnPhaseKeys: ['phase-site'],
      workPackages: [
        { workPackageKey: 'earthworks', title: 'Земляные работы' },
        { workPackageKey: 'footings', title: 'Фундаментные конструкции' },
        { workPackageKey: 'waterproofing', title: 'Гидроизоляция и обратная засыпка' },
      ],
    },
    {
      phaseKey: 'phase-shell',
      title: 'Коробка дома и гаража',
      orderHint: 3,
      dependsOnPhaseKeys: ['phase-foundation'],
      workPackages: [
        { workPackageKey: 'house-shell', title: 'Надземная часть дома' },
        { workPackageKey: 'garage-shell', title: 'Коробка гаража' },
        { workPackageKey: 'roof', title: 'Кровля и закрытие контура' },
      ],
    },
    {
      phaseKey: 'phase-finish',
      title: 'Инженерия и отделка',
      orderHint: 4,
      dependsOnPhaseKeys: ['phase-shell'],
      workPackages: [
        { workPackageKey: 'mep', title: 'Инженерные системы' },
        { workPackageKey: 'finishes', title: 'Отделочные работы' },
        { workPackageKey: 'handover', title: 'Пусконаладка и сдача' },
      ],
    },
  ],
};

const EXPANSIONS: ExpandedPhasePlan[] = [
  {
    phaseKey: 'phase-site',
    tasks: [
      { nodeKey: 'task-survey', title: 'Геодезическая разбивка', durationDays: 2, dependsOnWithinPhase: [], sequenceRole: 'entry' },
      { nodeKey: 'task-camp', title: 'Организация бытового городка', durationDays: 2, dependsOnWithinPhase: [{ nodeKey: 'task-survey', type: 'FS', lagDays: 0 }] },
      { nodeKey: 'task-access', title: 'Временные дороги и ограждение', durationDays: 2, dependsOnWithinPhase: [{ nodeKey: 'task-camp', type: 'FS', lagDays: 0 }], sequenceRole: 'exit' },
    ],
  },
  {
    phaseKey: 'phase-foundation',
    tasks: [
      { nodeKey: 'task-pit', title: 'Разработка котлована', durationDays: 4, dependsOnWithinPhase: [], sequenceRole: 'entry' },
      { nodeKey: 'task-footings', title: 'Армирование и бетонирование фундамента', durationDays: 5, dependsOnWithinPhase: [{ nodeKey: 'task-pit', type: 'FS', lagDays: 1 }] },
      { nodeKey: 'task-waterproofing', title: 'Гидроизоляция и обратная засыпка', durationDays: 3, dependsOnWithinPhase: [{ nodeKey: 'task-footings', type: 'FS', lagDays: 0 }], sequenceRole: 'exit' },
    ],
  },
  {
    phaseKey: 'phase-shell',
    tasks: [
      { nodeKey: 'task-house-shell', title: 'Возведение стен и перекрытий дома', durationDays: 8, dependsOnWithinPhase: [], sequenceRole: 'entry' },
      { nodeKey: 'task-garage-shell', title: 'Возведение коробки гаража', durationDays: 5, dependsOnWithinPhase: [{ nodeKey: 'task-house-shell', type: 'SS', lagDays: 2 }] },
      { nodeKey: 'task-roof', title: 'Монтаж кровли и закрытие контура', durationDays: 4, dependsOnWithinPhase: [{ nodeKey: 'task-house-shell', type: 'FS', lagDays: 0 }], sequenceRole: 'exit' },
    ],
  },
  {
    phaseKey: 'phase-finish',
    tasks: [
      { nodeKey: 'task-mep', title: 'Черновой монтаж инженерных систем', durationDays: 6, dependsOnWithinPhase: [], sequenceRole: 'entry' },
      { nodeKey: 'task-finish', title: 'Чистовая отделка', durationDays: 5, dependsOnWithinPhase: [{ nodeKey: 'task-mep', type: 'FS', lagDays: 0 }] },
      { nodeKey: 'task-handover', title: 'Пусконаладка и сдача объекта', durationDays: 2, dependsOnWithinPhase: [{ nodeKey: 'task-finish', type: 'FS', lagDays: 0 }], sequenceRole: 'exit' },
    ],
  },
];

const SKELETON_VERDICT: SkeletonQualityVerdict = {
  accepted: true,
  reasons: [],
  score: 95,
  metrics: {
    phaseCount: 4,
    workPackageCount: 12,
    minWorkPackagesPerPhase: 3,
    genericTitleCount: 0,
    genericTitleRatio: 0,
    objectTypeSignalCoverage: 0.2,
    requestedComponentCoverage: 0.3,
  },
};

const PHASE_VERDICT: PhaseExpansionQualityVerdict = {
  accepted: true,
  reasons: [],
  score: 93,
  metrics: {
    taskCount: 3,
    dependencyCount: 2,
    entryTaskCount: 1,
    exitTaskCount: 1,
    genericTitleCount: 0,
    genericTitleRatio: 0,
  },
};

const PLAN_VERDICT: PlanQualityVerdict = {
  accepted: true,
  reasons: [],
  score: 94,
  metrics: {
    phaseCount: 4,
    taskNodeCount: 12,
    dependencyCount: 11,
    crossPhaseDependencyCount: 3,
    genericTitleCount: 0,
    genericTitleRatio: 0,
    objectTypeSignalCoverage: 0.18,
    passesProductAdequacyFloor: true,
  },
};

function createPlanResult(overrides?: Partial<{
  skeletonVerdict: SkeletonQualityVerdict;
  expandedPhaseVerdict: PhaseExpansionQualityVerdict;
  planVerdict: PlanQualityVerdict;
  repairAttempted: boolean;
}> ) {
  const expandedPhases = EXPANSIONS.map((expansion) => ({
    phaseKey: expansion.phaseKey,
    title: SKELETON.phases.find((phase) => phase.phaseKey === expansion.phaseKey)?.title ?? expansion.phaseKey,
    expansion,
    verdict: overrides?.expandedPhaseVerdict ?? PHASE_VERDICT,
    repairAttempted: false,
  }));

  return {
    skeleton: SKELETON,
    skeletonVerdict: overrides?.skeletonVerdict ?? SKELETON_VERDICT,
    expandedPhases,
    crossPhaseLinkPlan: {
      links: [
        { fromNodeKey: 'task-access', toNodeKey: 'task-pit', type: 'FS' as const, lagDays: 0 },
        { fromNodeKey: 'task-waterproofing', toNodeKey: 'task-house-shell', type: 'FS' as const, lagDays: 0 },
        { fromNodeKey: 'task-roof', toNodeKey: 'task-mep', type: 'FS' as const, lagDays: 0 },
      ],
    },
    plan: {
      projectType: 'private_residential_house',
      assumptions: ['RF production calendar defaults'],
      nodes: [],
    },
    verdict: overrides?.planVerdict ?? PLAN_VERDICT,
    repairAttempted: overrides?.repairAttempted ?? false,
  };
}

function createCompiledSchedule() {
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
    retainedNodeCount: 16,
    compiledTaskCount: 12,
    compiledDependencyCount: 11,
    topLevelPhaseCount: 4,
    crossPhaseDependencyCount: 3,
    diagnostics: [{
      level: 'info' as const,
      code: 'compiled_schedule' as const,
      message: 'ok',
      retainedNodeCount: 16,
      compiledTaskCount: 12,
      compiledDependencyCount: 11,
      topLevelPhaseCount: 4,
    }],
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
  planResult?: ReturnType<typeof createPlanResult>;
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
      plannerQuery: async () => ({ content: JSON.stringify(SKELETON) }),
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
          return overrides?.planResult ?? createPlanResult();
        },
        async executePlan() {
          return compileResult;
        },
      },
    },
  };
}

describe('runInitialGeneration', () => {
  it('runs staged planning through compile, saves the assistant reply, broadcasts tasks, and logs the lifecycle', async () => {
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
        'wbs_skeleton_output',
        'wbs_skeleton_verdict',
        'phase_expansion_output',
        'phase_expansion_verdict',
        'phase_expansion_output',
        'phase_expansion_verdict',
        'phase_expansion_output',
        'phase_expansion_verdict',
        'phase_expansion_output',
        'phase_expansion_verdict',
        'cross_phase_linking_verdict',
        'executable_plan_output',
        'plan_quality_verdict',
        'compile_verdict',
        'initial_generation_result',
        'tasks_broadcast',
        'agent_run_completed',
      ],
    );
    assert.equal(harness.broadcasts.length, 3);
  });

  it('returns a controlled planning failure when the staged plan stays below the floor', async () => {
    const harness = createHarness({
      planResult: createPlanResult({
        planVerdict: {
          ...PLAN_VERDICT,
          accepted: false,
          reasons: ['weak_coverage'],
          score: 42,
        },
        repairAttempted: true,
      }),
    });

    const result = await runInitialGeneration(harness.input);

    assert.equal(result.ok, false);
    assert.equal(result.repairAttempted, true);
    assert.ok(harness.events.some((entry) => entry.event === 'plan_repair_requested'));
    assert.equal(harness.events.some((entry) => entry.event === 'compile_verdict'), false);
  });

  it('records compile verdict payloads for complete and controlled failure outcomes', async () => {
    const completeHarness = createHarness();
    const rejectedHarness = createHarness({
      compileResult: {
        ok: false,
        reason: 'controlled_rejection',
        message: 'We could not build a reliable starter schedule from this request.',
        droppedNodeKeys: [],
        droppedDependencyNodeKeys: [],
        retainedNodeCount: 16,
        retainedNodeRatio: 1,
        retainedTopLevelPhaseCount: 4,
        compiledTaskCount: 12,
        compiledDependencyCount: 11,
        crossPhaseDependencyCount: 0,
        everyRetainedPhaseHasAChildTask: true,
        hasBrokenReferences: true,
      },
    });

    await runInitialGeneration(completeHarness.input);
    await runInitialGeneration(rejectedHarness.input);

    const completeVerdict = completeHarness.events.find((entry) => entry.event === 'compile_verdict');
    const rejectedVerdict = rejectedHarness.events.find((entry) => entry.event === 'compile_verdict');

    assert.equal(completeVerdict?.payload.outcome, 'complete');
    assert.equal(rejectedVerdict?.payload.outcome, 'controlled_rejection');
  });

  it('returns a controlled rejection when compile fails and does not broadcast tasks', async () => {
    const harness = createHarness({
      compileResult: {
        ok: false,
        reason: 'controlled_rejection',
        message: 'We could not build a reliable starter schedule from this request.',
        droppedNodeKeys: [],
        droppedDependencyNodeKeys: [],
        retainedNodeCount: 16,
        retainedNodeRatio: 1,
        retainedTopLevelPhaseCount: 4,
        compiledTaskCount: 12,
        compiledDependencyCount: 11,
        crossPhaseDependencyCount: 0,
        everyRetainedPhaseHasAChildTask: true,
        hasBrokenReferences: true,
      },
    });

    const result = await runInitialGeneration(harness.input);

    assert.equal(result.ok, false);
    assert.match(result.assistantResponse, /не удалось|could not build/i);
    assert.equal(harness.broadcasts.some((entry) => (entry.payload as { type: string }).type === 'tasks'), false);
    assert.equal(harness.messages.length, 1);
  });
});
