import type { ResolvedDomainReference } from './domain-reference.js';
import { evaluateProjectPlanQuality } from './quality-gate.js';
import type {
  GenerationBrief,
  ModelRoutingDecision,
  PlanQualityVerdict,
  ProjectPlan,
  ProjectPlanDependency,
  ProjectPlanDependencyType,
  ProjectPlanNode,
} from './types.js';

const PLACEHOLDER_TITLE_PATTERN = /^(?:этап|задача|stage|task)\s+\d+$/i;
const maxRepairAttempts = 1;

type PlannerQueryInput = {
  prompt: string;
  model: string;
  stage: 'planning' | 'repair';
};

type PlannerQueryResult = string | { content?: string };

export type PlanInitialProjectInput = {
  userMessage: string;
  brief: GenerationBrief;
  reference: ResolvedDomainReference;
  modelDecision: Pick<ModelRoutingDecision, 'selectedModel'>;
  sdkQuery: (input: PlannerQueryInput) => Promise<PlannerQueryResult>;
};

export type PlanInitialProjectResult = {
  plan: ProjectPlan;
  verdict: PlanQualityVerdict;
  repairAttempted: boolean;
};

function buildPlanningPrompt(input: Pick<PlanInitialProjectInput, 'userMessage' | 'brief' | 'reference' | 'modelDecision'>): string {
  return [
    `Model: ${input.modelDecision.selectedModel}`,
    'You are an expert construction project planner.',
    'Return strict ProjectPlan JSON only. No markdown, no prose, no code fences.',
    'ProjectPlan JSON only with keys: projectType, nodes, assumptions.',
    `User request: ${input.userMessage}`,
    `Object type: ${input.brief.objectType}`,
    `Scope signals: ${input.brief.scopeSignals.join(', ')}`,
    `Starter schedule expectation: ${input.brief.starterScheduleExpectation}`,
    `Naming ban: ${input.brief.namingBan}`,
    `Domain context: ${input.brief.domainContextSummary}`,
    `Reference stages: ${input.reference.stageHints.join(' -> ')}`,
    `Parallel workstreams: ${input.reference.parallelWorkstreams.join(' | ')}`,
    `Server inference policy: ${input.brief.serverInferencePolicy}`,
    'Use real construction naming and realistic dependencies.',
  ].join('\n');
}

