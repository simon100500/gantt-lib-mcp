import type {
  InitialRequestClarificationReason,
  InitialRequestInterpretation,
  InitialRequestInterpretationRoute,
  InitialRequestKind,
  InitialRequestObjectProfile,
  InitialRequestProjectArchetype,
  LocationScope,
  NormalizedInitialRequest,
  PlanningMode,
  ScopeMode,
  WorklistPolicy,
} from './types.js';

type InterpretationQueryInput = {
  prompt: string;
  model: string;
  stage: 'initial_request_interpretation' | 'initial_request_interpretation_repair';
};

type InterpretationQueryResult = string | { content?: string };

type InitialRequestProjectState = {
  taskCount: number;
  hasHierarchy: boolean;
  isEmptyProject?: boolean;
};

export type InterpretInitialRequestInput = {
  userMessage: string;
  normalizedRequest: NormalizedInitialRequest;
  projectState: InitialRequestProjectState;
  model: string;
  interpretationQuery: (input: InterpretationQueryInput) => Promise<InterpretationQueryResult>;
};

export type InterpretationFallbackReason =
  | 'none'
  | 'model_unavailable'
  | 'schema_invalid'
  | 'empty_response';

export type InitialRequestInterpretationResult = {
  interpretation: InitialRequestInterpretation;
  usedModelDecision: boolean;
  repairAttempted: boolean;
  fallbackReason: InterpretationFallbackReason;
};

type RawInterpretationPayload = {
  route?: unknown;
  confidence?: unknown;
  requestKind?: unknown;
  planningMode?: unknown;
  scopeMode?: unknown;
  objectProfile?: unknown;
  projectArchetype?: unknown;
  locationScope?: unknown;
  worklistPolicy?: unknown;
  clarification?: unknown;
  signals?: unknown;
};

const VALID_ROUTE_VALUES = new Set<InitialRequestInterpretationRoute>([
  'initial_generation',
  'mutation',
]);

const VALID_REQUEST_KIND_VALUES = new Set<InitialRequestKind>([
  'whole_project',
  'partial_scope',
  'explicit_worklist',
  'targeted_edit',
  'ambiguous',
]);

const VALID_PLANNING_MODE_VALUES = new Set<PlanningMode>([
  'whole_project_bootstrap',
  'partial_scope_bootstrap',
  'worklist_bootstrap',
]);

const VALID_SCOPE_MODE_VALUES = new Set<ScopeMode>([
  'full_project',
  'partial_scope',
  'explicit_worklist',
]);

const VALID_OBJECT_PROFILE_VALUES = new Set<InitialRequestObjectProfile>([
  'unknown',
  'office_fitout',
  'kindergarten',
  'residential_multi_section',
]);

const VALID_PROJECT_ARCHETYPE_VALUES = new Set<InitialRequestProjectArchetype>([
  'unknown',
  'new_building',
  'renovation',
]);

const VALID_WORKLIST_POLICY_VALUES = new Set<WorklistPolicy>([
  'strict_worklist',
  'worklist_plus_inferred_supporting_tasks',
]);

const VALID_CLARIFICATION_REASON_VALUES = new Set<InitialRequestClarificationReason>([
  'none',
  'ambiguous_list',
  'missing_scope',
  'scope_boundary_ambiguity',
  'fragment_target_ambiguity',
  'worklist_completeness_ambiguity',
]);

function buildLocationScope(locationScope?: LocationScope): InitialRequestInterpretation['locationScope'] {
  return {
    sections: [...new Set(locationScope?.sections ?? [])],
    floors: [...new Set(locationScope?.floors ?? [])],
    zones: [...new Set(locationScope?.zones ?? [])],
  };
}

function readQueryContent(result: InterpretationQueryResult): string {
  if (typeof result === 'string') {
    return result;
  }

  if (typeof result.content === 'string') {
    return result.content;
  }

  return '';
}

