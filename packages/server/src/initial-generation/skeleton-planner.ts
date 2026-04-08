import type { ResolvedDomainReference } from './domain-reference.js';
import { evaluateSkeletonQuality } from './quality-gate.js';
import type {
  GenerationBrief,
  InitialGenerationPlannerStage,
  ModelRoutingDecision,
  ProjectWbsSkeleton,
  SkeletonPhase,
  SkeletonQualityVerdict,
  SkeletonWorkPackage,
} from './types.js';

const PLACEHOLDER_TITLE_PATTERN = /^(?:этап|задача|stage|task)\s+\d+$/i;
const maxRepairAttempts = 1;

type PlannerQueryInput = {
  prompt: string;
  model: string;
  stage: InitialGenerationPlannerStage;
};

type PlannerQueryResult = string | { content?: string };

export type PlanSkeletonInput = {
  userMessage: string;
  brief: GenerationBrief;
  reference: ResolvedDomainReference;
  modelDecision: Pick<ModelRoutingDecision, 'selectedModel'>;
  sdkQuery: (input: PlannerQueryInput) => Promise<PlannerQueryResult>;
};

export type PlanSkeletonResult = {
  skeleton: ProjectWbsSkeleton;
  verdict: SkeletonQualityVerdict;
  repairAttempted: boolean;
};

function buildSkeletonPrompt(input: Pick<PlanSkeletonInput, 'userMessage' | 'brief' | 'reference' | 'modelDecision'>): string {
  return [
    `Model: ${input.modelDecision.selectedModel}`,
    'You are an expert construction WBS planner.',
    'Return strict ProjectWbsSkeleton JSON only. No markdown, no prose, no code fences.',
    'ProjectWbsSkeleton JSON only with keys: projectType, assumptions, phases.',
    'Each phase must contain: phaseKey, title, objective?, orderHint, dependsOnPhaseKeys?, workPackages.',
    'Each work package must contain: workPackageKey, title, objective?.',
    'Do not output dates, startDate, endDate, calendars, milestones, or compiler-ready task graphs.',
    'Do not output task-level dependencies or executable sequencing.',
    'This stage defines only high-level phases and work packages.',
    `User request: ${input.userMessage}`,
    `Object type: ${input.brief.objectType}`,
    `Scope signals: ${input.brief.scopeSignals.join(', ')}`,
    `Starter schedule expectation: ${input.brief.starterScheduleExpectation}`,
    `Naming ban: ${input.brief.namingBan}`,
    `Domain context: ${input.brief.domainContextSummary}`,
    `Reference stages: ${input.reference.stageHints.join(' -> ')}`,
    `Parallel workstreams: ${input.reference.parallelWorkstreams.join(' | ')}`,
    `Server inference policy: ${input.brief.serverInferencePolicy}`,
    'For broad construction generation provide at least 4 top-level phases and at least 3 work packages in each major phase.',
    'Requested components such as garage or floor count must be reflected explicitly in phase titles or work packages.',
  ].join('\n');
}

