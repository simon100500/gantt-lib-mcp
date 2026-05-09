import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve as resolvePath } from 'node:path';

import type { ActorType, CommitProjectCommandRequest, CommitProjectCommandResponse } from '@gantt/mcp/types';
import type { ScheduleCommandOptions } from '@gantt/mcp/types';
import { historyService } from '@gantt/mcp/services';
import type { ServerMessage } from '../ws.js';
import { buildGenerationBrief, type BuildGenerationBriefInput } from './brief.js';
import { classifyInitialRequest } from './classification.js';
import { decideInitialClarification } from './clarification-gate.js';
import { assembleDomainSkeleton } from './domain/assembly.js';
import { executeInitialProjectPlan } from './executor.js';
import { normalizeInitialRequest } from './intake-normalization.js';
import * as initialRequestInterpreter from './interpreter.js';
import { resolveModelRoutingDecision } from './model-routing.js';
import { planInitialProject } from './planner.js';
import type { DomainSkeleton } from './domain/contracts.js';
import type {
  ClarificationDecision,
  GenerationBrief,
  InitialGenerationClassification,
  InitialGenerationPlannerStage,
  InitialRequestInterpretation,
  ModelRoutingDecision,
  NormalizedInitialRequest,
  ScheduledProjectPlan,
  StructuredProjectPlan,
} from './types.js';

type ListedTask = {
  id: string;
  name: string;
  startDate?: string;
  endDate?: string;
  parentId?: string;
  dependencies?: Array<{ taskId: string; type: string; lag?: number }>;
  sortOrder?: number;
};

type PreviewTaskMessage = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  parentId?: string;
  dependencies?: Array<{ taskId: string; type: string; lag?: number }>;
  sortOrder?: number;
};

type PlannerQueryInput = {
  prompt: string;
  model: string;
  stage: InitialGenerationPlannerStage;
  onTextDelta?: (delta: string, fullText: string) => Promise<void> | void;
};

type PlannerQueryResult = string | { content?: string };

type InterpretationQueryInput = {
  prompt: string;
  model: string;
  stage: 'initial_request_interpretation' | 'initial_request_interpretation_repair';
};

type InterpretationQueryResult = string | { content?: string };

export type InitialGenerationServices = {
  commandService: {
    commitCommand(
      request: CommitProjectCommandRequest,
      actorType: ActorType,
      actorId?: string,
    ): Promise<CommitProjectCommandResponse>;
  };
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
    list(projectId: string): Promise<{ tasks: ListedTask[] }>;
    listAll(projectId: string): Promise<ListedTask[]>;
  };
};

export type InitialGenerationLogger = {
  debug(event: string, payload: Record<string, unknown>): void | Promise<void>;
};

type InitialGenerationDeps = {
  buildGenerationBrief: (input: BuildGenerationBriefInput) => GenerationBrief;
  normalizeInitialRequest: (rawRequest: string) => NormalizedInitialRequest;
  interpretRequest: (input: {
    userMessage: string;
    normalizedRequest: NormalizedInitialRequest;
    projectState: {
      taskCount: number;
      hasHierarchy: boolean;
      isEmptyProject: boolean;
    };
    model: string;
    interpretationQuery: (input: InterpretationQueryInput) => Promise<InterpretationQueryResult>;
  }) => Promise<{
    interpretation: InitialRequestInterpretation;
    usedModelDecision: boolean;
    repairAttempted: boolean;
    fallbackReason: 'none' | 'model_unavailable' | 'schema_invalid' | 'empty_response';
  }>;
  classifyInitialRequest: (input: {
    normalizedRequest: NormalizedInitialRequest;
    interpretation: InitialRequestInterpretation;
  }) => InitialGenerationClassification;
  decideInitialClarification: (input: {
    normalizedRequest: NormalizedInitialRequest;
    interpretation: InitialRequestInterpretation;
    classification: InitialGenerationClassification;
  }) => ClarificationDecision;
  assembleDomainSkeleton: (input: {
    normalizedRequest: NormalizedInitialRequest;
    interpretation: InitialRequestInterpretation;
    classification: InitialGenerationClassification;
    clarificationDecision: ClarificationDecision;
  }) => DomainSkeleton;
  resolveModelRoutingDecision: (input: {
    route: 'initial_generation' | 'mutation';
    env: Record<string, string | undefined>;
  }) => ModelRoutingDecision;
};

type InitialGenerationSuccess = {
  ok: true;
  outcome: 'complete';
  assistantResponse: string;
  repairAttempted: boolean;
  tasksAfter: ListedTask[];
};

type InitialGenerationFailure = {
  ok: false;
  assistantResponse: string;
  repairAttempted: boolean;
  failureStage: 'planning' | 'compile';
};

export type InitialGenerationResult = InitialGenerationSuccess | InitialGenerationFailure;

