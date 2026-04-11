import { parseModelJson } from './json-response.js';
import {
  evaluateSchedulingQuality,
  evaluateStructureQuality,
} from './quality-gate.js';
import { normalizeGeneratedTitle } from './title-policy.js';
import type { DomainSkeleton } from './domain/contracts.js';
import type {
  ClarificationDecision,
  ExecutableProjectPlan,
  GenerationBrief,
  InitialGenerationClassification,
  InitialGenerationPlannerStage,
  ModelRoutingDecision,
  NormalizedInitialRequest,
  ProjectPlanDependency,
  ProjectPlanDependencyType,
  ScheduledPhase,
  ScheduledProjectPlan,
  ScheduledSubphase,
  ScheduledTask,
  SchedulingQualityVerdict,
  StructuredPhase,
  StructuredProjectPlan,
  StructuredSubphase,
  StructuredTask,
  StructureQualityVerdict,
} from './types.js';

type PlannerQueryInput = {
  prompt: string;
  model: string;
  stage: InitialGenerationPlannerStage;
};

type PlannerQueryResult = string | { content?: string };

export type PlanInitialProjectInput = {
  userMessage: string;
  brief: GenerationBrief;
  normalizedRequest?: NormalizedInitialRequest;
  classification?: InitialGenerationClassification;
  clarificationDecision?: ClarificationDecision;
  domainSkeleton?: DomainSkeleton;
  structureModelDecision: Pick<ModelRoutingDecision, 'selectedModel'>;
  schedulingModelDecision: Pick<ModelRoutingDecision, 'selectedModel'>;
  sdkQuery: (input: PlannerQueryInput) => Promise<PlannerQueryResult>;
};

export type PlanInitialProjectResult = {
  structure: StructuredProjectPlan;
  structureVerdict: StructureQualityVerdict;
  scheduled: ScheduledProjectPlan;
  schedulingVerdict: SchedulingQualityVerdict;
  plan: ExecutableProjectPlan;
  repairAttempted: boolean;
};

function readQueryContent(result: PlannerQueryResult): string {
  if (typeof result === 'string') {
    return result;
  }

  if (typeof result?.content === 'string') {
    return result.content;
  }

  throw new Error('Planner returned an empty response');
}

function buildPlanningContextLines(
  input: Pick<PlanInitialProjectInput, 'brief' | 'normalizedRequest' | 'classification' | 'clarificationDecision' | 'domainSkeleton'>,
): string[] {
  const lines: string[] = [];
  const classification = input.classification;
  const normalized = input.normalizedRequest;
  const clarification = input.clarificationDecision;
  const domainSkeleton = input.domainSkeleton;

  if (classification) {
    lines.push(`Planning mode: ${classification.planningMode}`);
    lines.push(`Scope mode: ${classification.scopeMode}`);
    lines.push(`Project archetype: ${classification.projectArchetype}`);
    lines.push(`Object profile: ${classification.objectProfile}`);
    lines.push(`Detail level: ${classification.detailLevel}`);
    lines.push(`Worklist policy: ${classification.worklistPolicy}`);
  }

  if (normalized?.locationScope) {
    lines.push(`Location scope: ${JSON.stringify(normalized.locationScope)}`);
  }

  if (normalized?.explicitWorkItems.length) {
    lines.push(`Explicit work items: ${JSON.stringify(normalized.explicitWorkItems)}`);
  }

  if (clarification?.action === 'ask') {
    lines.push(`Clarification fallback assumption: ${clarification.fallbackAssumption}`);
  } else if (clarification?.assumptions.length) {
    lines.push(`Server assumptions: ${JSON.stringify(clarification.assumptions)}`);
  }

  if (input.brief.domainContextSummary) {
    lines.push(`Domain context: ${input.brief.domainContextSummary}`);
  }

  if (domainSkeleton) {
    lines.push(`Domain skeleton stages: ${JSON.stringify(domainSkeleton.stageFamilies)}`);
    lines.push(`Domain skeleton milestones: ${JSON.stringify(domainSkeleton.milestoneSkeleton)}`);
    lines.push(`Domain required families: ${JSON.stringify(domainSkeleton.requiredFamilies)}`);
    lines.push(`Domain sequencing expectations: ${JSON.stringify(domainSkeleton.sequencingExpectations)}`);
    lines.push(`Domain scope boundaries: ${JSON.stringify(domainSkeleton.scopeBoundaries)}`);
    lines.push(`Domain decomposition policy: ${JSON.stringify(domainSkeleton.decompositionPolicy)}`);
    lines.push(`Rule pack mandatory families: ${JSON.stringify(domainSkeleton.rulePack.mandatoryFamilies)}`);
    lines.push(`Rule pack forbidden ordering: ${JSON.stringify(domainSkeleton.rulePack.forbiddenOrderings)}`);
    lines.push(`Rule pack parallelism: ${JSON.stringify(domainSkeleton.rulePack.allowableParallelismPatterns)}`);
    lines.push(`Skeleton assumptions: ${JSON.stringify(domainSkeleton.assumptions)}`);
  }

  return lines;
}

