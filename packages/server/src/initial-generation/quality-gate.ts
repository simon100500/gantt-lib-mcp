import type { GenerationBrief, PlanQualityVerdict, ProjectPlan, RepairReason } from './types.js';

const PLACEHOLDER_TITLE_PATTERN = /^(?:этап|задача|stage|task)\s+\d+$/i;

function hasHierarchy(plan: ProjectPlan): boolean {
  const childNodeCount = plan.nodes.filter((node) => node.parentNodeKey).length;
  const phaseCount = plan.nodes.filter((node) => node.kind === 'phase').length;
  return phaseCount >= 2 && childNodeCount >= 2;
}

function hasPlaceholderTitles(plan: ProjectPlan): boolean {
  return plan.nodes.some((node) => PLACEHOLDER_TITLE_PATTERN.test(node.title.trim()));
}

function hasEnoughCoverage(plan: ProjectPlan, brief: GenerationBrief): boolean {
  const minimumNodeCount = brief.scopeSignals.includes('broad_request') ? 6 : 4;
  const phaseCount = plan.nodes.filter((node) => node.kind === 'phase').length;
  return plan.nodes.length >= minimumNodeCount && phaseCount >= 2;
}

function hasSequenceRealism(plan: ProjectPlan): boolean {
  const taskNodes = plan.nodes.filter((node) => node.kind === 'task');
  if (taskNodes.length < 2) {
    return false;
  }

  const dependencyCount = taskNodes.reduce((sum, node) => sum + node.dependsOn.length, 0);
  return dependencyCount >= Math.max(1, Math.floor(taskNodes.length / 2));
}

export function evaluateProjectPlanQuality(plan: ProjectPlan, brief: GenerationBrief): PlanQualityVerdict {
  const reasons: RepairReason[] = [];

  if (!hasHierarchy(plan)) {
    reasons.push('missing_hierarchy');
  }

  if (hasPlaceholderTitles(plan)) {
    reasons.push('placeholder_titles');
  }

  if (!hasEnoughCoverage(plan, brief)) {
    reasons.push('weak_coverage');
  }

  if (!hasSequenceRealism(plan)) {
    reasons.push('weak_sequence');
  }

  return {
    accepted: reasons.length === 0,
    reasons,
    score: Math.max(0, 100 - reasons.length * 25),
  };
}
