import { randomUUID } from 'node:crypto';
import { query, isSDKAssistantMessage, isSDKResultMessage } from '@qwen-code/sdk';

import type { CommandService } from '@gantt/mcp/services';
import { getPrisma } from '@gantt/runtime-core/prisma';

import { writeServerDebugLog } from './debug-log.js';
import { buildMutationPlan } from './mutation/plan-builder.js';
import { executeMutationPlan } from './mutation/execution.js';
import type {
  MutationExecutionResult,
  MutationPlan,
  MutationTaskSnapshot,
  ResolvedMutationContext,
  SpecializedExecutorResolution,
  StructuredFragmentPlan,
} from './mutation/types.js';
import type { ServerMessage } from './ws.js';

type SplitTaskServices = {
  messageService: {
    add(
      role: 'user' | 'assistant',
      content: string,
      projectId: string,
      options?: {
        requestContextId?: string;
        historyGroupId?: string;
      },
    ): Promise<unknown>;
  };
  taskService: {
    get(
      id: string,
      includeChildren?: boolean | 'shallow' | 'deep',
    ): Promise<unknown>;
    list(
      projectId?: string,
      parentId?: string | null,
      limit?: number,
      offset?: number,
    ): Promise<{ tasks: MutationTaskSnapshot[]; hasMore?: boolean; total?: number }>;
  };
  commandService: {
    commitCommand: CommandService['commitCommand'];
  };
};

type SplitTaskEnv = {
  OPENAI_API_KEY: string;
  OPENAI_BASE_URL: string;
  OPENAI_MODEL: string;
  OPENAI_CHEAP_MODEL?: string;
};

export type RunDirectSplitTaskInput = {
  projectId: string;
  sessionId: string;
  runId: string;
  taskId: string;
  details?: string;
  explicitListMode?: boolean;
  explicitListText?: string;
  handoff?: Extract<SpecializedExecutorResolution, { executor: 'split_task' }>;
  env: SplitTaskEnv;
  services: SplitTaskServices;
  broadcastToSession: (sessionId: string, message: ServerMessage) => void;
  plannerQuery?: (prompt: string, env: SplitTaskEnv) => Promise<string>;
  loadProjectVersion?: (projectId: string) => Promise<number>;
  writeDebugLog?: typeof writeServerDebugLog;
  getLatestVisibleGroupId?: (projectId: string) => Promise<string | null>;
};

export type RunDirectSplitTaskResult = {
  execution: MutationExecutionResult;
  assistantResponse: string;
  tasksAfter: MutationTaskSnapshot[];
  plan: MutationPlan;
  fragmentPlan: StructuredFragmentPlan;
};

type DirectSplitPayload = {
  title?: unknown;
  why?: unknown;
  nodes?: unknown;
};

type ParsedExplicitListItem = {
  key: string;
  text: string;
};

async function loadAllProjectTasks(
  taskService: SplitTaskServices['taskService'],
  projectId: string,
): Promise<MutationTaskSnapshot[]> {
  const pageSize = 1000;
  let offset = 0;
  const allTasks: MutationTaskSnapshot[] = [];

  while (true) {
    const page = await taskService.list(projectId, undefined, pageSize, offset);
    allTasks.push(...page.tasks);
    if (!page.hasMore) {
      return allTasks;
    }
    offset += page.tasks.length;
    if (page.tasks.length === 0) {
      return allTasks;
    }
  }
}