function buildModeSpecificStructureLines(input: Pick<PlanInitialProjectInput, 'brief' | 'classification' | 'normalizedRequest' | 'domainSkeleton'>): string[] {
  const planningMode = input.classification?.planningMode ?? input.brief.planningMode ?? 'whole_project_bootstrap';

  if (planningMode === 'partial_scope_bootstrap') {
    return [
      'This is a partial-scope bootstrap, not a whole-project baseline.',
      'Constrain phases and subphases to the requested fragment only.',
      'Do not pad the graph with unrelated whole-project workstreams.',
      'Include fragment-appropriate completion milestones for the requested fragment.',
    ];
  }

  if (planningMode === 'worklist_bootstrap') {
    return [
      'This is a worklist bootstrap driven by explicit user-supplied work items.',
      'Treat the explicit work list as the source of truth for scope.',
      'Preserve user-supplied work items instead of replacing them with generic template content.',
      'Only infer supporting tasks when they are clearly necessary and keep them aligned with the stated worklist policy.',
    ];
  }

  return [
    'Build one whole-project hierarchy in a single pass.',
    'Use full-project milestones and balanced cross-phase workstreams.',
  ];
}

function buildStructurePrompt(
  input: Pick<PlanInitialProjectInput, 'userMessage' | 'brief' | 'normalizedRequest' | 'classification' | 'clarificationDecision' | 'domainSkeleton'>,
): string {
  return [
    'Return strict StructuredProjectPlan JSON only. No markdown, no prose, no code fences.',
    'StructuredProjectPlan JSON only with keys: projectType, assumptions, phases.',
    'Each phase must have: phaseKey, title, subphases.',
    'Each subphase must have: subphaseKey, title, tasks.',
    'Each task must have: taskKey, title.',
    'Use exactly 3 hierarchy levels: phase -> subphase -> task.',
    'Do not output durationDays, dependencies, dates, sequencing metadata, or schedule dates.',
    'The main job of this step is to produce a clean WBS, not a compressed summary.',
    'Top-level phases must be logically coherent and domain-specific.',
    'One top-level phase = one workstream or one stage with one dominant readiness logic.',
    'Do not merge unrelated workstreams into one top-level phase just to reduce the phase count.',
    'If two activities have different crews, different prerequisites, or different completion criteria, separate them into different top-level phases or at least different subphases as appropriate.',
    'Prefer clear construction semantics over compact wording.',
    'Bad top-level titles: "Инженерное оснащение и контур здания", "Кровля и внутренняя отделка", "Фасады + электрика".',
    'Good top-level titles: "Нулевой цикл", "Несущий каркас", "Фасады и контур", "Инженерные системы", "Внутренняя отделка", "Благоустройство", "Сдача объекта".',
    'If the request implies a specialized facility, preserve the major functional workstreams instead of collapsing them into generic phases.',
    'Do not optimize for fewer phases. Optimize for correct decomposition.',
    'Do not use placeholder titles like "Этап 1", "Подэтап 2", "Задача 3".',
    'Each task title must describe exactly one construction operation.',
    'Each task title must have one dominant completion criterion and one dominant crew/work package.',
    'Do not combine different operations in one task title with "и", "/", "+", commas, or similar compound wording.',
    'If the wording implies multiple operations, split them into separate tasks or separate subphases.',
    'Task-level compound formulations are forbidden.',
    'Each subphase title must describe one coherent grouping, not multiple unrelated operations compressed together.',
    ...buildModeSpecificStructureLines(input),
    ...buildPlanningContextLines(input),
    `Starter schedule expectation: ${input.brief.starterScheduleExpectation}`,
    `Naming ban: ${input.brief.namingBan}`,
    `User request: ${input.userMessage}`,
  ].join('\n');
}

