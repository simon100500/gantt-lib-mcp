import type { GenerationMode } from './types.js';

export type RouteDecisionReason =
  | 'empty_project_broad_schedule_creation'
  | 'targeted_existing_schedule_edit'
  | 'narrow_creation_request'
  | 'uncertain_default_to_initial_generation';

type RouteDecisionQueryInput = {
  prompt: string;
  model: string;
  stage: 'route_decision';
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
  isEmptyProject: boolean;
  hasHierarchy: boolean;
  taskCount: number;
  projectStateSummary: string;
  usedModelDecision: boolean;
};

type RawRouteDecision = {
  route?: unknown;
  confidence?: unknown;
  reason?: unknown;
  signals?: unknown;
};

const VALID_REASONS = new Set<RouteDecisionReason>([
  'empty_project_broad_schedule_creation',
  'targeted_existing_schedule_edit',
  'narrow_creation_request',
  'uncertain_default_to_initial_generation',
]);

function buildProjectStateSummary(input: Pick<SelectAgentRouteInput, 'taskCount' | 'hasHierarchy'>): string {
  const isEmptyProject = input.taskCount === 0;
  return [
    `empty_project=${isEmptyProject}`,
    `task_count=${input.taskCount}`,
    `has_hierarchy=${input.hasHierarchy}`,
  ].join(', ');
}

function readQueryContent(result: RouteDecisionQueryResult): string {
  if (typeof result === 'string') {
    return result;
  }

  if (typeof result.content === 'string') {
    return result.content;
  }

  throw new Error('Route decision query returned an unsupported payload');
}

function buildRouteDecisionPrompt(input: SelectAgentRouteInput): string {
  const summary = buildProjectStateSummary(input);
  const recentConversationSummary = input.recentConversationSummary?.trim() || 'none';

  return [
    'Return strict JSON only. No markdown, no prose, no code fences.',
    'Decide the route for a Gantt assistant request.',
    'Allowed routes: "initial_generation" or "mutation".',
    'Allowed reasons: "empty_project_broad_schedule_creation", "targeted_existing_schedule_edit", "narrow_creation_request", "uncertain_default_to_initial_generation".',
    'Prefer "initial_generation" for empty-project broad schedule creation requests, including vague wording.',
    'Prefer "mutation" for targeted edits against an existing schedule or a narrow scoped change request.',
    'Output schema: {"route":"initial_generation|mutation","confidence":0.0-1.0,"reason":"...","signals":["..."]}.',
    `Project state: ${summary}`,
    `Recent conversation summary: ${recentConversationSummary}`,
    `User request: ${input.userMessage}`,
  ].join('\n');
}

function parseRouteDecision(payload: string): Omit<AgentRouteSelection, 'isEmptyProject' | 'hasHierarchy' | 'taskCount' | 'projectStateSummary' | 'usedModelDecision'> {
  const parsed = JSON.parse(payload) as RawRouteDecision;

  if (parsed.route !== 'initial_generation' && parsed.route !== 'mutation') {
    throw new Error('Route decision payload has invalid route');
  }

  if (typeof parsed.confidence !== 'number' || Number.isNaN(parsed.confidence)) {
    throw new Error('Route decision payload has invalid confidence');
  }

  if (typeof parsed.reason !== 'string' || !VALID_REASONS.has(parsed.reason as RouteDecisionReason)) {
    throw new Error('Route decision payload has invalid reason');
  }

  if (!Array.isArray(parsed.signals) || parsed.signals.some((signal) => typeof signal !== 'string')) {
    throw new Error('Route decision payload has invalid signals');
  }

  return {
    route: parsed.route,
    confidence: Math.max(0, Math.min(1, parsed.confidence)),
    reason: parsed.reason as RouteDecisionReason,
    signals: [...new Set(parsed.signals.map((signal) => signal.trim()).filter(Boolean))],
  };
}

function looksLikeTargetedEdit(userMessage: string): boolean {
  const normalized = userMessage.trim().toLowerCase();

  if (/["«»]/.test(normalized)) {
    return true;
  }

  return [
    'сдвин',
    'перенес',
    'передвин',
    'смест',
    'добав',
    'измени',
    'обнов',
    'удал',
    'убер',
    'rename',
    'move',
    'shift',
    'delete',
    'remove',
    'update',
    'under ',
    'dependencies',
    'зависим',
  ].some((marker) => normalized.includes(marker));
}

function fallbackRouteDecision(input: SelectAgentRouteInput): AgentRouteSelection {
  const isEmptyProject = input.taskCount === 0;
  const targetedEdit = looksLikeTargetedEdit(input.userMessage);
  const projectStateSummary = buildProjectStateSummary(input);

  if (!isEmptyProject || targetedEdit) {
    return {
      route: 'mutation',
      confidence: 0.62,
      reason: targeted_existing_schedule_edit_for(input),
      signals: [
        isEmptyProject ? 'empty_project' : 'non_empty_project',
        targetedEdit ? 'targeted_edit_markers' : 'fallback_mutation_bias',
      ],
      isEmptyProject,
      hasHierarchy: input.hasHierarchy,
      taskCount: input.taskCount,
      projectStateSummary,
      usedModelDecision: false,
    };
  }

  return {
    route: 'initial_generation',
    confidence: 0.55,
    reason: 'uncertain_default_to_initial_generation',
    signals: [
      'empty_project',
      'fallback_without_route_model',
      'broad_request_default',
    ],
    isEmptyProject,
    hasHierarchy: input.hasHierarchy,
    taskCount: input.taskCount,
    projectStateSummary,
    usedModelDecision: false,
  };
}

function targeted_existing_schedule_edit_for(input: SelectAgentRouteInput): RouteDecisionReason {
  if (input.taskCount === 0) {
    return 'narrow_creation_request';
  }

  return 'targeted_existing_schedule_edit';
}

export async function selectAgentRoute(input: SelectAgentRouteInput): Promise<AgentRouteSelection> {
  const isEmptyProject = input.taskCount === 0;
  const projectStateSummary = buildProjectStateSummary(input);

  if (!input.routeDecisionQuery || !input.model) {
    return fallbackRouteDecision(input);
  }

  try {
    const result = await input.routeDecisionQuery({
      prompt: buildRouteDecisionPrompt(input),
      model: input.model,
      stage: 'route_decision',
    });
    const decision = parseRouteDecision(readQueryContent(result));

    return {
      ...decision,
      isEmptyProject,
      hasHierarchy: input.hasHierarchy,
      taskCount: input.taskCount,
      projectStateSummary,
      usedModelDecision: true,
    };
  } catch {
    return fallbackRouteDecision(input);
  }
}