function buildRepairPrompt(plan: ProjectPlan, verdict: PlanQualityVerdict, input: Pick<PlanInitialProjectInput, 'brief' | 'reference'>): string {
  return [
    'Return a fully corrected ProjectPlan JSON only.',
    `Criticism: ${verdict.reasons.join(', ')}`,
    `Object type: ${input.brief.objectType}`,
    `Domain context: ${input.reference.domainContextSummary}`,
    `Starter schedule expectation: ${input.brief.starterScheduleExpectation}`,
    'Previous plan:',
    JSON.stringify(plan, null, 2),
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

function normalizeDependency(input: unknown): ProjectPlanDependency {
  const dependency = input as Partial<ProjectPlanDependency> & { nodeKey?: unknown };
  if (!dependency || typeof dependency.nodeKey !== 'string' || dependency.nodeKey.trim().length === 0) {
    throw new Error('ProjectPlan dependency reference is missing nodeKey');
  }

  const type = dependency.type ?? 'FS';
  const lagDays = dependency.lagDays ?? 0;

  if (!['FS', 'SS', 'FF', 'SF'].includes(type)) {
    throw new Error(`ProjectPlan dependency type is invalid for ${dependency.nodeKey}`);
  }

  if (!Number.isInteger(lagDays)) {
    throw new Error(`ProjectPlan dependency lagDays must be an integer for ${dependency.nodeKey}`);
  }

  return {
    nodeKey: dependency.nodeKey,
    type: type as ProjectPlanDependencyType,
    lagDays,
  };
}

function normalizeNode(input: unknown): ProjectPlanNode {
  const node = input as Partial<ProjectPlanNode> & {
    nodeKey?: unknown;
    title?: unknown;
    kind?: unknown;
    durationDays?: unknown;
    parentNodeKey?: unknown;
    dependsOn?: unknown;
  };

  if (!node || typeof node.nodeKey !== 'string' || node.nodeKey.trim().length === 0) {
    throw new Error('ProjectPlan node is missing nodeKey');
  }

  if (typeof node.title !== 'string' || node.title.trim().length === 0) {
    throw new Error(`ProjectPlan node ${node.nodeKey} is missing title`);
  }

  if (PLACEHOLDER_TITLE_PATTERN.test(node.title.trim())) {
    throw new Error(`ProjectPlan placeholder title detected for ${node.nodeKey}`);
  }

  if (node.kind !== 'phase' && node.kind !== 'task') {
    throw new Error(`ProjectPlan node ${node.nodeKey} has invalid kind`);
  }

  if (!Number.isInteger(node.durationDays) || (node.durationDays as number) < 1) {
    throw new Error(`ProjectPlan node ${node.nodeKey} is missing durationDays`);
  }

  if (node.parentNodeKey !== undefined && typeof node.parentNodeKey !== 'string') {
    throw new Error(`ProjectPlan node ${node.nodeKey} has invalid parentNodeKey`);
  }

  const dependsOnInput = node.dependsOn ?? [];
  if (!Array.isArray(dependsOnInput)) {
    throw new Error(`ProjectPlan node ${node.nodeKey} has invalid dependsOn`);
  }

  return {
    nodeKey: node.nodeKey,
    title: node.title.trim(),
    parentNodeKey: node.parentNodeKey,
    kind: node.kind,
    durationDays: node.durationDays as number,
    dependsOn: dependsOnInput.map((dependency) => normalizeDependency(dependency)),
  };
}

function validateProjectPlan(raw: unknown): ProjectPlan {
  if (!raw || typeof raw !== 'object') {
    throw new Error('ProjectPlan payload must be an object');
  }

  const payload = raw as Partial<ProjectPlan> & {
    projectType?: unknown;
    nodes?: unknown;
    assumptions?: unknown;
  };

  if (typeof payload.projectType !== 'string' || payload.projectType.trim().length === 0) {
    throw new Error('ProjectPlan is missing projectType');
  }

  if (!Array.isArray(payload.nodes)) {
    throw new Error('ProjectPlan is missing nodes');
  }

  if (payload.assumptions !== undefined && !Array.isArray(payload.assumptions)) {
    throw new Error('ProjectPlan assumptions must be an array');
  }

  const nodes = payload.nodes.map((node) => normalizeNode(node));
  const assumptions = (payload.assumptions ?? []).map((assumption) => {
    if (typeof assumption !== 'string') {
      throw new Error('ProjectPlan assumptions must contain strings');
    }

    return assumption;
  });

  const seenNodeKeys = new Set<string>();
  for (const node of nodes) {
    if (seenNodeKeys.has(node.nodeKey)) {
      throw new Error(`ProjectPlan has duplicate nodeKey: ${node.nodeKey}`);
    }
    seenNodeKeys.add(node.nodeKey);
  }

  for (const node of nodes) {
    if (node.kind === 'task' && !node.parentNodeKey) {
      throw new Error(`ProjectPlan has top-level task: ${node.nodeKey}`);
    }

    if (node.parentNodeKey && !seenNodeKeys.has(node.parentNodeKey)) {
      throw new Error(`ProjectPlan parent reference is invalid for ${node.nodeKey}`);
    }

    for (const dependency of node.dependsOn) {
      if (!seenNodeKeys.has(dependency.nodeKey)) {
        throw new Error(`ProjectPlan dependency reference is invalid for ${node.nodeKey}: ${dependency.nodeKey}`);
      }
    }
  }

  return {
    projectType: payload.projectType,
    nodes,
    assumptions,
  };
}

async function requestPlan(
  prompt: string,
  input: PlanInitialProjectInput,
  stage: 'planning' | 'repair',
): Promise<ProjectPlan> {
  const result = await input.sdkQuery({
    prompt,
    model: input.modelDecision.selectedModel,
    stage,
  });

  return validateProjectPlan(parsePlannerResponse(readQueryContent(result)));
}

export async function planInitialProject(input: PlanInitialProjectInput): Promise<PlanInitialProjectResult> {
  const planningPrompt = buildPlanningPrompt(input);
  const firstPlan = await requestPlan(planningPrompt, input, 'planning');
  const firstVerdict = evaluateProjectPlanQuality(firstPlan, input.brief);

  if (firstVerdict.accepted) {
    return {
      plan: firstPlan,
      verdict: firstVerdict,
      repairAttempted: false,
    };
  }

  let repairAttempt = 0;
  let repairedPlan = firstPlan;
  let repairedVerdict = firstVerdict;

  while (repairAttempt < maxRepairAttempts && !repairedVerdict.accepted) {
    repairAttempt += 1;
    const repairPrompt = buildRepairPrompt(repairedPlan, repairedVerdict, input);
    repairedPlan = await requestPlan(repairPrompt, input, 'repair');
    repairedVerdict = evaluateProjectPlanQuality(repairedPlan, input.brief);
  }

  return {
    plan: repairedPlan,
    verdict: repairedVerdict,
    repairAttempted: repairAttempt > 0,
  };
}
