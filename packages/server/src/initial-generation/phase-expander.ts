import type { ResolvedDomainReference } from './domain-reference.js';
import { evaluatePhaseExpansionQuality } from './quality-gate.js';
import type {
  ExpandedPhasePlan,
  ExpandedPhaseTask,
  GenerationBrief,
  InitialGenerationPlannerStage,
  ModelRoutingDecision,
  PhaseExpansionQualityVerdict,
  ProjectPlanDependency,
  ProjectPlanDependencyType,
  ProjectWbsSkeleton,
  SkeletonPhase,
} from './types.js';

const PLACEHOLDER_TITLE_PATTERN = /^(?:этап|задача|stage|task)\s+\d+$/i;
const maxRepairAttempts = 1;

type PlannerQueryInput = {
  prompt: string;
  model: string;
  stage: InitialGenerationPlannerStage;
};

type PlannerQueryResult = string | { content?: string };

export type ExpandPhasesInput = {
  userMessage: string;
  brief: GenerationBrief;
  reference: ResolvedDomainReference;
  skeleton: ProjectWbsSkeleton;
  modelDecision: Pick<ModelRoutingDecision, 'selectedModel'>;
  sdkQuery: (input: PlannerQueryInput) => Promise<PlannerQueryResult>;
};

export type ExpandedPhaseResult = {
  phase: SkeletonPhase;
  expansion: ExpandedPhasePlan;
  verdict: PhaseExpansionQualityVerdict;
  repairAttempted: boolean;
};

function buildExpansionPrompt(input: ExpandPhasesInput, phase: SkeletonPhase): string {
  const orderedPhases = [...input.skeleton.phases].sort((left, right) => left.orderHint - right.orderHint);
  const currentIndex = orderedPhases.findIndex((item) => item.phaseKey === phase.phaseKey);
  const previousPhase = currentIndex > 0 ? orderedPhases[currentIndex - 1] : null;
  const nextPhase = currentIndex >= 0 && currentIndex < orderedPhases.length - 1 ? orderedPhases[currentIndex + 1] : null;

  return [
    `Model: ${input.modelDecision.selectedModel}`,
    'You are expanding one construction phase into executable child tasks.',
    'Return strict ExpandedPhasePlan JSON only. No markdown, no prose, no code fences.',
    'ExpandedPhasePlan JSON only with keys: phaseKey, tasks.',
    'Each task must contain: nodeKey, title, durationDays, dependsOnWithinPhase, sequenceRole?.',
    'Only output tasks for the requested phase.',
    'Do not output dates, startDate, endDate, calendars, or compiler-ready scheduled tasks.',
    'Do not output phase-to-phase dependencies here. Only within-phase task dependencies are allowed.',
    `User request: ${input.userMessage}`,
    `Object type: ${input.brief.objectType}`,
    `Domain context: ${input.brief.domainContextSummary}`,
    `Reference stages: ${input.reference.stageHints.join(' -> ')}`,
    `Current phase: ${phase.title}`,
    `Current phase objective: ${phase.objective ?? 'not provided'}`,
    `Current phase work packages: ${phase.workPackages.map((pkg) => pkg.title).join(' | ')}`,
    previousPhase ? `Previous phase: ${previousPhase.title}` : 'Previous phase: none',
    nextPhase ? `Next phase: ${nextPhase.title}` : 'Next phase: none',
    'Mark likely start tasks with sequenceRole="entry" and likely finish tasks with sequenceRole="exit" when clear.',
    'Use realistic durations in days. The dependency graph plus durations will determine dates later.',
  ].join('\n');
}

function buildExpansionRepairPrompt(
  phase: SkeletonPhase,
  expansion: ExpandedPhasePlan,
  verdict: PhaseExpansionQualityVerdict,
): string {
  return [
    'Return a fully corrected ExpandedPhasePlan JSON only.',
    'Do not output dates, startDate, endDate, or phase-to-phase dependencies.',
    `Phase: ${phase.title}`,
    `Criticism: ${verdict.reasons.join(', ')}`,
    `Metrics: tasks=${verdict.metrics.taskCount}, dependencies=${verdict.metrics.dependencyCount}, entryTasks=${verdict.metrics.entryTaskCount}, exitTasks=${verdict.metrics.exitTaskCount}, genericTitleRatio=${verdict.metrics.genericTitleRatio.toFixed(2)}`,
    'Previous expansion:',
    JSON.stringify(expansion, null, 2),
  ].join('\n');
}

function readQueryContent(result: PlannerQueryResult): string {
  if (typeof result === 'string') {
    return result;
  }
  if (typeof result.content === 'string') {
    return result.content;
  }
  throw new Error('Planner query returned an unsupported payload');
}

function parsePlannerResponse(payload: string): unknown {
  return JSON.parse(payload);
}

function slugifyKeyPart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9а-я]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function buildGeneratedTaskKey(title: unknown, index: number): string {
  const base = typeof title === 'string' ? slugifyKeyPart(title) : '';
  return `task-${base || 'generated'}-${index + 1}`;
}

