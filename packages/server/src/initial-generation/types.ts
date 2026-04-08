export type GenerationMode = 'initial_generation' | 'mutation';

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
  | 'weak_object_fit'
  | 'missing_requested_component'
  | 'weak_subphase_decomposition';

export type StructureQualityMetrics = {
  phaseCount: number;
  subphaseCount: number;
  taskCount: number;
  minSubphasesPerPhase: number;
  minTasksPerSubphase: number;
  genericTitleCount: number;
  genericTitleRatio: number;
  objectTypeSignalCoverage: number;
  requestedComponentCoverage: number;
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
  | 'graph_cycle_detected';

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
