import { Agent, type AgentEvent, type AgentTool } from '@mariozechner/pi-agent-core';
import { Type, type Model, type TSchema } from '@mariozechner/pi-ai';
import { NORMALIZED_TOOL_CATALOG } from '@gantt/runtime-core/tool-core/catalog';
import { createToolContext } from '@gantt/runtime-core/tool-core/context';
import { executeToolCall } from '@gantt/runtime-core/tool-core/handlers';
import type {
  NormalizedToolInputMap,
  NormalizedToolName,
  ToolCallContext,
} from '@gantt/runtime-core/tool-core/types';
import type { ServerMessage } from '../ws.js';

type JsonSchemaProperty = {
  type?: string;
  enum?: readonly string[];
  pattern?: string;
  minimum?: number;
  maximum?: number;
  description?: string;
  properties?: Record<string, JsonSchemaProperty>;
  items?: JsonSchemaProperty;
  required?: readonly string[];
};

export type PiAgentEnv = {
  OPENAI_API_KEY: string;
  OPENAI_BASE_URL: string;
  OPENAI_MODEL: string;
};

export type PiToolExecutionFact = {
  toolCallId: string;
  name: NormalizedToolName;
  mutating: boolean;
  status: 'accepted' | 'rejected' | 'error' | 'ok';
  changedTaskIds: string[];
  changedDependencyIds: string[];
  error?: string;
  durationMs?: number;
};

export type PiAgentRunResult = {
  assistantResponse: string;
  streamedContent: boolean;
  toolFacts: PiToolExecutionFact[];
  toolCallCount: number;
  acceptedMutatingToolCalls: PiToolExecutionFact[];
  rejectedMutatingToolCalls: PiToolExecutionFact[];
  tasksAfter?: unknown[];
  metrics: {
    durationMs: number;
    timeToFirstToolCallMs: number | null;
    timeToFirstAssistantTextMs: number | null;
  };
};

export type BuildPiAgentToolsInput = {
  projectId: string;
  runId: string;
  historyGroupId: string;
  requestContextId: string;
  historyTitle: string;
  userId?: string;
  createContext?: typeof createToolContext;
  executeTool?: typeof executeToolCall;
};

type ToolDefinition = (typeof NORMALIZED_TOOL_CATALOG)[number];

export const GANTT_PI_AGENT_CARD = {
  name: 'gantt-tool-agent',
  mode: 'fast autonomous execution',
  tools: NORMALIZED_TOOL_CATALOG.map((tool) => tool.name),
  responsibility: [
    'Handle natural-language requests against an existing Gantt project.',
    'Use only normalized gantt tools and the minimum necessary context.',
    'Apply explicit default placement for simple task creation when the user omits dates.',
    'Preserve product-side history, undo, sessions, and UI events.',
  ],
  triggerExamples: [
    'добавь сдачу технадзору',
    'сдвинь штукатурку на 2 дня',
    'свяжи исполнительную документацию и акт приемки',
    'проверь график',
  ],
  doNotUseFor: [
    'empty-project initial generation',
    'bootstrap schedule creation',
    'unsupported absolute move-to-date operations',
  ],
} as const;