function normalizeDependency(input: unknown): ProjectPlanDependency {
  if (typeof input === 'string') {
    return { nodeKey: input, type: 'FS', lagDays: 0 };
  }

  const value = (!input || typeof input !== 'object' ? {} : input) as Record<string, unknown>;
  const type = value.type;
  const lagDays = value.lagDays ?? value.lag ?? 0;

  return {
    nodeKey: typeof value.nodeKey === 'string' && value.nodeKey.trim().length > 0
      ? value.nodeKey.trim()
      : typeof value.id === 'string' && value.id.trim().length > 0
        ? value.id.trim()
        : typeof value.predecessorId === 'string' && value.predecessorId.trim().length > 0
          ? value.predecessorId.trim()
          : '',
    type: type === 'SS' || type === 'FF' || type === 'SF' ? type : 'FS',
    lagDays: Number.isInteger(lagDays) ? Number(lagDays) : 0,
  };
}

function normalizeTask(input: unknown, index: number): ExpandedPhaseTask {
  const value = (!input || typeof input !== 'object' ? {} : input) as Record<string, unknown>;
  const nodeKey = typeof value.nodeKey === 'string' && value.nodeKey.trim().length > 0
    ? value.nodeKey.trim()
    : typeof value.id === 'string' && value.id.trim().length > 0
      ? value.id.trim()
      : buildGeneratedTaskKey(value.title ?? value.name, index);
  const title = typeof value.title === 'string' && value.title.trim().length > 0
    ? value.title.trim()
    : typeof value.name === 'string' && value.name.trim().length > 0
      ? value.name.trim()
      : nodeKey;

  if (PLACEHOLDER_TITLE_PATTERN.test(title)) {
    throw new Error(`Phase expansion contains placeholder task title: ${title}`);
  }

  const dependsOnRaw = Array.isArray(value.dependsOnWithinPhase)
    ? value.dependsOnWithinPhase
    : Array.isArray(value.dependsOn)
      ? value.dependsOn
      : Array.isArray(value.dependencies)
        ? value.dependencies
        : [];

  const sequenceRole = value.sequenceRole === 'entry' || value.sequenceRole === 'intermediate' || value.sequenceRole === 'exit'
    ? value.sequenceRole
    : undefined;

  return {
    nodeKey,
    title,
    durationDays: Number.isInteger(value.durationDays) && Number(value.durationDays) > 0
      ? Number(value.durationDays)
      : Number.isInteger(value.duration) && Number(value.duration) > 0
        ? Number(value.duration)
        : 1,
    dependsOnWithinPhase: dependsOnRaw.map((dependency) => normalizeDependency(dependency)).filter((dependency) => dependency.nodeKey.length > 0),
    sequenceRole,
  };
}

function validateExpansion(raw: unknown, phaseKey: string): ExpandedPhasePlan {
  if (!raw || typeof raw !== 'object') {
    throw new Error('ExpandedPhasePlan payload must be an object');
  }

  const payload = raw as Record<string, unknown>;
  const tasksRaw = Array.isArray(payload.tasks) ? payload.tasks : [];
  const tasks = tasksRaw.map((task, index) => normalizeTask(task, index));
  const taskKeys = new Set<string>();
  for (const task of tasks) {
    if (taskKeys.has(task.nodeKey)) {
      throw new Error(`ExpandedPhasePlan contains duplicate nodeKey: ${task.nodeKey}`);
    }
    taskKeys.add(task.nodeKey);
  }

  for (const task of tasks) {
    for (const dependency of task.dependsOnWithinPhase) {
      if (!taskKeys.has(dependency.nodeKey)) {
        throw new Error(`ExpandedPhasePlan contains broken within-phase dependency: ${task.nodeKey} -> ${dependency.nodeKey}`);
      }
      if (!['FS', 'SS', 'FF', 'SF'].includes(dependency.type)) {
        throw new Error(`ExpandedPhasePlan contains unsupported dependency type: ${dependency.type as ProjectPlanDependencyType}`);
      }
    }
  }

  return {
    phaseKey: typeof payload.phaseKey === 'string' && payload.phaseKey.trim().length > 0 ? payload.phaseKey.trim() : phaseKey,
    tasks,
  };
}

async function requestExpansion(
  prompt: string,
  input: ExpandPhasesInput,
  phase: SkeletonPhase,
  stage: InitialGenerationPlannerStage,
): Promise<ExpandedPhasePlan> {
  const result = await input.sdkQuery({
    prompt,
    model: input.modelDecision.selectedModel,
    stage,
  });
  return validateExpansion(parsePlannerResponse(readQueryContent(result)), phase.phaseKey);
}

async function expandPhase(input: ExpandPhasesInput, phase: SkeletonPhase): Promise<ExpandedPhaseResult> {
  let expansion = await requestExpansion(buildExpansionPrompt(input, phase), input, phase, 'phase_expansion');
  let verdict = evaluatePhaseExpansionQuality(expansion);
  let repairAttempted = false;

  for (let attempt = 0; attempt < maxRepairAttempts && !verdict.accepted; attempt += 1) {
    repairAttempted = true;
    expansion = await requestExpansion(
      buildExpansionRepairPrompt(phase, expansion, verdict),
      input,
      phase,
      'phase_expansion_repair',
    );
    verdict = evaluatePhaseExpansionQuality(expansion);
  }

  return {
    phase,
    expansion,
    verdict,
    repairAttempted,
  };
}

export async function expandProjectPhases(input: ExpandPhasesInput): Promise<ExpandedPhaseResult[]> {
  const orderedPhases = [...input.skeleton.phases].sort((left, right) => left.orderHint - right.orderHint);
  const results: ExpandedPhaseResult[] = [];

  for (const phase of orderedPhases) {
    results.push(await expandPhase(input, phase));
  }

  return results;
}