function buildStructureRepairPrompt(
  structure: StructuredProjectPlan,
  verdict: StructureQualityVerdict,
  input: Pick<PlanInitialProjectInput, 'userMessage' | 'brief' | 'normalizedRequest' | 'classification' | 'clarificationDecision' | 'domainSkeleton'>,
): string {
  return [
    'Return a fully corrected StructuredProjectPlan JSON only.',
    'Keep the same overall project intent but fix the structural violations below.',
    'Still forbid durations, dependencies, or dates.',
    'Still require exactly 3 hierarchy levels: phase -> subphase -> task.',
    `Validation reasons: ${verdict.reasons.join(', ')}`,
    `Validation metrics: ${JSON.stringify(verdict.metrics)}`,
    `Previous JSON: ${JSON.stringify(structure)}`,
    buildStructurePrompt(input),
  ].join('\n');
}

function buildSchedulingPrompt(
  input: Pick<PlanInitialProjectInput, 'userMessage' | 'brief' | 'normalizedRequest' | 'classification' | 'clarificationDecision' | 'domainSkeleton'>,
  structure: StructuredProjectPlan,
): string {
  return [
    'Return strict ScheduledProjectPlan JSON only. No markdown, no prose, no code fences.',
    'ScheduledProjectPlan JSON only with keys: projectType, assumptions, phases.',
    'Preserve the exact same phases, subphases, task keys, titles, and hierarchy from the provided structure.',
    'You may add only durationDays and dependsOn to leaf tasks.',
    'Every leaf task must get integer durationDays >= 1.',
    'Every dependsOn entry must reference an existing taskKey and use one of FS, SS, FF, SF.',
    'dependsOn must be an array of objects only.',
    'Each dependency object must have exactly this shape: { "taskKey": "EXISTING_TASK_KEY", "type": "FS", "lagDays": 0 }.',
    'Do not output dependency strings such as "TASK_AFS", "TASK_A;FS", "TASK_A FS", or any other shorthand.',
    'Do not output nodeKey inside dependsOn when taskKey can be used.',
    'Do not output dependsOn as a string, map, tuple, semicolon format, or compact notation.',
    'Good example: { "taskKey": "PAINT_WALLS", "title": "Окраска стен", "durationDays": 3, "dependsOn": [{ "taskKey": "PUTTY_WALLS", "type": "FS", "lagDays": 0 }] }',
    'Good example with lag: { "taskKey": "FLOOR_FINISH", "title": "Укладка чистового покрытия", "durationDays": 2, "dependsOn": [{ "taskKey": "SELF_LEVELING", "type": "FS", "lagDays": 1 }] }',
    'Bad examples: "dependsOn": ["PUTTY_WALLSFS"], "dependsOn": ["PUTTY_WALLS;FS"], "dependsOn": ["PUTTY_WALLS FS"], "dependsOn": [{ "nodeKey": "PUTTY_WALLS", "type": "FS" }].',
    'If a dependency is uncertain, omit it instead of inventing or corrupting it.',
    'Do not create, delete, rename, merge, split, or move nodes.',
    'Do not add dependencies to phases or subphases.',
    ...(input.classification?.planningMode === 'partial_scope_bootstrap'
      ? [
          'Build a realistic dependency graph for the requested fragment only with no cycles.',
          'Do not introduce dependencies that imply unrelated whole-project work outside the requested fragment.',
        ]
      : input.classification?.planningMode === 'worklist_bootstrap'
        ? [
            'Sequence the explicit worklist credibly with no cycles.',
            'Keep any inferred supporting dependencies aligned with the user-supplied scope.',
          ]
        : ['Build a realistic non-trivial dependency graph for the whole project with no cycles.']),
    ...buildPlanningContextLines(input),
    `User request: ${input.userMessage}`,
    `Locked structure: ${JSON.stringify(structure)}`,
  ].join('\n');
}