export const GANTT_PI_AGENT_SYSTEM_PROMPT = [
  'Ты автономный агент управления Gantt-проектом. Ты работаешь только через инструменты проекта и должен быстро превратить естественный запрос пользователя в минимальный набор tool calls.',
  '',
  'Твоя ответственность:',
  '1. Понять, хочет пользователь чтение, изменение или проверку.',
  '2. Найти минимальный нужный контекст.',
  '3. Вызвать правильный инструмент.',
  '4. Ответить кратко только по факту результата.',
  '',
  'Инструменты:',
  '- get_project_summary: краткое состояние проекта, версия, диапазон дат, количество задач, health flags.',
  '- find_tasks: быстрый поиск задач по названию. Используй первым, когда пользователь называет задачу без ID.',
  '- get_task_context: одна задача, родители, дети, соседи, predecessor/successor связи.',
  '- get_schedule_slice: ветка, список задач или окно дат.',
  '- create_tasks: создать одну задачу или небольшой фрагмент. Для контейнеров и обычных работ используй type "task"; type "project" запрещён.',
  '- update_tasks: изменить имя, цвет, прогресс; не использовать для дат и связей.',
  '- move_tasks: изменить родителя или порядок задач.',
  '- shift_tasks: сдвинуть даты на N дней по текущему режиму дней проекта и выбранному календарю. Не выбирай режим сам.',
  '- change_task_duration: изменить длительность задачи в днях с якорем start/end. Используй для "увеличь срок", "сделай 10 дней", "уменьши на 3 дня".',
  '- delete_tasks: удалить задачи.',
  '- link_tasks: создать predecessor-successor связь между существующими задачами; если тип не указан, используй FS.',
  '- unlink_tasks: удалить связь.',
  '- recalculate_project: пересчитать график, только когда пользователь просит пересчёт или это явно нужно после структурного изменения.',
  '- validate_schedule: проверить график, только когда пользователь просит проверку или диагностику.',
  '',
  'Дефолты для автономности:',
  '- Если пользователь просит просто добавить новую работу/задачу и не дал даты, не задавай уточняющий вопрос.',
  '- Для такой новой задачи сначала получи get_project_summary, затем создай top-level задачу длительностью 1 день.',
  '- Дату по умолчанию ставь в effectiveDateRange.endDate проекта; если endDate нет, используй сегодняшнюю дату.',
  '- Если пользователь просит добавить задачу "в конце работ", "в финале", "после завершения", создай её после последней релевантной задачи и задай зависимость FS, а не только ту же дату.',
  '- Если пользователь сказал "туда же", "рядом", "после", "в блок", но объект неясен, используй короткую историю и find_tasks для ближайшего контекста.',
  '- Уточняй только когда неверный выбор может удалить, переместить, связать или массово изменить существующие задачи.',
  '- Если пользователь просит добавить подробный/последовательный фрагмент работ, создавай реалистичные FS-зависимости между явно последовательными задачами.',
  '- Для зависимостей внутри одного create_tasks вызова задай стабильные id новым задачам и указывай dependencies через эти id; не жди отдельного поиска.',
  '- Если создаёшь задачу "после X", сначала найди X, затем создай новую задачу и свяжи X -> новая задача через link_tasks, если зависимость явно нужна.',
  '- Если пользователь просит связать две существующие задачи, найди обе через find_tasks и вызови link_tasks; не заменяй это update_tasks или ручным редактированием dependencies.',
  '- Если find_tasks вернул один точный match по названию и остальные более длинные частичные совпадения, выбирай точный match без уточнения.',
  '',
  'Процесс:',
  '1. Если запрос read-only, используй read tool или ответь из уже доступного контекста.',
  '2. Если запрос mutating и нужны taskId, сначала используй find_tasks.',
  '3. Если результат find_tasks неоднозначен и выбор изменит проект, задай один короткий уточняющий вопрос.',
  '4. Если taskId известен, сразу вызывай подходящий mutation tool.',
  '5. Для одного намерения предпочитай минимальное число mutation tool calls.',
  '6. Не делай validate_schedule после успешного изменения, если пользователь не просил проверить.',
  '7. Не делай второй проход, если tool уже дал достаточный результат.',
  '',
  'Правила:',
  '- Никогда не выдумывай taskId.',
  '- Не читай весь проект без необходимости.',
  '- Не используй несколько инструментов там, где достаточно одного.',
  '- Не пересказывай внутренний план.',
  '- Если инструмент вернул rejected/error, не заявляй успех.',
  '- Если один tool call был rejected, но следующий mutating tool call accepted, отвечай по успешному применённому изменению.',
  '- Если доступные инструменты не покрывают запрос, скажи это прямо.',
  '- Абсолютный перенос на дату сейчас не покрыт отдельным публичным инструментом; не имитируй его через ручной пересчёт.',
  '- Отвечай на языке пользователя.',
  '- Ответ: 1-2 коротких предложения, только результат.',
].join('\n');

