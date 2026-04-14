export type GenerationMode = 'initial_generation' | 'mutation';

export type ScopeMode =
  | 'full_project'
  | 'partial_scope'
  | 'explicit_worklist';

export type PlanningMode =
  | 'whole_project_bootstrap'
  | 'partial_scope_bootstrap'
  | 'worklist_bootstrap';

export type DetailLevel = 'low' | 'medium' | 'high';

export type WorklistPolicy =
  | 'strict_worklist'
  | 'worklist_plus_inferred_supporting_tasks';

export type InitialRequestInterpretationRoute = 'initial_generation' | 'mutation';

export type InitialRequestKind = 'whole_project'|'partial_scope'|'explicit_worklist'|'targeted_edit'|'ambiguous';

export type InitialRequestObjectProfile =
  | 'unknown'
  | 'office_fitout'
  | 'kindergarten'
  | 'residential_multi_section';

export type InitialRequestProjectArchetype = 'unknown' | 'new_building' | 'renovation';

export type InitialRequestClarificationReason =
  | 'none'
  | 'ambiguous_list'
  | 'missing_scope'
  | 'scope_boundary_ambiguity'
  | 'fragment_target_ambiguity'
  | 'worklist_completeness_ambiguity';

export type InitialRequestInterpretation = {
  route: InitialRequestInterpretationRoute;
  confidence: number;
  requestKind: InitialRequestKind;
  planningMode: PlanningMode;
  scopeMode: ScopeMode;
  objectProfile: InitialRequestObjectProfile;
  projectArchetype: InitialRequestProjectArchetype;
  locationScope: {
    sections: string[];
    floors: string[];
    zones: string[];
  };
  worklistPolicy: WorklistPolicy;
  clarification: {
    needed: boolean;
    reason: InitialRequestClarificationReason;
  };
  signals: string[];
};

export type SourceConfidence = 'low' | 'medium' | 'high';

export type ClarificationReason =
  | 'scope_boundary_ambiguity'
  | 'fragment_target_ambiguity'
  | 'worklist_completeness_ambiguity'
  | 'detail_policy_ambiguity';

export type LocationScope = {
  sections?: string[];
  floors?: string[];
  zones?: string[];
};

export type NormalizedInitialRequest = {
  rawRequest: string;
  normalizedRequest: string;
  explicitWorkItems: string[];
  locationScope?: LocationScope;
  sourceConfidence: SourceConfidence;
};

export type InitialGenerationPlannerStage =
  | 'structure_planning'
  | 'structure_planning_repair'
  | 'schedule_metadata'
  | 'schedule_metadata_repair';

export type ProjectPlanNodeKind = 'phase' | 'subphase' | 'task';

export type ProjectPlanDependencyType = 'FS' | 'SS' | 'FF' | 'SF';

export type GenerationBrief = {
  objectType: string;
  scopeSignals: string[];
  starterScheduleExpectation: string;
  namingBan: string;
  domainContextSummary: string;
  serverInferencePolicy: string;
  domainSkeletonSummary?: string;
  scopeMode?: ScopeMode;
  planningMode?: PlanningMode;
  detailLevel?: DetailLevel;
  worklistPolicy?: WorklistPolicy;
  locationScope?: LocationScope;
  explicitWorkItems?: string[];
  clarificationAssumptions?: string[];
};

export type InitialGenerationClassification = {
  scopeMode: ScopeMode;
  planningMode: PlanningMode;
  projectArchetype: InitialRequestProjectArchetype;
  objectProfile: InitialRequestObjectProfile;
  detailLevel: DetailLevel;
  confidence: number;
  explicitWorkItemsPresent: boolean;
  worklistPolicy: WorklistPolicy;
  locationScope?: LocationScope;
};

export type ClarificationDecision =
  | {
      action: 'proceed_with_assumptions';
      assumptions: string[];
    }
  | {
      action: 'ask';
      impact: 'high';
      reason: ClarificationReason;
      question: string;
      choices: string[];
      fallbackAssumption: string;
    };

export type ProjectPlanDependency = {
  nodeKey: string;
  type: ProjectPlanDependencyType;
  lagDays?: number;
};

export type StructuredTask = {
  taskKey: string;
  title: string;
};

export type StructuredSubphase = {
  subphaseKey: string;
  title: string;
  tasks: StructuredTask[];
};

export type StructuredPhase = {
  phaseKey: string;
  title: string;
  subphases: StructuredSubphase[];
};

export type StructuredProjectPlan = {
  projectType: string;
  assumptions: string[];
  phases: StructuredPhase[];
};

export type ScheduledTask = StructuredTask & {
  durationDays: number;
  dependsOn: ProjectPlanDependency[];
};

export type ScheduledSubphase = {
  subphaseKey: string;
  title: string;
  tasks: ScheduledTask[];
};

export type ScheduledPhase = {
  phaseKey: string;
  title: string;
  subphases: ScheduledSubphase[];
};

export type ScheduledProjectPlan = {
  projectType: string;
  assumptions: string[];
  phases: ScheduledPhase[];
};

export type ProjectPlanNode = {
  nodeKey: string;
  title: string;
  parentNodeKey?: string;
  kind: ProjectPlanNodeKind;
  durationDays: number;
  dependsOn: ProjectPlanDependency[];
};

export type ExecutableProjectPlan = {
  projectType: string;
  nodes: ProjectPlanNode[];
  assumptions: string[];
};

export type ProjectPlan = ExecutableProjectPlan;

export type StructureRepairReason =
  | 'missing_hierarchy'
  | 'too_few_phases'
  | 'too_few_subphases'
  | 'too_few_tasks'
  | 'placeholder_titles'
  | 'oversized_titles'
  | 'weak_subphase_decomposition'
  | 'scope_boundary_violation';

export type StructureQualityMetrics = {
  phaseCount: number;
  subphaseCount: number;
  taskCount: number;
  minSubphasesPerPhase: number;
  minTasksPerSubphase: number;
  genericTitleCount: number;
  genericTitleRatio: number;
};

export type StructureQualityVerdict = {
  accepted: boolean;
  reasons: StructureRepairReason[];
  score: number;
  metrics: StructureQualityMetrics;
};

export type SchedulingRepairReason =
  | 'structure_changed'
  | 'titles_changed'
  | 'hierarchy_changed'
  | 'missing_task_durations'
  | 'invalid_task_duration'
  | 'missing_dependency_graph'
  | 'broken_dependency_reference'
  | 'dependency_target_not_task'
  | 'task_outside_subphase'
  | 'phase_has_dependencies'
  | 'graph_cycle_detected'
  | 'scope_boundary_violation';

export type SchedulingQualityMetrics = {
  taskCount: number;
  tasksWithDurationCount: number;
  dependencyCount: number;
  tasksWithoutDependenciesCount: number;
  crossPhaseDependencyCount: number;
};

export type SchedulingQualityVerdict = {
  accepted: boolean;
  reasons: SchedulingRepairReason[];
  score: number;
  metrics: SchedulingQualityMetrics;
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
