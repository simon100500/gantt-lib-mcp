import { selectMutationExecutionMode } from './execution-routing.js';
import type {
  FragmentNode,
  MutationIntent,
  MutationIntentType,
  MutationRiskLevel,
  MutationRoute,
  MutationRouteEnvelope,
  StructuredFragmentPlan,
} from './types.js';

type MutationIntentQueryInput = {
  prompt: string;
  model: string;
  stage: 'mutation_semantic_extraction';
};

type MutationIntentQueryResult = string | { content?: string };

type SemanticExtractionEnv = {
  OPENAI_API_KEY: string;
  OPENAI_BASE_URL: string;
  OPENAI_MODEL: string;
  OPENAI_CHEAP_MODEL?: string;
};

type RawMutationIntentPayload = {
  route?: unknown;
  intentFamily?: unknown;
  intentType?: unknown;
  confidence?: unknown;
  riskLevel?: unknown;
  params?: unknown;
  ambiguities?: unknown;
  entitiesMentioned?: unknown;
  taskTitle?: unknown;
  taskType?: unknown;
  durationDays?: unknown;
  durationDeltaDays?: unknown;
  durationMultiplier?: unknown;
  deltaDays?: unknown;
  targetDate?: unknown;
  renamedTitle?: unknown;
  metadataFields?: unknown;
  groupScopeHint?: unknown;
  dependency?: unknown;
  fragmentPlan?: unknown;
};

export type ClassifyMutationIntentInput = {
  userMessage: string;
  env: SemanticExtractionEnv;
  semanticIntentQuery?: (input: MutationIntentQueryInput) => Promise<MutationIntentQueryResult>;
};

const VALID_INTENT_TYPES = new Set<MutationIntentType>([
  'add_single_task',
  'add_repeated_fragment',
  'change_duration',
  'shift_relative',
  'move_to_date',
  'move_in_hierarchy',
  'link_tasks',
  'unlink_tasks',
  'delete_task',
  'rename_task',
  'update_metadata',
  'decompose_task',
  'expand_wbs',
  'restructure_branch',
  'validate_only',
  'unsupported_or_ambiguous',
]);

const VALID_ROUTES = new Set<MutationRoute>([
  'fast_path',
  'specialized_fast_path',
  'agent_path',
  'clarify',
]);

const VALID_RISK_LEVELS = new Set<MutationRiskLevel>(['S0', 'S1', 'S2', 'S3']);

const MUTATION_INTENT_HTTP_TIMEOUT_MS = 8_000;

async function executeMutationSemanticQuery(
  input: MutationIntentQueryInput,
  env: SemanticExtractionEnv,
): Promise<{ content: string }> {
  if (!env.OPENAI_API_KEY) {
    throw new Error('API key not configured for mutation semantic extraction.');
  }

  const abortController = new AbortController();
  const timeoutHandle = setTimeout(() => abortController.abort(), MUTATION_INTENT_HTTP_TIMEOUT_MS);

  try {
    const baseUrl = env.OPENAI_BASE_URL.endsWith('/')
      ? env.OPENAI_BASE_URL
      : `${env.OPENAI_BASE_URL}/`;
    const response = await fetch(new URL('chat/completions', baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: input.model,
        temperature: 0,
        messages: [
          {
            role: 'system',
            content: 'Return strict JSON only. No markdown, no prose, no code fences.',
          },
          {
            role: 'user',
            content: input.prompt,
          },
        ],
        response_format: { type: 'json_object' },
      }),
      signal: abortController.signal,
    });

    if (!response.ok) {
      throw new Error(`Mutation semantic extraction HTTP ${response.status}`);
    }

    const payload = await response.json() as {
      choices?: Array<{
        message?: {
          content?: string | Array<{ type?: string; text?: string }>;
        };
      }>;
    };
    const rawContent = payload.choices?.[0]?.message?.content;
    const content = typeof rawContent === 'string'
      ? rawContent
      : Array.isArray(rawContent)
        ? rawContent
          .filter((block) => block.type === 'text' && typeof block.text === 'string')
          .map((block) => block.text ?? '')
          .join('')
        : '';

    if (content.trim().length === 0) {
      throw new Error('Mutation semantic extraction returned an empty response');
    }

    return { content };
  } finally {
    clearTimeout(timeoutHandle);
  }
}

function normalizeRequest(userMessage: string): string {
  return userMessage.trim().replace(/\s+/g, ' ').toLowerCase();
}

