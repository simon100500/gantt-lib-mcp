import type { ResolvedDomainReference } from './domain-reference.js';
import { buildExecutablePlan } from './link-reconciliation.js';
import { expandProjectPhases } from './phase-expander.js';
import { planProjectSkeleton } from './skeleton-planner.js';
import type {
  CrossPhaseLinkPlan,
  ExecutableProjectPlan,
  ExpandedPhasePlan,
  GenerationBrief,
  InitialGenerationPlannerStage,
  ModelRoutingDecision,
  PhaseExpansionQualityVerdict,
  PlanQualityVerdict,
  ProjectWbsSkeleton,
  SkeletonQualityVerdict,
} from './types.js';

type PlannerQueryInput = {
  prompt: string;
  model: string;
  stage: InitialGenerationPlannerStage;
};

type PlannerQueryResult = string | { content?: string };

export type PlanInitialProjectInput = {
  userMessage: string;
  brief: GenerationBrief;
  reference: ResolvedDomainReference;
  modelDecision: Pick<ModelRoutingDecision, 'selectedModel'>;
  sdkQuery: (input: PlannerQueryInput) => Promise<PlannerQueryResult>;
};

export type ExpandedPhasePlanningResult = {
  phaseKey: string;
  title: string;
  expansion: ExpandedPhasePlan;
  verdict: PhaseExpansionQualityVerdict;
  repairAttempted: boolean;
};

export type PlanInitialProjectResult = {
  plan: ExecutableProjectPlan;
  skeleton: ProjectWbsSkeleton;
  skeletonVerdict: SkeletonQualityVerdict;
  expandedPhases: ExpandedPhasePlanningResult[];
  crossPhaseLinkPlan: CrossPhaseLinkPlan;
  verdict: PlanQualityVerdict;
  repairAttempted: boolean;
};

export async function planInitialProject(input: PlanInitialProjectInput): Promise<PlanInitialProjectResult> {
  const skeletonResult = await planProjectSkeleton(input);
  const expandedPhaseResults = skeletonResult.verdict.accepted
    ? await expandProjectPhases({
        userMessage: input.userMessage,
        brief: input.brief,
        reference: input.reference,
        skeleton: skeletonResult.skeleton,
        modelDecision: input.modelDecision,
        sdkQuery: input.sdkQuery,
      })
    : [];

  const expansionRepairAttempted = expandedPhaseResults.some((result) => result.repairAttempted);
  const failedExpansion = expandedPhaseResults.find((result) => !result.verdict.accepted);

  const executableResult = failedExpansion
    ? {
        plan: {
          projectType: skeletonResult.skeleton.projectType,
          assumptions: skeletonResult.skeleton.assumptions,
          nodes: [],
        } satisfies ExecutableProjectPlan,
        crossPhaseLinkPlan: { links: [] } satisfies CrossPhaseLinkPlan,
        verdict: {
          accepted: false,
          reasons: ['weak_coverage'],
          score: 0,
          metrics: {
            phaseCount: 0,
            taskNodeCount: 0,
            dependencyCount: 0,
            crossPhaseDependencyCount: 0,
            genericTitleCount: 0,
            genericTitleRatio: 1,
            objectTypeSignalCoverage: 0,
            passesProductAdequacyFloor: false,
          },
        } satisfies PlanQualityVerdict,
      }
    : buildExecutablePlan({
        brief: input.brief,
        skeleton: skeletonResult.skeleton,
        expansions: expandedPhaseResults.map((result) => result.expansion),
      });

  return {
    plan: executableResult.plan,
    skeleton: skeletonResult.skeleton,
    skeletonVerdict: skeletonResult.verdict,
    expandedPhases: expandedPhaseResults.map((result) => ({
      phaseKey: result.phase.phaseKey,
      title: result.phase.title,
      expansion: result.expansion,
      verdict: result.verdict,
      repairAttempted: result.repairAttempted,
    })),
    crossPhaseLinkPlan: executableResult.crossPhaseLinkPlan,
    verdict: executableResult.verdict,
    repairAttempted: skeletonResult.repairAttempted || expansionRepairAttempted,
  };
}
