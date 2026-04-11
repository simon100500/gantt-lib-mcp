import type {
  ClarificationDecision,
  DetailLevel,
  InitialGenerationClassification,
  NormalizedInitialRequest,
  PlanningMode,
  ScopeMode,
  WorklistPolicy,
} from '../types.js';

export type ProjectArchetypeDefinition = {
  archetypeKey: string;
  defaultStages: string[];
  requiredFamilies: string[];
  milestoneSkeleton: string[];
  sequencingExpectations: string[];
  assumptions?: string[];
};

export type ObjectProfileDefinition = {
  profileKey: string;
  archetypeKey: string;
  addedFamilies: string[];
  excludedFamilies: string[];
  milestoneAdditions: string[];
  sequencingOverrides: string[];
  assumptions?: string[];
};

export type FragmentDefinition = {
  fragmentKey: string;
  label: string;
  addedFamilies: string[];
  milestoneAdditions: string[];
  scopeBoundaries: string[];
  sequencingExpectations: string[];
  assumptions?: string[];
};

export type PlanningRulePackDefinition = {
  rulePackKey: string;
  mandatoryFamilies: string[];
  forbiddenOrderings: string[];
  allowableParallelismPatterns: string[];
  missingFamilyChecks: string[];
};

export type DecompositionPolicyDefinition = {
  policyKey: DetailLevel;
  targetTaskRange: { min: number; max: number };
  maxDepth: number;
  guidance: string[];
};

export type DomainPlanningContext = {
  normalizedRequest: NormalizedInitialRequest;
  classification: InitialGenerationClassification;
  clarificationDecision: ClarificationDecision;
};

export type DomainSkeleton = {
  planningMode: PlanningMode;
  scopeMode: ScopeMode;
  projectArchetype: string;
  objectProfile: string;
  fragmentKey?: string;
  worklistPolicy: WorklistPolicy;
  stageFamilies: string[];
  milestoneSkeleton: string[];
  requiredFamilies: string[];
  sequencingExpectations: string[];
  scopeBoundaries: string[];
  decompositionPolicy: DecompositionPolicyDefinition;
  rulePack: PlanningRulePackDefinition;
  assumptions: string[];
  explicitWorkItems: string[];
};