function buildPrompt(userMessage: string): string {
  return [
    'Interpret the user request for a Gantt mutation routing pipeline.',
    'Return strict routing JSON only. Do not rely on fixed trigger words. Infer semantics from request meaning.',
    'The router must be cheap and schema-constrained. Never generate DB payloads, task IDs, tool calls, or committed mutations.',
    'Allowed route values: "fast_path", "specialized_fast_path", "agent_path", "clarify".',
    'Allowed riskLevel values: "S0", "S1", "S2", "S3".',
    'Allowed intentType values: "add_single_task", "add_repeated_fragment", "change_duration", "shift_relative", "move_to_date", "move_in_hierarchy", "link_tasks", "unlink_tasks", "delete_task", "rename_task", "update_metadata", "decompose_task", "expand_wbs", "restructure_branch", "validate_only", "unsupported_or_ambiguous".',
    'Schema:',
    '{"route":"fast_path|specialized_fast_path|agent_path|clarify","intentFamily":"task_edit|structure|planning|validation","intentType":"...","confidence":0.0-1.0,"riskLevel":"S0|S1|S2|S3","params":{},"ambiguities":["..."],"entitiesMentioned":["..."],"taskTitle":"optional","taskType":"task|milestone","durationDays":1,"durationDeltaDays":5,"durationMultiplier":2,"deltaDays":0,"targetDate":"YYYY-MM-DD","renamedTitle":"optional","metadataFields":{"color":"#RRGGBB","progress":0,"parentId":null},"groupScopeHint":"optional","dependency":{"taskId":"optional","type":"FS|SS|FF|SF","lag":0},"fragmentPlan":{"title":"...","nodes":[{"nodeKey":"stable-key","title":"...","taskType":"task|milestone","durationDays":1,"dependsOnNodeKeys":["..."]}]}}',
    'Rules:',
    '1. Always fill route, intentFamily, intentType, confidence, riskLevel, params, and ambiguities.',
    '2. Put entity names that the server must resolve into entitiesMentioned.',
    '3. For structural decomposition requests such as "разбей ... поэтажно", use route "specialized_fast_path", intentType "decompose_task", riskLevel "S2", and params.executor "split_task".',
    '4. Use route "clarify" when the request is structurally ambiguous or target resolution is missing.',
    '5. Use route "agent_path" only for broad planning, tradeoff, resource, or optimization requests.',
    '6. Never guess task IDs, parent IDs, or DB payloads.',
    '7. For add_single_task, provide taskTitle and preferably durationDays.',
    '8. For change_duration, provide exactly one duration shape: durationMultiplier for relative scaling like "в 2 раза", "в 1.5 раза", "на 50%"; durationDeltaDays for additive/subtractive phrases like "на 20 дней", "еще на 5 дней", "уменьши на 3 дня"; durationDays only for explicit absolute target duration like "до 10 дней" or "сделай 10 дней".',
    '9. For shift_relative, provide deltaDays.',
    '10. For move_to_date, provide targetDate in ISO format.',
    '11. For rename_task, provide renamedTitle.',
    '12. For update_metadata, provide only the fields explicitly implied by the request.',
    '13. For add_repeated_fragment, provide groupScopeHint and fragmentPlan.',
    '14. For expand_wbs, provide fragmentPlan.',
    '15. For link/unlink, include both endpoint names in entitiesMentioned. Use dependency.type when linking; default to FS if unsure.',
    '16. If the request is too ambiguous for safe deterministic or specialized execution, return route "clarify" or "agent_path" instead of defaulting to fast_path.',
    `User request: ${userMessage}`,
  ].join('\n');
}

function requiresResolution(routeEnvelope: MutationRouteEnvelope): boolean {
  if (routeEnvelope.route === 'clarify') {
    return false;
  }

  return routeEnvelope.intentType !== 'validate_only';
}

function requiresSchedulingPlacement(routeEnvelope: MutationRouteEnvelope): boolean {
  return routeEnvelope.route !== 'clarify' && (
    routeEnvelope.intentType === 'add_single_task'
    || routeEnvelope.intentType === 'add_repeated_fragment'
    || routeEnvelope.intentType === 'expand_wbs'
    || routeEnvelope.intentType === 'restructure_branch'
    || routeEnvelope.intentType === 'decompose_task'
  );
}

function readQueryContent(result: MutationIntentQueryResult): string {
  if (typeof result === 'string') {
    return result;
  }

  if (typeof result.content === 'string') {
    return result.content;
  }

  throw new Error('Mutation semantic query returned an unsupported payload');
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(
    value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean),
  )];
}

function readParamsRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return { ...(value as Record<string, unknown>) };
}