export type RunInitialGenerationInput = {
  projectId: string;
  sessionId: string;
  runId: string;
  userMessage: string;
  tasksBefore: Array<{ id: string; name: string }>;
  baseVersion: number;
  serverDate?: string;
  scheduleOptions?: Pick<ScheduleCommandOptions, 'businessDays' | 'weekendPredicate'>;
  brief?: GenerationBrief;
  interpretationModel?: string;
  interpretationQuery?: (input: InterpretationQueryInput) => Promise<InterpretationQueryResult>;
  structureModelRoutingDecision?: ModelRoutingDecision;
  schedulingModelRoutingDecision?: ModelRoutingDecision;
  routingEnv?: Record<string, string | undefined>;
  plannerQuery: (input: PlannerQueryInput) => Promise<PlannerQueryResult>;
  services: InitialGenerationServices;
  logger: InitialGenerationLogger;
  broadcastToSession: (sessionId: string, message: ServerMessage) => void;
  deps?: Partial<InitialGenerationDeps>;
};

function getDefaultDeps(): InitialGenerationDeps {
  return {
    buildGenerationBrief,
    normalizeInitialRequest,
    interpretRequest: initialRequestInterpreter.interpretInitialRequest,
    classifyInitialRequest,
    decideInitialClarification,
    assembleDomainSkeleton,
    resolveModelRoutingDecision,
  };
}

function getServerDate(value?: string): string {
  return (value ?? new Date().toISOString()).slice(0, 10);
}

function readPlannerQueryContent(result: PlannerQueryResult): string {
  if (typeof result === 'string') {
    return result;
  }

  return typeof result?.content === 'string' ? result.content : '';
}

function buildSuccessResponse(): string {
  return 'Я подготовил стартовый график проекта с фазами, подэтапами и задачами.';
}

function buildInitialGenerationSystemMessage(): string {
  return 'Стартовый график составлен в календарных днях. Изменить режим можно в меню проекта.';
}

function buildFailureResponse(stage: InitialGenerationFailure['failureStage']): string {
  if (stage === 'compile') {
    return 'Не удалось собрать и сохранить стартовый график полностью.';
  }

  return 'Не удалось подготовить надежный стартовый график по этому запросу.';
}

function buildPreviewId(nodeKey: string): string {
  return `preview:${nodeKey}`;
}

type LoosePreviewEntity = {
  kind: 'phase' | 'subphase' | 'task';
  key: string;
  title: string;
  parentKey?: string;
  startDate?: string;
  endDate?: string;
  order: number;
};

type PreviewWaveSource = 'structure_phases' | 'structure_subphases' | 'scheduled_tasks';

type PreviewDebugWave = {
  wave: number;
  source: PreviewWaveSource;
  taskCount: number;
  tree: Array<{ id: string; name: string; parentId?: string }>;
};

type InitialGenerationDebugCapture = {
  enabled: boolean;
  outputDir: string;
  plannerStreams: {
    structure: { deltas: string[]; latestFullText: string };
    scheduled: { deltas: string[]; latestFullText: string };
  };
  previewWaves: PreviewDebugWave[];
  finalTasks: Array<{ id: string; name: string; parentId?: string }>;
};

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function normalizeHierarchyTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/gu, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function shouldCollapsePreviewSubphase(
  phaseTitle: string,
  subphaseTitle: string,
  taskTitles: string[],
): boolean {
  if (taskTitles.length !== 1) {
    return false;
  }

  const normalizedPhase = normalizeHierarchyTitle(phaseTitle);
  const normalizedSubphase = normalizeHierarchyTitle(subphaseTitle);
  const normalizedTask = normalizeHierarchyTitle(taskTitles[0] ?? '');
  if (!normalizedSubphase) {
    return false;
  }

  return normalizedSubphase === normalizedPhase
    || normalizedSubphase === normalizedTask
    || normalizedPhase.includes(normalizedSubphase)
    || normalizedSubphase.includes(normalizedPhase)
    || normalizedTask.includes(normalizedSubphase)
    || normalizedSubphase.includes(normalizedTask);
}

function parseLoosePreviewEntities(rawText: string): LoosePreviewEntity[] {
  const tokenPattern = /"(phaseKey|subphaseKey|taskKey|title|startDate|endDate)"\s*:\s*"([^"]*)"/g;
  const entityMap = new Map<string, LoosePreviewEntity>();
  const orderedKeys: string[] = [];
  let currentPhaseKey: string | undefined;
  let currentSubphaseKey: string | undefined;
  let pendingEntityId: string | undefined;
  let order = 0;

  const ensureEntity = (kind: LoosePreviewEntity['kind'], key: string, parentKey?: string): LoosePreviewEntity => {
    const id = `${kind}:${key}`;
    const existing = entityMap.get(id);
    if (existing) {
      if (parentKey && !existing.parentKey) {
        existing.parentKey = parentKey;
      }
      return existing;
    }

    const entity: LoosePreviewEntity = {
      kind,
      key,
      title: key,
      ...(parentKey ? { parentKey } : {}),
      order: order++,
    };
    entityMap.set(id, entity);
    orderedKeys.push(id);
    return entity;
  };

  for (const match of rawText.matchAll(tokenPattern)) {
    const field = match[1];
    const value = match[2]?.trim() ?? '';
    if (!field || !value) {
      continue;
    }

    if (field === 'phaseKey') {
      const entity = ensureEntity('phase', value);
      currentPhaseKey = entity.key;
      currentSubphaseKey = undefined;
      pendingEntityId = `phase:${value}`;
      continue;
    }

    if (field === 'subphaseKey') {
      const entity = ensureEntity('subphase', value, currentPhaseKey);
      currentSubphaseKey = entity.key;
      pendingEntityId = `subphase:${value}`;
      continue;
    }

    if (field === 'taskKey') {
      const entity = ensureEntity('task', value, currentSubphaseKey ?? currentPhaseKey);
      pendingEntityId = `task:${value}`;
      continue;
    }

    if (!pendingEntityId) {
      continue;
    }

    const entity = entityMap.get(pendingEntityId);
    if (!entity) {
      continue;
    }

    if (field === 'title') {
      entity.title = value;
      continue;
    }

    if (field === 'startDate' && isIsoDate(value)) {
      entity.startDate = value;
      continue;
    }

    if (field === 'endDate' && isIsoDate(value)) {
      entity.endDate = value;
    }
  }

  return orderedKeys
    .map((id) => entityMap.get(id))
    .filter((entity): entity is LoosePreviewEntity => Boolean(entity));
}

