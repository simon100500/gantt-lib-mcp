export type GenerationMode = 'initial_generation' | 'mutation';

export type InitialGenerationPlannerStage =
  | 'skeleton'
  | 'skeleton_repair'
  | 'phase_expansion'
  | 'phase_expansion_repair';

export type ProjectPlanNodeKind = 'phase' | 'task';

export type ProjectPlanDependencyType = 'FS' | 'SS' | 'FF' | 'SF';

export type GenerationBrief = {
  objectType: string;
  scopeSignals: string[];
  starterScheduleExpectation: string;
  namingBan: string;
  domainContextSummary: string;
  serverInferencePolicy: string;
};

export type ProjectPlanDependency = {
  nodeKey: string;
  type: ProjectPlanDependencyType;
  lagDays?: number;
};

export type ProjectPlanNode = {
  nodeKey: string;
  title: string;
  parentNodeKey?: string;
  kind: ProjectPlanNodeKind;
  durationDays: number;
  dependsOn: ProjectPlanDependency[];
};

export type SkeletonWorkPackage = {
  workPackageKey: string;
  title: string;
  objective?: string;
};

export type SkeletonPhase = {
  phaseKey: string;
  title: string;
  objective?: string;
  orderHint: number;
  dependsOnPhaseKeys?: string[];
  workPackages: SkeletonWorkPackage[];
};

export type ProjectWbsSkeleton = {
  projectType: string;
  assumptions: string[];
  phases: SkeletonPhase[];
};

export type ExpandedPhaseTask = {
  nodeKey: string;
  title: string;
  durationDays: number;
  dependsOnWithinPhase: ProjectPlanDependency[];
  sequenceRole?: 'entry' | 'intermediate' | 'exit';
};

export type ExpandedPhasePlan = {
  phaseKey: string;
  tasks: ExpandedPhaseTask[];
};

export type CrossPhaseLink = {
  fromNodeKey: string;
  toNodeKey: string;
  type: ProjectPlanDependencyType;
  lagDays?: number;
};

export type CrossPhaseLinkPlan = {
  links: CrossPhaseLink[];
};

export type ExecutableProjectPlan = {
  projectType: string;
  nodes: ProjectPlanNode[];
  assumptions: string[];
};

export type ProjectPlan = ExecutableProjectPlan;

export type SkeletonRepairReason =
  | 'too_few_phases'
  | 'too_few_work_packages'
  | 'placeholder_titles'
  | 'weak_object_fit'
  | 'missing_requested_component'
  | 'weak_phase_decomposition';

export type SkeletonQualityMetrics = {
  phaseCount: number;
  workPackageCount: number;
  minWorkPackagesPerPhase: number;
  genericTitleCount: number;
  genericTitleRatio: number;
  objectTypeSignalCoverage: number;
  requestedComponentCoverage: number;
};

export type SkeletonQualityVerdict = {
  accepted: boolean;
  reasons: SkeletonRepairReason[];
  score: number;
  metrics: SkeletonQualityMetrics;
};

export type PhaseExpansionRepairReason =
  | 'too_few_tasks'
  | 'placeholder_titles'
  | 'missing_entry_task'
  | 'missing_exit_task'
  | 'broken_within_phase_dependency'
  | 'weak_within_phase_sequence'
  | 'self_dependency';

export type PhaseExpansionQualityMetrics = {
  taskCount: number;
  dependencyCount: number;
  entryTaskCount: number;
  exitTaskCount: number;
  genericTitleCount: number;
  genericTitleRatio: number;
};

export type PhaseExpansionQualityVerdict = {
  accepted: boolean;
  reasons: PhaseExpansionRepairReason[];
  score: number;
  metrics: PhaseExpansionQualityMetrics;
};

export type RepairReason =
  | 'missing_hierarchy'
  | 'placeholder_titles'
  | 'weak_coverage'
  | 'weak_sequence'
  | 'too_few_phases'
  | 'too_few_tasks'
  | 'missing_dependency_graph'
  | 'weak_cross_phase_sequence'
  | 'weak_subject_specificity'
  | 'weak_object_scale_fit'
  | 'phase_has_dependencies'
  | 'graph_cycle_detected';

export type PlanQualityMetrics = {
  phaseCount: number;
  taskNodeCount: number;
  dependencyCount: number;
  crossPhaseDependencyCount: number;
  genericTitleCount: number;
  genericTitleRatio: number;
  objectTypeSignalCoverage: number;
  passesProductAdequacyFloor: boolean;
};

export type PlanQualityVerdict = {
  accepted: boolean;
  reasons: RepairReason[];
  score: number;
  metrics: PlanQualityMetrics;
};

export type ModelRoutingDecisionReason =
  | 'initial_generation_requires_strong_model'
  | 'mutation_prefers_cheap_model'
  | 'cheap_model_missing_fallback_to_main';

export type ModelRoutingDecision = {
  route: GenerationMode;
  tier: 'strong' | 'cheap' | 'main_fallback';
  selectedModel: string;
  reason: ModelRoutingDecisionReason;
};

export type CompiledInitialSchedule = {
  projectId: string;
  taskCount: number;
  createdTaskIds: string[];
  droppedNodeKeys: string[];
  droppedDependencyNodeKeys: string[];
};
