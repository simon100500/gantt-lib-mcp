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
  taskTitle?: string;
  taskType?: 'task' | 'milestone';
  durationDays?: number;
  deltaDays?: number;
  targetDate?: string;
  renamedTitle?: string;
  metadataFields?: {
    color?: string | null;
    progress?: number;
    parentId?: string | null;
  };
  groupScopeHint?: string;
  dependency?: {
    taskId?: string;
    type: 'FS' | 'SS' | 'FF' | 'SF';
    lag?: number;
  };
  fragmentPlan?: StructuredFragmentPlan;
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
  groupMemberIds: string[];
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
  operations: MutationPlanOperation[];
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
  verificationVerdict: 'not_run' | 'accepted' | 'failed';
  userFacingMessage: string;
  failureReason?: MutationFailureReason;
};

export type MutationTaskSnapshot = {
  id: string;
  name: string;
  startDate?: string;
  endDate?: string;
  type?: 'task' | 'milestone';
  color?: string;
  parentId?: string;
  dependencies?: Array<{ taskId: string; type: string; lag?: number }>;
};

export type MutationOrchestrationResult = {
  handled: boolean;
  status: MutationExecutionStatus;
  legacyFallbackAllowed: boolean;
  failureReason?: MutationFailureReason;
  intent: MutationIntent;
  executionMode: MutationExecutionMode;
  resolutionContext: ResolvedMutationContext | null;
  plan: MutationPlan | null;
  result: MutationExecutionResult;
  assistantResponse?: string;
  tasksAfter?: MutationTaskSnapshot[];
};

export type FragmentNode = {
  nodeKey: string;
  title: string;
  taskType?: 'task' | 'milestone';
  durationDays: number;
  dependsOnNodeKeys: string[];
};

export type StructuredFragmentPlan = {
  title: string;
  nodes: FragmentNode[];
  why: string;
};

export type MutationPlanOperation =
  | {
      kind: 'append_task_after';
      taskId: string;
      title: string;
      taskType?: 'task' | 'milestone';
      predecessorTaskId: string;
      parentId: string | null;
      durationDays: number;
    }
  | {
      kind: 'append_task_before';
      taskId: string;
      title: string;
      taskType?: 'task' | 'milestone';
      successorTaskId: string;
      parentId: string | null;
      durationDays: number;
    }
  | {
      kind: 'append_task_to_container';
      taskId: string;
      title: string;
      taskType?: 'task' | 'milestone';
      containerId: string;
      durationDays: number;
    }
  | {
      kind: 'shift_task_by_delta';
      taskId: string;
      deltaDays: number;
    }
  | {
      kind: 'move_task_to_date';
      taskId: string;
      targetDate: string;
    }
  | {
      kind: 'move_task_in_hierarchy';
      taskId: string;
      newParentId: string | null;
    }
  | {
      kind: 'link_tasks';
      taskId: string;
      dependency: { taskId: string; type: 'FS' | 'SS' | 'FF' | 'SF'; lag?: number };
    }
  | {
      kind: 'unlink_tasks';
      taskId: string;
      depTaskId: string;
    }
  | {
      kind: 'delete_task';
      taskId: string;
    }
  | {
      kind: 'rename_task';
      taskId: string;
      name: string;
    }
  | {
      kind: 'update_task_metadata';
      taskId: string;
      fields: {
        color?: string | null;
        progress?: number;
        parentId?: string | null;
      };
    }
  | {
      kind: 'fanout_fragment_to_groups';
      groupIds: string[];
      fragmentPlan: StructuredFragmentPlan;
    }
  | {
      kind: 'expand_branch_from_plan';
      anchorTaskId: string;
      fragmentPlan: StructuredFragmentPlan;
    };