function buildLoosePreviewTasks(
  rawText: string,
  anchorDate: string,
): PreviewTaskMessage[] {
  const entities = parseLoosePreviewEntities(rawText);
  if (entities.length === 0) {
    return [];
  }

  const rows = entities.map((entity) => ({
    id: buildPreviewId(entity.key),
    name: entity.title || entity.key,
    startDate: entity.startDate ?? anchorDate,
    endDate: entity.endDate ?? entity.startDate ?? anchorDate,
    parentId: entity.parentKey ? buildPreviewId(entity.parentKey) : undefined,
    sortOrder: entity.order,
  }));

  const childrenByParent = new Map<string, PreviewTaskMessage[]>();
  for (const row of rows) {
    if (!row.parentId) {
      continue;
    }
    const children = childrenByParent.get(row.parentId) ?? [];
    children.push(row);
    childrenByParent.set(row.parentId, children);
  }

  const applyRollup = (row: PreviewTaskMessage): { startDate: string; endDate: string } => {
    const children = childrenByParent.get(row.id) ?? [];
    if (children.length === 0) {
      return { startDate: row.startDate, endDate: row.endDate };
    }

    const childRanges = children.map((child) => applyRollup(child));
    const startDate = childRanges.reduce((min, range) => range.startDate < min ? range.startDate : min, childRanges[0]!.startDate);
    const endDate = childRanges.reduce((max, range) => range.endDate > max ? range.endDate : max, childRanges[0]!.endDate);
    row.startDate = startDate;
    row.endDate = endDate;
    return { startDate, endDate };
  };

  for (const row of rows) {
    if (!row.parentId) {
      applyRollup(row);
    }
  }

  return rows;
}

function buildPreviewSignature(tasks: PreviewTaskMessage[]): string {
  return tasks
    .map((task) => `${task.id}|${task.parentId ?? ''}|${task.name}|${task.startDate}|${task.endDate}|${task.sortOrder ?? 0}`)
    .join('\n');
}

function buildPreviewSemanticSignature(tasks: PreviewTaskMessage[]): string {
  return tasks
    .map((task) => [
      task.id,
      task.parentId ?? '',
      task.startDate,
      task.endDate,
    ].join('|'))
    .join('\n');
}

function mergePreviewTasks(
  currentTasks: PreviewTaskMessage[],
  incomingTasks: PreviewTaskMessage[],
): PreviewTaskMessage[] {
  if (currentTasks.length === 0) {
    return [...incomingTasks];
  }

  const merged = new Map(currentTasks.map((task) => [task.id, { ...task }]));
  for (const task of incomingTasks) {
    const previous = merged.get(task.id);
    merged.set(task.id, previous ? { ...previous, ...task } : { ...task });
  }

  return [...merged.values()].sort((left, right) => {
    const leftOrder = left.sortOrder ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = right.sortOrder ?? Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }
    return left.id.localeCompare(right.id);
  });
}

function buildPhaseOnlyPreviewTasks(
  structure: StructuredProjectPlan,
  anchorDate: string,
): PreviewTaskMessage[] {
  return structure.phases.map((phase, index) => ({
    id: buildPreviewId(phase.phaseKey),
    name: phase.title,
    startDate: anchorDate,
    endDate: anchorDate,
    sortOrder: index,
  }));
}

function buildStructurePreviewTasks(
  structure: StructuredProjectPlan,
  anchorDate: string,
): PreviewTaskMessage[] {
  const rows: PreviewTaskMessage[] = [];
  let sortOrder = 0;

  for (const phase of structure.phases) {
    rows.push({
      id: buildPreviewId(phase.phaseKey),
      name: phase.title,
      startDate: anchorDate,
      endDate: anchorDate,
      sortOrder: sortOrder++,
    });

    for (const subphase of phase.subphases) {
      if (shouldCollapsePreviewSubphase(phase.title, subphase.title, subphase.tasks.map((task) => task.title))) {
        continue;
      }

      rows.push({
        id: buildPreviewId(subphase.subphaseKey),
        name: subphase.title,
        startDate: anchorDate,
        endDate: anchorDate,
        parentId: buildPreviewId(phase.phaseKey),
        sortOrder: sortOrder++,
      });
    }
  }

  return rows;
}

