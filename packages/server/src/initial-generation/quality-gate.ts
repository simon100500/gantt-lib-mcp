import type {
  ExecutableProjectPlan,
  GenerationBrief,
  ProjectPlanNode,
  ScheduledProjectPlan,
  SchedulingQualityMetrics,
  SchedulingQualityVerdict,
  StructuredProjectPlan,
  StructureQualityMetrics,
  StructureQualityVerdict,
} from './types.js';
import { isEnumerativeTitle, isTitleTooLong } from './title-policy.js';

const PLACEHOLDER_TITLE_PATTERN = /^(?:этап|подэтап|задача|phase|subphase|task)\s+\d+$/i;
const GENERIC_TITLE_PATTERN = /^(?:строительн(?:ые)?\s+работы|общ(?:ие)?\s+работы|работы|construction works|general works|phase|stage|subphase|task)$/i;
const MAX_TOP_LEVEL_PHASES = 7;
const MAX_TASKS = 40;

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
      .filter((token) => token.length >= 4 || /^\d+$/.test(token)),
  );

  if (requestedSignals.size === 0) {
    return 1;
  }

  const normalizedText = text.toLowerCase();
  const matchedSignals = [...requestedSignals].filter((signal) => normalizedText.includes(signal));
  return matchedSignals.length / requestedSignals.size;
}

function getTaskNodes(plan: ExecutableProjectPlan): ProjectPlanNode[] {
  return plan.nodes.filter((node) => node.kind === 'task');
}

function getNodeMap(plan: ExecutableProjectPlan): Map<string, ProjectPlanNode> {
  return new Map(plan.nodes.map((node) => [node.nodeKey, node]));
}

function getRootPhaseKey(plan: ExecutableProjectPlan, node: ProjectPlanNode): string | null {
  if (!node.parentNodeKey) {
    return node.kind === 'phase' ? node.nodeKey : null;
  }

  const parent = getNodeMap(plan).get(node.parentNodeKey);
  if (!parent) {
    return null;
  }

  return getRootPhaseKey(plan, parent);
}

