import type { MutationExecutionMode, MutationIntent } from './types.js';

export function selectMutationExecutionMode(intent: MutationIntent): MutationExecutionMode {
  switch (intent.routeEnvelope.route) {
    case 'fast_path':
      return 'deterministic';
    case 'specialized_fast_path':
      return 'hybrid';
    case 'agent_path':
    case 'clarify':
      return 'full_agent';
  }
}

export function prefersEmbeddedDirectToolPath(intent: MutationIntent): boolean {
  return selectMutationExecutionMode(intent) !== 'full_agent';
}

export function isCompatibilityFallbackExecutionMode(mode: MutationExecutionMode): boolean {
  return mode === 'full_agent';
}