const MUTATING_TOOL_NAMES = new Set<string>(
  NORMALIZED_TOOL_CATALOG
    .filter((definition) => definition.mutating)
    .map((definition) => definition.name),
);

export function buildPiOpenAICompletionsModel(env: PiAgentEnv): Model<'openai-completions'> {
  return {
    id: env.OPENAI_MODEL,
    name: env.OPENAI_MODEL,
    api: 'openai-completions',
    provider: 'gantt-openai-compatible',
    baseUrl: env.OPENAI_BASE_URL,
    reasoning: false,
    input: ['text'],
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    },
    contextWindow: 128000,
    maxTokens: 4096,
    compat: {
      supportsStore: false,
      supportsReasoningEffort: false,
    },
  };
}

function schemaOptions(property: JsonSchemaProperty | undefined): Record<string, unknown> {
  return {
    ...(property?.description ? { description: property.description } : {}),
    ...(property?.pattern ? { pattern: property.pattern } : {}),
    ...(typeof property?.minimum === 'number' ? { minimum: property.minimum } : {}),
    ...(typeof property?.maximum === 'number' ? { maximum: property.maximum } : {}),
  };
}

export function convertJsonSchemaPropertyToTypeBox(
  property: JsonSchemaProperty | undefined,
  required: boolean,
): TSchema {
  let schema: TSchema;

  if (Array.isArray(property?.enum) && property.enum.length > 0) {
    schema = property.enum.length === 1
      ? Type.Literal(property.enum[0], schemaOptions(property))
      : Type.Union(
          property.enum.map((value) => Type.Literal(value)),
          schemaOptions(property),
        );
  } else {
    switch (property?.type) {
      case 'string':
        schema = Type.String(schemaOptions(property));
        break;
      case 'number':
        schema = Type.Number(schemaOptions(property));
        break;
      case 'boolean':
        schema = Type.Boolean(schemaOptions(property));
        break;
      case 'array':
        schema = Type.Array(
          convertJsonSchemaPropertyToTypeBox(property.items, true),
          schemaOptions(property),
        );
        break;
      case 'object':
      default: {
        const objectRequired = new Set(property?.required ?? []);
        const shape: Record<string, TSchema> = {};
        for (const [key, value] of Object.entries(property?.properties ?? {})) {
          shape[key] = convertJsonSchemaPropertyToTypeBox(value, objectRequired.has(key));
        }
        schema = Type.Object(shape, schemaOptions(property));
        break;
      }
    }
  }

  return required ? schema : Type.Optional(schema);
}

export function convertToolInputSchemaToTypeBox(schema: ToolDefinition['inputSchema']): TSchema {
  const jsonSchema = schema as { properties: Record<string, JsonSchemaProperty>; required?: readonly string[] };
  const required = new Set(jsonSchema.required ?? []);
  const shape: Record<string, TSchema> = {};

  for (const [key, value] of Object.entries(jsonSchema.properties)) {
    shape[key] = convertJsonSchemaPropertyToTypeBox(value, required.has(key));
  }

  return Type.Object(shape);
}

function isNormalizedToolName(name: string): name is NormalizedToolName {
  return NORMALIZED_TOOL_CATALOG.some((definition) => definition.name === name);
}

function removeVerboseMutationPayload(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return value;
  }

  const result = value as Record<string, unknown>;
  if (result.status === 'accepted' || result.status === 'rejected') {
    return {
      status: result.status,
      reason: result.reason,
      changedTaskIds: Array.isArray(result.changedTaskIds) ? result.changedTaskIds : [],
      changedTasks: compactChangedTasks(result.changedTasks),
      changedDependencyIds: Array.isArray(result.changedDependencyIds) ? result.changedDependencyIds : [],
      conflicts: Array.isArray(result.conflicts) ? result.conflicts : [],
    };
  }

  return value;
}

