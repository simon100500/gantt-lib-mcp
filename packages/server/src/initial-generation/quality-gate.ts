import type {
  ExecutableProjectPlan,
  ExpandedPhasePlan,
  GenerationBrief,
  PhaseExpansionQualityMetrics,
  PhaseExpansionQualityVerdict,
  PlanQualityMetrics,
  PlanQualityVerdict,
  ProjectPlanNode,
  ProjectWbsSkeleton,
  SkeletonQualityMetrics,
  SkeletonQualityVerdict,
} from './types.js';

const PLACEHOLDER_TITLE_PATTERN = /^(?:этап|задача|stage|task)\s+\d+$/i;
const GENERIC_TITLE_PATTERN = /^(?:строительн(?:ые)?\s+работы|общ(?:ие)?\s+работы|работы|construction works|general works|phase|stage)$/i;

function isBroadRequest(brief: GenerationBrief): boolean {
  return brief.scopeSignals.includes('broad_request') || brief.scopeSignals.includes('starter_generation_request');
}

function countGenericTitles(values: string[]): number {
  return values.filter((value) => {
    const title = value.trim();
    return PLACEHOLDER_TITLE_PATTERN.test(title) || GENERIC_TITLE_PATTERN.test(title);
  }).length;
}

function inferSignalCoverage(brief: GenerationBrief, text: string): number {
  if (!brief.scopeSignals.includes('explicit_area') && !brief.scopeSignals.includes('material_mentioned')) {
    return 1;
  }

  const messageSignals = new Set(
    `${brief.objectType} ${brief.domainContextSummary}`.toLowerCase().split(/[^a-zа-я0-9]+/i).filter((token) => token.length >= 4),
  );
  if (messageSignals.size === 0) {
    return 1;
  }

  const normalizedText = text.toLowerCase();
  const matchedSignals = [...messageSignals].filter((signal) => normalizedText.includes(signal));
  return matchedSignals.length / messageSignals.size;
}

function inferRequestedComponentCoverage(userMessage: string, text: string): number {
  const requestedSignals = new Set(
    userMessage
      .toLowerCase()
      .split(/[^a-zа-я0-9]+/i)
      .filter((token) => token.length >= 4 || token === '3'),
  );

  if (requestedSignals.size === 0) {
    return 1;
  }

  const normalizedText = text.toLowerCase();
  const matchedSignals = [...requestedSignals].filter((signal) => normalizedText.includes(signal));
  return matchedSignals.length / requestedSignals.size;
}

export function collectSkeletonMetrics(
  skeleton: ProjectWbsSkeleton,
  brief: GenerationBrief,
  userMessage: string,
): SkeletonQualityMetrics {
  const phaseCount = skeleton.phases.length;
  const workPackageCount = skeleton.phases.reduce((sum, phase) => sum + phase.workPackages.length, 0);
  const minWorkPackagesPerPhase = skeleton.phases.length === 0
    ? 0
    : Math.min(...skeleton.phases.map((phase) => phase.workPackages.length));
  const titles = skeleton.phases.flatMap((phase) => [phase.title, ...phase.workPackages.map((pkg) => pkg.title)]);
  const genericTitleCount = countGenericTitles(titles);
  const genericTitleRatio = titles.length === 0 ? 1 : genericTitleCount / titles.length;
  const objectTypeSignalCoverage = inferSignalCoverage(brief, titles.join(' '));
  const requestedComponentCoverage = inferRequestedComponentCoverage(userMessage, titles.join(' '));

  return {
    phaseCount,
    workPackageCount,
    minWorkPackagesPerPhase,
    genericTitleCount,
    genericTitleRatio,
    objectTypeSignalCoverage,
    requestedComponentCoverage,
  };
}

