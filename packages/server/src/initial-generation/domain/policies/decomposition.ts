import type { DetailLevel } from '../../types.js';
import type { DecompositionPolicyDefinition } from '../contracts.js';

export const DECOMPOSITION_POLICIES: Record<DetailLevel, DecompositionPolicyDefinition> = {
  low: {
    policyKey: 'low',
    targetTaskRange: { min: 8, max: 16 },
    maxDepth: 3,
    guidance: [
      'Держать укрупнённые work packages без микродекомпозиции.',
    ],
  },
  medium: {
    policyKey: 'medium',
    targetTaskRange: { min: 16, max: 28 },
    maxDepth: 3,
    guidance: [
      'Разбивать график на practical subphases с осмысленными task packages.',
    ],
  },
  high: {
    policyKey: 'high',
    targetTaskRange: { min: 24, max: 40 },
    maxDepth: 3,
    guidance: [
      'Допускать более детальную task-level декомпозицию без ухода в micro-tasks.',
    ],
  },
};
