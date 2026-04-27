import type { SemanticMutationPlan, SemanticOperation, SemanticPlanAmbiguity } from './semantic-types.js';

type SemanticPlannerQueryInput = {
  prompt: string;
  model: string;
  stage: 'mutation_semantic_planner';
};

type SemanticPlannerQueryResult = string | { content?: string };

type SemanticPlannerEnv = {
  OPENAI_API_KEY: string;
  OPENAI_BASE_URL: string;
  OPENAI_MODEL: string;
  OPENAI_CHEAP_MODEL?: string;
};

export type PlanSemanticMutationInput = {
  userMessage: string;
  env: SemanticPlannerEnv;
  semanticPlannerQuery?: (input: SemanticPlannerQueryInput) => Promise<SemanticPlannerQueryResult>;
};

const SEMANTIC_PLANNER_HTTP_TIMEOUT_MS = 8_000;

async function executeSemanticPlannerQuery(
  input: SemanticPlannerQueryInput,
  env: SemanticPlannerEnv,
): Promise<{ content: string }> {
  if (!env.OPENAI_API_KEY) {
    throw new Error('API key not configured for semantic mutation planner.');
  }

  const abortController = new AbortController();
  const timeoutHandle = setTimeout(() => abortController.abort(), SEMANTIC_PLANNER_HTTP_TIMEOUT_MS);

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
      throw new Error(`Semantic mutation planner HTTP ${response.status}`);
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
      throw new Error('Semantic mutation planner returned an empty response');
    }

    return { content };
  } finally {
    clearTimeout(timeoutHandle);
  }
}

function buildPrompt(userMessage: string): string {
  return [
    'Return a semantic mutation plan for a Gantt mutation request.',
    'Do not guess task IDs. Do not generate direct command payloads. Do not perform writes.',
    'If target or placement is ambiguous, set ambiguity instead of guessing.',
    'Use this schema:',
    '{"ambiguity":"none|low_confidence_target|missing_anchor|unsupported","explanation":"optional","operations":[{"action":"change_duration","targetHint":"...","durationMode":"absolute_days|delta_days|multiplier","durationValue":10,"anchor":"start|end"},{"action":"add_task","title":"...","taskType":"task|milestone","durationDays":1,"placement":{"mode":"after|before|inside_tail","anchorHint":"optional","parentHint":"optional"}},{"action":"move_task","targetHint":"...","moveMode":"to_date|relative_delta|to_parent","targetDate":"YYYY-MM-DD","deltaDays":3,"parentHint":"optional"},{"action":"rename_task","targetHint":"...","newTitle":"..."},{"action":"delete_task","targetHint":"..."},{"action":"link_tasks","predecessorHint":"...","successorHint":"...","dependencyType":"FS|SS|FF|SF","lagDays":0},{"action":"unlink_tasks","predecessorHint":"...","successorHint":"..."},{"action":"move_in_hierarchy","targetHint":"...","parentHint":"...|null"}]}',
    'Rules:',
    '1. Additive duration phrases like "на 20 дней" mean delta_days.',
    '2. Multiplicative phrases like "в 2 раза" mean multiplier.',
    '3. Absolute duration phrases like "сделай 10 дней" mean absolute_days.',
    '4. Duration changes anchor to "end" by default unless the user explicitly says otherwise.',
    '5. Phrases like "в конце работ" should produce add_task placement.mode="inside_tail".',
    '6. Use unsupported only when the request shape is outside the schema.',
    '7. Use low_confidence_target or missing_anchor when the write path would otherwise require guessing.',
    `User request: ${userMessage}`,
  ].join('\n');
}

function readQueryContent(result: SemanticPlannerQueryResult): string {
  if (typeof result === 'string') {
    return result;
  }

  if (typeof result.content === 'string') {
    return result.content;
  }

  throw new Error('Semantic planner query returned an unsupported payload');
}

function isAmbiguity(value: unknown): value is SemanticPlanAmbiguity {
  return value === 'none'
    || value === 'low_confidence_target'
    || value === 'missing_anchor'
    || value === 'unsupported';
}

function toTaskType(value: unknown): 'task' | 'milestone' | undefined {
  return value === 'task' || value === 'milestone' ? value : undefined;
}

function toDependencyType(value: unknown): 'FS' | 'SS' | 'FF' | 'SF' | undefined {
  return value === 'FS' || value === 'SS' || value === 'FF' || value === 'SF' ? value : undefined;
}