function extractJsonObject(payload: string): string {
  const trimmed = payload.trim();
  if (trimmed.length === 0) {
    throw new Error('empty_response');
  }

  const start = trimmed.indexOf('{');
  if (start === -1) {
    throw new Error('invalid_json');
  }

  let depth = 0;
  let inString = false;
  let escaped = false;
  let end = -1;

  for (let index = start; index < trimmed.length; index += 1) {
    const char = trimmed[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === '{') {
      depth += 1;
      continue;
    }

    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        end = index + 1;
        break;
      }
    }
  }

  if (end === -1) {
    throw new Error('invalid_json');
  }

  const candidate = trimmed.slice(start, end).trim();
  const trailing = trimmed.slice(end).trim();
  if (candidate.length === 0 || trailing.length > 0) {
    throw new Error('invalid_json');
  }

  return candidate;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(
    value
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter(Boolean),
  )];
}

function parseLocationScope(value: unknown): InitialRequestInterpretation['locationScope'] {
  if (!value || typeof value !== 'object') {
    return {
      sections: [],
      floors: [],
      zones: [],
    };
  }

  const raw = value as {
    sections?: unknown;
    floors?: unknown;
    zones?: unknown;
  };

  return {
    sections: asStringArray(raw.sections),
    floors: asStringArray(raw.floors),
    zones: asStringArray(raw.zones),
  };
}

function parseInterpretationPayload(payload: string): InitialRequestInterpretation {
  const parsed = JSON.parse(extractJsonObject(payload)) as RawInterpretationPayload;

  if (typeof parsed.route !== 'string' || !VALID_ROUTE_VALUES.has(parsed.route as InitialRequestInterpretationRoute)) {
    throw new Error('schema_invalid');
  }

  if (typeof parsed.requestKind !== 'string' || !VALID_REQUEST_KIND_VALUES.has(parsed.requestKind as InitialRequestKind)) {
    throw new Error('schema_invalid');
  }

  if (typeof parsed.planningMode !== 'string' || !VALID_PLANNING_MODE_VALUES.has(parsed.planningMode as PlanningMode)) {
    throw new Error('schema_invalid');
  }

  if (typeof parsed.scopeMode !== 'string' || !VALID_SCOPE_MODE_VALUES.has(parsed.scopeMode as ScopeMode)) {
    throw new Error('schema_invalid');
  }

  if (
    typeof parsed.objectProfile !== 'string'
    || !VALID_OBJECT_PROFILE_VALUES.has(parsed.objectProfile as InitialRequestObjectProfile)
  ) {
    throw new Error('schema_invalid');
  }

  if (
    typeof parsed.projectArchetype !== 'string'
    || !VALID_PROJECT_ARCHETYPE_VALUES.has(parsed.projectArchetype as InitialRequestProjectArchetype)
  ) {
    throw new Error('schema_invalid');
  }

  if (
    typeof parsed.worklistPolicy !== 'string'
    || !VALID_WORKLIST_POLICY_VALUES.has(parsed.worklistPolicy as WorklistPolicy)
  ) {
    throw new Error('schema_invalid');
  }

  const clarification = parsed.clarification && typeof parsed.clarification === 'object'
    ? parsed.clarification as { needed?: unknown; reason?: unknown }
    : null;

  if (
    !clarification
    || typeof clarification.needed !== 'boolean'
    || typeof clarification.reason !== 'string'
    || !VALID_CLARIFICATION_REASON_VALUES.has(clarification.reason as InitialRequestClarificationReason)
  ) {
    throw new Error('schema_invalid');
  }

  const confidence = typeof parsed.confidence === 'number' && !Number.isNaN(parsed.confidence)
    ? Math.max(0, Math.min(1, parsed.confidence))
    : 0.4;

  return {
    route: parsed.route as InitialRequestInterpretationRoute,
    confidence,
    requestKind: parsed.requestKind as InitialRequestKind,
    planningMode: parsed.planningMode as PlanningMode,
    scopeMode: parsed.scopeMode as ScopeMode,
    objectProfile: parsed.objectProfile as InitialRequestObjectProfile,
    projectArchetype: parsed.projectArchetype as InitialRequestProjectArchetype,
    locationScope: parseLocationScope(parsed.locationScope),
    worklistPolicy: parsed.worklistPolicy as WorklistPolicy,
    clarification: {
      needed: clarification.needed,
      reason: clarification.reason as InitialRequestClarificationReason,
    },
    signals: asStringArray(parsed.signals),
  };
}