export function evaluateSkeletonQuality(
  skeleton: ProjectWbsSkeleton,
  brief: GenerationBrief,
  userMessage: string,
): SkeletonQualityVerdict {
  const metrics = collectSkeletonMetrics(skeleton, brief, userMessage);
  const reasons: SkeletonQualityVerdict['reasons'] = [];
  const broadRequest = isBroadRequest(brief);

  if (metrics.phaseCount < (broadRequest ? 4 : 2)) {
    reasons.push('too_few_phases');
  }

  if (metrics.workPackageCount < (broadRequest ? 12 : 4) || metrics.minWorkPackagesPerPhase < (broadRequest ? 2 : 1)) {
    reasons.push('too_few_work_packages');
  }

  if (metrics.genericTitleCount > 0) {
    reasons.push('placeholder_titles');
  }

  if (metrics.objectTypeSignalCoverage < (broadRequest ? 0.08 : 0.04)) {
    reasons.push('weak_object_fit');
  }

  if (metrics.requestedComponentCoverage < (broadRequest ? 0.2 : 0.1)) {
    reasons.push('missing_requested_component');
  }

  if (broadRequest && metrics.minWorkPackagesPerPhase < 3) {
    reasons.push('weak_phase_decomposition');
  }

  const uniqueReasons = [...new Set(reasons)];
  return {
    accepted: uniqueReasons.length === 0,
    reasons: uniqueReasons,
    score: Math.max(0, 100 - uniqueReasons.length * 15),
    metrics,
  };
}

export function collectPhaseExpansionMetrics(expansion: ExpandedPhasePlan): PhaseExpansionQualityMetrics {
  const dependencyCount = expansion.tasks.reduce((sum, task) => sum + task.dependsOnWithinPhase.length, 0);
  const dependencyTargets = new Set(expansion.tasks.flatMap((task) => task.dependsOnWithinPhase.map((dependency) => dependency.nodeKey)));
  const entryTaskCount = expansion.tasks.filter((task) => task.sequenceRole === 'entry' || task.dependsOnWithinPhase.length === 0).length;
  const exitTaskCount = expansion.tasks.filter((task) => task.sequenceRole === 'exit' || !dependencyTargets.has(task.nodeKey)).length;
  const genericTitleCount = countGenericTitles(expansion.tasks.map((task) => task.title));
  const genericTitleRatio = expansion.tasks.length === 0 ? 1 : genericTitleCount / expansion.tasks.length;

  return {
    taskCount: expansion.tasks.length,
    dependencyCount,
    entryTaskCount,
    exitTaskCount,
    genericTitleCount,
    genericTitleRatio,
  };
}

export function evaluatePhaseExpansionQuality(expansion: ExpandedPhasePlan): PhaseExpansionQualityVerdict {
  const metrics = collectPhaseExpansionMetrics(expansion);
  const reasons: PhaseExpansionQualityVerdict['reasons'] = [];
  const taskKeys = new Set(expansion.tasks.map((task) => task.nodeKey));

  if (metrics.taskCount < 3) {
    reasons.push('too_few_tasks');
  }

  if (metrics.genericTitleCount > 0) {
    reasons.push('placeholder_titles');
  }

  if (metrics.entryTaskCount < 1) {
    reasons.push('missing_entry_task');
  }

  if (metrics.exitTaskCount < 1) {
    reasons.push('missing_exit_task');
  }

  const invalidDependency = expansion.tasks.some((task) =>
    task.dependsOnWithinPhase.some((dependency) => !taskKeys.has(dependency.nodeKey)),
  );
  if (invalidDependency) {
    reasons.push('broken_within_phase_dependency');
  }

  const selfDependency = expansion.tasks.some((task) =>
    task.dependsOnWithinPhase.some((dependency) => dependency.nodeKey === task.nodeKey),
  );
  if (selfDependency) {
    reasons.push('self_dependency');
  }

  if (metrics.dependencyCount < Math.max(1, metrics.taskCount - 2)) {
    reasons.push('weak_within_phase_sequence');
  }

  const uniqueReasons = [...new Set(reasons)];
  return {
    accepted: uniqueReasons.length === 0,
    reasons: uniqueReasons,
    score: Math.max(0, 100 - uniqueReasons.length * 16),
    metrics,
  };
}

function getPhaseNodes(plan: ExecutableProjectPlan): ProjectPlanNode[] {
  return plan.nodes.filter((node) => node.kind === 'phase' && !node.parentNodeKey);
}

