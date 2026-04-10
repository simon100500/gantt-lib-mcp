import type {
  DetailLevel,
  InitialGenerationClassification,
  NormalizedInitialRequest,
  PlanningMode,
  ScopeMode,
  WorklistPolicy,
} from './types.js';

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}

function inferScopeMode(input: NormalizedInitialRequest): ScopeMode {
  if (input.explicitWorkItems.length > 0) {
    return 'explicit_worklist';
  }

  if (input.scopeSignals.fragment || input.locationScope) {
    return 'partial_scope';
  }

  return 'full_project';
}

function inferPlanningMode(scopeMode: ScopeMode): PlanningMode {
  if (scopeMode === 'partial_scope') {
    return 'partial_scope_bootstrap';
  }

  if (scopeMode === 'explicit_worklist') {
    return 'worklist_bootstrap';
  }

  return 'whole_project_bootstrap';
}

function inferProjectArchetype(input: NormalizedInitialRequest): string {
  const message = input.normalizedRequest.toLowerCase();

  if (/(?:fit[- ]?out|ремонт|отделк[аи]\s+офис|офисн(?:ая|ого)\s+отделк)/i.test(message)) {
    return 'fit_out';
  }

  if (/(?:строительств(?:о|а)|детск(?:ий|ого)\s+сад|жил(?:ой|ого)\s+дом|секци(?:я|и)|подвал)/i.test(message)) {
    return 'new_building';
  }

  return input.explicitWorkItems.length > 0 ? 'unknown' : 'new_building';
}

function inferObjectProfile(input: NormalizedInitialRequest): string {
  const message = input.normalizedRequest.toLowerCase();

  if (/детск(?:ий|ого)\s+сад/i.test(message)) {
    return 'kindergarten';
  }

  if (
    /(?:жил(?:ой|ого)\s+дом|многосекц|секци(?:я|и)|корпус(?:а|ов)?)/i.test(message)
    || Boolean(input.locationScope?.sections?.length)
  ) {
    return 'residential_multi_section';
  }

  if (/(?:офис|fit[- ]?out|ремонт офиса|отделка офиса)/i.test(message)) {
    return 'office_fitout';
  }

  return 'unknown';
}

function inferDetailLevel(input: NormalizedInitialRequest): DetailLevel {
  if (input.explicitWorkItems.length >= 8) {
    return 'high';
  }

  if (input.locationScope || input.scopeSignals.fragment || input.explicitWorkItems.length >= 4) {
    return 'medium';
  }

  return 'medium';
}

function inferWorklistPolicy(input: NormalizedInitialRequest): WorklistPolicy {
  const message = input.normalizedRequest.toLowerCase();

  if (/(?:дополни|при необходимости добавь|можно дополнить|расшири)/i.test(message)) {
    return 'worklist_plus_inferred_supporting_tasks';
  }

  return 'strict_worklist';
}

function inferConfidence(
  input: NormalizedInitialRequest,
  scopeMode: ScopeMode,
  projectArchetype: string,
  objectProfile: string,
): number {
  let confidence = input.sourceConfidence === 'high'
    ? 0.9
    : input.sourceConfidence === 'medium'
      ? 0.78
      : 0.62;

  if (scopeMode === 'explicit_worklist') {
    confidence += 0.08;
  }

  if (input.locationScope) {
    confidence += 0.05;
  }

  if (projectArchetype === 'unknown') {
    confidence -= 0.12;
  }

  if (objectProfile === 'unknown') {
    confidence -= 0.06;
  }

  if (input.scopeSignals.fragment && input.scopeSignals.wholeProject) {
    confidence -= 0.18;
  }

  return clampConfidence(confidence);
}

export function classifyInitialRequest(input: NormalizedInitialRequest): InitialGenerationClassification {
  const scopeMode = inferScopeMode(input);
  const planningMode = inferPlanningMode(scopeMode);
  const projectArchetype = inferProjectArchetype(input);
  const objectProfile = inferObjectProfile(input);
  const detailLevel = inferDetailLevel(input);
  const worklistPolicy = inferWorklistPolicy(input);
  const confidence = inferConfidence(input, scopeMode, projectArchetype, objectProfile);

  return {
    scopeMode,
    planningMode,
    projectArchetype,
    objectProfile,
    detailLevel,
    confidence,
    explicitWorkItemsPresent: input.explicitWorkItems.length > 0,
    worklistPolicy,
    ...(input.locationScope ? { locationScope: input.locationScope } : {}),
  };
}
