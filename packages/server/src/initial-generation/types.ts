export type GenerationMode = 'initial_generation' | 'mutation';

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

export type ProjectPlan = {
  projectType: string;
  nodes: ProjectPlanNode[];
  assumptions: string[];
};

export type RepairReason =
  | 'missing_hierarchy'
  | 'placeholder_titles'
  | 'weak_coverage'
  | 'weak_sequence';

export type PlanQualityVerdict = {
  accepted: boolean;
  reasons: RepairReason[];
  score: number;
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