function parseOperation(value: unknown): SemanticOperation | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const raw = value as Record<string, unknown>;
  switch (raw.action) {
    case 'change_duration':
      if (
        typeof raw.targetHint !== 'string'
        || (raw.durationMode !== 'absolute_days' && raw.durationMode !== 'delta_days' && raw.durationMode !== 'multiplier')
        || typeof raw.durationValue !== 'number'
      ) {
        return null;
      }
      return {
        action: 'change_duration',
        targetHint: raw.targetHint.trim(),
        durationMode: raw.durationMode,
        durationValue: raw.durationValue,
        anchor: raw.anchor === 'start' || raw.anchor === 'end' ? raw.anchor : undefined,
      };

    case 'add_task': {
      const placement = raw.placement && typeof raw.placement === 'object'
        ? raw.placement as Record<string, unknown>
        : null;
      if (typeof raw.title !== 'string' || !placement || (placement.mode !== 'after' && placement.mode !== 'before' && placement.mode !== 'inside_tail')) {
        return null;
      }
      return {
        action: 'add_task',
        title: raw.title.trim(),
        taskType: toTaskType(raw.taskType),
        durationDays: typeof raw.durationDays === 'number' ? Math.max(1, Math.round(raw.durationDays)) : undefined,
        placement: {
          mode: placement.mode,
          anchorHint: typeof placement.anchorHint === 'string' ? placement.anchorHint.trim() : undefined,
          parentHint: typeof placement.parentHint === 'string' ? placement.parentHint.trim() : undefined,
        },
      };
    }

    case 'move_task':
      if (typeof raw.targetHint !== 'string' || (raw.moveMode !== 'to_date' && raw.moveMode !== 'relative_delta' && raw.moveMode !== 'to_parent')) {
        return null;
      }
      return {
        action: 'move_task',
        targetHint: raw.targetHint.trim(),
        moveMode: raw.moveMode,
        targetDate: typeof raw.targetDate === 'string' ? raw.targetDate.trim() : undefined,
        deltaDays: typeof raw.deltaDays === 'number' ? Math.round(raw.deltaDays) : undefined,
        parentHint: typeof raw.parentHint === 'string' ? raw.parentHint.trim() : undefined,
      };

    case 'rename_task':
      if (typeof raw.targetHint !== 'string' || typeof raw.newTitle !== 'string') {
        return null;
      }
      return {
        action: 'rename_task',
        targetHint: raw.targetHint.trim(),
        newTitle: raw.newTitle.trim(),
      };

    case 'delete_task':
      if (typeof raw.targetHint !== 'string') {
        return null;
      }
      return {
        action: 'delete_task',
        targetHint: raw.targetHint.trim(),
      };

    case 'link_tasks':
      if (typeof raw.predecessorHint !== 'string' || typeof raw.successorHint !== 'string') {
        return null;
      }
      return {
        action: 'link_tasks',
        predecessorHint: raw.predecessorHint.trim(),
        successorHint: raw.successorHint.trim(),
        dependencyType: toDependencyType(raw.dependencyType),
        lagDays: typeof raw.lagDays === 'number' ? Math.round(raw.lagDays) : undefined,
      };

    case 'unlink_tasks':
      if (typeof raw.predecessorHint !== 'string' || typeof raw.successorHint !== 'string') {
        return null;
      }
      return {
        action: 'unlink_tasks',
        predecessorHint: raw.predecessorHint.trim(),
        successorHint: raw.successorHint.trim(),
      };

    case 'move_in_hierarchy':
      if (typeof raw.targetHint !== 'string' || (typeof raw.parentHint !== 'string' && raw.parentHint !== null)) {
        return null;
      }
      return {
        action: 'move_in_hierarchy',
        targetHint: raw.targetHint.trim(),
        parentHint: raw.parentHint,
      };

    default:
      return null;
  }
}

function parseSemanticPlan(payload: string): SemanticMutationPlan {
  const parsed = JSON.parse(payload) as {
    ambiguity?: unknown;
    explanation?: unknown;
    operations?: unknown;
  };
  const ambiguity = isAmbiguity(parsed.ambiguity) ? parsed.ambiguity : 'unsupported';
  const operations = Array.isArray(parsed.operations)
    ? parsed.operations.flatMap((operation) => {
        const parsedOperation = parseOperation(operation);
        return parsedOperation ? [parsedOperation] : [];
      })
    : [];

  if (ambiguity === 'none' && operations.length === 0) {
    return {
      ambiguity: 'unsupported',
      explanation: 'Semantic planner returned no supported operations.',
      operations: [],
    };
  }

  return {
    ambiguity,
    explanation: typeof parsed.explanation === 'string' ? parsed.explanation.trim() : undefined,
    operations,
  };
}

function buildFallbackPlan(userMessage: string): SemanticMutationPlan {
  return {
    ambiguity: 'unsupported',
    explanation: `Semantic planner could not interpret: ${userMessage.trim()}`,
    operations: [],
  };
}

export async function planSemanticMutation(input: PlanSemanticMutationInput): Promise<SemanticMutationPlan> {
  const semanticPlannerQuery = input.semanticPlannerQuery
    ?? ((queryInput: SemanticPlannerQueryInput) => executeSemanticPlannerQuery(queryInput, input.env));

  try {
    const result = await semanticPlannerQuery({
      prompt: buildPrompt(input.userMessage),
      model: input.env.OPENAI_CHEAP_MODEL ?? input.env.OPENAI_MODEL,
      stage: 'mutation_semantic_planner',
    });

    return parseSemanticPlan(readQueryContent(result));
  } catch {
    return buildFallbackPlan(input.userMessage);
  }
}

