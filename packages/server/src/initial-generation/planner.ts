import { parseModelJson } from './json-response.js';
import {
  buildSchedulingPrompt,
  buildSchedulingRepairPrompt,
  buildStructurePrompt,
  buildStructureRepairPrompt,
} from './prompts/index.js';
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

function slugify(value: string): string {
  const map: Record<string, string> = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
    к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
    х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ы: 'y', э: 'e', ю: 'yu', я: 'ya', ь: '', ъ: '',
  };

  return value
    .toLowerCase()
    .split('')
    .map((char) => map[char] ?? char)
    .join('')
    .replace(/[^a-z0-9а-яё]+/giu, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
}

function buildDeterministicTaskKey(title: string, index: number, seenKeys: Set<string>): string {
  const base = slugify(title) || `task-${index + 1}`;
  let candidate = base;
  let suffix = 2;
  while (seenKeys.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  seenKeys.add(candidate);
  return candidate;
}

function stripLeadingEnumeration(value: string): string {
  return value.replace(/^\s*\d+[.)]\s*/u, '').trim();
}

function normalizeWorkItemTitle(value: string): string {
  return stripLeadingEnumeration(value)
    .replace(/\s*[-–—]\s*\d[\d\s.,/a-zа-я%]*(?:\([^)]*\)[\d\s.,/a-zа-я%]*)*.*$/iu, '')
    .replace(/\s+/g, ' ')
    .replace(/[-–—\s]+$/u, '')
    .trim();
}

function inferDominantWorkFamily(taskTitles: string[]): string | null {
  const firstWords = taskTitles
    .map((title) => title.split(/\s+/u)[0]?.toLowerCase() ?? '')
    .filter(Boolean);
  const counts = new Map<string, number>();

  for (const word of firstWords) {
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }

  let dominant: { word: string; count: number } | null = null;
  for (const [word, count] of counts) {
    if (!dominant || count > dominant.count) {
      dominant = { word, count };
    }
  }

  if (!dominant || dominant.count < Math.max(2, Math.ceil(taskTitles.length * 0.6))) {
    return null;
  }

  if (dominant.word === 'демонтаж') {
    return 'Демонтажные работы';
  }
  if (dominant.word === 'монтаж') {
    return 'Монтажные работы';
  }
  if (dominant.word === 'ремонт') {
    return 'Ремонтные работы';
  }
  if (dominant.word === 'устройство') {
    return 'Работы по устройству';
  }

  return null;
}

function deriveWorklistPhaseTitle(taskTitles: string[]): string {
  return inferDominantWorkFamily(taskTitles) ?? 'Основные работы';
}

function deriveWorklistSubphaseTitle(phaseTitle: string, taskTitles: string[]): string {
  if (taskTitles.length <= 1) {
    return phaseTitle;
  }

  const withParenthetical = taskTitles
    .map((title) => title.match(/\(([^)]+)\)/u)?.[1]?.trim())
    .filter((value): value is string => Boolean(value));
  const uniqueParenthetical = [...new Set(withParenthetical)];

  if (uniqueParenthetical.length === 1) {
    return `${phaseTitle}: ${uniqueParenthetical[0]}`;
  }

  return phaseTitle;
}

function isFlatExplicitWorklist(input: PlanInitialProjectInput): boolean {
  return (input.classification?.planningMode ?? input.brief.planningMode) === 'worklist_bootstrap'
    && (input.normalizedRequest?.explicitWorkItems.length ?? input.brief.explicitWorkItems?.length ?? 0) >= 3;
}

function buildFlatWorklistStructure(input: PlanInitialProjectInput): StructuredProjectPlan {
  const explicitWorkItems = input.normalizedRequest?.explicitWorkItems ?? input.brief.explicitWorkItems ?? [];
  const taskKeys = new Set<string>();
  const taskTitles = explicitWorkItems.map((item) => normalizeWorkItemTitle(item) || stripLeadingEnumeration(item));
  const phaseTitle = deriveWorklistPhaseTitle(taskTitles);
  const subphaseTitle = deriveWorklistSubphaseTitle(phaseTitle, taskTitles);

  return {
    projectType: input.classification?.projectArchetype ?? input.brief.objectType,
    assumptions: [
      'Пользовательский список работ является основным источником состава графика',
      ...(input.brief.clarificationAssumptions ?? []),
    ],
    phases: [{
      phaseKey: 'user-worklist',
      title: phaseTitle,
      subphases: [{
        subphaseKey: 'user-work-items',
        title: subphaseTitle,
        tasks: taskTitles.map((item, index) => ({
          taskKey: buildDeterministicTaskKey(item, index, taskKeys),
          title: item,
        })),
      }],
    }],
  };
}

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