function buildSchedulingRepairPrompt(
  structure: StructuredProjectPlan,
  scheduled: ScheduledProjectPlan,
  verdict: SchedulingQualityVerdict,
  input: Pick<PlanInitialProjectInput, 'userMessage' | 'brief' | 'normalizedRequest' | 'classification' | 'clarificationDecision' | 'domainSkeleton'>,
): string {
  return [
    'Return a fully corrected ScheduledProjectPlan JSON only.',
    'Do not change the locked structure or any titles.',
    'Fix dependsOn formatting if needed.',
    'Output dependsOn only as arrays of objects with taskKey, type, lagDays.',
    'Never use dependency shorthand strings, semicolon-delimited references, compact references, or nodeKey-only references.',
    `Validation reasons: ${verdict.reasons.join(', ')}`,
    `Validation metrics: ${JSON.stringify(verdict.metrics)}`,
    `Previous JSON: ${JSON.stringify(scheduled)}`,
    buildSchedulingPrompt(input, structure),
  ].join('\n');
}

function normalizeStructureTask(input: unknown, index: number): StructuredTask {
  if (!input || typeof input !== 'object') {
    throw new Error(`Structured task at index ${index} must be an object`);
  }

  const record = input as Record<string, unknown>;
  const taskKey = typeof record.taskKey === 'string' ? record.taskKey.trim() : '';
  if (!taskKey) {
    throw new Error(`Structured task at index ${index} is missing taskKey`);
  }

  return {
    taskKey,
    title: normalizeGeneratedTitle(record.title, `Задача ${index + 1}`),
  };
}

function normalizeStructureSubphase(input: unknown, index: number): StructuredSubphase {
  if (!input || typeof input !== 'object') {
    throw new Error(`Structured subphase at index ${index} must be an object`);
  }

  const record = input as Record<string, unknown>;
  const subphaseKey = typeof record.subphaseKey === 'string' ? record.subphaseKey.trim() : '';
  if (!subphaseKey) {
    throw new Error(`Structured subphase at index ${index} is missing subphaseKey`);
  }

  const tasksInput = Array.isArray(record.tasks) ? record.tasks : [];
  const tasks = tasksInput.map((task, taskIndex) => normalizeStructureTask(task, taskIndex));
  const duplicateTaskKeys = new Set<string>();
  for (const task of tasks) {
    if (duplicateTaskKeys.has(task.taskKey)) {
      throw new Error(`Structured subphase ${subphaseKey} contains duplicate taskKey ${task.taskKey}`);
    }
    duplicateTaskKeys.add(task.taskKey);
  }

  return {
    subphaseKey,
    title: normalizeGeneratedTitle(record.title, `Подэтап ${index + 1}`),
    tasks,
  };
}