function deriveRouteEnvelope(parsed: RawMutationIntentPayload, intentType: MutationIntentType): MutationRouteEnvelope {
  const route = typeof parsed.route === 'string' && VALID_ROUTES.has(parsed.route as MutationRoute)
    ? parsed.route as MutationRoute
    : intentType === 'decompose_task'
      ? 'specialized_fast_path'
      : intentType === 'unsupported_or_ambiguous'
        ? 'clarify'
        : 'fast_path';

  const confidence = typeof parsed.confidence === 'number' && !Number.isNaN(parsed.confidence)
    ? Math.max(0, Math.min(1, parsed.confidence))
    : route === 'clarify'
      ? 0.2
      : 0.4;

  const riskLevel = typeof parsed.riskLevel === 'string' && VALID_RISK_LEVELS.has(parsed.riskLevel as MutationRiskLevel)
    ? parsed.riskLevel as MutationRiskLevel
    : route === 'specialized_fast_path'
      ? 'S2'
      : route === 'agent_path'
        ? 'S3'
        : route === 'clarify'
          ? 'S2'
          : 'S1';

  return {
    route,
    intentFamily: typeof parsed.intentFamily === 'string' && parsed.intentFamily.trim().length > 0
      ? parsed.intentFamily.trim()
      : route === 'specialized_fast_path'
        ? 'structure'
        : route === 'agent_path'
          ? 'planning'
          : route === 'clarify'
            ? 'clarification'
            : 'task_edit',
    intentType,
    confidence,
    riskLevel,
    params: readParamsRecord(parsed.params),
    ambiguities: asStringArray(parsed.ambiguities),
  };
}

function parseFragmentPlan(value: unknown): StructuredFragmentPlan | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const raw = value as {
    title?: unknown;
    nodes?: unknown;
    why?: unknown;
  };

  if (typeof raw.title !== 'string' || !Array.isArray(raw.nodes)) {
    return undefined;
  }

  const nodes: FragmentNode[] = raw.nodes.flatMap((node) => {
    if (!node || typeof node !== 'object') {
      return [];
    }

    const rawNode = node as {
      nodeKey?: unknown;
      title?: unknown;
      taskType?: unknown;
      durationDays?: unknown;
      dependsOnNodeKeys?: unknown;
    };

    if (
      typeof rawNode.nodeKey !== 'string'
      || typeof rawNode.title !== 'string'
      || typeof rawNode.durationDays !== 'number'
      || !Array.isArray(rawNode.dependsOnNodeKeys)
    ) {
      return [];
    }

    const taskType = rawNode.taskType === 'task' || rawNode.taskType === 'milestone'
      ? rawNode.taskType
      : undefined;

    return [{
      nodeKey: rawNode.nodeKey.trim(),
      title: rawNode.title.trim(),
      taskType,
      durationDays: Math.max(1, Math.round(rawNode.durationDays)),
      dependsOnNodeKeys: asStringArray(rawNode.dependsOnNodeKeys),
    }];
  });

  if (nodes.length === 0) {
    return undefined;
  }

  return {
    title: raw.title.trim(),
    nodes,
    why: typeof raw.why === 'string' && raw.why.trim().length > 0
      ? raw.why.trim()
      : 'Structured fragment plan extracted by the mutation semantic model.',
  };
}