function buildScheduledPreviewTasks(
  scheduled: ScheduledProjectPlan,
  anchorDate: string,
): PreviewTaskMessage[] {
  const rows: PreviewTaskMessage[] = [];
  let sortOrder = 0;

  for (const phase of scheduled.phases) {
    const phaseTaskDates = phase.subphases.flatMap((subphase) => subphase.tasks.flatMap((task) => {
      const startDate = task.startDate ?? anchorDate;
      const endDate = task.endDate ?? startDate;
      return [{ startDate, endDate }];
    }));
    const phaseStartDate = phaseTaskDates.length > 0
      ? phaseTaskDates.reduce((min, entry) => entry.startDate < min ? entry.startDate : min, phaseTaskDates[0]!.startDate)
      : anchorDate;
    const phaseEndDate = phaseTaskDates.length > 0
      ? phaseTaskDates.reduce((max, entry) => entry.endDate > max ? entry.endDate : max, phaseTaskDates[0]!.endDate)
      : anchorDate;

    rows.push({
      id: buildPreviewId(phase.phaseKey),
      name: phase.title,
      startDate: phaseStartDate,
      endDate: phaseEndDate,
      sortOrder: sortOrder++,
    });

    for (const subphase of phase.subphases) {
      const subphaseTaskDates = subphase.tasks.map((task) => ({
        startDate: task.startDate ?? anchorDate,
        endDate: task.endDate ?? task.startDate ?? anchorDate,
      }));
      const subphaseStartDate = subphaseTaskDates.length > 0
        ? subphaseTaskDates.reduce((min, entry) => entry.startDate < min ? entry.startDate : min, subphaseTaskDates[0]!.startDate)
        : anchorDate;
      const subphaseEndDate = subphaseTaskDates.length > 0
        ? subphaseTaskDates.reduce((max, entry) => entry.endDate > max ? entry.endDate : max, subphaseTaskDates[0]!.endDate)
        : anchorDate;

      const collapseSubphase = shouldCollapsePreviewSubphase(
        phase.title,
        subphase.title,
        subphase.tasks.map((task) => task.title),
      );
      if (!collapseSubphase) {
        rows.push({
          id: buildPreviewId(subphase.subphaseKey),
          name: subphase.title,
          startDate: subphaseStartDate,
          endDate: subphaseEndDate,
          parentId: buildPreviewId(phase.phaseKey),
          sortOrder: sortOrder++,
        });
      }

      for (const task of subphase.tasks) {
        const taskStartDate = task.startDate ?? anchorDate;
        const taskEndDate = task.endDate ?? taskStartDate;
        rows.push({
          id: buildPreviewId(task.taskKey),
          name: task.title,
          startDate: taskStartDate,
          endDate: taskEndDate,
          parentId: collapseSubphase ? buildPreviewId(phase.phaseKey) : buildPreviewId(subphase.subphaseKey),
          dependencies: task.dependsOn.map((dependency) => ({
            taskId: buildPreviewId(dependency.nodeKey),
            type: dependency.type,
            lag: dependency.lagDays ?? 0,
          })),
          sortOrder: sortOrder++,
        });
      }
    }
  }

  return rows;
}

async function broadcastPreviewWave(
  input: RunInitialGenerationInput,
  waveNumber: number,
  previewTasks: PreviewTaskMessage[],
  source: PreviewWaveSource,
  debugCapture?: InitialGenerationDebugCapture,
): Promise<void> {
  input.broadcastToSession(input.sessionId, {
    type: 'preview_tasks_replace',
    tasks: previewTasks,
    provisional: true,
    wave: waveNumber,
  });
  await input.logger.debug('preview_tasks_broadcast', {
    runId: input.runId,
    projectId: input.projectId,
    sessionId: input.sessionId,
    wave: waveNumber,
    source,
    taskCount: previewTasks.length,
    taskIds: previewTasks.map((task) => task.id),
    taskNames: previewTasks.map((task) => task.name),
  });
  debugCapture?.previewWaves.push({
    wave: waveNumber,
    source,
    taskCount: previewTasks.length,
    tree: previewTasks.map((task) => ({
      id: task.id,
      name: task.name,
      parentId: task.parentId,
    })),
  });
}

async function saveAssistantMessage(
  input: RunInitialGenerationInput,
  assistantResponse: string,
  metadata?: {
    requestContextId?: string;
    historyGroupId?: string;
  },
): Promise<void> {
  await input.services.messageService.add('assistant', assistantResponse, input.projectId, metadata);
  input.broadcastToSession(input.sessionId, { type: 'token', content: assistantResponse });
}

function resolveCheckpointGroupId(latestVisibleGroupId: string | null): string {
  return latestVisibleGroupId ?? 'initial';
}

async function broadcastTasksSnapshot(
  input: RunInitialGenerationInput,
  reason: string,
  debugCapture?: InitialGenerationDebugCapture,
): Promise<ListedTask[]> {
  const tasks = await input.services.taskService.listAll(input.projectId);
  input.broadcastToSession(input.sessionId, { type: 'tasks', tasks });
  await input.logger.debug('tasks_broadcast', {
    runId: input.runId,
    projectId: input.projectId,
    sessionId: input.sessionId,
    reason,
    taskCount: tasks.length,
    taskIds: tasks.map((task) => task.id),
    taskNames: tasks.map((task) => task.name),
  });
  if (debugCapture) {
    debugCapture.finalTasks = tasks.map((task) => ({
      id: task.id,
      name: task.name,
      parentId: task.parentId,
    }));
  }

  return tasks;
}

