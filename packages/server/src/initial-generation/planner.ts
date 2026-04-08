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
    `Metrics: phases=${verdict.metrics.phaseCount}, tasks=${verdict.metrics.taskNodeCount}, dependencies=${verdict.metrics.dependencyCount}, crossPhaseDependencies=${verdict.metrics.crossPhaseDependencyCount}, genericTitleRatio=${verdict.metrics.genericTitleRatio.toFixed(2)}`,
    `Object type: ${input.brief.objectType}`,
    `Domain context: ${input.reference.domainContextSummary}`,
    `Starter schedule expectation: ${input.brief.starterScheduleExpectation}`,
    'Broad starter schedules must retain at least 4 top-level phases, 8 task nodes, 3 dependencies, and 2 cross-phase dependency links.',
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

function slugifyNodeKeyPart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9а-я]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function buildGeneratedNodeKey(input: { title?: unknown; kind?: unknown; index: number }): string {
  const title = typeof input.title === 'string' ? slugifyNodeKeyPart(input.title) : '';
  const kind = input.kind === 'phase' ? 'phase' : 'task';
  return `${kind}-${title || 'generated'}-${input.index + 1}`;
}

function normalizeDependencyInput(input: unknown): unknown {
  if (typeof input === 'string') {
    return { nodeKey: input, type: 'FS', lagDays: 0 };
  }

  if (!input || typeof input !== 'object') {
    return input;
  }

  const dependency = input as Record<string, unknown>;
  return {
    nodeKey: dependency.nodeKey ?? dependency.id ?? dependency.key ?? dependency.taskId ?? dependency.predecessorId,
    type: dependency.type ?? dependency.dependencyType ?? 'FS',
    lagDays: dependency.lagDays ?? dependency.lag ?? 0,
  };
}

function normalizeLooseNode(input: unknown, index: number, parentNodeKey?: string): Record<string, unknown> {
  const node = (!input || typeof input !== 'object' ? {} : input) as Record<string, unknown>;
  const kind = node.kind ?? node.type ?? node.nodeType ?? (parentNodeKey ? 'task' : 'phase');
  const nodeKey = node.nodeKey ?? node.id ?? node.key ?? node.tempId ?? buildGeneratedNodeKey({
    title: node.title ?? node.name,
    kind,
    index,
  });
  const dependsOn = node.dependsOn ?? node.dependencies ?? node.predecessors ?? [];

  return {
    nodeKey,
    title: node.title ?? node.name,
    parentNodeKey: node.parentNodeKey ?? node.parentId ?? parentNodeKey,
    kind,
    durationDays: node.durationDays ?? node.duration ?? node.days ?? 1,
    dependsOn: Array.isArray(dependsOn) ? dependsOn.map((dependency) => normalizeDependencyInput(dependency)) : [],
  };
}

function flattenHierarchicalNodes(rawNodes: unknown[]): unknown[] {
  const flattened: unknown[] = [];

  rawNodes.forEach((rawNode, index) => {
    const normalizedNode = normalizeLooseNode(rawNode, index);
    flattened.push(normalizedNode);

    const node = (!rawNode || typeof rawNode !== 'object' ? {} : rawNode) as Record<string, unknown>;
    const childTasks = Array.isArray(node.tasks) ? node.tasks : Array.isArray(node.children) ? node.children : [];
    childTasks.forEach((child, childIndex) => {
      flattened.push(normalizeLooseNode(child, childIndex, normalizedNode.nodeKey as string));
    });
  });

  return flattened;
}

function normalizeLooseProjectPlan(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') {
    return raw;
  }

  const payload = raw as Record<string, unknown>;
  const nodesSource = Array.isArray(payload.nodes)
    ? payload.nodes
    : Array.isArray(payload.phases)
      ? payload.phases
      : null;

  if (!nodesSource) {
    return raw;
  }

  return {
    projectType: payload.projectType ?? payload.project_type ?? payload.type ?? 'construction',
    assumptions: Array.isArray(payload.assumptions) ? payload.assumptions : [],
    nodes: flattenHierarchicalNodes(nodesSource),
  };
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
  const normalizedRaw = normalizeLooseProjectPlan(raw);
  if (!normalizedRaw || typeof normalizedRaw !== 'object') {
    throw new Error('ProjectPlan payload must be an object');
  }

  const payload = normalizedRaw as Partial<ProjectPlan> & {
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
  const content = readQueryContent(result);

  try {
    return validateProjectPlan(parsePlannerResponse(content));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const preview = content.slice(0, 600);
    throw new Error(`${message}; planner_response_preview=${preview}`);
  }
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