function compactChangedTasks(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((task): task is Record<string, unknown> => Boolean(task) && typeof task === 'object')
    .map((task) => ({
      id: task.id,
      name: task.name,
      startDate: task.startDate,
      endDate: task.endDate,
      parentId: task.parentId ?? null,
    }))
    .filter((task) => typeof task.id === 'string' && typeof task.name === 'string');
}

function makeRejectedToolResult(reason: string, message: string) {
  return {
    status: 'rejected',
    reason,
    message,
    changedTaskIds: [],
  };
}

function extractChangedTaskIds(value: unknown): string[] {
  if (!value || typeof value !== 'object') {
    return [];
  }

  const changedTaskIds = (value as { changedTaskIds?: unknown }).changedTaskIds;
  return Array.isArray(changedTaskIds)
    ? changedTaskIds.filter((item): item is string => typeof item === 'string')
    : [];
}

function extractChangedDependencyIds(value: unknown): string[] {
  if (!value || typeof value !== 'object') {
    return [];
  }

  const changedDependencyIds = (value as { changedDependencyIds?: unknown }).changedDependencyIds;
  return Array.isArray(changedDependencyIds)
    ? changedDependencyIds.filter((item): item is string => typeof item === 'string')
    : [];
}

function extractStatus(value: unknown): PiToolExecutionFact['status'] {
  if (value && typeof value === 'object') {
    const status = (value as { status?: unknown }).status;
    if (status === 'accepted' || status === 'rejected') {
      return status;
    }
  }

  return 'ok';
}

export function buildPiAgentTools(input: BuildPiAgentToolsInput): AgentTool[] {
  const createContext = input.createContext ?? createToolContext;
  const runTool = input.executeTool ?? executeToolCall;

  return NORMALIZED_TOOL_CATALOG.map((definition) => ({
    name: definition.name,
    label: definition.name,
    description: definition.description,
    parameters: convertToolInputSchemaToTypeBox(definition.inputSchema),
    executionMode: definition.mutating ? 'sequential' : 'parallel',
    execute: async (_toolCallId, params, signal) => {
      if (signal?.aborted) {
        throw new Error('Tool call aborted');
      }

      const mutating = definition.mutating;
      const context: ToolCallContext = createContext({
        actorType: 'agent',
        actorId: input.userId,
        defaultProjectId: input.projectId,
        history: mutating
          ? {
              groupId: input.historyGroupId,
              requestContextId: input.requestContextId,
              title: input.historyTitle,
              origin: 'agent_run',
              finalizeGroup: true,
              undoable: true,
            }
          : undefined,
      });
      const toolInput = {
        ...(params as Record<string, unknown>),
        ...(mutating ? { includeSnapshot: false } : {}),
      } as NormalizedToolInputMap[typeof definition.name];
      const result = await runTool(
        definition.name,
        toolInput,
        context,
      );
      const compact = result.ok
        ? removeVerboseMutationPayload(result.data)
        : makeRejectedToolResult(result.error.code, result.error.message);

      return {
        content: [{ type: 'text', text: JSON.stringify(compact) }],
        details: compact,
      };
    },
  }));
}

function extractAssistantText(message: unknown): string {
  if (!message || typeof message !== 'object') {
    return '';
  }

  const role = (message as { role?: unknown }).role;
  const content = (message as { content?: unknown }).content;
  if (role !== 'assistant' || !Array.isArray(content)) {
    return '';
  }

  return content
    .filter((block): block is { type: 'text'; text: string } => (
      block
      && typeof block === 'object'
      && (block as { type?: unknown }).type === 'text'
      && typeof (block as { text?: unknown }).text === 'string'
    ))
    .map((block) => block.text)
    .join('');
}