async function finishSuccessfulRun(
  input: RunInitialGenerationInput,
  assistantResponse: string,
  debugCapture?: InitialGenerationDebugCapture,
  metadata?: {
    requestContextId?: string;
    historyGroupId?: string;
    systemMessage?: string | null;
  },
): Promise<ListedTask[]> {
  const tasks = await broadcastTasksSnapshot(input, 'final_state', debugCapture);
  input.broadcastToSession(input.sessionId, { type: 'history_changed' });
  input.broadcastToSession(input.sessionId, {
    type: 'done',
    chatMessage: metadata,
  });
  await input.logger.debug('agent_run_completed', {
    runId: input.runId,
    projectId: input.projectId,
    sessionId: input.sessionId,
    assistantResponse,
  });

  return tasks;
}

function createDebugCapture(input: RunInitialGenerationInput): InitialGenerationDebugCapture | null {
  const env = input.routingEnv ?? process.env;
  if (env.INITIAL_GENERATION_DEBUG_CAPTURE !== '1') {
    return null;
  }

  return {
    enabled: true,
    outputDir: env.INITIAL_GENERATION_DEBUG_CAPTURE_DIR ?? '.planning/debug',
    plannerStreams: {
      structure: { deltas: [], latestFullText: '' },
      scheduled: { deltas: [], latestFullText: '' },
    },
    previewWaves: [],
    finalTasks: [],
  };
}

async function flushDebugCapture(
  input: RunInitialGenerationInput,
  debugCapture: InitialGenerationDebugCapture | null,
  outcome: 'complete' | 'compile_failed' | 'planning_failed',
): Promise<void> {
  if (!debugCapture?.enabled) {
    return;
  }

  const outputDir = resolvePath(debugCapture.outputDir);
  await mkdir(outputDir, { recursive: true });
  const outputPath = resolvePath(outputDir, `${input.runId}.json`);
  await writeFile(outputPath, JSON.stringify({
    runId: input.runId,
    projectId: input.projectId,
    sessionId: input.sessionId,
    userMessage: input.userMessage,
    outcome,
    plannerStreams: debugCapture.plannerStreams,
    previewWaves: debugCapture.previewWaves,
    finalTasks: debugCapture.finalTasks,
  }, null, 2));
  await input.logger.debug('initial_generation_debug_capture_written', {
    runId: input.runId,
    projectId: input.projectId,
    sessionId: input.sessionId,
    outputPath,
    outcome,
  });
}

async function finishFailedRun(
  input: RunInitialGenerationInput,
  assistantResponse: string,
  metadata?: {
    requestContextId?: string;
    historyGroupId?: string;
  },
): Promise<void> {
  input.broadcastToSession(input.sessionId, {
    type: 'done',
    chatMessage: metadata,
  });
  await input.logger.debug('agent_run_completed', {
    runId: input.runId,
    projectId: input.projectId,
    sessionId: input.sessionId,
    assistantResponse,
    controlledFailure: true,
  });
}

function buildInterpretationTelemetry(input: {
  interpretation: InitialRequestInterpretation;
  usedModelDecision: boolean;
  repairAttempted: boolean;
  fallbackReason: 'none' | 'model_unavailable' | 'schema_invalid' | 'empty_response';
}): Record<string, unknown> {
  return {
    route: input.interpretation.route,
    requestKind: input.interpretation.requestKind,
    planningMode: input.interpretation.planningMode,
    scopeMode: input.interpretation.scopeMode,
    objectProfile: input.interpretation.objectProfile,
    projectArchetype: input.interpretation.projectArchetype,
    worklistPolicy: input.interpretation.worklistPolicy,
    locationScope: input.interpretation.locationScope,
    confidence: input.interpretation.confidence,
    signals: input.interpretation.signals,
    clarification: input.interpretation.clarification,
    usedModelDecision: input.usedModelDecision,
    repairAttempted: input.repairAttempted,
    fallbackReason: input.fallbackReason,
  };
}

function buildNormalizedDecisionTelemetry(input: {
  interpretation: InitialRequestInterpretation;
  classification: InitialGenerationClassification;
  clarificationDecision: ClarificationDecision;
  brief: GenerationBrief;
  domainSkeleton: DomainSkeleton;
  usedModelDecision: boolean;
  repairAttempted: boolean;
  fallbackReason: 'none' | 'model_unavailable' | 'schema_invalid' | 'empty_response';
}): Record<string, unknown> {
  return {
    ...buildInterpretationTelemetry({
      interpretation: input.interpretation,
      usedModelDecision: input.usedModelDecision,
      repairAttempted: input.repairAttempted,
      fallbackReason: input.fallbackReason,
    }),
    classification: input.classification,
    clarificationDecision: input.clarificationDecision,
    brief: input.brief,
    domainSkeleton: input.domainSkeleton,
  };
}