function buildSkeletonRepairPrompt(
  skeleton: ProjectWbsSkeleton,
  verdict: SkeletonQualityVerdict,
  input: Pick<PlanSkeletonInput, 'brief' | 'reference' | 'userMessage'>,
): string {
  return [
    'Return a fully corrected ProjectWbsSkeleton JSON only.',
    'Do not output dates, startDate, endDate, or executable task graphs.',
    `User request: ${input.userMessage}`,
    `Criticism: ${verdict.reasons.join(', ')}`,
    `Metrics: phases=${verdict.metrics.phaseCount}, workPackages=${verdict.metrics.workPackageCount}, minWorkPackagesPerPhase=${verdict.metrics.minWorkPackagesPerPhase}, genericTitleRatio=${verdict.metrics.genericTitleRatio.toFixed(2)}, requestedComponentCoverage=${verdict.metrics.requestedComponentCoverage.toFixed(2)}`,
    `Object type: ${input.brief.objectType}`,
    `Domain context: ${input.reference.domainContextSummary}`,
    'Broad starter schedules must retain at least 4 phases and cover requested object parts explicitly.',
    'Previous skeleton:',
    JSON.stringify(skeleton, null, 2),
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

function buildGeneratedPhaseKey(title: unknown, index: number): string {
  const base = typeof title === 'string' ? slugifyKeyPart(title) : '';
  return `phase-${base || 'generated'}-${index + 1}`;
}

function buildGeneratedWorkPackageKey(title: unknown, index: number): string {
  const base = typeof title === 'string' ? slugifyKeyPart(title) : '';
  return `work-package-${base || 'generated'}-${index + 1}`;
}

function normalizeWorkPackage(input: unknown, index: number): SkeletonWorkPackage {
  const value = (!input || typeof input !== 'object' ? {} : input) as Record<string, unknown>;
  const workPackageKey = typeof value.workPackageKey === 'string' && value.workPackageKey.trim().length > 0
    ? value.workPackageKey.trim()
    : typeof value.id === 'string' && value.id.trim().length > 0
      ? value.id.trim()
      : buildGeneratedWorkPackageKey(value.title ?? value.name, index);
  const title = typeof value.title === 'string' && value.title.trim().length > 0
    ? value.title.trim()
    : typeof value.name === 'string' && value.name.trim().length > 0
      ? value.name.trim()
      : workPackageKey;

  if (PLACEHOLDER_TITLE_PATTERN.test(title)) {
    throw new Error(`Skeleton contains placeholder work package title: ${title}`);
  }

  return {
    workPackageKey,
    title,
    objective: typeof value.objective === 'string' && value.objective.trim().length > 0 ? value.objective.trim() : undefined,
  };
}

function normalizePhase(input: unknown, index: number): SkeletonPhase {
  const value = (!input || typeof input !== 'object' ? {} : input) as Record<string, unknown>;
  const phaseKey = typeof value.phaseKey === 'string' && value.phaseKey.trim().length > 0
    ? value.phaseKey.trim()
    : typeof value.id === 'string' && value.id.trim().length > 0
      ? value.id.trim()
      : buildGeneratedPhaseKey(value.title ?? value.name, index);
  const title = typeof value.title === 'string' && value.title.trim().length > 0
    ? value.title.trim()
    : typeof value.name === 'string' && value.name.trim().length > 0
      ? value.name.trim()
      : phaseKey;

  if (PLACEHOLDER_TITLE_PATTERN.test(title)) {
    throw new Error(`Skeleton contains placeholder phase title: ${title}`);
  }

  const workPackagesRaw = Array.isArray(value.workPackages)
    ? value.workPackages
    : Array.isArray(value.children)
      ? value.children
      : Array.isArray(value.work_packages)
        ? value.work_packages
        : [];

  return {
    phaseKey,
    title,
    objective: typeof value.objective === 'string' && value.objective.trim().length > 0 ? value.objective.trim() : undefined,
    orderHint: Number.isInteger(value.orderHint) ? Number(value.orderHint) : index + 1,
    dependsOnPhaseKeys: Array.isArray(value.dependsOnPhaseKeys)
      ? value.dependsOnPhaseKeys.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : Array.isArray(value.dependsOn)
        ? value.dependsOn.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        : undefined,
    workPackages: workPackagesRaw.map((item, workPackageIndex) => normalizeWorkPackage(item, workPackageIndex)),
  };
}

function validateSkeleton(raw: unknown): ProjectWbsSkeleton {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Skeleton payload must be an object');
  }

  const payload = raw as Record<string, unknown>;
  const phasesRaw = Array.isArray(payload.phases) ? payload.phases : [];
  const phases = phasesRaw.map((phase, index) => normalizePhase(phase, index));
  const phaseKeys = new Set<string>();
  for (const phase of phases) {
    if (phaseKeys.has(phase.phaseKey)) {
      throw new Error(`Skeleton contains duplicate phaseKey: ${phase.phaseKey}`);
    }
    phaseKeys.add(phase.phaseKey);
  }

  const assumptions = Array.isArray(payload.assumptions)
    ? payload.assumptions.filter((item): item is string => typeof item === 'string')
    : [];

  return {
    projectType: typeof payload.projectType === 'string' && payload.projectType.trim().length > 0
      ? payload.projectType.trim()
      : 'construction',
    assumptions,
    phases,
  };
}

async function requestSkeleton(
  prompt: string,
  input: PlanSkeletonInput,
  stage: InitialGenerationPlannerStage,
): Promise<ProjectWbsSkeleton> {
  const result = await input.sdkQuery({
    prompt,
    model: input.modelDecision.selectedModel,
    stage,
  });
  return validateSkeleton(parsePlannerResponse(readQueryContent(result)));
}

export async function planProjectSkeleton(input: PlanSkeletonInput): Promise<PlanSkeletonResult> {
  const firstSkeleton = await requestSkeleton(buildSkeletonPrompt(input), input, 'skeleton');
  const firstVerdict = evaluateSkeletonQuality(firstSkeleton, input.brief, input.userMessage);

  if (firstVerdict.accepted) {
    return {
      skeleton: firstSkeleton,
      verdict: firstVerdict,
      repairAttempted: false,
    };
  }

  let repairAttempted = false;
  let latestSkeleton = firstSkeleton;
  let latestVerdict = firstVerdict;

  for (let attempt = 0; attempt < maxRepairAttempts && !latestVerdict.accepted; attempt += 1) {
    repairAttempted = true;
    latestSkeleton = await requestSkeleton(
      buildSkeletonRepairPrompt(latestSkeleton, latestVerdict, input),
      input,
      'skeleton_repair',
    );
    latestVerdict = evaluateSkeletonQuality(latestSkeleton, input.brief, input.userMessage);
  }

  return {
    skeleton: latestSkeleton,
    verdict: latestVerdict,
    repairAttempted,
  };
}