function getTaskNodes(plan: ExecutableProjectPlan): ProjectPlanNode[] {
  return plan.nodes.filter((node) => node.kind === 'task');
}

function getRootPhaseKey(plan: ExecutableProjectPlan, node: ProjectPlanNode): string | null {
  if (!node.parentNodeKey) {
    return node.kind === 'phase' ? node.nodeKey : null;
  }

  const parent = plan.nodes.find((candidate) => candidate.nodeKey === node.parentNodeKey);
  if (!parent) {
    return null;
  }

  return getRootPhaseKey(plan, parent);
}

function countCrossPhaseDependencies(plan: ExecutableProjectPlan): number {
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

function hasTaskCycle(plan: ExecutableProjectPlan): boolean {
  const tasks = getTaskNodes(plan);
  const dependencyMap = new Map(tasks.map((task) => [task.nodeKey, task.dependsOn.map((dependency) => dependency.nodeKey)]));
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (nodeKey: string): boolean => {
    if (visiting.has(nodeKey)) {
      return true;
    }
    if (visited.has(nodeKey)) {
      return false;
    }

    visiting.add(nodeKey);
    for (const dependency of dependencyMap.get(nodeKey) ?? []) {
      if (visit(dependency)) {
        return true;
      }
    }
    visiting.delete(nodeKey);
    visited.add(nodeKey);
    return false;
  };

  return tasks.some((task) => visit(task.nodeKey));
}

export function collectProjectPlanMetrics(plan: ExecutableProjectPlan, brief: GenerationBrief): PlanQualityMetrics {
  const phaseCount = getPhaseNodes(plan).length;
  const taskNodes = getTaskNodes(plan);
  const taskNodeCount = taskNodes.length;
  const dependencyCount = taskNodes.reduce((sum, node) => sum + node.dependsOn.length, 0);
  const crossPhaseDependencyCount = countCrossPhaseDependencies(plan);
  const genericTitleCount = countGenericTitles(plan.nodes.map((node) => node.title));
  const genericTitleRatio = plan.nodes.length === 0 ? 1 : genericTitleCount / plan.nodes.length;
  const objectTypeSignalCoverage = inferSignalCoverage(brief, plan.nodes.map((node) => node.title).join(' '));
  const broadRequest = isBroadRequest(brief);
  const passesProductAdequacyFloor = !broadRequest || (
    phaseCount >= 4
    && taskNodeCount >= 12
    && dependencyCount >= 8
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

export function evaluateProjectPlanQuality(plan: ExecutableProjectPlan, brief: GenerationBrief): PlanQualityVerdict {
  const reasons: PlanQualityVerdict['reasons'] = [];
  const metrics = collectProjectPlanMetrics(plan, brief);
  const broadRequest = isBroadRequest(brief);

  if (metrics.phaseCount < 2 || metrics.taskNodeCount < 2) {
    reasons.push('missing_hierarchy');
  }

  if (metrics.genericTitleCount > 0) {
    reasons.push('placeholder_titles');
  }

  if (metrics.phaseCount < (broadRequest ? 4 : 2) || metrics.taskNodeCount < (broadRequest ? 6 : 4)) {
    reasons.push('weak_coverage');
  }

  if (metrics.dependencyCount < Math.max(1, Math.floor(metrics.taskNodeCount / 2))) {
    reasons.push('weak_sequence');
  }

  if (broadRequest && metrics.phaseCount < 4) {
    reasons.push('too_few_phases');
  }

  if (broadRequest && metrics.taskNodeCount < 12) {
    reasons.push('too_few_tasks');
  }

  if (broadRequest && metrics.dependencyCount < 8) {
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

  if (plan.nodes.some((node) => node.kind === 'phase' && node.dependsOn.length > 0)) {
    reasons.push('phase_has_dependencies');
  }

  if (hasTaskCycle(plan)) {
    reasons.push('graph_cycle_detected');
  }

  const uniqueReasons = [...new Set(reasons)];
  return {
    accepted: uniqueReasons.length === 0,
    reasons: uniqueReasons,
    score: Math.max(0, 100 - uniqueReasons.length * 12.5),
    metrics,
  };
}