export async function runInitialGeneration(
  input: RunInitialGenerationInput,
): Promise<InitialGenerationResult> {
  const deps = {
    ...getDefaultDeps(),
    ...(input.deps ?? {}),
  } satisfies InitialGenerationDeps;

  const normalizedRequest = deps.normalizeInitialRequest(input.userMessage);
  const interpretationResult = await deps.interpretRequest({
    userMessage: input.userMessage,
    normalizedRequest,
    projectState: {
      taskCount: input.tasksBefore.length,
      hasHierarchy: input.tasksBefore.some((task) => Boolean(task.id)),
      isEmptyProject: input.tasksBefore.length === 0,
    },
    model: input.interpretationModel ?? input.structureModelRoutingDecision?.selectedModel ?? 'unavailable',
    interpretationQuery: async (queryInput) => {
      if (!input.interpretationQuery) {
        throw new Error('model_unavailable');
      }
      return input.interpretationQuery(queryInput);
    },
  });
  const interpretation = interpretationResult.interpretation;
  const classification = deps.classifyInitialRequest({
    normalizedRequest,
    interpretation,
  });
  const clarificationDecision = deps.decideInitialClarification({
    normalizedRequest,
    interpretation,
    classification,
  });
  const domainSkeleton = deps.assembleDomainSkeleton({
    normalizedRequest,
    interpretation,
    classification,
    clarificationDecision,
  });
  const brief = input.brief ?? deps.buildGenerationBrief({
    userMessage: input.userMessage,
    normalizedRequest,
    interpretation,
    classification,
    clarificationDecision,
    domainSkeleton,
  });
  const structureModelRoutingDecision = input.structureModelRoutingDecision ?? deps.resolveModelRoutingDecision({
    route: 'initial_generation',
    env: input.routingEnv ?? process.env,
  });
  const schedulingModelRoutingDecision = input.schedulingModelRoutingDecision ?? deps.resolveModelRoutingDecision({
    route: 'mutation',
    env: input.routingEnv ?? process.env,
  });

  await input.logger.debug('model_routing_decision', {
    runId: input.runId,
    projectId: input.projectId,
    sessionId: input.sessionId,
    stage: 'structure_planning',
    ...structureModelRoutingDecision,
  });
  await input.logger.debug('model_routing_decision', {
    runId: input.runId,
    projectId: input.projectId,
    sessionId: input.sessionId,
    stage: 'schedule_metadata',
    ...schedulingModelRoutingDecision,
  });
  await input.logger.debug('initial_generation_intake_normalized', {
    runId: input.runId,
    projectId: input.projectId,
    sessionId: input.sessionId,
    normalizedRequest,
  });
  const interpretationTelemetry = buildInterpretationTelemetry({
    interpretation,
    usedModelDecision: interpretationResult.usedModelDecision,
    repairAttempted: interpretationResult.repairAttempted,
    fallbackReason: interpretationResult.fallbackReason,
  });
  await input.logger.debug('initial_generation_interpretation', {
    runId: input.runId,
    projectId: input.projectId,
    sessionId: input.sessionId,
    interpretation,
    ...interpretationTelemetry,
  });
  await input.logger.debug('initial_generation_interpretation_validation', {
    runId: input.runId,
    projectId: input.projectId,
    sessionId: input.sessionId,
    validationVerdict: interpretationResult.fallbackReason === 'none' ? 'accepted' : 'fallback_applied',
    ...interpretationTelemetry,
  });
  await input.logger.debug('initial_generation_interpretation_fallback', {
    runId: input.runId,
    projectId: input.projectId,
    sessionId: input.sessionId,
    fallbackApplied: interpretationResult.fallbackReason !== 'none',
    ...interpretationTelemetry,
  });
  await input.logger.debug('initial_generation_classification', {
    runId: input.runId,
    projectId: input.projectId,
    sessionId: input.sessionId,
    classification,
  });
  await input.logger.debug('initial_generation_clarification', {
    runId: input.runId,
    projectId: input.projectId,
    sessionId: input.sessionId,
    clarificationDecision,
  });
  await input.logger.debug('initial_generation_domain_skeleton', {
    runId: input.runId,
    projectId: input.projectId,
    sessionId: input.sessionId,
    domainSkeleton,
  });
  await input.logger.debug('initial_generation_normalized_decisions', {
    runId: input.runId,
    projectId: input.projectId,
    sessionId: input.sessionId,
    ...buildNormalizedDecisionTelemetry({
      interpretation,
      classification,
      clarificationDecision,
      brief,
      domainSkeleton,
      usedModelDecision: interpretationResult.usedModelDecision,
      repairAttempted: interpretationResult.repairAttempted,
      fallbackReason: interpretationResult.fallbackReason,
    }),
  });

  let repairAttempted = false;
  let previewWaveCount = 0;
  const previewAnchorDate = getServerDate(input.serverDate);
  const streamingPreviewSignatures = new Map<'structure' | 'scheduled', string>();
  const debugCapture = createDebugCapture(input);
  let visiblePreviewTasks: PreviewTaskMessage[] = [];
  let visiblePreviewSignature = '';
  let visiblePreviewSemanticSignature = '';
  const historyGroupId = randomUUID();
  const checkpointGroupId = resolveCheckpointGroupId(await historyService.getLatestVisibleGroupId(input.projectId));
  const emitMergedPreview = async (
    source: 'structure_phases' | 'structure_subphases' | 'scheduled_tasks',
    incomingTasks: PreviewTaskMessage[],
  ): Promise<void> => {
    const mergedTasks = mergePreviewTasks(visiblePreviewTasks, incomingTasks);
    const mergedSignature = buildPreviewSignature(mergedTasks);
    const mergedSemanticSignature = buildPreviewSemanticSignature(mergedTasks);
    if (mergedSignature === visiblePreviewSignature) {
      return;
    }
    if (source === 'scheduled_tasks' && mergedSemanticSignature === visiblePreviewSemanticSignature) {
      return;
    }

    visiblePreviewTasks = mergedTasks;
    visiblePreviewSignature = mergedSignature;
    visiblePreviewSemanticSignature = mergedSemanticSignature;
    previewWaveCount += 1;
    await broadcastPreviewWave(input, previewWaveCount, mergedTasks, source, debugCapture ?? undefined);
  };
  const maybeBroadcastStreamingPreview = async (
    family: 'structure' | 'scheduled',
    fullText: string,
  ): Promise<void> => {
    if (family !== 'structure') {
      return;
    }

    const previewTasks = buildLoosePreviewTasks(fullText, previewAnchorDate);
    if (previewTasks.length === 0) {
      return;
    }

    const signature = buildPreviewSignature(previewTasks);
    if (signature === streamingPreviewSignatures.get(family)) {
      return;
    }

    streamingPreviewSignatures.set(family, signature);
    await emitMergedPreview(
      family === 'structure' ? 'structure_subphases' : 'scheduled_tasks',
      previewTasks,
    );
  };
  const loggedPlannerQuery = async (plannerInput: PlannerQueryInput): Promise<PlannerQueryResult> => {
    const startedAt = Date.now();
    await input.logger.debug('planner_query_request', {
      runId: input.runId,
      projectId: input.projectId,
      sessionId: input.sessionId,
      stage: plannerInput.stage,
      model: plannerInput.model,
      prompt: plannerInput.prompt,
      promptLength: plannerInput.prompt.length,
    });

    try {
      const result = await input.plannerQuery({
        ...plannerInput,
        onTextDelta: async (delta, fullText) => {
          await plannerInput.onTextDelta?.(delta, fullText);
          const family = plannerInput.stage === 'structure_planning' || plannerInput.stage === 'structure_planning_repair'
            ? 'structure'
            : 'scheduled';
          const streamBucket = family === 'structure'
            ? debugCapture?.plannerStreams.structure
            : debugCapture?.plannerStreams.scheduled;
          if (streamBucket) {
            streamBucket.deltas.push(delta);
            streamBucket.latestFullText = fullText;
          }
          await maybeBroadcastStreamingPreview(family, fullText);
        },
      });
      const content = readPlannerQueryContent(result);
      await input.logger.debug('planner_query_response', {
        runId: input.runId,
        projectId: input.projectId,
        sessionId: input.sessionId,
        stage: plannerInput.stage,
        model: plannerInput.model,
        durationMs: Date.now() - startedAt,
        response: content,
        responseLength: content.length,
        responseType: typeof result === 'string' ? 'string' : 'object',
      });
      return result;
    } catch (error) {
      await input.logger.debug('planner_query_failed', {
        runId: input.runId,
        projectId: input.projectId,
        sessionId: input.sessionId,
        stage: plannerInput.stage,
        model: plannerInput.model,
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };

  try {
    const planning = await planInitialProject({
      userMessage: input.userMessage,
      brief,
      normalizedRequest,
      classification,
      clarificationDecision,
      domainSkeleton,
      structureModelDecision: structureModelRoutingDecision,
      schedulingModelDecision: schedulingModelRoutingDecision,
      sdkQuery: loggedPlannerQuery,
      onStructureReady: async (structure) => {
        const phasePreview = buildPhaseOnlyPreviewTasks(structure, previewAnchorDate);
        if (phasePreview.length > 0) {
          await emitMergedPreview('structure_phases', phasePreview);
        }

        const structurePreview = buildStructurePreviewTasks(structure, previewAnchorDate);
        const phaseSignature = phasePreview.map((task) => task.id).join('|');
        const structureSignature = structurePreview.map((task) => task.id).join('|');
        if (structurePreview.length > 0 && structureSignature !== phaseSignature) {
          await emitMergedPreview('structure_subphases', structurePreview);
        }
      },
      onScheduledReady: async (scheduled) => {
        const scheduledPreview = buildScheduledPreviewTasks(scheduled, previewAnchorDate);
        if (scheduledPreview.length > 0) {
          await emitMergedPreview('scheduled_tasks', scheduledPreview);
        }
      },
    });
    repairAttempted = planning.repairAttempted;

    await input.logger.debug('structure_plan_output', {
      runId: input.runId,
      projectId: input.projectId,
      sessionId: input.sessionId,
      selectedModel: structureModelRoutingDecision.selectedModel,
      structure: planning.structure,
      repairAttempted: planning.repairAttempted,
    });
    await input.logger.debug('structure_gate_verdict', {
      runId: input.runId,
      projectId: input.projectId,
      sessionId: input.sessionId,
      accepted: planning.structureVerdict.accepted,
      reasons: planning.structureVerdict.reasons,
      score: planning.structureVerdict.score,
      metrics: planning.structureVerdict.metrics,
    });

    await input.logger.debug('schedule_metadata_output', {
      runId: input.runId,
      projectId: input.projectId,
      sessionId: input.sessionId,
      selectedModel: schedulingModelRoutingDecision.selectedModel,
      scheduled: planning.scheduled,
    });
    await input.logger.debug('scheduling_gate_verdict', {
      runId: input.runId,
      projectId: input.projectId,
      sessionId: input.sessionId,
      accepted: planning.schedulingVerdict.accepted,
      reasons: planning.schedulingVerdict.reasons,
      score: planning.schedulingVerdict.score,
      metrics: planning.schedulingVerdict.metrics,
    });

    await input.logger.debug('executable_plan_output', {
      runId: input.runId,
      projectId: input.projectId,
      sessionId: input.sessionId,
      plan: planning.plan,
    });

    const execution = await executeInitialProjectPlan({
      projectId: input.projectId,
      baseVersion: input.baseVersion,
      clientRequestId: randomUUID(),
      actorId: input.runId,
      plan: planning.plan,
      commandService: input.services.commandService,
      serverDate: getServerDate(input.serverDate),
      scheduleOptions: { businessDays: false },
      history: {
        groupId: historyGroupId,
        origin: 'agent_run',
        title: `AI — ${input.userMessage.trim().replace(/\s+/g, ' ') || 'Стартовый график'}`,
        requestContextId: input.runId,
        finalizeGroup: true,
      },
      onCompiled: async (_compiledSchedule) => {},
    });

    await input.logger.debug('compile_verdict', {
      runId: input.runId,
      projectId: input.projectId,
      sessionId: input.sessionId,
      ok: execution.ok,
      ...(execution.ok
        ? {
            outcome: execution.outcome,
            retainedNodeCount: execution.compiledSchedule.retainedNodeCount,
            compiledTaskCount: execution.compiledSchedule.compiledTaskCount,
            compiledDependencyCount: execution.compiledSchedule.compiledDependencyCount,
            topLevelPhaseCount: execution.compiledSchedule.topLevelPhaseCount,
          }
        : {
            outcome: execution.reason,
            message: execution.message,
            retainedNodeCount: execution.retainedNodeCount,
            retainedTopLevelPhaseCount: execution.retainedTopLevelPhaseCount,
            compiledTaskCount: execution.compiledTaskCount,
            compiledDependencyCount: execution.compiledDependencyCount,
          }),
    });

    if (!execution.ok) {
      const assistantResponse = buildFailureResponse('compile');
      if (previewWaveCount > 0) {
        input.broadcastToSession(input.sessionId, {
          type: 'preview_failed',
          message: 'Предварительный график не был сохранён. Проверьте ошибку и повторите запуск.',
        });
      }
      await saveAssistantMessage(input, assistantResponse, {
        requestContextId: input.runId,
      });
      await input.logger.debug('initial_generation_result', {
        runId: input.runId,
        projectId: input.projectId,
        sessionId: input.sessionId,
        accepted: false,
        outcome: execution.reason,
        repairAttempted,
        assistantResponse,
      });
      await finishFailedRun(input, assistantResponse, {
        requestContextId: input.runId,
      });
      await flushDebugCapture(input, debugCapture, 'compile_failed');

      return {
        ok: false,
        assistantResponse,
        repairAttempted,
        failureStage: 'compile',
      };
    }

    const assistantResponse = buildSuccessResponse();
    await saveAssistantMessage(input, assistantResponse, {
      requestContextId: input.runId,
      historyGroupId: checkpointGroupId,
    });
    await input.logger.debug('initial_generation_result', {
      runId: input.runId,
      projectId: input.projectId,
      sessionId: input.sessionId,
      accepted: true,
      outcome: 'complete',
      repairAttempted,
      assistantResponse,
    });
    const tasksAfter = await finishSuccessfulRun(input, assistantResponse, debugCapture ?? undefined, {
      requestContextId: input.runId,
      historyGroupId: checkpointGroupId,
      systemMessage: buildInitialGenerationSystemMessage(),
    });
    await flushDebugCapture(input, debugCapture, 'complete');

    return {
      ok: true,
      outcome: 'complete',
      assistantResponse,
      repairAttempted,
      tasksAfter,
    };
  } catch (error) {
    const assistantResponse = buildFailureResponse('planning');
    await saveAssistantMessage(input, assistantResponse, {
      requestContextId: input.runId,
    });
    await input.logger.debug('initial_generation_result', {
      runId: input.runId,
      projectId: input.projectId,
      sessionId: input.sessionId,
      accepted: false,
      reason: 'planning_error',
      repairAttempted,
      assistantResponse,
      error: error instanceof Error ? error.message : String(error),
    });
    await finishFailedRun(input, assistantResponse, {
      requestContextId: input.runId,
    });
    await flushDebugCapture(input, debugCapture, 'planning_failed');

    return {
      ok: false,
      assistantResponse,
      repairAttempted,
      failureStage: 'planning',
    };
  }
}
