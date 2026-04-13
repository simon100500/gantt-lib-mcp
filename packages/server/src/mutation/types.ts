export type MutationIntentType =
  | 'add_single_task'
  | 'add_repeated_fragment'
  | 'shift_relative'
  | 'move_to_date'
  | 'move_in_hierarchy'
  | 'link_tasks'
  | 'unlink_tasks'
  | 'delete_task'
  | 'rename_task'
  | 'update_metadata'
  | 'expand_wbs'
  | 'restructure_branch'
  | 'validate_only'
  | 'unsupported_or_ambiguous';

export type MutationExecutionMode = 'deterministic' | 'hybrid' | 'full_agent';

export type MutationFailureReason =
  | 'anchor_not_found'
  | 'multiple_low_confidence_targets'
  | 'container_not_resolved'
  | 'placement_not_resolved'
  | 'unsupported_mutation_shape'
  | 'deterministic_execution_failed'
  | 'verification_failed'
  | 'group_scope_not_resolved'
  | 'expansion_anchor_not_resolved';

export type MutationIntent = {
  intentType: MutationIntentType;
  confidence: number;
  rawRequest: string;
  normalizedRequest: string;
  entitiesMentioned: string[];
  requiresResolution: boolean;
  requiresSchedulingPlacement: boolean;
  executionMode: MutationExecutionMode;
};

export type MutationResolutionEntity = {
  id: string;
  name: string;
  score?: number;
};

export type PlacementPolicy =
  | 'after_predecessor'
  | 'before_successor'
  | 'tail_of_container'
  | 'group_tail'
  | 'no_placement_required'
  | 'unresolved';

export type ResolvedMutationContext = {
  projectId: string;
  projectVersion: number | null;
  resolutionQuery: string;
  containers: MutationResolutionEntity[];
  tasks: MutationResolutionEntity[];
  predecessors: MutationResolutionEntity[];
  successors: MutationResolutionEntity[];
  selectedContainerId: string | null;
  selectedPredecessorTaskId: string | null;
  selectedSuccessorTaskId: string | null;
  placementPolicy: PlacementPolicy;
  confidence: number;
};

export type MutationPlan = {
  planType: MutationIntentType;
  operations: string[];
  why: string;
  expectedChangedTaskIds: string[];
  canExecuteDeterministically: boolean;
  needsAgentExecution: boolean;
};

export type MutationExecutionStatus = 'completed' | 'failed' | 'deferred_to_legacy';

export type MutationExecutionResult = {
  status: MutationExecutionStatus;
  executionMode: MutationExecutionMode;
  committedCommandTypes: string[];
  changedTaskIds: string[];
  verificationVerdict: 'not_run' | 'passed' | 'failed';
  userFacingMessage: string;
  failureReason?: MutationFailureReason;
};

export type MutationTaskSnapshot = {
  id: string;
  name: string;
  startDate?: string;
  endDate?: string;
  parentId?: string;
  dependencies?: Array<{ taskId: string; type: string; lag?: number }>;
};

export type MutationOrchestrationResult = {
  handled: boolean;
  status: MutationExecutionStatus;
  legacyFallbackAllowed: boolean;
  intent: MutationIntent;
  executionMode: MutationExecutionMode;
  resolutionContext: ResolvedMutationContext | null;
  plan: MutationPlan | null;
  result: MutationExecutionResult;
  assistantResponse?: string;
  tasksAfter?: MutationTaskSnapshot[];
};
