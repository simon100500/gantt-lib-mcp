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

export function buildLocationGranularityLines(input: PlannerPromptContext): string[] {
  return [
    'Do not collapse explicitly requested location entities into broad grouped buckets.',
    'Infer location entity types from the user request itself instead of assuming a fixed dictionary of location kinds.',
    'Location entity types may be sections, blocks, levels, floors, spans, pickets, zones, axes, buildings, or other user-defined units.',
    'If the request names concrete location entities or concrete counts of location entities, preserve them explicitly in decomposition rather than merging them into generic grouped buckets.',
    'If the request specifies two location dimensions at once, infer the minimal location unit as the cross-product of those dimensions when that is what the request implies.',
    'Example: if the request says "5 sections, 3 floors on each", the minimal location unit is one floor within one section.',
    'Default to one explicit container per concrete location entity, not grouped containers.',
    'Do not create grouped range containers such as "Секции 1-2", "Блоки 3-5", "Этажи 1-3", "нижние этажи", "типовые секции", or other aggregated placeholders when the request implies separate entities.',
    'If section 1, section 2, and section 3 are in scope, represent them separately unless the user explicitly asked to combine them.',
    'Do not assume crew packaging or execution batching across entities unless the user explicitly requested such grouping.',
    'When the request gives counts but not labels, enumerate coherent per-entity labels in the output so every minimal location unit remains explicit.',
  ];
}