function buildInitialMessages(input: {
  projectId: string;
  messages: Array<{ role: string; content: string }>;
}) {
  const recent = input.messages.slice(-6);
  const content = [
    `projectId: ${input.projectId}`,
    recent.length > 0
      ? [
          'Короткая история диалога:',
          ...recent.map((message) => `${message.role === 'assistant' ? 'Assistant' : 'User'}: ${message.content}`),
        ].join('\n')
      : '',
  ].filter(Boolean).join('\n\n');

  return [{
    role: 'user' as const,
    content,
    timestamp: Date.now(),
  }];
}

function buildNoToolCallMutationMessage(): string {
  return 'Изменение не применилось: агент не выполнил ни одного tool call, поэтому проект не изменился.';
}

function buildRejectedMutationMessage(facts: PiToolExecutionFact[]): string {
  const first = facts[0];
  const reason = first?.error ? ` (${first.error})` : '';
  return `Изменение не применилось: tool call вернул отклонение${reason}.`;
}

export function looksLikeMutatingRequest(userMessage: string): boolean {
  return /\b(add|create|insert|rename|update|move|shift|delete|link|unlink|recalculate|change)\b/i.test(userMessage)
    || /(добав|созда|переимен|измени|обнов|сдвин|перенес|удал|свяж|убери связь|пересч)/i.test(userMessage);
}

