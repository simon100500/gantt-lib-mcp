import { interpretInitialRequest } from './interpreter.js';
import { normalizeInitialRequest } from './intake-normalization.js';
import type { GenerationMode, InitialRequestInterpretation } from './types.js';

export type RouteDecisionReason =
  | 'interpreted_whole_project_initial_generation'
  | 'interpreted_partial_scope_initial_generation'
  | 'interpreted_explicit_worklist_initial_generation'
  | 'interpreted_ambiguous_initial_generation'
  | 'interpreted_targeted_edit_mutation'
  | 'interpreted_existing_scope_mutation'
  | 'fallback_empty_project_defaults_to_initial_generation'
  | 'fallback_non_empty_project_defaults_to_mutation';

type RouteDecisionQueryInput = {
  prompt: string;
  model: string;
  stage: 'initial_request_interpretation' | 'initial_request_interpretation_repair';
};

type RouteDecisionQueryResult = string | { content?: string };

export type SelectAgentRouteInput = {
  userMessage: string;
  taskCount: number;
  hasHierarchy: boolean;
  recentConversationSummary?: string;
  model?: string;
  routeDecisionQuery?: (input: RouteDecisionQueryInput) => Promise<RouteDecisionQueryResult>;
};

export type AgentRouteSelection = {
  route: GenerationMode;
  confidence: number;
  reason: RouteDecisionReason;
  signals: string[];
  interpretation: InitialRequestInterpretation;
  isEmptyProject: boolean;
  hasHierarchy: boolean;
  taskCount: number;
  projectStateSummary: string;
  usedModelDecision: boolean;
};

function buildProjectStateSummary(input: Pick<SelectAgentRouteInput, 'taskCount' | 'hasHierarchy'>): string {
  const isEmptyProject = input.taskCount === 0;
  return [
    `empty_project=${isEmptyProject}`,
    `task_count=${input.taskCount}`,
    `has_hierarchy=${input.hasHierarchy}`,
  ].join(', ');
}

function mapReason(selection: {
  isEmptyProject: boolean;
  usedModelDecision: boolean;
  interpretation: InitialRequestInterpretation;
}): RouteDecisionReason {
  if (!selection.usedModelDecision) {
    return selection.isEmptyProject
      ? 'fallback_empty_project_defaults_to_initial_generation'
      : 'fallback_non_empty_project_defaults_to_mutation';
  }

  if (selection.interpretation.route === 'mutation') {
    return selection.interpretation.requestKind === 'targeted_edit'
      ? 'interpreted_targeted_edit_mutation'
      : 'interpreted_existing_scope_mutation';
  }

  if (selection.interpretation.requestKind === 'explicit_worklist') {
    return 'interpreted_explicit_worklist_initial_generation';
  }

  if (selection.interpretation.requestKind === 'partial_scope') {
    return 'interpreted_partial_scope_initial_generation';
  }

  if (selection.interpretation.requestKind === 'ambiguous') {
    return 'interpreted_ambiguous_initial_generation';
  }

  return 'interpreted_whole_project_initial_generation';
}

export async function selectAgentRoute(input: SelectAgentRouteInput): Promise<AgentRouteSelection> {
  const isEmptyProject = input.taskCount === 0;
  const projectStateSummary = buildProjectStateSummary(input);
  const normalizedRequest = normalizeInitialRequest(input.userMessage);
  const interpreterResult = await interpretInitialRequest({
    userMessage: input.userMessage,
    normalizedRequest,
    projectState: {
      taskCount: input.taskCount,
      hasHierarchy: input.hasHierarchy,
      isEmptyProject,
    },
    model: input.model ?? 'unavailable',
    interpretationQuery: async (queryInput) => {
      if (!input.routeDecisionQuery || !input.model) {
        throw new Error('model_unavailable');
      }

      const result = await input.routeDecisionQuery(queryInput);
      if (typeof result === 'string') {
        return result;
      }

      if (typeof result.content === 'string') {
        return result.content;
      }

      throw new Error('Route interpretation query returned an unsupported payload');
    },
  });

  return {
    route: interpreterResult.interpretation.route,
    confidence: interpreterResult.interpretation.confidence,
    reason: mapReason({
      isEmptyProject,
      usedModelDecision: interpreterResult.usedModelDecision,
      interpretation: interpreterResult.interpretation,
    }),
    signals: interpreterResult.interpretation.signals,
    interpretation: interpreterResult.interpretation,
    isEmptyProject,
    hasHierarchy: input.hasHierarchy,
    taskCount: input.taskCount,
    projectStateSummary,
    usedModelDecision: interpreterResult.usedModelDecision,
  };
}
