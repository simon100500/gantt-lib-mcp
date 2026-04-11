import type { PlannerPromptContext } from './types.js';

export function buildPlanningContextLines(input: PlannerPromptContext): string[] {
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

export function getPlanningMode(input: Pick<PlannerPromptContext, 'brief' | 'classification'>): string {
  return input.classification?.planningMode ?? input.brief.planningMode ?? 'whole_project_bootstrap';
}