function parseIntentPayload(userMessage: string, payload: string): MutationIntent {
  const parsed = JSON.parse(payload) as RawMutationIntentPayload;

  if (typeof parsed.intentType !== 'string' || !VALID_INTENT_TYPES.has(parsed.intentType as MutationIntentType)) {
    throw new Error('Mutation semantic payload has invalid intentType');
  }

  const intentType = parsed.intentType as MutationIntentType;
  const routeEnvelope = deriveRouteEnvelope(parsed, intentType);
  const confidence = routeEnvelope.confidence;

  const fragmentPlan = parseFragmentPlan(parsed.fragmentPlan);
  const dependencyRaw = parsed.dependency && typeof parsed.dependency === 'object'
    ? parsed.dependency as { taskId?: unknown; type?: unknown; lag?: unknown }
    : null;
  const metadataRaw = parsed.metadataFields && typeof parsed.metadataFields === 'object'
    ? parsed.metadataFields as { color?: unknown; progress?: unknown; parentId?: unknown }
    : null;

  const intentWithoutMode = {
    routeEnvelope,
    intentType,
    confidence,
    rawRequest: userMessage.trim(),
    normalizedRequest: normalizeRequest(userMessage),
    entitiesMentioned: asStringArray(parsed.entitiesMentioned),
    requiresResolution: requiresResolution(routeEnvelope),
    requiresSchedulingPlacement: requiresSchedulingPlacement(routeEnvelope),
    executionMode: 'deterministic',
    taskTitle: typeof parsed.taskTitle === 'string'
      ? parsed.taskTitle.trim()
      : typeof routeEnvelope.params.taskTitle === 'string'
        ? routeEnvelope.params.taskTitle
        : undefined,
    taskType: parsed.taskType === 'task' || parsed.taskType === 'milestone' ? parsed.taskType : undefined,
    durationDays: typeof parsed.durationDays === 'number'
      ? Math.max(1, Math.round(parsed.durationDays))
      : typeof routeEnvelope.params.durationDays === 'number'
        ? Math.max(1, Math.round(routeEnvelope.params.durationDays))
        : undefined,
    durationDeltaDays: typeof parsed.durationDeltaDays === 'number' ? Math.round(parsed.durationDeltaDays) : undefined,
    durationMultiplier: typeof parsed.durationMultiplier === 'number' && Number.isFinite(parsed.durationMultiplier)
      ? Math.max(parsed.durationMultiplier, 0.1)
      : undefined,
    deltaDays: typeof parsed.deltaDays === 'number' ? Math.round(parsed.deltaDays) : undefined,
    targetDate: typeof parsed.targetDate === 'string' ? parsed.targetDate.trim() : undefined,
    renamedTitle: typeof parsed.renamedTitle === 'string' ? parsed.renamedTitle.trim() : undefined,
    metadataFields: metadataRaw
      ? {
          color: typeof metadataRaw.color === 'string' ? metadataRaw.color.trim() : undefined,
          progress: typeof metadataRaw.progress === 'number' ? metadataRaw.progress : undefined,
          parentId: typeof metadataRaw.parentId === 'string' ? metadataRaw.parentId : metadataRaw.parentId === null ? null : undefined,
        }
      : undefined,
    groupScopeHint: typeof parsed.groupScopeHint === 'string' ? parsed.groupScopeHint.trim() : undefined,
    dependency: dependencyRaw && (
      dependencyRaw.type === 'FS'
      || dependencyRaw.type === 'SS'
      || dependencyRaw.type === 'FF'
      || dependencyRaw.type === 'SF'
    )
      ? {
          taskId: typeof dependencyRaw.taskId === 'string' ? dependencyRaw.taskId.trim() : undefined,
          type: dependencyRaw.type,
          lag: typeof dependencyRaw.lag === 'number' ? Math.round(dependencyRaw.lag) : undefined,
        }
      : undefined,
    fragmentPlan,
  } satisfies Omit<MutationIntent, 'executionMode'> & { executionMode: 'deterministic' };

  return {
    ...intentWithoutMode,
    executionMode: selectMutationExecutionMode(intentWithoutMode),
  };
}

function fallbackIntent(userMessage: string): MutationIntent {
  const routeEnvelope: MutationRouteEnvelope = {
    route: 'clarify',
    intentFamily: 'clarification',
    intentType: 'unsupported_or_ambiguous',
    confidence: 0.2,
    riskLevel: 'S2',
    params: {},
    ambiguities: ['route_schema_invalid'],
  };
  const intentWithoutMode = {
    routeEnvelope,
    intentType: 'unsupported_or_ambiguous' as const,
    confidence: 0.2,
    rawRequest: userMessage.trim(),
    normalizedRequest: normalizeRequest(userMessage),
    entitiesMentioned: [],
    requiresResolution: requiresResolution(routeEnvelope),
    requiresSchedulingPlacement: false,
    executionMode: 'deterministic' as const,
  };

  return {
    ...intentWithoutMode,
    executionMode: selectMutationExecutionMode(intentWithoutMode),
  };
}

export async function classifyMutationIntent(input: ClassifyMutationIntentInput): Promise<MutationIntent> {
  const semanticIntentQuery = input.semanticIntentQuery
    ?? ((queryInput: MutationIntentQueryInput) => executeMutationSemanticQuery(queryInput, input.env));

  try {
    const result = await semanticIntentQuery({
      prompt: buildPrompt(input.userMessage),
      model: input.env.OPENAI_CHEAP_MODEL ?? input.env.OPENAI_MODEL,
      stage: 'mutation_semantic_extraction',
    });

    return parseIntentPayload(input.userMessage, readQueryContent(result));
  } catch {
    return fallbackIntent(input.userMessage);
  }
}
