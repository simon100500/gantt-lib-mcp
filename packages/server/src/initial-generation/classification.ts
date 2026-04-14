import type {
  DetailLevel,
  InitialGenerationClassification,
  InitialRequestInterpretation,
  NormalizedInitialRequest,
} from './types.js';

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}

function inferDetailLevel(normalizedRequest: NormalizedInitialRequest): DetailLevel {
  if (normalizedRequest.explicitWorkItems.length >= 8) {
    return 'high';
  }

  const locationEvidenceCount = (normalizedRequest.locationScope?.sections?.length ?? 0)
    + (normalizedRequest.locationScope?.floors?.length ?? 0)
    + (normalizedRequest.locationScope?.zones?.length ?? 0);

  if (locationEvidenceCount > 0 || normalizedRequest.explicitWorkItems.length >= 4) {
    return 'medium';
  }

  return 'medium';
}

function inferConfidence(
  normalizedRequest: NormalizedInitialRequest,
  interpretation: InitialRequestInterpretation,
): number {
  let confidence = normalizedRequest.sourceConfidence === 'high'
    ? 0.9
    : normalizedRequest.sourceConfidence === 'medium'
      ? 0.78
      : 0.62;

  confidence = Math.max(confidence, interpretation.confidence);

  if (interpretation.scopeMode === 'explicit_worklist') {
    confidence += 0.08;
  }

  if (normalizedRequest.locationScope) {
    confidence += 0.05;
  }

  if (interpretation.projectArchetype === 'unknown') {
    confidence -= 0.12;
  }

  if (interpretation.objectProfile === 'unknown') {
    confidence -= 0.06;
  }

  if (interpretation.requestKind === 'ambiguous') {
    confidence -= 0.18;
  }

  return clampConfidence(confidence);
}

function hasLocationScope(locationScope: InitialRequestInterpretation['locationScope']): boolean {
  return locationScope.sections.length > 0
    || locationScope.floors.length > 0
    || locationScope.zones.length > 0;
}

function normalizeLocationScope(
  locationScope?: NormalizedInitialRequest['locationScope'] | InitialRequestInterpretation['locationScope'],
): InitialRequestInterpretation['locationScope'] {
  return {
    sections: [...(locationScope?.sections ?? [])],
    floors: [...(locationScope?.floors ?? [])],
    zones: [...(locationScope?.zones ?? [])],
  };
}

type ClassifyInitialRequestInput = {
  normalizedRequest: NormalizedInitialRequest;
  interpretation: InitialRequestInterpretation;
};

export function classifyInitialRequest(input: ClassifyInitialRequestInput): InitialGenerationClassification {
  const { normalizedRequest, interpretation } = input;
  const detailLevel = inferDetailLevel(normalizedRequest);
  const confidence = inferConfidence(normalizedRequest, interpretation);
  const interpretedLocationScope = normalizeLocationScope(interpretation.locationScope);
  const normalizedLocationScope = normalizeLocationScope(normalizedRequest.locationScope);
  const locationScope = hasLocationScope(interpretedLocationScope)
    ? interpretedLocationScope
    : normalizedLocationScope;

  return {
    scopeMode: interpretation.scopeMode,
    planningMode: interpretation.planningMode,
    projectArchetype: interpretation.projectArchetype,
    objectProfile: interpretation.objectProfile,
    detailLevel,
    confidence,
    explicitWorkItemsPresent: normalizedRequest.explicitWorkItems.length > 0,
    worklistPolicy: interpretation.worklistPolicy,
    ...(hasLocationScope(locationScope)
      ? { locationScope }
      : {}),
  };
}