function buildSdkEnv(env: SplitTaskEnv): Record<string, string> {
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

function normalizeIsoDate(value?: string | Date): string {
  if (!value) {
    return '';
  }

  return typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}

function parseDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function getInclusiveDurationDays(startDate: string, endDate: string): number {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  const diff = Math.round((end.getTime() - start.getTime()) / 86400000);
  return Math.max(1, diff + 1);
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/giu, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
}

function resolveCheckpointGroupId(latestVisibleGroupId: string | null): string {
  return latestVisibleGroupId ?? 'initial';
}

export function buildSplitTaskTrace(taskName: string, details?: string): string {
  const trimmedDetails = details?.trim();
  if (!trimmedDetails) {
    return `Разбить задачу «${taskName}» на подзадачи.`;
  }

  return `Разбить задачу «${taskName}» на подзадачи. Уточнения: ${trimmedDetails}`;
}

export function parseExplicitSplitList(value?: string): ParsedExplicitListItem[] {
  if (!value?.trim()) {
    return [];
  }

  const normalized = value.includes('\n')
    ? value
    : value.replace(/;/g, '\n');

  return normalized
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .map((line) => line.replace(/^(?:[-*•]|\d+[.)])\s*/u, '').trim())
    .filter((line) => line.length > 0)
    .map((text, index) => ({
      key: `item-${index + 1}`,
      text,
    }));
}

function buildSplitTaskUserTrace(taskName: string, input: { details?: string; explicitListMode?: boolean; explicitItems?: ParsedExplicitListItem[] }): string {
  const trimmedDetails = input.details?.trim();
  const parts = [`Разбить задачу «${taskName}» на подзадачи.`];

  if (input.explicitListMode && input.explicitItems && input.explicitItems.length > 0) {
    parts.push(`Используй только этот явный список подзадач:\n${input.explicitItems.map((item) => item.text).join('\n')}`);
  }

  if (trimmedDetails) {
    parts.push(`Уточнения: ${trimmedDetails}`);
  }

  return parts.join(' ');
}

function buildPrompt(input: {
  taskName: string;
  startDate: string;
  endDate: string;
  parentDurationDays: number;
  existingChildNames: string[];
  details?: string;
  explicitItems?: ParsedExplicitListItem[];
  explicitListMode?: boolean;
}): string {
  const existingChildrenBlock = input.existingChildNames.length > 0
    ? input.existingChildNames.map((name) => `- ${name}`).join('\n')
    : '- none';
  const detailsLine = input.details?.trim()
    ? `Additional user details: ${input.details.trim()}`
    : 'Additional user details: none';
  const explicitItemsBlock = input.explicitItems?.length
    ? input.explicitItems.map((item) => `- ${item.key}: ${item.text}`).join('\n')
    : '- none';
  const schema = input.explicitListMode
    ? '{"title":"parent task title","why":"short rationale","nodes":[{"nodeKey":"stable-key","sourceItemKey":"item-1","title":"child title","taskType":"task","durationDays":1,"dependsOnNodeKeys":["previous-node-key"]}]}'
    : '{"title":"parent task title","why":"short rationale","nodes":[{"nodeKey":"stable-key","title":"child title","taskType":"task","durationDays":1,"dependsOnNodeKeys":["previous-node-key"]}]}';

  return [
    'Return strict JSON only. No markdown, no prose, no code fences.',
    'You are generating child tasks for one existing parent task in a Gantt chart.',
    'The parent task already exists and must remain the parent. Do not recreate it. Do not create top-level items or sibling branches.',
    input.explicitListMode
      ? 'Use exactly the explicit user-supplied worklist below. Do not add extra child tasks, do not omit items, and do not merge multiple source items into one task.'
      : 'Create 4 to 8 concrete child tasks unless the scope clearly requires fewer.',
    'Avoid vague titles like "Основные работы" or "Прочее".',
    'Avoid duplicates with existing child tasks listed below.',
    'Use regular tasks, not milestones. Do not emit milestone nodes for this split-task flow.',
    'Do not force a fully sequential chain. Some child tasks may run in parallel, some may have dependencies, and some may have none.',
    'Choose dependencies only when they reflect real execution logic. Parallel work is allowed and often desirable.',
    'Schema:',
    schema,
    'Rules:',
    '1. Every node must have integer durationDays >= 1.',
    '2. dependsOnNodeKeys may reference only nodeKeys that appear earlier in the nodes array, but dependencies are optional.',
    '3. Use parallel branches when appropriate instead of inventing unnecessary FS links.',
    '4. Keep the total duration reasonably close to the parent time window.',
    ...(input.explicitListMode
      ? [
          '5. Emit exactly one node per explicit source item.',
          '6. Every node must include sourceItemKey and it must match one explicit source item key exactly once.',
          '7. You may clean up wording in titles, but scope must stay strictly inside the explicit user list.',
        ]
      : []),
    `Parent task: ${input.taskName}`,
    `Parent range: ${input.startDate} to ${input.endDate}`,
    `Parent duration days: ${input.parentDurationDays}`,
    detailsLine,
    'Explicit user list:',
    explicitItemsBlock,
    'Existing child tasks to avoid duplicating:',
    existingChildrenBlock,
  ].join('\n');
}