export async function runPiOrdinaryAgent(input: {
  userMessage: string;
  projectId: string;
  sessionId: string;
  runId: string;
  userId?: string;
  env: PiAgentEnv;
  messages: Array<{ role: string; content: string }>;
  historyGroupId: string;
  requestContextId: string;
  historyTitle: string;
  mutationRoute: boolean;
  taskService: {
    list(projectId: string): Promise<{ tasks: unknown[] }>;
  };
  broadcastToSession: (sessionId: string, message: ServerMessage) => void;
  logger?: {
    debug(event: string, payload: Record<string, unknown>): Promise<void> | void;
  };
}): Promise<PiAgentRunResult> {
  const startedAt = Date.now();
  let assistantResponse = '';
  let streamedContent = false;
  let timeToFirstToolCallMs: number | null = null;
  let timeToFirstAssistantTextMs: number | null = null;
  const toolStarts = new Map<string, number>();
  const toolFacts = new Map<string, PiToolExecutionFact>();
  const model = buildPiOpenAICompletionsModel(input.env);

  const agent = new Agent({
    initialState: {
      systemPrompt: GANTT_PI_AGENT_SYSTEM_PROMPT,
      model,
      thinkingLevel: 'off',
      tools: buildPiAgentTools({
        projectId: input.projectId,
        runId: input.runId,
        historyGroupId: input.historyGroupId,
        requestContextId: input.requestContextId,
        historyTitle: input.historyTitle,
        userId: input.userId,
      }),
      messages: buildInitialMessages({
        projectId: input.projectId,
        messages: input.messages,
      }),
    },
    toolExecution: 'parallel',
    getApiKey: () => input.env.OPENAI_API_KEY,
    sessionId: input.sessionId,
  });

  agent.subscribe(async (event: AgentEvent) => {
    switch (event.type) {
      case 'message_update':
        if (event.assistantMessageEvent.type === 'text_delta' && event.assistantMessageEvent.delta) {
          if (timeToFirstAssistantTextMs === null) {
            timeToFirstAssistantTextMs = Date.now() - startedAt;
          }
          assistantResponse += event.assistantMessageEvent.delta;
          streamedContent = true;
          input.broadcastToSession(input.sessionId, {
            type: 'token',
            content: event.assistantMessageEvent.delta,
          });
        }
        break;
      case 'tool_execution_start': {
        if (timeToFirstToolCallMs === null) {
          timeToFirstToolCallMs = Date.now() - startedAt;
        }
        toolStarts.set(event.toolCallId, Date.now());
        if (isNormalizedToolName(event.toolName)) {
          toolFacts.set(event.toolCallId, {
            toolCallId: event.toolCallId,
            name: event.toolName,
            mutating: MUTATING_TOOL_NAMES.has(event.toolName),
            status: 'ok',
            changedTaskIds: [],
            changedDependencyIds: [],
          });
        }
        await input.logger?.debug('pi_tool_execution_start', {
          runId: input.runId,
          projectId: input.projectId,
          sessionId: input.sessionId,
          toolCallId: event.toolCallId,
          toolName: event.toolName,
        });
        break;
      }
      case 'tool_execution_end': {
        const existing = toolFacts.get(event.toolCallId);
        const details = event.result && typeof event.result === 'object'
          ? (event.result as { details?: unknown }).details
          : undefined;
        if (existing) {
          existing.status = event.isError ? 'error' : extractStatus(details);
          existing.changedTaskIds = extractChangedTaskIds(details);
          existing.changedDependencyIds = extractChangedDependencyIds(details);
          existing.error = event.isError
            ? extractAssistantText({ role: 'assistant', content: (event.result as { content?: unknown })?.content })
            : (
                details && typeof details === 'object' && typeof (details as { reason?: unknown }).reason === 'string'
                  ? String((details as { reason?: unknown }).reason)
                  : undefined
              );
          existing.durationMs = Date.now() - (toolStarts.get(event.toolCallId) ?? Date.now());
        }
        await input.logger?.debug('pi_tool_execution_end', {
          runId: input.runId,
          projectId: input.projectId,
          sessionId: input.sessionId,
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          isError: event.isError,
          details,
        });
        break;
      }
      case 'turn_end':
        await input.logger?.debug('pi_turn_end', {
          runId: input.runId,
          projectId: input.projectId,
          sessionId: input.sessionId,
          toolResultCount: event.toolResults.length,
        });
        break;
      case 'agent_end': {
        if (!streamedContent) {
          const finalText = [...event.messages].reverse().map(extractAssistantText).find((text) => text.trim().length > 0);
          assistantResponse = finalText ?? assistantResponse;
        }
        await input.logger?.debug('pi_agent_end', {
          runId: input.runId,
          projectId: input.projectId,
          sessionId: input.sessionId,
          messageCount: event.messages.length,
        });
        break;
      }
    }
  });

  await agent.prompt(input.userMessage);

  const facts = [...toolFacts.values()];
  const acceptedMutatingToolCalls = facts.filter((fact) => fact.mutating && fact.status === 'accepted');
  const rejectedMutatingToolCalls = facts.filter((fact) => fact.mutating && (fact.status === 'rejected' || fact.status === 'error'));

  if (rejectedMutatingToolCalls.length > 0 && acceptedMutatingToolCalls.length === 0) {
    assistantResponse = buildRejectedMutationMessage(rejectedMutatingToolCalls);
    streamedContent = false;
  } else if (
    input.mutationRoute
    && looksLikeMutatingRequest(input.userMessage)
    && facts.length === 0
    && assistantResponse.trim().length === 0
  ) {
    assistantResponse = buildNoToolCallMutationMessage();
    streamedContent = false;
  }

  const shouldRefreshTasks = facts.some((fact) => fact.mutating);
  const tasksAfter = shouldRefreshTasks
    ? (await input.taskService.list(input.projectId)).tasks
    : undefined;

  return {
    assistantResponse: assistantResponse.trim(),
    streamedContent,
    toolFacts: facts,
    toolCallCount: facts.length,
    acceptedMutatingToolCalls,
    rejectedMutatingToolCalls,
    tasksAfter,
    metrics: {
      durationMs: Date.now() - startedAt,
      timeToFirstToolCallMs,
      timeToFirstAssistantTextMs,
    },
  };
}
