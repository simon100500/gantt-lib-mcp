import type { ClarificationDecision, InitialGenerationClassification, NormalizedInitialRequest } from '../types.js';
import type { DomainPlanningContext, DomainSkeleton, FragmentDefinition } from './contracts.js';
import {
  DECOMPOSITION_POLICIES,
  DEFAULT_RULE_PACK,
  FRAGMENT_DEFINITIONS,
  OBJECT_PROFILES,
  PROJECT_ARCHETYPES,
} from './registry.js';

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function removeExcluded(values: string[], excluded: string[]): string[] {
  const excludedSet = new Set(excluded);
  return values.filter((value) => !excludedSet.has(value));
}

function resolveFragmentDefinition(context: DomainPlanningContext): FragmentDefinition | undefined {
  const { normalizedRequest, classification, clarificationDecision } = context;

  if (classification.scopeMode !== 'partial_scope') {
    return undefined;
  }

  const hasBasement = normalizedRequest.locationScope?.zones?.includes('подвал')
    || /подвал/i.test(normalizedRequest.normalizedRequest);
  const handoverIntent = normalizedRequest.scopeSignals.handoverIntent
    || (clarificationDecision.action === 'ask' && /передач/i.test(clarificationDecision.fallbackAssumption));

  if (hasBasement && handoverIntent) {
    return FRAGMENT_DEFINITIONS.basement_handover;
  }

  if (normalizedRequest.locationScope?.sections?.length) {
    return FRAGMENT_DEFINITIONS.section_fragment;
  }

  return undefined;
}

function buildAssumptions(
  context: DomainPlanningContext,
  fragment: FragmentDefinition | undefined,
  profileAssumptions: string[],
  archetypeAssumptions: string[],
): string[] {
  const clarificationAssumptions = context.clarificationDecision.action === 'proceed_with_assumptions'
    ? context.clarificationDecision.assumptions
    : [context.clarificationDecision.fallbackAssumption];

  return unique([
    ...archetypeAssumptions,
    ...profileAssumptions,
    ...(fragment?.assumptions ?? []),
    ...clarificationAssumptions,
  ]);
}

export function assembleDomainSkeleton(context: DomainPlanningContext): DomainSkeleton {
  const classification = context.classification;
  const archetype = PROJECT_ARCHETYPES[classification.projectArchetype] ?? PROJECT_ARCHETYPES.new_building;
  const profile = OBJECT_PROFILES[classification.objectProfile];
  const fragment = resolveFragmentDefinition(context);
  const decompositionPolicy = DECOMPOSITION_POLICIES[classification.detailLevel];

  const stageFamilies = unique([
    ...archetype.defaultStages,
    ...(fragment ? [fragment.label] : []),
  ]);

  const requiredFamilies = unique(removeExcluded([
    ...archetype.requiredFamilies,
    ...(profile?.addedFamilies ?? []),
    ...(fragment?.addedFamilies ?? []),
  ], profile?.excludedFamilies ?? []));

  const milestoneSkeleton = unique([
    ...archetype.milestoneSkeleton,
    ...(profile?.milestoneAdditions ?? []),
    ...(fragment?.milestoneAdditions ?? []),
  ]);

  const sequencingExpectations = unique([
    ...archetype.sequencingExpectations,
    ...(profile?.sequencingOverrides ?? []),
    ...(fragment?.sequencingExpectations ?? []),
  ]);

  const scopeBoundaries = classification.scopeMode === 'full_project'
    ? ['Допускается full-project starter schedule без искусственного сужения scope.']
    : unique([
        ...(fragment?.scopeBoundaries ?? []),
        classification.scopeMode === 'explicit_worklist'
          ? 'Сохранять scope внутри пользовательского списка работ.'
          : 'Не выходить за границы явно указанного локального фрагмента.',
      ]);

  const assumptions = buildAssumptions(
    context,
    fragment,
    profile?.assumptions ?? [],
    archetype.assumptions ?? [],
  );

  return {
    planningMode: classification.planningMode,
    scopeMode: classification.scopeMode,
    projectArchetype: archetype.archetypeKey,
    objectProfile: profile?.profileKey ?? classification.objectProfile,
    ...(fragment ? { fragmentKey: fragment.fragmentKey } : {}),
    worklistPolicy: classification.worklistPolicy,
    stageFamilies,
    milestoneSkeleton,
    requiredFamilies,
    sequencingExpectations,
    scopeBoundaries,
    decompositionPolicy,
    rulePack: DEFAULT_RULE_PACK,
    assumptions,
    explicitWorkItems: context.normalizedRequest.explicitWorkItems,
  };
}
