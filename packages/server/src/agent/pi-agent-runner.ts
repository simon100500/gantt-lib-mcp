import { Agent, type AgentEvent, type AgentTool } from '@mariozechner/pi-agent-core';
import { Type, type TSchema } from '@mariozechner/pi-ai';
import { NORMALIZED_TOOL_CATALOG } from '@gantt/runtime-core/tool-core/catalog';
import { createToolContext } from '@gantt/runtime-core/tool-core/context';
import { executeToolCall } from '@gantt/runtime-core/tool-core/handlers';
import type {
  AgentOpenThreadState,
  AgentSessionSnapshotMessage,
} from '@gantt/runtime-core/types';
import type {
  NormalizedToolInputMap,
  NormalizedToolName,
  ToolCallContext,
} from '@gantt/runtime-core/tool-core/types';
import type { ServerMessage } from '../ws.js';
import { buildPiOpenAICompletionsModel, type PiOpenAIEnv } from './pi-model.js';

export { buildPiOpenAICompletionsModel } from './pi-model.js';

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

export type PiAgentEnv = PiOpenAIEnv;

export type PiToolExecutionFact = {
  toolCallId: string;
  name: NormalizedToolName;
  mutating: boolean;
  status: 'accepted' | 'rejected' | 'error' | 'ok';
  changedTaskIds: string[];
  changedDependencyIds: string[];
  resolvedTaskIds?: string[];
  searchQuery?: string;
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
  sessionMessages: AgentSessionSnapshotMessage[];
  metrics: {
    durationMs: number;
    timeToFirstToolCallMs: number | null;
    timeToFirstAssistantTextMs: number | null;
    restoreMessageCount: number;
    restoreMessageChars: number;
    sessionMemoryChars: number;
    systemPromptChars: number;
    approxInputChars: number;
    activePolicyCount: number;
  };
};

type PiContextUserMessage = {
  role: 'user';
  content: string;
  timestamp: number;
};

type PiContextAssistantMessage = {
  role: 'assistant';
  content: Array<{ type: 'text'; text: string }>;
  api: 'openai-completions';
  provider: 'session-memory';
  model: 'session-memory';
  usage: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    totalTokens: number;
    cost: {
      input: number;
      output: number;
      cacheRead: number;
      cacheWrite: number;
      total: number;
    };
  };
  stopReason: 'stop';
  timestamp: number;
};

const EMPTY_ASSISTANT_USAGE: PiContextAssistantMessage['usage'] = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    total: 0,
  },
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

const BASE_PROMPT_BLOCK = [
  'Ты автономный агент управления Gantt-проектом. Ты работаешь только через инструменты проекта и должен быстро превратить естественный запрос пользователя в минимальный набор tool calls.',
  '',
  'Твоя ответственность:',
  '1. Понять, хочет пользователь чтение, изменение или проверку.',
  '2. Найти минимальный нужный контекст.',
  '3. Вызвать правильный инструмент.',
  '4. Ответить кратко только по факту результата.',
  '',
].join('\n');

const TOOL_PROMPT_BLOCK = [
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
].join('\n');

const GENERAL_PROCESS_BLOCK = [
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
].join('\n');

