export type GenerationMode = 'initial_generation' | 'mutation';

export type ProjectPlanNodeKind = 'phase' | 'task';

export type ProjectPlanDependencyType = 'FS' | 'SS' | 'FF' | 'SF';

export type GenerationBrief = {
  projectType: string;
  projectScopeSummary: string;
  expectations: string[];
  assumptions: string[];
  generationMode: GenerationMode;
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
  | 'placeholder_naming'
  | 'weak_sequence_realism'
  | 'insufficient_scale'
  | 'invalid_dependencies';

export type PlanQualityVerdict = {
  status: 'accepted' | 'repair_required' | 'accepted_after_repair';
  reasons: RepairReason[];
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
