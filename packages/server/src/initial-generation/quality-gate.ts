import type {
  GenerationBrief,
  PlanQualityMetrics,
  PlanQualityVerdict,
  ProjectPlan,
  ProjectPlanNode,
  RepairReason,
} from './types.js';

const PLACEHOLDER_TITLE_PATTERN = /^(?:этап|задача|stage|task)\s+\d+$/i;
const GENERIC_TITLE_PATTERN = /^(?:строительн(?:ые)?\s+работы|общ(?:ие)?\s+работы|работы|construction works|general works|phase|stage)$/i;

function getPhaseNodes(plan: ProjectPlan): ProjectPlanNode[] {
  return plan.nodes.filter((node) => node.kind === 'phase' && !node.parentNodeKey);
}

function getTaskNodes(plan: ProjectPlan): ProjectPlanNode[] {
  return plan.nodes.filter((node) => node.kind === 'task');
}

function getRootPhaseKey(plan: ProjectPlan, node: ProjectPlanNode): string | null {
  if (!node.parentNodeKey) {
    return node.kind === 'phase' ? node.nodeKey : null;
  }

  const parent = plan.nodes.find((candidate) => candidate.nodeKey === node.parentNodeKey);
  if (!parent) {
    return null;
  }

  return getRootPhaseKey(plan, parent);
}

function countCrossPhaseDependencies(plan: ProjectPlan): number {
  const nodesByKey = new Map(plan.nodes.map((node) => [node.nodeKey, node]));

  return getTaskNodes(plan).reduce((count, node) => {
    const sourcePhase = getRootPhaseKey(plan, node);

    return count + node.dependsOn.filter((dependency) => {
      const target = nodesByKey.get(dependency.nodeKey);
      if (!target) {
        return false;
      }

      return sourcePhase !== null && getRootPhaseKey(plan, target) !== sourcePhase;
    }).length;
  }, 0);
}

function countGenericTitles(plan: ProjectPlan): number {
  return plan.nodes.filter((node) => {
    const title = node.title.trim();
    return PLACEHOLDER_TITLE_PATTERN.test(title) || GENERIC_TITLE_PATTERN.test(title);
  }).length;
}

function inferObjectTypeSignalCoverage(brief: GenerationBrief, plan: ProjectPlan): number {
  if (!brief.scopeSignals.includes('explicit_area') && !brief.scopeSignals.includes('material_mentioned')) {
    return 1;
  }

  const messageSignals = new Set(
    `${brief.objectType} ${brief.domainContextSummary}`.toLowerCase().split(/[^a-zа-я0-9]+/i).filter((token) => token.length >= 4),
  );

  if (messageSignals.size === 0) {
    return 1;
  }

  const planText = plan.nodes.map((node) => node.title.toLowerCase()).join(' ');
  const matchedSignals = [...messageSignals].filter((signal) => planText.includes(signal));
  return matchedSignals.length / messageSignals.size;
}

export function collectProjectPlanMetrics(plan: ProjectPlan, brief: GenerationBrief): PlanQualityMetrics {
  const phaseCount = getPhaseNodes(plan).length;
  const taskNodes = getTaskNodes(plan);
  const taskNodeCount = taskNodes.length;
  const dependencyCount = taskNodes.reduce((sum, node) => sum + node.dependsOn.length, 0);
  const crossPhaseDependencyCount = countCrossPhaseDependencies(plan);
  const genericTitleCount = countGenericTitles(plan);
  const genericTitleRatio = plan.nodes.length === 0 ? 1 : genericTitleCount / plan.nodes.length;
  const objectTypeSignalCoverage = inferObjectTypeSignalCoverage(brief, plan);
  const broadRequest = brief.scopeSignals.includes('broad_request') || brief.scopeSignals.includes('starter_generation_request');
  const passesProductAdequacyFloor = !broadRequest || (
    phaseCount >= 4
    && taskNodeCount >= 8
    && dependencyCount >= 3
    && crossPhaseDependencyCount >= 2
    && genericTitleRatio <= 0.2
    && objectTypeSignalCoverage >= 0.08
  );

  return {
    phaseCount,
    taskNodeCount,
    dependencyCount,
    crossPhaseDependencyCount,
    genericTitleCount,
    genericTitleRatio,
    objectTypeSignalCoverage,
    passesProductAdequacyFloor,
  };
}

export function evaluateProjectPlanQuality(plan: ProjectPlan, brief: GenerationBrief): PlanQualityVerdict {
  const reasons: RepairReason[] = [];
  const metrics = collectProjectPlanMetrics(plan, brief);
  const broadRequest = brief.scopeSignals.includes('broad_request') || brief.scopeSignals.includes('starter_generation_request');

  if (metrics.phaseCount < 2 || metrics.taskNodeCount < 2) {
    reasons.push('missing_hierarchy');
  }

  if (metrics.genericTitleCount > 0) {
    reasons.push('placeholder_titles');
  }

  if (metrics.phaseCount < (broadRequest ? 4 : 2) || metrics.taskNodeCount < (broadRequest ? 8 : 4)) {
    reasons.push('weak_coverage');
  }

  if (metrics.dependencyCount < Math.max(1, Math.floor(metrics.taskNodeCount / 2))) {
    reasons.push('weak_sequence');
  }

  if (broadRequest && metrics.phaseCount < 4) {
    reasons.push('too_few_phases');
  }

  if (broadRequest && metrics.taskNodeCount < 8) {
    reasons.push('too_few_tasks');
  }

  if (broadRequest && metrics.dependencyCount < 3) {
    reasons.push('missing_dependency_graph');
  }

  if (broadRequest && metrics.crossPhaseDependencyCount < 2) {
    reasons.push('weak_cross_phase_sequence');
  }

  if (metrics.genericTitleRatio > 0.2) {
    reasons.push('weak_subject_specificity');
  }

  if (broadRequest && metrics.objectTypeSignalCoverage < 0.08) {
    reasons.push('weak_object_scale_fit');
  }

  const uniqueReasons = [...new Set(reasons)];

  return {
    accepted: uniqueReasons.length === 0,
    reasons: uniqueReasons,
    score: Math.max(0, 100 - uniqueReasons.length * 12.5),
    metrics,
  };
}