function normalizeExplicitDateRange(record: Record<string, unknown>): { startDate: string; endDate: string } | undefined {
  const startDate = typeof record.startDate === 'string' ? record.startDate.trim() : '';
  const endDate = typeof record.endDate === 'string' ? record.endDate.trim() : '';
  const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

  if (!startDate && !endDate) {
    return undefined;
  }

  if (!isoDatePattern.test(startDate) || !isoDatePattern.test(endDate) || startDate > endDate) {
    return undefined;
  }

  return { startDate, endDate };
}

function normalizeScheduledTask(
  input: unknown,
  fallbackTask: StructuredTask,
  structureTaskKeys: Set<string>,
): ScheduledTask {
  const record = asObject(input) ?? {};
  const durationDays = record.durationDays;
  const dependsOnInput = Array.isArray(record.dependsOn) ? record.dependsOn : [];
  const explicitDateRange = normalizeExplicitDateRange(record);

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
    ...(explicitDateRange ?? {}),
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

function flattenScheduledPlan(plan: ScheduledProjectPlan, options?: { collapseSingleSubphaseWorklist?: boolean }): ExecutableProjectPlan {
  const nodes: ExecutableProjectPlan['nodes'] = [];
  const collapseSingleSubphaseWorklist = options?.collapseSingleSubphaseWorklist ?? false;

  for (const phase of plan.phases) {
    nodes.push({
      nodeKey: phase.phaseKey,
      title: phase.title,
      kind: 'phase',
      durationDays: 1,
      dependsOn: [],
    });

    for (const subphase of phase.subphases) {
      const collapseSubphase = collapseSingleSubphaseWorklist && phase.subphases.length === 1;
      if (!collapseSubphase) {
        nodes.push({
          nodeKey: subphase.subphaseKey,
          title: subphase.title,
          parentNodeKey: phase.phaseKey,
          kind: 'subphase',
          durationDays: 1,
          dependsOn: [],
        });
      }

      for (const task of subphase.tasks) {
        nodes.push({
          nodeKey: task.taskKey,
          title: task.title,
          parentNodeKey: collapseSubphase ? phase.phaseKey : subphase.subphaseKey,
        kind: 'task',
        durationDays: task.durationDays,
        dependsOn: task.dependsOn,
        ...(task.startDate ? { startDate: task.startDate } : {}),
        ...(task.endDate ? { endDate: task.endDate } : {}),
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
  const flatExplicitWorklist = isFlatExplicitWorklist(input);

  let structure = flatExplicitWorklist
    ? buildFlatWorklistStructure(input)
    : await requestStructuredProject(
        buildStructurePrompt(input),
        'structure_planning',
        input.structureModelDecision.selectedModel,
        input.sdkQuery,
      );
  let structureVerdict = evaluateStructureQuality(structure, {
    brief: input.brief,
    userMessage: input.userMessage,
    normalizedRequest: input.normalizedRequest,
    classification: input.classification,
    domainSkeleton: input.domainSkeleton,
  });

  if (!structureVerdict.accepted) {
    repairAttempted = true;
    structure = flatExplicitWorklist
      ? buildFlatWorklistStructure(input)
      : await requestStructuredProject(
          buildStructureRepairPrompt({ ...input, structure, verdict: structureVerdict }),
          'structure_planning_repair',
          input.structureModelDecision.selectedModel,
          input.sdkQuery,
        );
    structureVerdict = evaluateStructureQuality(structure, {
      brief: input.brief,
      userMessage: input.userMessage,
      normalizedRequest: input.normalizedRequest,
      classification: input.classification,
      domainSkeleton: input.domainSkeleton,
    });
  }

  let scheduled = await requestScheduledProject(
    buildSchedulingPrompt({ ...input, structure }),
    'schedule_metadata',
    input.schedulingModelDecision.selectedModel,
    input.sdkQuery,
    structure,
  );
  let plan = flattenScheduledPlan(scheduled, {
    collapseSingleSubphaseWorklist: flatExplicitWorklist,
  });
  let schedulingVerdict = evaluateSchedulingQuality(structure, scheduled, plan, {
    brief: input.brief,
    userMessage: input.userMessage,
    normalizedRequest: input.normalizedRequest,
    classification: input.classification,
    domainSkeleton: input.domainSkeleton,
  });

  if (!schedulingVerdict.accepted) {
    repairAttempted = true;
    scheduled = await requestScheduledProject(
      buildSchedulingRepairPrompt({ ...input, structure, scheduled, verdict: schedulingVerdict }),
      'schedule_metadata_repair',
      input.schedulingModelDecision.selectedModel,
      input.sdkQuery,
      structure,
    );
    plan = flattenScheduledPlan(scheduled, {
      collapseSingleSubphaseWorklist: flatExplicitWorklist,
    });
    schedulingVerdict = evaluateSchedulingQuality(structure, scheduled, plan, {
      brief: input.brief,
      userMessage: input.userMessage,
      normalizedRequest: input.normalizedRequest,
      classification: input.classification,
      domainSkeleton: input.domainSkeleton,
    });
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
