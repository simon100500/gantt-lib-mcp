import type {
  ClarificationDecision,
  GenerationBrief,
  InitialGenerationClassification,
  InitialRequestInterpretation,
  NormalizedInitialRequest,
} from './types.js';
import type { DomainSkeleton } from './domain/contracts.js';

export type BuildGenerationBriefInput = {
  userMessage: string;
  normalizedRequest?: NormalizedInitialRequest;
  interpretation?: InitialRequestInterpretation;
  classification?: InitialGenerationClassification;
  clarificationDecision?: ClarificationDecision;
  domainSkeleton?: DomainSkeleton;
};

function buildScopeSignals(
  interpretation?: InitialRequestInterpretation,
  normalizedRequest?: NormalizedInitialRequest,
): string[] {
  const signals = new Set<string>();

  if (!interpretation) {
    return [];
  }

  signals.add(interpretation.scopeMode);
  signals.add(interpretation.requestKind);

  if (interpretation.scopeMode === 'full_project') {
    signals.add('broad_request');
  }

  if (interpretation.scopeMode === 'partial_scope') {
    signals.add('fragment_request');
  }

  if (interpretation.scopeMode === 'explicit_worklist' || normalizedRequest?.explicitWorkItems.length) {
    signals.add('explicit_worklist');
  }

  if (
    interpretation.clarification.reason === 'fragment_target_ambiguity'
    || interpretation.signals.includes('fragment_delivery_state')
  ) {
    signals.add('handover_scope');
  }

  return [...signals];
}

function normalizeLocationScope(
  locationScope?: NormalizedInitialRequest['locationScope'] | InitialRequestInterpretation['locationScope'],
): InitialRequestInterpretation['locationScope'] | undefined {
  if (!locationScope) {
    return undefined;
  }

  return {
    sections: [...(locationScope.sections ?? [])],
    floors: [...(locationScope.floors ?? [])],
    zones: [...(locationScope.zones ?? [])],
  };
}

export function buildGenerationBrief(input: BuildGenerationBriefInput): GenerationBrief {
  const normalized = input.normalizedRequest;
  const interpretation = input.interpretation;
  const classification = input.classification;
  const domainSkeleton = input.domainSkeleton;
  const clarificationAssumptions = input.clarificationDecision?.action === 'proceed_with_assumptions'
    ? input.clarificationDecision.assumptions
    : input.clarificationDecision
      ? [input.clarificationDecision.fallbackAssumption]
      : [];

  const scopeSignals = buildScopeSignals(interpretation, normalized);

  let objectType = 'project';
  if (interpretation?.objectProfile && interpretation.objectProfile !== 'unknown') {
    objectType = interpretation.objectProfile;
  } else if (interpretation?.projectArchetype && interpretation.projectArchetype !== 'unknown') {
    objectType = interpretation.projectArchetype;
  } else if (classification?.objectProfile && classification.objectProfile !== 'unknown') {
    objectType = classification.objectProfile;
  } else if (classification?.projectArchetype && classification.projectArchetype !== 'unknown') {
    objectType = classification.projectArchetype;
  }

  const locationScope = normalizeLocationScope(normalized?.locationScope ?? interpretation?.locationScope);
  const locationSummary = locationScope
    ? [
        locationScope.sections.length > 0 ? `sections=${locationScope.sections.join('|')}` : '',
        locationScope.floors.length > 0 ? `floors=${locationScope.floors.join('|')}` : '',
        locationScope.zones.length > 0 ? `zones=${locationScope.zones.join('|')}` : '',
      ].filter(Boolean).join('; ')
    : '';

  return {
    objectType,
    scopeSignals,
    starterScheduleExpectation:
      'Return a full starter schedule baseline with realistic phases, subphases, and tasks.',
    namingBan:
      'Do not use filler titles like "Этап 1" or "Task 3"; every node title must name a real activity.',
    domainContextSummary: interpretation
      ? [
          `request_kind=${interpretation.requestKind}`,
          `planning_mode=${interpretation.planningMode}`,
          `scope_mode=${interpretation.scopeMode}`,
          `project_archetype=${interpretation.projectArchetype}`,
          `object_profile=${interpretation.objectProfile}`,
          `worklist_policy=${interpretation.worklistPolicy}`,
          ...(locationSummary ? [locationSummary] : []),
        ].join('; ')
      : '',
    ...(domainSkeleton
      ? {
          domainSkeletonSummary: [
            `fragment=${domainSkeleton.fragmentKey ?? 'none'}`,
            `stages=${domainSkeleton.stageFamilies.join('|')}`,
            `milestones=${domainSkeleton.milestoneSkeleton.join('|')}`,
            `families=${domainSkeleton.requiredFamilies.join('|')}`,
          ].join('; '),
        }
      : {}),
    serverInferencePolicy:
      'Rely on the normalized request, classification, and explicit server-side assumptions.',
    ...(classification?.scopeMode ? { scopeMode: classification.scopeMode } : {}),
    ...(classification?.planningMode ? { planningMode: classification.planningMode } : {}),
    ...(classification?.detailLevel ? { detailLevel: classification.detailLevel } : {}),
    ...(classification?.worklistPolicy ? { worklistPolicy: classification.worklistPolicy } : {}),
    ...(locationScope ? { locationScope } : {}),
    ...(normalized?.explicitWorkItems ? { explicitWorkItems: normalized.explicitWorkItems } : {}),
    ...(clarificationAssumptions.length > 0 ? { clarificationAssumptions } : {}),
  };
}
