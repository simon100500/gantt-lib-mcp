import {
  query,
  isSDKAssistantMessage,
  isSDKResultMessage,
} from '@qwen-code/sdk';

import { selectMutationExecutionMode } from './execution-routing.js';
import type { MutationIntent, MutationIntentType, StructuredFragmentPlan } from './types.js';

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
  intentType?: unknown;
  confidence?: unknown;
  entitiesMentioned?: unknown;
  taskTitle?: unknown;
  durationDays?: unknown;
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
  'shift_relative',
  'move_to_date',
  'move_in_hierarchy',
  'link_tasks',
  'unlink_tasks',
  'delete_task',
  'rename_task',
  'update_metadata',
  'expand_wbs',
  'restructure_branch',
  'validate_only',
  'unsupported_or_ambiguous',
]);

function buildSdkEnv(env: SemanticExtractionEnv): Record<string, string> {
  const sdkEnv: Record<string, string> = {
    OPENAI_API_KEY: env.OPENAI_API_KEY,
    OPENAI_BASE_URL: env.OPENAI_BASE_URL,
    OPENAI_MODEL: env.OPENAI_MODEL,
  };

  if (env.OPENAI_CHEAP_MODEL) {
    sdkEnv.OPENAI_CHEAP_MODEL = env.OPENAI_CHEAP_MODEL;
  }

  return sdkEnv;
}

function extractAssistantText(content: Array<{ type: string; text?: string }>): string {
  return content
    .filter((block) => block.type === 'text' && typeof block.text === 'string' && block.text.length > 0)
    .map((block) => block.text ?? '')
    .join('');
}

async function executeMutationSemanticQuery(
  input: MutationIntentQueryInput,
  env: SemanticExtractionEnv,
): Promise<{ content: string }> {
  if (!env.OPENAI_API_KEY) {
    throw new Error('API key not configured for mutation semantic extraction.');
  }

  const session = query({
    prompt: input.prompt,
    options: {
      authType: 'openai',
      model: input.model,
      cwd: process.cwd(),
      permissionMode: 'yolo',
      env: buildSdkEnv(env),
      maxSessionTurns: 2,
    },
  });

  let content = '';

  for await (const event of session) {
    if (isSDKAssistantMessage(event)) {
      const text = extractAssistantText(event.message.content as Array<{ type: string; text?: string }>);
      if (text.trim().length > 0) {
        content = text;
      }
    }

    if (isSDKResultMessage(event)) {
      if (event.is_error) {
        throw new Error(typeof event.error === 'string' ? event.error : 'Mutation semantic extraction failed');
      }

      if (typeof event.result === 'string' && event.result.trim().length > 0) {
        content = event.result;
      }
      break;
    }
  }

  if (content.trim().length === 0) {
    throw new Error('Mutation semantic extraction returned an empty response');
  }

  return { content };
}

function normalizeRequest(userMessage: string): string {
  return userMessage.trim().replace(/\s+/g, ' ').toLowerCase();
}

function buildPrompt(userMessage: string): string {
  return [
    'Return strict JSON only. No markdown, no prose, no code fences.',
    'Interpret the user request for a Gantt mutation pipeline.',
    'Do not rely on fixed trigger words. Infer semantics from the request meaning.',
    'The server will execute only deterministic operations after your extraction.',
    'Allowed intentType values: "add_single_task", "add_repeated_fragment", "shift_relative", "move_to_date", "move_in_hierarchy", "link_tasks", "unlink_tasks", "delete_task", "rename_task", "update_metadata", "expand_wbs", "restructure_branch", "validate_only", "unsupported_or_ambiguous".',
    'Schema:',
    '{"intentType":"...","confidence":0.0-1.0,"entitiesMentioned":["..."],"taskTitle":"optional","durationDays":1,"deltaDays":0,"targetDate":"YYYY-MM-DD","renamedTitle":"optional","metadataFields":{"color":"#RRGGBB","progress":0,"parentId":null},"groupScopeHint":"optional","dependency":{"taskId":"optional","type":"FS|SS|FF|SF","lag":0},"fragmentPlan":{"title":"...","nodes":[{"nodeKey":"stable-key","title":"...","durationDays":1,"dependsOnNodeKeys":["..."]}]}}',
    'Rules:',
    '1. Put entity names that the server must resolve into entitiesMentioned.',
    '2. For add_single_task, provide taskTitle and preferably durationDays.',
    '3. For shift_relative, provide deltaDays.',
    '4. For move_to_date, provide targetDate in ISO format.',
    '5. For rename_task, provide renamedTitle.',
    '6. For update_metadata, provide only the fields explicitly implied by the request.',
    '7. For add_repeated_fragment, provide groupScopeHint and fragmentPlan.',
    '8. For expand_wbs, provide fragmentPlan.',
    '9. For link/unlink, include both endpoint names in entitiesMentioned. Use dependency.type when linking; default to FS if unsure.',
    '10. If the request is too ambiguous for deterministic execution, return unsupported_or_ambiguous.',
    `User request: ${userMessage}`,
  ].join('\n');
}

function requiresResolution(intentType: MutationIntentType): boolean {
  return intentType !== 'unsupported_or_ambiguous' && intentType !== 'validate_only';
}

function requiresSchedulingPlacement(intentType: MutationIntentType): boolean {
  return intentType === 'add_single_task'
    || intentType === 'add_repeated_fragment'
    || intentType === 'expand_wbs'
    || intentType === 'restructure_branch';
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

  const nodes = raw.nodes.flatMap((node) => {
    if (!node || typeof node !== 'object') {
      return [];
    }

    const rawNode = node as {
      nodeKey?: unknown;
      title?: unknown;
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

    return [{
      nodeKey: rawNode.nodeKey.trim(),
      title: rawNode.title.trim(),
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
  const confidence = typeof parsed.confidence === 'number' && !Number.isNaN(parsed.confidence)
    ? Math.max(0, Math.min(1, parsed.confidence))
    : 0.4;

  const fragmentPlan = parseFragmentPlan(parsed.fragmentPlan);
  const dependencyRaw = parsed.dependency && typeof parsed.dependency === 'object'
    ? parsed.dependency as { taskId?: unknown; type?: unknown; lag?: unknown }
    : null;
  const metadataRaw = parsed.metadataFields && typeof parsed.metadataFields === 'object'
    ? parsed.metadataFields as { color?: unknown; progress?: unknown; parentId?: unknown }
    : null;

  const intentWithoutMode = {
    intentType,
    confidence,
    rawRequest: userMessage.trim(),
    normalizedRequest: normalizeRequest(userMessage),
    entitiesMentioned: asStringArray(parsed.entitiesMentioned),
    requiresResolution: requiresResolution(intentType),
    requiresSchedulingPlacement: requiresSchedulingPlacement(intentType),
    executionMode: 'deterministic',
    taskTitle: typeof parsed.taskTitle === 'string' ? parsed.taskTitle.trim() : undefined,
    durationDays: typeof parsed.durationDays === 'number' ? Math.max(1, Math.round(parsed.durationDays)) : undefined,
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
  const intentWithoutMode = {
    intentType: 'unsupported_or_ambiguous' as const,
    confidence: 0.2,
    rawRequest: userMessage.trim(),
    normalizedRequest: normalizeRequest(userMessage),
    entitiesMentioned: [],
    requiresResolution: false,
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