function normalizeStructurePhase(input: unknown, index: number): StructuredPhase {
  if (!input || typeof input !== 'object') {
    throw new Error(`Structured phase at index ${index} must be an object`);
  }

  const record = input as Record<string, unknown>;
  const phaseKey = typeof record.phaseKey === 'string' ? record.phaseKey.trim() : '';
  if (!phaseKey) {
    throw new Error(`Structured phase at index ${index} is missing phaseKey`);
  }

  const subphasesInput = Array.isArray(record.subphases) ? record.subphases : [];
  const subphases = subphasesInput.map((subphase, subphaseIndex) => normalizeStructureSubphase(subphase, subphaseIndex));
  const duplicateSubphaseKeys = new Set<string>();
  for (const subphase of subphases) {
    if (duplicateSubphaseKeys.has(subphase.subphaseKey)) {
      throw new Error(`Structured phase ${phaseKey} contains duplicate subphaseKey ${subphase.subphaseKey}`);
    }
    duplicateSubphaseKeys.add(subphase.subphaseKey);
  }

  return {
    phaseKey,
    title: normalizeGeneratedTitle(record.title, `Этап ${index + 1}`),
    subphases,
  };
}

function validateStructure(raw: unknown): StructuredProjectPlan {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Structured project payload must be an object');
  }

  const record = raw as Record<string, unknown>;
  const phasesInput = Array.isArray(record.phases) ? record.phases : [];
  const phases = phasesInput.map((phase, phaseIndex) => normalizeStructurePhase(phase, phaseIndex));
  const duplicatePhaseKeys = new Set<string>();
  for (const phase of phases) {
    if (duplicatePhaseKeys.has(phase.phaseKey)) {
      throw new Error(`Structured project contains duplicate phaseKey ${phase.phaseKey}`);
    }
    duplicatePhaseKeys.add(phase.phaseKey);
  }

  return {
    projectType: typeof record.projectType === 'string' ? record.projectType.trim() : '',
    assumptions: Array.isArray(record.assumptions)
      ? record.assumptions.filter((value): value is string => typeof value === 'string').map((value) => value.trim()).filter(Boolean)
      : [],
    phases,
  };
}

