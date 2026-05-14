import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MAX_REFERENCE_CONTEXT_CHARS = 4_000;

export type ReferenceIntentRoute = 'offtopic_fool' | 'reference_help' | 'product_action';

export type ReferenceIntentDecision = {
  route: ReferenceIntentRoute;
  confidence: number;
  signals: string[];
  usedModelDecision: boolean;
  fallbackReason: 'none' | 'invalid_json' | 'empty_response' | 'query_failed';
};

type RawReferenceIntentPayload = {
  route?: unknown;
  confidence?: unknown;
  signals?: unknown;
};

let cachedReferenceBrief: string | null = null;
let cachedReferenceBriefPath: string | null = null;

function clipText(value: string, limit: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= limit) {
    return trimmed;
  }

  return `${trimmed.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
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

export function parseReferenceIntentDecision(payload: string): ReferenceIntentDecision {
  const parsed = JSON.parse(extractJsonObject(payload)) as RawReferenceIntentPayload;
  const route = parsed.route === 'offtopic_fool' || parsed.route === 'reference_help' || parsed.route === 'product_action'
    ? parsed.route
    : 'product_action';
  const confidence = typeof parsed.confidence === 'number'
    ? Math.max(0, Math.min(1, parsed.confidence))
    : 0.5;

  return {
    route,
    confidence,
    signals: asStringArray(parsed.signals),
    usedModelDecision: true,
    fallbackReason: 'none',
  };
}

function buildReferenceIntentPrompt(input: {
  userMessage: string;
  recentConversationSummary?: string;
  taskCount: number;
  hasHierarchy: boolean;
}): string {
  return [
    'Ты роутер запросов для продукта управления Gantt-графиком.',
    'Верни строго один JSON-объект без пояснений.',
    'Определи route:',
    '- "offtopic_fool" если вопрос явно не про продукт, график, задачи, планирование, ресурсы, шаблоны, историю, экспорт или работу приложения.',
    '- "reference_help" если пользователь просит справку, объяснение, инструкцию, описание возможностей или как что-то сделать в продукте.',
    '- "product_action" если пользователь хочет, чтобы система выполнила действие с проектом, задачами, связями, датами, ресурсами или другими сущностями.',
    'Не используй route "offtopic_fool" для обычных product-вопросов, даже если они сформулированы странно.',
    'Формат ответа:',
    '{"route":"reference_help|offtopic_fool|product_action","confidence":0.0,"signals":["..."]}',
    `taskCount: ${input.taskCount}`,
    `hasHierarchy: ${input.hasHierarchy}`,
    input.recentConversationSummary ? `recentConversationSummary:\n${clipText(input.recentConversationSummary, 500)}` : 'recentConversationSummary: none',
    `userMessage:\n${clipText(input.userMessage, 600)}`,
  ].join('\n');
}

export async function classifyReferenceIntent(input: {
  userMessage: string;
  recentConversationSummary?: string;
  taskCount: number;
  hasHierarchy: boolean;
  model: string;
  query: (input: { prompt: string; model: string }) => Promise<{ content: string }>;
}): Promise<ReferenceIntentDecision> {
  try {
    const result = await input.query({
      prompt: buildReferenceIntentPrompt(input),
      model: input.model,
    });
    return parseReferenceIntentDecision(result.content);
  } catch (error) {
    const fallbackReason = error instanceof Error && error.message === 'empty_response'
      ? 'empty_response'
      : error instanceof Error && error.message === 'invalid_json'
        ? 'invalid_json'
        : 'query_failed';

    return {
      route: 'product_action',
      confidence: 0,
      signals: ['reference_intent_fallback'],
      usedModelDecision: false,
      fallbackReason,
    };
  }
}

export function buildOfftopicFoolResponse(userMessage: string): string {
  const isRussian = /[А-Яа-яЁё]/.test(userMessage);

  if (!isRussian) {
    return 'I am better at Gantt work than cosmic philosophy. I can help create and edit schedules, link tasks, shift dates, validate the plan, manage templates, resources, history, and explain how to use these features.';
  }

  return 'С таким вопросом я вряд ли стану академиком. Зато я хорошо помогаю с графиком: могу подсказать, как создавать и редактировать задачи, связывать их, сдвигать сроки, проверять график, работать с шаблонами, ресурсами и историей версий.';
}

export function loadReferenceBrief(projectRoot: string): string {
  const briefPath = join(projectRoot, 'PI-REFERENCE-BRIEF.md');
  if (cachedReferenceBrief && cachedReferenceBriefPath === briefPath) {
    return cachedReferenceBrief;
  }

  cachedReferenceBriefPath = briefPath;
  cachedReferenceBrief = clipText(readFileSync(briefPath, 'utf-8'), MAX_REFERENCE_CONTEXT_CHARS);
  return cachedReferenceBrief;
}
