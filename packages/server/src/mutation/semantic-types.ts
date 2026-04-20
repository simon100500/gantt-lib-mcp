export type SemanticPlanAmbiguity =
  | 'none'
  | 'low_confidence_target'
  | 'missing_anchor'
  | 'unsupported';

export type SemanticMutationPlan = {
  ambiguity: SemanticPlanAmbiguity;
  explanation?: string;
  operations: SemanticOperation[];
};

export type SemanticOperation =
  | {
      action: 'change_duration';
      targetHint: string;
      durationMode: 'absolute_days' | 'delta_days' | 'multiplier';
      durationValue: number;
      anchor?: 'start' | 'end';
    }
  | {
      action: 'add_task';
      title: string;
      taskType?: 'task' | 'milestone';
      durationDays?: number;
      placement: {
        mode: 'after' | 'before' | 'inside_tail';
        anchorHint?: string;
        parentHint?: string;
      };
    }
  | {
      action: 'move_task';
      targetHint: string;
      moveMode: 'to_date' | 'relative_delta' | 'to_parent';
      targetDate?: string;
      deltaDays?: number;
      parentHint?: string;
    }
  | {
      action: 'rename_task';
      targetHint: string;
      newTitle: string;
    }
  | {
      action: 'delete_task';
      targetHint: string;
    }
  | {
      action: 'link_tasks';
      predecessorHint: string;
      successorHint: string;
      dependencyType?: 'FS' | 'SS' | 'FF' | 'SF';
      lagDays?: number;
    }
  | {
      action: 'unlink_tasks';
      predecessorHint: string;
      successorHint: string;
    }
  | {
      action: 'move_in_hierarchy';
      targetHint: string;
      parentHint: string | null;
    };

export type ResolvedSemanticMutationPlan = {
  ambiguity: SemanticPlanAmbiguity;
  explanation?: string;
  confidence: number;
  operations: ResolvedSemanticOperation[];
};

export type ResolvedSemanticOperation =
  | {
      action: 'change_duration';
      targetHint: string;
      targetId: string;
      durationMode: 'absolute_days' | 'delta_days' | 'multiplier';
      durationValue: number;
      anchor: 'start' | 'end';
    }
  | {
      action: 'add_task';
      title: string;
      taskType?: 'task' | 'milestone';
      durationDays: number;
      placement: {
        mode: 'after' | 'before' | 'inside_tail';
        anchorTaskId?: string;
        parentId?: string | null;
      };
    }
  | {
      action: 'move_task';
      targetHint: string;
      targetId: string;
      moveMode: 'to_date' | 'relative_delta' | 'to_parent';
      targetDate?: string;
      deltaDays?: number;
      parentId?: string | null;
    }
  | {
      action: 'rename_task';
      targetHint: string;
      targetId: string;
      newTitle: string;
    }
  | {
      action: 'delete_task';
      targetHint: string;
      targetId: string;
    }
  | {
      action: 'link_tasks';
      predecessorHint: string;
      predecessorId: string;
      successorHint: string;
      successorId: string;
      dependencyType: 'FS' | 'SS' | 'FF' | 'SF';
      lagDays?: number;
    }
  | {
      action: 'unlink_tasks';
      predecessorHint: string;
      predecessorId: string;
      successorHint: string;
      successorId: string;
    }
  | {
      action: 'move_in_hierarchy';
      targetHint: string;
      targetId: string;
      parentId: string | null;
    };