function getStructureTaskKeys(structure: StructuredProjectPlan): Set<string> {
  return new Set(
    structure.phases.flatMap((phase) =>
      phase.subphases.flatMap((subphase) => subphase.tasks.map((task) => task.taskKey)),
    ),
  );
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function parseStringDependency(
  input: string,
  structureTaskKeys: Set<string>,
): ProjectPlanDependency | null {
  const normalized = input.trim();
  if (!normalized) {
    return null;
  }

  if (structureTaskKeys.has(normalized)) {
    return {
      nodeKey: normalized,
      type: 'FS',
      lagDays: 0,
    };
  }

  const suffixMatch = normalized.match(/^(.*?)(FS|SS|FF|SF)([+-]?\d+)?$/);
  if (!suffixMatch) {
    return null;
  }

  const [, candidateNodeKey, type, lagDaysRaw] = suffixMatch;
  const nodeKey = candidateNodeKey?.trim() ?? '';
  if (!nodeKey || !structureTaskKeys.has(nodeKey)) {
    return null;
  }

  const lagDays = lagDaysRaw ? Number.parseInt(lagDaysRaw, 10) : 0;
  return {
    nodeKey,
    type: type as ProjectPlanDependencyType,
    lagDays: Number.isInteger(lagDays) ? lagDays : 0,
  };
}

function normalizeDependency(
  input: unknown,
  structureTaskKeys: Set<string>,
): ProjectPlanDependency | null {
  if (typeof input === 'string') {
    return parseStringDependency(input, structureTaskKeys);
  }

  const record = asObject(input);
  if (!record) {
    return null;
  }

  const taskKey = typeof record.taskKey === 'string' ? record.taskKey.trim() : '';
  const fallbackNodeKey = typeof record.nodeKey === 'string' ? record.nodeKey.trim() : '';
  const nodeKey = taskKey || fallbackNodeKey;
  if (!nodeKey || !structureTaskKeys.has(nodeKey)) {
    return null;
  }

  const type = record.type;
  const normalizedType: ProjectPlanDependencyType = type === 'SS' || type === 'FF' || type === 'SF' || type === 'FS'
    ? type
    : 'FS';
  const lagDays = typeof record.lagDays === 'number' && Number.isInteger(record.lagDays)
    ? record.lagDays
    : 0;

  return {
    nodeKey,
    type: normalizedType,
    lagDays,
  };
}

function dedupeDependencies(dependencies: ProjectPlanDependency[]): ProjectPlanDependency[] {
  const seen = new Set<string>();
  const result: ProjectPlanDependency[] = [];

  for (const dependency of dependencies) {
    const signature = `${dependency.nodeKey}:${dependency.type}:${dependency.lagDays ?? 0}`;
    if (seen.has(signature)) {
      continue;
    }
    seen.add(signature);
    result.push(dependency);
  }

  return result;
}

function normalizeScheduledTask(
  input: unknown,
  fallbackTask: StructuredTask,
  structureTaskKeys: Set<string>,
): ScheduledTask {
  const record = asObject(input) ?? {};
  const durationDays = record.durationDays;
  const dependsOnInput = Array.isArray(record.dependsOn) ? record.dependsOn : [];

  return {
    taskKey: fallbackTask.taskKey,
    title: normalizeGeneratedTitle(record.title, fallbackTask.title),
    durationDays: typeof durationDays === 'number' && Number.isInteger(durationDays) && durationDays >= 1 ? durationDays : 1,
    dependsOn: dedupeDependencies(
      dependsOnInput
        .map((dependency) => normalizeDependency(dependency, structureTaskKeys))
        .filter((dependency): dependency is ProjectPlanDependency => dependency !== null)
        .filter((dependency) => dependency.nodeKey !== fallbackTask.taskKey),
    ),
  };
}

function normalizeScheduledSubphase(
  input: unknown,
  fallbackSubphase: StructuredSubphase,
  structureTaskKeys: Set<string>,
): ScheduledSubphase {
  const record = asObject(input) ?? {};
  const tasksInput = Array.isArray(record.tasks) ? record.tasks : [];
  return {
    subphaseKey: fallbackSubphase.subphaseKey,
    title: normalizeGeneratedTitle(record.title, fallbackSubphase.title),
    tasks: fallbackSubphase.tasks.map((task, taskIndex) =>
      normalizeScheduledTask(tasksInput[taskIndex], task, structureTaskKeys)),
  };
}

function normalizeScheduledPhase(
  input: unknown,
  fallbackPhase: StructuredPhase,
  structureTaskKeys: Set<string>,
): ScheduledPhase {
  const record = asObject(input) ?? {};
  const subphasesInput = Array.isArray(record.subphases) ? record.subphases : [];
  return {
    phaseKey: fallbackPhase.phaseKey,
    title: normalizeGeneratedTitle(record.title, fallbackPhase.title),
    subphases: fallbackPhase.subphases.map((subphase, subphaseIndex) =>
      normalizeScheduledSubphase(subphasesInput[subphaseIndex], subphase, structureTaskKeys)),
  };
}

function validateScheduled(raw: unknown, structure: StructuredProjectPlan): ScheduledProjectPlan {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Scheduled project payload must be an object');
  }

  const record = raw as Record<string, unknown>;
  const phasesInput = Array.isArray(record.phases) ? record.phases : [];
  const structureTaskKeys = getStructureTaskKeys(structure);

  return {
    projectType: typeof record.projectType === 'string' ? record.projectType.trim() : structure.projectType,
    assumptions: Array.isArray(record.assumptions)
      ? record.assumptions.filter((value): value is string => typeof value === 'string').map((value) => value.trim()).filter(Boolean)
      : structure.assumptions,
    phases: structure.phases.map((phase, phaseIndex) =>
      normalizeScheduledPhase(phasesInput[phaseIndex], phase, structureTaskKeys)),
  };
}