function buildPrompt(input: InterpretInitialRequestInput): string {
  const projectIsEmpty = input.projectState.isEmptyProject ?? input.projectState.taskCount === 0;
  const locationScope = buildLocationScope(input.normalizedRequest.locationScope);
  const explicitWorklistCount = input.normalizedRequest.explicitWorkItems.length;

  return [
    'Return strict JSON only. No markdown, no prose, no code fences.',
    'Interpret the initial Gantt request into one shared semantic contract.',
    'Allowed enum values:',
    '- route: "initial_generation" | "mutation"',
    '- requestKind: "whole_project" | "partial_scope" | "explicit_worklist" | "targeted_edit" | "ambiguous"',
    '- planningMode: "whole_project_bootstrap" | "partial_scope_bootstrap" | "worklist_bootstrap"',
    '- scopeMode: "full_project" | "partial_scope" | "explicit_worklist"',
    '- objectProfile: "unknown" | "office_fitout" | "kindergarten" | "residential_multi_section"',
    '- projectArchetype: "unknown" | "new_building" | "renovation"',
    '- worklistPolicy: "strict_worklist" | "worklist_plus_inferred_supporting_tasks"',
    '- clarification.reason: "none" | "ambiguous_list" | "missing_scope" | "scope_boundary_ambiguity" | "fragment_target_ambiguity" | "worklist_completeness_ambiguity"',
    'Runtime keyword logic is forbidden. Do not emulate semantic regexes, word lists, or lexical fallbacks.',
    'Infer semantics from the whole request meaning and the project state facts only.',
    'If the request is a targeted_edit against an existing schedule, set route to "mutation".',
    'If the request provides an explicit_worklist for a starter schedule, set scopeMode to "explicit_worklist".',
    'Schema:',
    '{"route":"initial_generation|mutation","confidence":0.0,"requestKind":"whole_project|partial_scope|explicit_worklist|targeted_edit|ambiguous","planningMode":"whole_project_bootstrap|partial_scope_bootstrap|worklist_bootstrap","scopeMode":"full_project|partial_scope|explicit_worklist","objectProfile":"unknown|office_fitout|kindergarten|residential_multi_section","projectArchetype":"unknown|new_building|renovation","locationScope":{"sections":["..."],"floors":["..."],"zones":["..."]},"worklistPolicy":"strict_worklist|worklist_plus_inferred_supporting_tasks","clarification":{"needed":false,"reason":"none|ambiguous_list|missing_scope|scope_boundary_ambiguity|fragment_target_ambiguity|worklist_completeness_ambiguity"},"signals":["..."]}',
    'Examples:',
    'Russian paraphrase broad bootstrap -> {"route":"initial_generation","requestKind":"whole_project","planningMode":"whole_project_bootstrap","scopeMode":"full_project"}',
    'English paraphrase broad bootstrap -> {"route":"initial_generation","requestKind":"whole_project","planningMode":"whole_project_bootstrap","scopeMode":"full_project"}',
    'Partial scope request -> {"route":"initial_generation","requestKind":"partial_scope","planningMode":"partial_scope_bootstrap","scopeMode":"partial_scope"}',
    'Explicit worklist request -> {"route":"initial_generation","requestKind":"explicit_worklist","planningMode":"worklist_bootstrap","scopeMode":"explicit_worklist","worklistPolicy":"strict_worklist"}',
    'Targeted edit request -> {"route":"mutation","requestKind":"targeted_edit","scopeMode":"partial_scope"}',
    'Ambiguous phrasing -> {"route":"initial_generation","requestKind":"ambiguous","clarification":{"needed":true,"reason":"missing_scope"}}',
    `Project facts: ${JSON.stringify({
      taskCount: input.projectState.taskCount,
      hasHierarchy: input.projectState.hasHierarchy,
      isEmptyProject: projectIsEmpty,
      explicitWorklistCount,
      locationScope,
    })}`,
    `Normalized request: ${input.normalizedRequest.normalizedRequest}`,
    `Original request: ${input.userMessage}`,
  ].join('\n');
}

function buildRepairPrompt(input: InterpretInitialRequestInput, previousResponse: string, failureReason: string): string {
  return [
    buildPrompt(input),
    'Repair the previous answer and return one valid JSON object only.',
    `Failure reason: ${failureReason}`,
    `Previous response: ${previousResponse.trim() || '<empty>'}`,
  ].join('\n');
}

