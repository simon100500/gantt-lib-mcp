import type { DomainSkeleton } from '../domain/contracts.js';
import type {
  ClarificationDecision,
  GenerationBrief,
  InitialGenerationClassification,
  NormalizedInitialRequest,
  ScheduledProjectPlan,
  SchedulingQualityVerdict,
  StructuredProjectPlan,
  StructureQualityVerdict,
} from '../types.js';

export type PlannerPromptContext = {
  userMessage: string;
  brief: GenerationBrief;
  normalizedRequest?: NormalizedInitialRequest;
  classification?: InitialGenerationClassification;
  clarificationDecision?: ClarificationDecision;
  domainSkeleton?: DomainSkeleton;
};

export type StructureRepairPromptInput = PlannerPromptContext & {
  structure: StructuredProjectPlan;
  verdict: StructureQualityVerdict;
};

export type SchedulingPromptInput = PlannerPromptContext & {
  structure: StructuredProjectPlan;
};

export type SchedulingRepairPromptInput = SchedulingPromptInput & {
  scheduled: ScheduledProjectPlan;
  verdict: SchedulingQualityVerdict;
};