function flattenScheduledPlan(plan: ScheduledProjectPlan): ExecutableProjectPlan {
  const nodes: ExecutableProjectPlan['nodes'] = [];

  for (const phase of plan.phases) {
    nodes.push({
      nodeKey: phase.phaseKey,
      title: phase.title,
      kind: 'phase',
      durationDays: 1,
      dependsOn: [],
    });

    for (const subphase of phase.subphases) {
      nodes.push({
        nodeKey: subphase.subphaseKey,
        title: subphase.title,
        parentNodeKey: phase.phaseKey,
        kind: 'subphase',
        durationDays: 1,
        dependsOn: [],
      });

      for (const task of subphase.tasks) {
        nodes.push({
          nodeKey: task.taskKey,
          title: task.title,
          parentNodeKey: subphase.subphaseKey,
          kind: 'task',
          durationDays: task.durationDays,
          dependsOn: task.dependsOn,
        });
      }
    }
  }

  return {
    projectType: plan.projectType,
    assumptions: plan.assumptions,
    nodes,
  };
}

async function requestStructuredProject(
  prompt: string,
  stage: InitialGenerationPlannerStage,
  model: string,
  sdkQuery: PlanInitialProjectInput['sdkQuery'],
): Promise<StructuredProjectPlan> {
  const response = await sdkQuery({
    prompt,
    model,
    stage,
  });

  return validateStructure(parseModelJson(readQueryContent(response)));
}

async function requestScheduledProject(
  prompt: string,
  stage: InitialGenerationPlannerStage,
  model: string,
  sdkQuery: PlanInitialProjectInput['sdkQuery'],
  structure: StructuredProjectPlan,
): Promise<ScheduledProjectPlan> {
  const response = await sdkQuery({
    prompt,
    model,
    stage,
  });

  return validateScheduled(parseModelJson(readQueryContent(response)), structure);
}

export async function planInitialProject(input: PlanInitialProjectInput): Promise<PlanInitialProjectResult> {
  let repairAttempted = false;

  let structure = await requestStructuredProject(
    buildStructurePrompt(input),
    'structure_planning',
    input.structureModelDecision.selectedModel,
    input.sdkQuery,
  );
  let structureVerdict = evaluateStructureQuality(structure, input.brief, input.userMessage);

  if (!structureVerdict.accepted) {
    repairAttempted = true;
    structure = await requestStructuredProject(
      buildStructureRepairPrompt(structure, structureVerdict, input),
      'structure_planning_repair',
      input.structureModelDecision.selectedModel,
      input.sdkQuery,
    );
    structureVerdict = evaluateStructureQuality(structure, input.brief, input.userMessage);
  }

  let scheduled = await requestScheduledProject(
    buildSchedulingPrompt(input, structure),
    'schedule_metadata',
    input.schedulingModelDecision.selectedModel,
    input.sdkQuery,
    structure,
  );
  let plan = flattenScheduledPlan(scheduled);
  let schedulingVerdict = evaluateSchedulingQuality(structure, scheduled, plan);

  if (!schedulingVerdict.accepted) {
    repairAttempted = true;
    scheduled = await requestScheduledProject(
      buildSchedulingRepairPrompt(structure, scheduled, schedulingVerdict, input),
      'schedule_metadata_repair',
      input.schedulingModelDecision.selectedModel,
      input.sdkQuery,
      structure,
    );
    plan = flattenScheduledPlan(scheduled);
    schedulingVerdict = evaluateSchedulingQuality(structure, scheduled, plan);
  }

  return {
    structure,
    structureVerdict,
    scheduled,
    schedulingVerdict,
    plan,
    repairAttempted,
  };
}