function fallbackInterpretation(input: InterpretInitialRequestInput, fallbackReason: InterpretationFallbackReason): InitialRequestInterpretationResult {
  const locationScope = buildLocationScope(input.normalizedRequest.locationScope);
  const explicitWorklistCount = input.normalizedRequest.explicitWorkItems.length;
  const hasLocationScope = locationScope.sections.length > 0
    || locationScope.floors.length > 0
    || locationScope.zones.length > 0;
  const projectIsEmpty = input.projectState.isEmptyProject ?? input.projectState.taskCount === 0;
  const route: InitialRequestInterpretationRoute = projectIsEmpty ? 'initial_generation' : 'mutation';
  const requestKind: InitialRequestKind = explicitWorklistCount >= 3
    ? 'explicit_worklist'
    : hasLocationScope
      ? 'partial_scope'
      : projectIsEmpty
        ? 'whole_project'
        : 'ambiguous';
  const planningMode: PlanningMode = explicitWorklistCount >= 3
    ? 'worklist_bootstrap'
    : hasLocationScope || !projectIsEmpty
      ? 'partial_scope_bootstrap'
      : 'whole_project_bootstrap';
  const scopeMode: ScopeMode = explicitWorklistCount >= 3
    ? 'explicit_worklist'
    : hasLocationScope
      ? 'partial_scope'
      : 'full_project';
  const worklistPolicy: WorklistPolicy = explicitWorklistCount >= 3
    ? 'strict_worklist'
    : 'worklist_plus_inferred_supporting_tasks';
  const clarificationNeeded = requestKind === 'ambiguous';
  const clarificationReason: InitialRequestClarificationReason = clarificationNeeded ? 'missing_scope' : 'none';

  return {
    interpretation: {
      route,
      confidence: projectIsEmpty ? 0.55 : 0.52,
      requestKind,
      planningMode,
      scopeMode,
      objectProfile: 'unknown',
      projectArchetype: 'unknown',
      locationScope,
      worklistPolicy,
      clarification: {
        needed: clarificationNeeded,
        reason: clarificationReason,
      },
      signals: [
        projectIsEmpty ? 'empty_project' : 'non_empty_project',
        input.projectState.hasHierarchy ? 'has_hierarchy' : 'flat_project',
        explicitWorklistCount >= 3 ? `explicit_worklist_count:${explicitWorklistCount}` : 'no_explicit_worklist',
        hasLocationScope ? 'location_scope_present' : 'location_scope_absent',
        `fallback:${fallbackReason}`,
      ],
    },
    usedModelDecision: false,
    repairAttempted: false,
    fallbackReason,
  };
}

async function queryInterpretation(
  input: InterpretInitialRequestInput,
  prompt: string,
  stage: InterpretationQueryInput['stage'],
): Promise<string> {
  const result = await input.interpretationQuery({
    prompt,
    model: input.model,
    stage,
  });

  return readQueryContent(result);
}

export async function interpretInitialRequest(
  input: InterpretInitialRequestInput,
): Promise<InitialRequestInterpretationResult> {
  const basePrompt = buildPrompt(input);

  let initialResponse = '';
  try {
    initialResponse = await queryInterpretation(input, basePrompt, 'initial_request_interpretation');
  } catch {
    return fallbackInterpretation(input, 'model_unavailable');
  }

  if (initialResponse.trim().length === 0) {
    return fallbackInterpretation(input, 'empty_response');
  }

  try {
    return {
      interpretation: parseInterpretationPayload(initialResponse),
      usedModelDecision: true,
      repairAttempted: false,
      fallbackReason: 'none',
    };
  } catch (error) {
    const failureReason = error instanceof Error ? error.message : 'schema_invalid';
    if (failureReason === 'empty_response') {
      return fallbackInterpretation(input, 'empty_response');
    }

    try {
      const repairedResponse = await queryInterpretation(
        input,
        buildRepairPrompt(input, initialResponse, failureReason),
        'initial_request_interpretation_repair',
      );

      if (repairedResponse.trim().length === 0) {
        const fallback = fallbackInterpretation(input, 'empty_response');
        return {
          ...fallback,
          repairAttempted: true,
        };
      }

      return {
        interpretation: parseInterpretationPayload(repairedResponse),
        usedModelDecision: true,
        repairAttempted: true,
        fallbackReason: 'none',
      };
    } catch {
      const fallback = fallbackInterpretation(input, 'schema_invalid');
      return {
        ...fallback,
        repairAttempted: true,
      };
    }
  }
}