function countCrossPhaseDependencies(plan: ExecutableProjectPlan): number {
  const nodesByKey = getNodeMap(plan);

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

function titlesAreTooLongOrEnumerative(values: string[]): boolean {
  return values.some((value) => isTitleTooLong(value) || isEnumerativeTitle(value));
}

function getStructureSignature(structure: StructuredProjectPlan | ScheduledProjectPlan): string[] {
  const signature: string[] = [];

  for (const phase of structure.phases) {
    signature.push(`phase:${phase.phaseKey}:${phase.title}`);
    for (const subphase of phase.subphases) {
      signature.push(`subphase:${phase.phaseKey}:${subphase.subphaseKey}:${subphase.title}`);
      for (const task of subphase.tasks) {
        signature.push(`task:${phase.phaseKey}:${subphase.subphaseKey}:${task.taskKey}:${task.title}`);
      }
    }
  }

  return signature;
}

export function collectStructureMetrics(
  structure: StructuredProjectPlan,
  brief: GenerationBrief,
  userMessage: string,
): StructureQualityMetrics {
  const phaseCount = structure.phases.length;
  const subphaseCount = structure.phases.reduce((sum, phase) => sum + phase.subphases.length, 0);
  const taskCount = structure.phases.reduce(
    (sum, phase) => sum + phase.subphases.reduce((subphaseSum, subphase) => subphaseSum + subphase.tasks.length, 0),
    0,
  );
  const minSubphasesPerPhase = phaseCount === 0
    ? 0
    : Math.min(...structure.phases.map((phase) => phase.subphases.length));
  const minTasksPerSubphase = subphaseCount === 0
    ? 0
    : Math.min(...structure.phases.flatMap((phase) => phase.subphases.map((subphase) => subphase.tasks.length)));
  const titles = structure.phases.flatMap((phase) => [
    phase.title,
    ...phase.subphases.flatMap((subphase) => [subphase.title, ...subphase.tasks.map((task) => task.title)]),
  ]);
  const genericTitleCount = countGenericTitles(titles);
  const genericTitleRatio = titles.length === 0 ? 1 : genericTitleCount / titles.length;
  const objectTypeSignalCoverage = inferSignalCoverage(brief, titles.join(' '));
  const requestedComponentCoverage = inferRequestedComponentCoverage(userMessage, titles.join(' '));

  return {
    phaseCount,
    subphaseCount,
    taskCount,
    minSubphasesPerPhase,
    minTasksPerSubphase,
    genericTitleCount,
    genericTitleRatio,
    objectTypeSignalCoverage,
    requestedComponentCoverage,
  };
}

export function evaluateStructureQuality(
  structure: StructuredProjectPlan,
  brief: GenerationBrief,
  userMessage: string,
): StructureQualityVerdict {
  const metrics = collectStructureMetrics(structure, brief, userMessage);
  const reasons: StructureQualityVerdict['reasons'] = [];
  const broadRequest = isBroadRequest(brief);

  if (metrics.phaseCount < (broadRequest ? 4 : 2)) {
    reasons.push('too_few_phases');
  }
  if (metrics.phaseCount > MAX_TOP_LEVEL_PHASES) {
    reasons.push('missing_hierarchy');
  }

  if (metrics.subphaseCount < (broadRequest ? 8 : 3) || metrics.minSubphasesPerPhase < (broadRequest ? 2 : 1)) {
    reasons.push('too_few_subphases');
  }

  if (metrics.taskCount < (broadRequest ? 16 : 4) || metrics.minTasksPerSubphase < (broadRequest ? 2 : 1)) {
    reasons.push('too_few_tasks');
  }

  if (metrics.genericTitleCount > 0) {
    reasons.push('placeholder_titles');
  }

  if (titlesAreTooLongOrEnumerative(structure.phases.flatMap((phase) => [
    phase.title,
    ...phase.subphases.flatMap((subphase) => [subphase.title, ...subphase.tasks.map((task) => task.title)]),
  ]))) {
    reasons.push('oversized_titles');
  }

  if (metrics.objectTypeSignalCoverage < (broadRequest ? 0.08 : 0.04)) {
    reasons.push('weak_object_fit');
  }

  if (metrics.requestedComponentCoverage < (broadRequest ? 0.2 : 0.1)) {
    reasons.push('missing_requested_component');
  }

  if (broadRequest && metrics.minSubphasesPerPhase < 2) {
    reasons.push('weak_subphase_decomposition');
  }

  const uniqueReasons = [...new Set(reasons)];
  return {
    accepted: uniqueReasons.length === 0,
    reasons: uniqueReasons,
    score: Math.max(0, 100 - uniqueReasons.length * 14),
    metrics,
  };
}

export function collectSchedulingMetrics(
  structure: StructuredProjectPlan,
  scheduled: ScheduledProjectPlan,
  plan: ExecutableProjectPlan,
): SchedulingQualityMetrics {
  const taskCount = structure.phases.reduce(
    (sum, phase) => sum + phase.subphases.reduce((subphaseSum, subphase) => subphaseSum + subphase.tasks.length, 0),
    0,
  );
  const tasks = getTaskNodes(plan);
  const tasksWithDurationCount = tasks.filter((task) => Number.isInteger(task.durationDays) && task.durationDays >= 1).length;
  const dependencyCount = tasks.reduce((sum, task) => sum + task.dependsOn.length, 0);
  const tasksWithoutDependenciesCount = tasks.filter((task) => task.dependsOn.length === 0).length;
  const crossPhaseDependencyCount = countCrossPhaseDependencies(plan);
  void scheduled;

  return {
    taskCount,
    tasksWithDurationCount,
    dependencyCount,
    tasksWithoutDependenciesCount,
    crossPhaseDependencyCount,
  };
}

export function evaluateSchedulingQuality(
  structure: StructuredProjectPlan,
  scheduled: ScheduledProjectPlan,
  plan: ExecutableProjectPlan,
): SchedulingQualityVerdict {
  const reasons: SchedulingQualityVerdict['reasons'] = [];
  const structureSignature = getStructureSignature(structure);
  const scheduledSignature = getStructureSignature(scheduled);
  const metrics = collectSchedulingMetrics(structure, scheduled, plan);
  const nodeMap = getNodeMap(plan);
  const taskKeys = new Set(getTaskNodes(plan).map((task) => task.nodeKey));

  if (structureSignature.length !== scheduledSignature.length) {
    reasons.push('structure_changed');
  } else {
    const structureEntries = new Set(structureSignature);
    const scheduledEntries = new Set(scheduledSignature);
    if (structureEntries.size !== scheduledEntries.size || [...structureEntries].some((entry) => !scheduledEntries.has(entry))) {
      const structureKeySignature = structureSignature.map((entry) => entry.split(':').slice(0, -1).join(':'));
      const scheduledKeySignature = scheduledSignature.map((entry) => entry.split(':').slice(0, -1).join(':'));
      const structureTitleSignature = structureSignature.map((entry) => entry.split(':').at(-1) ?? '');
      const scheduledTitleSignature = scheduledSignature.map((entry) => entry.split(':').at(-1) ?? '');

      if (JSON.stringify(structureKeySignature) !== JSON.stringify(scheduledKeySignature)) {
        reasons.push('hierarchy_changed');
      }
      if (JSON.stringify(structureTitleSignature) !== JSON.stringify(scheduledTitleSignature)) {
        reasons.push('titles_changed');
      }
      if (!reasons.includes('hierarchy_changed') && !reasons.includes('titles_changed')) {
        reasons.push('structure_changed');
      }
    }
  }

  if (metrics.tasksWithDurationCount < metrics.taskCount) {
    reasons.push('missing_task_durations');
  }

  if (getTaskNodes(plan).some((task) => !Number.isInteger(task.durationDays) || task.durationDays < 1)) {
    reasons.push('invalid_task_duration');
  }

  if (plan.nodes.some((node) => (node.kind === 'phase' || node.kind === 'subphase') && node.dependsOn.length > 0)) {
    reasons.push('phase_has_dependencies');
  }

  if (plan.nodes.some((node) => node.kind === 'task' && !node.parentNodeKey)) {
    reasons.push('task_outside_subphase');
  }

  if (plan.nodes.some((node) => node.kind === 'task' && node.parentNodeKey && nodeMap.get(node.parentNodeKey)?.kind !== 'subphase')) {
    reasons.push('task_outside_subphase');
  }

  for (const task of getTaskNodes(plan)) {
    for (const dependency of task.dependsOn) {
      const target = nodeMap.get(dependency.nodeKey);
      if (!target) {
        reasons.push('broken_dependency_reference');
      } else if (!taskKeys.has(target.nodeKey)) {
        reasons.push('dependency_target_not_task');
      }
    }
  }

  if (metrics.dependencyCount < Math.max(1, Math.floor(metrics.taskCount / 3))) {
    reasons.push('missing_dependency_graph');
  }

  if (hasTaskCycle(plan)) {
    reasons.push('graph_cycle_detected');
  }

  const uniqueReasons = [...new Set(reasons)];
  return {
    accepted: uniqueReasons.length === 0,
    reasons: uniqueReasons,
    score: Math.max(0, 100 - uniqueReasons.length * 14),
    metrics,
  };
}
