import type { GenerationMode, ModelRoutingDecision } from './types.js';

type ModelRoutingEnv = {
  OPENAI_MODEL?: string;
  OPENAI_CHEAP_MODEL?: string;
  model?: string;
  cheap_model?: string;
};

type ResolveModelRoutingDecisionInput = {
  route: GenerationMode;
  env: ModelRoutingEnv;
};

export function resolveModelRoutingDecision(
  input: ResolveModelRoutingDecisionInput,
): ModelRoutingDecision {
  const strongModel = input.env.OPENAI_MODEL ?? input.env.model;
  const cheapModel = input.env.OPENAI_CHEAP_MODEL ?? input.env.cheap_model;

  if (!strongModel) {
    throw new Error('OPENAI_MODEL or model is required for model routing');
  }

  if (input.route === 'initial_generation') {
    return {
      route: input.route,
      tier: 'strong',
      selectedModel: strongModel,
      reason: 'initial_generation_requires_strong_model',
    };
  }

  if (cheapModel) {
    return {
      route: input.route,
      tier: 'cheap',
      selectedModel: cheapModel,
      reason: 'mutation_prefers_cheap_model',
    };
  }

  return {
    route: input.route,
    tier: 'main_fallback',
    selectedModel: strongModel,
    reason: 'cheap_model_missing_fallback_to_main',
  };
}
