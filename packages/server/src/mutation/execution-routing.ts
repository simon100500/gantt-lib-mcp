import type { MutationExecutionMode, MutationIntent } from './types.js';

export function selectMutationExecutionMode(intent: MutationIntent): MutationExecutionMode {
  switch (intent.intentType) {
    case 'add_single_task':
    case 'shift_relative':
    case 'move_to_date':
    case 'move_in_hierarchy':
    case 'link_tasks':
    case 'unlink_tasks':
    case 'delete_task':
    case 'rename_task':
    case 'update_metadata':
    case 'validate_only':
      return 'deterministic';
    case 'add_repeated_fragment':
    case 'expand_wbs':
      return 'hybrid';
    case 'restructure_branch':
    case 'unsupported_or_ambiguous':
      return 'full_agent';
  }
}

export function prefersEmbeddedDirectToolPath(intent: MutationIntent): boolean {
  return selectMutationExecutionMode(intent) !== 'full_agent';
}

export function isCompatibilityFallbackExecutionMode(mode: MutationExecutionMode): boolean {
  return mode === 'full_agent';
}