const SAFETY_RULES_BLOCK = [
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

const FOLLOW_UP_POLICY_BLOCK = [
  'Follow-up policy:',
  '- Если сообщение короткое и похоже на продолжение предыдущего хода, опирайся на session memory и последний unresolved thread.',
  '- Если в session memory есть lastResolvedTaskIds или lastCreatedTaskIds, используй их как основной кандидатный набор, прежде чем читать больше контекста.',
  '- Если follow-up по-прежнему неоднозначен для mutating действия, задай один короткий уточняющий вопрос.',
].join('\n');

const BULK_EDIT_POLICY_BLOCK = [
  'Bulk edit policy:',
  '- Если пользователь просит действие для нескольких задач или для всего ранее найденного набора, предпочитай один batched tool call.',
  '- Не делай серию однотипных mutation calls, если тот же результат можно выразить одним вызовом.',
].join('\n');

const VALIDATION_POLICY_BLOCK = [
  'Validation policy:',
  '- validate_schedule вызывай только по явному запросу на проверку, диагностику или когда нужно сообщить о целостности графика.',
].join('\n');

const LINKING_POLICY_BLOCK = [
  'Linking policy:',
  '- Для связи существующих задач сначала используй find_tasks или session memory, затем вызывай link_tasks или unlink_tasks.',
  '- Не редактируй dependencies вручную через другие инструменты.',
].join('\n');

export const GANTT_PI_AGENT_SYSTEM_PROMPT = [
  BASE_PROMPT_BLOCK,
  TOOL_PROMPT_BLOCK,
  GENERAL_PROCESS_BLOCK,
  FOLLOW_UP_POLICY_BLOCK,
  BULK_EDIT_POLICY_BLOCK,
  LINKING_POLICY_BLOCK,
  VALIDATION_POLICY_BLOCK,
  SAFETY_RULES_BLOCK,
].join('\n\n');

const MUTATING_TOOL_NAMES = new Set<string>(
  NORMALIZED_TOOL_CATALOG
    .filter((definition) => definition.mutating)
    .map((definition) => definition.name),
);
const SESSION_MEMORY_PREFIX = '[SESSION_MEMORY]';
const MAX_SESSION_RESTORE_MESSAGES = 8;
const MAX_CONTEXT_MESSAGES = 24;
const MAX_RESTORED_MESSAGE_CHARS = 1_500;

function uniqueIds(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
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

function extractResolvedTaskIds(name: string, value: unknown): string[] {
  if (name !== 'find_tasks' || !value || typeof value !== 'object') {
    return [];
  }

  const matches = (value as { matches?: unknown }).matches;
  if (!Array.isArray(matches)) {
    return [];
  }

  return uniqueIds(matches
    .filter((match): match is { taskId?: unknown } => Boolean(match) && typeof match === 'object')
    .map((match) => (typeof match.taskId === 'string' ? match.taskId : ''))
    .filter((taskId) => taskId.length > 0));
}

function extractSearchQuery(name: string, value: unknown): string | undefined {
  if (name !== 'find_tasks' || !value || typeof value !== 'object') {
    return undefined;
  }

  const query = (value as { query?: unknown }).query;
  return typeof query === 'string' && query.trim().length > 0 ? query.trim() : undefined;
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

function extractMessageTextContent(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }

  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .filter((block): block is { type: 'text'; text: string } => (
      Boolean(block)
      && typeof block === 'object'
      && (block as { type?: unknown }).type === 'text'
      && typeof (block as { text?: unknown }).text === 'string'
    ))
    .map((block) => block.text)
    .join('');
}

function clipText(value: string, limit: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= limit) {
    return trimmed;
  }

  return `${trimmed.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

function createAssistantContextMessage(content: string, timestamp: number): PiContextAssistantMessage {
  return {
    role: 'assistant',
    content: [{ type: 'text', text: content }],
    api: 'openai-completions',
    provider: 'session-memory',
    model: 'session-memory',
    usage: EMPTY_ASSISTANT_USAGE,
    stopReason: 'stop',
    timestamp,
  };
}

function createUserContextMessage(content: string, timestamp: number): PiContextUserMessage {
  return {
    role: 'user',
    content,
    timestamp,
  };
}

function isShortFollowUpMessage(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 && (
    normalized.length <= 24
    || ['да', 'нет', 'во всех', 'туда же', 'сделай так же', 'а теперь свяжи их'].includes(normalized)
  );
}

function buildPiSystemPrompt(input: {
  userMessage: string;
  mutationRoute: boolean;
  openThreads?: AgentOpenThreadState | null;
}): { prompt: string; activePolicyCount: number } {
  const blocks = [
    BASE_PROMPT_BLOCK,
    TOOL_PROMPT_BLOCK,
    GENERAL_PROCESS_BLOCK,
  ];
  let activePolicyCount = 0;
  const lowerMessage = input.userMessage.toLowerCase();

  if (input.openThreads?.unresolved || isShortFollowUpMessage(input.userMessage)) {
    blocks.push(FOLLOW_UP_POLICY_BLOCK);
    activePolicyCount += 1;
  }
  if (/(во всех|массов|несколько|все найденные|оба|обе)/.test(lowerMessage)) {
    blocks.push(BULK_EDIT_POLICY_BLOCK);
    activePolicyCount += 1;
  }
  if (/(свяж|убери связь|unlink|link|зависим)/.test(lowerMessage)) {
    blocks.push(LINKING_POLICY_BLOCK);
    activePolicyCount += 1;
  }
  if (!input.mutationRoute || /(проверь|validate|диагност|ошиб)/.test(lowerMessage)) {
    blocks.push(VALIDATION_POLICY_BLOCK);
    activePolicyCount += 1;
  }

  blocks.push(SAFETY_RULES_BLOCK);

  return {
    prompt: blocks.join('\n\n'),
    activePolicyCount,
  };
}

function buildSessionMemoryMessage(input: {
  projectId: string;
  rollingSummary?: string | null;
  openThreads?: AgentOpenThreadState | null;
}): string | null {
  const summary = input.rollingSummary?.trim();
  const openThread = input.openThreads;
  const lines = [
    `${SESSION_MEMORY_PREFIX}`,
    `projectId: ${input.projectId}`,
  ];

  if (summary) {
    lines.push(`rollingSummary: ${summary}`);
  }

  if (openThread?.unresolved) {
    if (openThread.activeOperationKind) {
      lines.push(`activeOperationKind: ${openThread.activeOperationKind}`);
    }
    if (openThread.recentAssistantQuestion) {
      lines.push(`recentAssistantQuestion: ${openThread.recentAssistantQuestion}`);
    }
    if (openThread.lastUserMessage) {
      lines.push(`lastUserMessage: ${openThread.lastUserMessage}`);
    }
    if (Array.isArray(openThread.targetEntityHints) && openThread.targetEntityHints.length > 0) {
      lines.push(`targetEntityHints: ${openThread.targetEntityHints.join(', ')}`);
    }
  }

  if (Array.isArray(openThread?.lastResolvedTaskIds) && openThread.lastResolvedTaskIds.length > 0) {
    lines.push(`lastResolvedTaskIds: ${openThread.lastResolvedTaskIds.slice(0, 8).join(', ')}`);
  }
  if (Array.isArray(openThread?.lastCreatedTaskIds) && openThread.lastCreatedTaskIds.length > 0) {
    lines.push(`lastCreatedTaskIds: ${openThread.lastCreatedTaskIds.slice(0, 8).join(', ')}`);
  }
  if (openThread?.lastMutationTool) {
    lines.push(`lastMutationTool: ${openThread.lastMutationTool}`);
  }
  if (openThread?.lastSearchQuery) {
    lines.push(`lastSearchQuery: ${clipText(openThread.lastSearchQuery, 120)}`);
  }
  if (openThread?.scopeHint) {
    lines.push(`scopeHint: ${openThread.scopeHint}`);
  }
  if (openThread?.activeParentId) {
    lines.push(`activeParentId: ${openThread.activeParentId}`);
  }

  return lines.length > 2 ? lines.join('\n') : null;
}

function buildInitialMessages(input: {
  projectId: string;
  messages: AgentSessionSnapshotMessage[];
  rollingSummary?: string | null;
  openThreads?: AgentOpenThreadState | null;
}): any[] {
  const initialMessages: Array<PiContextUserMessage | PiContextAssistantMessage> = [];
  const sessionMemoryMessage = buildSessionMemoryMessage(input);
  if (sessionMemoryMessage) {
    initialMessages.push(createAssistantContextMessage(sessionMemoryMessage, Date.now()));
  }

  for (const message of input.messages.slice(-MAX_SESSION_RESTORE_MESSAGES)) {
    const content = clipText(message.content, MAX_RESTORED_MESSAGE_CHARS);
    if (!content || content.startsWith(SESSION_MEMORY_PREFIX)) {
      continue;
    }

    initialMessages.push(
      message.role === 'assistant'
        ? createAssistantContextMessage(content, message.timestamp)
        : createUserContextMessage(content, message.timestamp),
    );
  }

  if (initialMessages.length === 0) {
    initialMessages.push(createAssistantContextMessage(`projectId: ${input.projectId}`, Date.now()));
  }

  return initialMessages as any[];
}

function measureInitialContext(input: {
  systemPrompt: string;
  initialMessages: any[];
  sessionMemoryMessage: string | null;
  activePolicyCount: number;
}) {
  const restoreMessages = input.initialMessages.filter((message) => {
    const text = extractMessageTextContent((message as { content?: unknown }).content);
    return text.length > 0 && !text.startsWith(SESSION_MEMORY_PREFIX);
  });
  const restoreMessageChars = restoreMessages.reduce((sum, message) => (
    sum + extractMessageTextContent((message as { content?: unknown }).content).length
  ), 0);
  const sessionMemoryChars = input.sessionMemoryMessage?.length ?? 0;
  const systemPromptChars = input.systemPrompt.length;

  return {
    restoreMessageCount: restoreMessages.length,
    restoreMessageChars,
    sessionMemoryChars,
    systemPromptChars,
    approxInputChars: restoreMessageChars + sessionMemoryChars + systemPromptChars,
    activePolicyCount: input.activePolicyCount,
  };
}

export async function compactSessionContext<TMessage extends { role?: unknown; content?: unknown }>(
  messages: TMessage[],
): Promise<TMessage[]> {
  if (messages.length <= MAX_CONTEXT_MESSAGES) {
    return messages;
  }

  const memoryMessage = messages.find((message) => (
    extractMessageTextContent(message?.content).startsWith(SESSION_MEMORY_PREFIX)
  ));
  const tail = messages.filter((message) => message !== memoryMessage).slice(-(MAX_CONTEXT_MESSAGES - (memoryMessage ? 1 : 0)));

  return memoryMessage ? [memoryMessage, ...tail] : tail;
}

export function extractSessionSnapshotMessages(messages: unknown[]): AgentSessionSnapshotMessage[] {
  return messages
    .filter((message): message is Record<string, unknown> => Boolean(message) && typeof message === 'object')
    .map((message) => ({
      role: message.role === 'assistant' ? 'assistant' : message.role === 'user' ? 'user' : null,
      content: clipText(extractMessageTextContent(message.content), 4_000),
      timestamp: typeof message.timestamp === 'number' ? message.timestamp : Date.now(),
    }))
    .filter((message): message is AgentSessionSnapshotMessage => (
      message.role !== null
      && message.content.length > 0
      && !message.content.startsWith(SESSION_MEMORY_PREFIX)
    ))
    .slice(-MAX_SESSION_RESTORE_MESSAGES);
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
  messages: AgentSessionSnapshotMessage[];
  historyGroupId: string;
  requestContextId: string;
  historyTitle: string;
  mutationRoute: boolean;
  rollingSummary?: string | null;
  openThreads?: AgentOpenThreadState | null;
  taskService: {
    list(projectId: string): Promise<{ tasks: unknown[] }>;
    listAll(projectId: string): Promise<unknown[]>;
  };
  broadcastToSession: (sessionId: string, message: ServerMessage) => void;
  signal?: AbortSignal;
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
  const sessionMemoryMessage = buildSessionMemoryMessage({
    projectId: input.projectId,
    rollingSummary: input.rollingSummary,
    openThreads: input.openThreads,
  });
  const { prompt: systemPrompt, activePolicyCount } = buildPiSystemPrompt({
    userMessage: input.userMessage,
    mutationRoute: input.mutationRoute,
    openThreads: input.openThreads,
  });
  const initialMessages = buildInitialMessages({
    projectId: input.projectId,
    messages: input.messages,
    rollingSummary: input.rollingSummary,
    openThreads: input.openThreads,
  });
  const initialContextMetrics = measureInitialContext({
    systemPrompt,
    initialMessages,
    sessionMemoryMessage,
    activePolicyCount,
  });

  const agent = new Agent({
    initialState: {
      systemPrompt,
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
      messages: initialMessages,
    },
    transformContext: compactSessionContext,
    toolExecution: 'parallel',
    getApiKey: () => input.env.OPENAI_API_KEY,
    sessionId: input.sessionId,
  });

  if (input.signal) {
    if (input.signal.aborted) {
      agent.abort();
    } else {
      input.signal.addEventListener('abort', () => {
        agent.abort();
      }, { once: true });
    }
  }

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
          existing.resolvedTaskIds = extractResolvedTaskIds(existing.name, details);
          existing.searchQuery = extractSearchQuery(existing.name, details);
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
    ? await input.taskService.listAll(input.projectId)
    : undefined;
  const sessionMessages = extractSessionSnapshotMessages(agent.state.messages);

  return {
    assistantResponse: assistantResponse.trim(),
    streamedContent,
    toolFacts: facts,
    toolCallCount: facts.length,
    acceptedMutatingToolCalls,
    rejectedMutatingToolCalls,
    tasksAfter,
    sessionMessages,
    metrics: {
      durationMs: Date.now() - startedAt,
      timeToFirstToolCallMs,
      timeToFirstAssistantTextMs,
      restoreMessageCount: initialContextMetrics.restoreMessageCount,
      restoreMessageChars: initialContextMetrics.restoreMessageChars,
      sessionMemoryChars: initialContextMetrics.sessionMemoryChars,
      systemPromptChars: initialContextMetrics.systemPromptChars,
      approxInputChars: initialContextMetrics.approxInputChars,
      activePolicyCount: initialContextMetrics.activePolicyCount,
    },
  };
}