function parseFragmentPlan(payloadText: string, explicitItems: ParsedExplicitListItem[] = []): StructuredFragmentPlan {
  const parsed = JSON.parse(payloadText) as DirectSplitPayload;
  const rawNodes = Array.isArray(parsed.nodes) ? parsed.nodes : [];
  const seenKeys = new Set<string>();
  const explicitItemMap = new Map(explicitItems.map((item) => [item.key, item]));
  const usedExplicitItemKeys = new Set<string>();

  const nodes = rawNodes.flatMap((node, index) => {
    if (!node || typeof node !== 'object') {
      return [];
    }

    const raw = node as {
      nodeKey?: unknown;
      title?: unknown;
      taskType?: unknown;
      durationDays?: unknown;
      dependsOnNodeKeys?: unknown;
      sourceItemKey?: unknown;
    };

    const title = typeof raw.title === 'string' ? raw.title.trim() : '';
    if (!title) {
      return [];
    }

    const durationDays = typeof raw.durationDays === 'number' ? Math.max(1, Math.round(raw.durationDays)) : 1;
    const baseKey = typeof raw.nodeKey === 'string' && raw.nodeKey.trim().length > 0
      ? raw.nodeKey.trim()
      : slugify(title) || `step-${index + 1}`;

    let nodeKey = baseKey;
    let suffix = 2;
    while (seenKeys.has(nodeKey)) {
      nodeKey = `${baseKey}-${suffix}`;
      suffix += 1;
    }
    seenKeys.add(nodeKey);

    const dependsOnNodeKeys = Array.isArray(raw.dependsOnNodeKeys)
      ? raw.dependsOnNodeKeys.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : [];
    const sourceItemKey = typeof raw.sourceItemKey === 'string' ? raw.sourceItemKey.trim() : '';

    if (explicitItemMap.size > 0) {
      if (!explicitItemMap.has(sourceItemKey) || usedExplicitItemKeys.has(sourceItemKey)) {
        return [];
      }
      usedExplicitItemKeys.add(sourceItemKey);
    }

    const taskType: 'task' | 'milestone' | undefined = raw.taskType === 'milestone'
      ? 'milestone'
      : raw.taskType === 'task'
        ? 'task'
        : undefined;

    return [{
      nodeKey,
      title,
      taskType,
      durationDays,
      dependsOnNodeKeys: dependsOnNodeKeys.filter((depKey) => depKey !== nodeKey),
      sourceItemKey,
    }];
  });

  if (explicitItemMap.size > 0) {
    if (usedExplicitItemKeys.size !== explicitItemMap.size) {
      throw new Error('Split task planner must return exactly the explicit user list with no omissions.');
    }

    nodes.sort((left, right) => {
      const leftIndex = explicitItems.findIndex((item) => item.key === left.sourceItemKey);
      const rightIndex = explicitItems.findIndex((item) => item.key === right.sourceItemKey);
      return leftIndex - rightIndex;
    });
  }

  if (nodes.length === 0) {
    throw new Error('Split task planner returned no valid child tasks.');
  }

  return {
    title: typeof parsed.title === 'string' && parsed.title.trim().length > 0 ? parsed.title.trim() : 'Task split',
    why: typeof parsed.why === 'string' && parsed.why.trim().length > 0 ? parsed.why.trim() : 'Direct split-task planning response.',
    nodes: nodes.map(({ sourceItemKey: _sourceItemKey, ...node }) => node),
  };
}

