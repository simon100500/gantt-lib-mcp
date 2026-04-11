import type {
  ClarificationDecision,
  GenerationBrief,
  InitialGenerationClassification,
  NormalizedInitialRequest,
} from './types.js';
import type { DomainSkeleton } from './domain/contracts.js';

export type BuildGenerationBriefInput = {
  userMessage: string;
  normalizedRequest?: NormalizedInitialRequest;
  classification?: InitialGenerationClassification;
  clarificationDecision?: ClarificationDecision;
  domainSkeleton?: DomainSkeleton;
};

function detectScopeSignals(userMessage: string): string[] {
  const signals = new Set<string>();
  const message = userMessage.toLowerCase();

  if (/(строит|construction|build)/i.test(message)) {
    signals.add('new_build');
  }

  if (/(ремонт|fit[- ]?out|renovat)/i.test(message)) {
    signals.add('renovation');
  }

  if (/(газобетон|brick|кирпич|монолит)/i.test(message)) {
    signals.add('material_mentioned');
  }

  if (/(\d+(?:[.,]\d+)?)\s*(?:м2|м²|кв\.?\s*м)/i.test(message)) {
    signals.add('explicit_area');
  }

  if (signals.size === 0) {
    signals.add('starter_generation_request');
  }

  return [...signals];
}

export function buildGenerationBrief(input: BuildGenerationBriefInput): GenerationBrief {
  const normalized = input.normalizedRequest;
  const classification = input.classification;
  const domainSkeleton = input.domainSkeleton;
  const clarificationAssumptions = input.clarificationDecision?.action === 'proceed_with_assumptions'
    ? input.clarificationDecision.assumptions
    : input.clarificationDecision
      ? [input.clarificationDecision.fallbackAssumption]
      : [];

  const scopeSignals = new Set(detectScopeSignals(input.userMessage));
  if (classification?.scopeMode) {
    scopeSignals.add(classification.scopeMode);
  }
  if (normalized?.scopeSignals.fragment) {
    scopeSignals.add('fragment_request');
  }
  if (normalized?.scopeSignals.wholeProject) {
    scopeSignals.add('broad_request');
  }
  if (normalized?.scopeSignals.handoverIntent) {
    scopeSignals.add('handover_intent');
  }
  if (normalized?.explicitWorkItems.length) {
    scopeSignals.add('explicit_worklist');
  }

  let objectType = 'project';
  if (classification) {
    if (classification.objectProfile !== 'unknown') {
      objectType = classification.objectProfile;
    } else if (classification.projectArchetype !== 'unknown') {
      objectType = classification.projectArchetype;
    }
  }

  return {
    objectType,
    scopeSignals: [...scopeSignals],
    starterScheduleExpectation:
      'Return a full starter schedule baseline with realistic phases, subphases, and tasks.',
    namingBan:
      'Do not use filler titles like "Этап 1" or "Task 3"; every node title must name a real activity.',
    domainContextSummary: classification
      ? [
          `planning_mode=${classification.planningMode}`,
          `scope_mode=${classification.scopeMode}`,
          `project_archetype=${classification.projectArchetype}`,
          `object_profile=${classification.objectProfile}`,
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
    ...(normalized?.locationScope ? { locationScope: normalized.locationScope } : {}),
    ...(normalized?.explicitWorkItems ? { explicitWorkItems: normalized.explicitWorkItems } : {}),
    ...(clarificationAssumptions.length > 0 ? { clarificationAssumptions } : {}),
  };
}