async function executeDirectSplitPlanningQuery(prompt: string, env: SplitTaskEnv): Promise<string> {
  if (!env.OPENAI_API_KEY) {
    throw new Error('API key not configured. Set OPENAI_API_KEY or ANTHROPIC_AUTH_TOKEN in .env');
  }

  const session = query({
    prompt,
    options: {
      authType: 'openai',
      model: env.OPENAI_MODEL,
      cwd: process.cwd(),
      permissionMode: 'yolo',
      env: buildSdkEnv(env),
      maxSessionTurns: 2,
      excludeTools: ['write_file', 'edit_file', 'run_terminal_cmd', 'run_python_code'],
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
        throw new Error(typeof event.error === 'string' ? event.error : 'Split task planner failed');
      }

      if (typeof event.result === 'string' && event.result.trim().length > 0) {
        content = event.result;
      }
      break;
    }
  }

  if (content.trim().length === 0) {
    throw new Error('Split task planner returned an empty response');
  }

  return content;
}

async function getProjectVersion(projectId: string): Promise<number> {
  const project = await getPrisma().project.findUnique({
    where: { id: projectId },
    select: { version: true },
  });

  if (!project) {
    throw new Error(`Project ${projectId} not found`);
  }

  return project.version;
}

async function getLatestVisibleHistoryGroupId(projectId: string): Promise<string | null> {
  const { historyService } = await import('@gantt/mcp/services');
  return historyService.getLatestVisibleGroupId(projectId);
}

export async function runDirectSplitTask(input: RunDirectSplitTaskInput): Promise<RunDirectSplitTaskResult> {
  const executePlannerQuery = input.plannerQuery ?? executeDirectSplitPlanningQuery;
  const loadProjectVersion = input.loadProjectVersion ?? getProjectVersion;
  const debugLog = input.writeDebugLog ?? writeServerDebugLog;
  const resolveLatestVisibleGroupId = input.getLatestVisibleGroupId
    ?? getLatestVisibleHistoryGroupId;
  const tasksBefore = await loadAllProjectTasks(input.services.taskService, input.projectId);
  const taskBefore = tasksBefore.find((task) => task.id === input.taskId);
  if (!taskBefore) {
    throw new Error('Task not found in current project');
  }

  const task = await input.services.taskService.get(input.taskId, 'shallow') as {
    id: string;
    name: string;
    startDate?: string | Date;
    endDate?: string | Date;
    children?: Array<{ name: string }>;
  } | undefined;
  if (!task || typeof task.name !== 'string') {
    throw new Error('Task not found');
  }

  const taskName = task.name.trim();
  const startDate = normalizeIsoDate(task.startDate);
  const endDate = normalizeIsoDate(task.endDate);
  const existingChildNames = (task.children ?? []).map((child) => child.name.trim()).filter(Boolean);
  const explicitItems = input.explicitListMode ? parseExplicitSplitList(input.explicitListText) : [];
  if (input.explicitListMode && explicitItems.length === 0) {
    throw new Error('Explicit split list is empty');
  }
  const userTrace = buildSplitTaskUserTrace(taskName, {
    details: input.details,
    explicitListMode: input.explicitListMode,
    explicitItems,
  });
  const historyGroupId = randomUUID();
  const checkpointGroupId = resolveCheckpointGroupId(await resolveLatestVisibleGroupId(input.projectId));

  await input.services.messageService.add('user', userTrace, input.projectId, {
    requestContextId: input.runId,
    historyGroupId: checkpointGroupId,
  });
  await debugLog('direct_split_requested', {
    runId: input.runId,
    projectId: input.projectId,
    sessionId: input.sessionId,
    taskId: input.taskId,
    taskName,
    details: input.details?.trim() || undefined,
    explicitListMode: input.explicitListMode === true,
    explicitListItems: explicitItems.map((item) => item.text),
    existingChildCount: existingChildNames.length,
  });

  const plannerPrompt = buildPrompt({
    taskName,
    startDate,
    endDate,
    parentDurationDays: getInclusiveDurationDays(startDate, endDate),
    existingChildNames,
    details: input.details,
    explicitItems,
    explicitListMode: input.explicitListMode,
  });

  const plannerOutput = await executePlannerQuery(plannerPrompt, input.env);
  const fragmentPlan = parseFragmentPlan(plannerOutput, explicitItems);
  const projectVersion = await loadProjectVersion(input.projectId);

  const resolutionContext: ResolvedMutationContext = {
    projectId: input.projectId,
    projectVersion,
    resolutionQuery: taskName,
    containers: [],
    groupMemberIds: [],
    tasks: [{ id: task.id, name: task.name, score: 1 }],
    predecessors: [{ id: task.id, name: task.name, score: 1 }],
    successors: [],
    selectedContainerId: null,
    selectedPredecessorTaskId: task.id,
    selectedSuccessorTaskId: null,
    placementPolicy: 'no_placement_required',
    confidence: 1,
    ambiguities: [],
  };

  const plan = await buildMutationPlan({
    intent: {
      routeEnvelope: {
        route: 'specialized_fast_path',
        intentFamily: 'structure',
        intentType: 'decompose_task',
        confidence: 1,
        riskLevel: 'S2',
        params: {
          executor: 'split_task',
        },
        ambiguities: [],
      },
      intentType: 'decompose_task',
      confidence: 1,
      rawRequest: userTrace,
      normalizedRequest: userTrace.toLowerCase(),
      entitiesMentioned: [task.name],
      requiresResolution: true,
      requiresSchedulingPlacement: true,
      executionMode: 'hybrid',
      fragmentPlan,
    },
    resolutionContext,
    userMessage: userTrace,
    tasksBefore,
  });

  const execution = await executeMutationPlan({
    projectId: input.projectId,
    projectVersion,
    tasksBefore,
    plan,
    history: {
      groupId: historyGroupId,
      requestContextId: input.runId,
      historyTitle: userTrace,
      historyUndoable: true,
    },
    commandService: input.services.commandService,
  });

  if (execution.status !== 'completed') {
    throw new Error(execution.userFacingMessage || 'Direct split task execution failed');
  }

  const tasksAfter = await loadAllProjectTasks(input.services.taskService, input.projectId);
  const assistantResponse = `Задача «${taskName}» детализирована на ${fragmentPlan.nodes.length} подзадач.`;

  await input.services.messageService.add('assistant', assistantResponse, input.projectId, {
    requestContextId: input.runId,
    historyGroupId: checkpointGroupId,
  });
  input.broadcastToSession(input.sessionId, { type: 'token', content: assistantResponse });
  input.broadcastToSession(input.sessionId, { type: 'tasks', tasks: tasksAfter });
  input.broadcastToSession(input.sessionId, { type: 'history_changed' });
  input.broadcastToSession(input.sessionId, {
    type: 'done',
    chatMessage: {
      requestContextId: input.runId,
      historyGroupId: checkpointGroupId,
    },
  });

  await debugLog('direct_split_completed', {
    runId: input.runId,
    projectId: input.projectId,
    sessionId: input.sessionId,
    taskId: input.taskId,
    changedTaskIds: execution.changedTaskIds,
    commandTypes: execution.committedCommandTypes,
    taskCountAfter: tasksAfter.length,
  });

  return {
    execution,
    assistantResponse,
    tasksAfter: tasksAfter as MutationTaskSnapshot[],
    plan,
    fragmentPlan,
  };
}
