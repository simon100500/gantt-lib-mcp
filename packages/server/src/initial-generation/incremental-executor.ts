import type {
  ActorType,
  CommitProjectCommandRequest,
  CommitProjectCommandResponse,
  CreateTaskInput,
} from '@gantt/mcp/types';

import { buildExecutablePlan } from './link-reconciliation.js';
import { buildDeterministicTaskId, compileInitialProjectPlan } from './compiler.js';
import type {
  ExpandedPhasePlanningResult,
  PlanInitialProjectResult,
} from './planner.js';

export type ExecuteIncrementalInitialGenerationInput = {
  projectId: string;
  baseVersion: number;
  clientRequestId: string;
  actorId?: string;
  serverDate: string;
  planning: PlanInitialProjectResult;
  commandService: {
    commitCommand(
      request: CommitProjectCommandRequest,
      actorType: ActorType,
      actorId?: string,
    ): Promise<CommitProjectCommandResponse>;
  };
};

export type IncrementalCommitContext = {
  currentVersion: number;
  committedPhaseKeys: string[];
  committedTaskNodeKeys: string[];
};

export type ExecuteIncrementalInitialGenerationResult =
  | {
      ok: true;
      outcome: 'complete' | 'partial';
      message: string;
      committedPhaseKeys: string[];
      committedTaskNodeKeys: string[];
    }
  | {
      ok: false;
      reason: 'commit_rejected';
      message: string;
      committedPhaseKeys: string[];
      committedTaskNodeKeys: string[];
      commitResponse?: Exclude<CommitProjectCommandResponse, { accepted: true }>;
    };

function parseDateOnly(value: string): Date {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid serverDate: ${value}`);
  }
  return parsed;
}

function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function isWeekend(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

function addUtcDays(date: Date, delta: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + delta));
}

function shiftBusinessDays(date: Date, offset: number): Date {
  let current = date;
  let remaining = Math.abs(offset);
  const direction = offset >= 0 ? 1 : -1;

  while (remaining > 0) {
    current = addUtcDays(current, direction);
    while (isWeekend(current)) {
      current = addUtcDays(current, direction);
    }
    remaining -= 1;
  }

  return current;
}

async function commitCommand(
  input: ExecuteIncrementalInitialGenerationInput,
  baseVersion: number,
  command: CommitProjectCommandRequest['command'],
): Promise<Extract<CommitProjectCommandResponse, { accepted: true }>> {
  const response = await input.commandService.commitCommand({
    projectId: input.projectId,
    clientRequestId: `${input.clientRequestId}:${baseVersion}:${command.type}`,
    baseVersion,
    command,
  }, 'agent', input.actorId);

  if (!response.accepted) {
    throw response;
  }

  return response;
}

export function buildSkeletonTasks(input: ExecuteIncrementalInitialGenerationInput): CreateTaskInput[] {
  const anchor = parseDateOnly(input.serverDate);
  return input.planning.skeleton.phases
    .sort((left, right) => left.orderHint - right.orderHint)
    .map((phase, index) => {
      const start = shiftBusinessDays(anchor, index);
      return {
        id: buildDeterministicTaskId(input.projectId, phase.phaseKey),
        projectId: input.projectId,
        name: phase.title,
        startDate: formatDateOnly(start),
        endDate: formatDateOnly(start),
        sortOrder: index,
      };
    });
}

export function getOrderedExpandedPhases(planning: PlanInitialProjectResult): ExpandedPhasePlanningResult[] {
  const order = new Map(planning.skeleton.phases.map((phase, index) => [phase.phaseKey, index]));
  return [...planning.expandedPhases].sort((left, right) =>
    (order.get(left.phaseKey) ?? Number.MAX_SAFE_INTEGER) - (order.get(right.phaseKey) ?? Number.MAX_SAFE_INTEGER),
  );
}

export function buildPartialPlan(
  planning: PlanInitialProjectResult,
  expandedPhases: ExpandedPhasePlanningResult[],
) {
  const phaseKeys = new Set(expandedPhases.map((phase) => phase.phaseKey));
  return buildExecutablePlan({
    brief: {
      objectType: '',
      scopeSignals: [],
      starterScheduleExpectation: '',
      namingBan: '',
      domainContextSummary: '',
      serverInferencePolicy: '',
    },
    skeleton: {
      ...planning.skeleton,
      phases: planning.skeleton.phases.filter((phase) => phaseKeys.has(phase.phaseKey)),
    },
    expansions: expandedPhases.map((phase) => phase.expansion),
  }).plan;
}

export function extractCurrentPhaseTasks(
  projectId: string,
  phaseKey: string,
  compiledTasks: CreateTaskInput[],
): CreateTaskInput[] {
  const phaseTaskId = buildDeterministicTaskId(projectId, phaseKey);
  return compiledTasks.filter((task) => task.parentId === phaseTaskId);
}

export async function executeIncrementalInitialGeneration(
  input: ExecuteIncrementalInitialGenerationInput,
): Promise<ExecuteIncrementalInitialGenerationResult> {
  let currentVersion = input.baseVersion;
  const committedPhaseKeys: string[] = [];
  const committedTaskNodeKeys: string[] = [];

  try {
    const skeletonTasks = buildSkeletonTasks(input);
    const skeletonCommit = await commitCommand(input, currentVersion, {
      type: 'create_tasks_batch',
      tasks: skeletonTasks,
    });
    currentVersion = skeletonCommit.newVersion;
    committedPhaseKeys.push(...input.planning.skeleton.phases.map((phase) => phase.phaseKey));

    const orderedExpandedPhases = getOrderedExpandedPhases(input.planning);

    for (let index = 0; index < orderedExpandedPhases.length; index += 1) {
      const currentPhase = orderedExpandedPhases[index]!;
      const partialPlan = buildPartialPlan(input.planning, orderedExpandedPhases.slice(0, index + 1));
      const compiled = compileInitialProjectPlan({
        projectId: input.projectId,
        baseVersion: currentVersion,
        serverDate: input.serverDate,
        plan: partialPlan,
      });

      const phaseTasks = extractCurrentPhaseTasks(input.projectId, currentPhase.phaseKey, compiled.command.tasks);
      if (phaseTasks.length === 0) {
        return {
          ok: true,
          outcome: 'partial',
          message: `Stopped after skeleton commit: phase ${currentPhase.phaseKey} did not produce executable child tasks.`,
          committedPhaseKeys,
          committedTaskNodeKeys,
        };
      }

      const createCommit = await commitCommand(input, currentVersion, {
        type: 'create_tasks_batch',
        tasks: phaseTasks,
      });
      currentVersion = createCommit.newVersion;
      committedTaskNodeKeys.push(...currentPhase.expansion.tasks.map((task) => task.nodeKey));
    }

    return {
      ok: true,
      outcome: 'complete',
      message: 'Built the starter schedule incrementally.',
      committedPhaseKeys,
      committedTaskNodeKeys,
    };
  } catch (error) {
    return {
      ok: false,
      reason: 'commit_rejected',
      message: 'The starter schedule could not be committed incrementally.',
      committedPhaseKeys,
      committedTaskNodeKeys,
      commitResponse: error && typeof error === 'object' && 'accepted' in error ? error as Exclude<CommitProjectCommandResponse, { accepted: true }> : undefined,
    };
  }
}

export async function commitSkeletonStructure(
  input: ExecuteIncrementalInitialGenerationInput,
): Promise<IncrementalCommitContext | Exclude<ExecuteIncrementalInitialGenerationResult, { ok: true }>> {
  try {
    const skeletonTasks = buildSkeletonTasks(input);
    const skeletonCommit = await commitCommand(input, input.baseVersion, {
      type: 'create_tasks_batch',
      tasks: skeletonTasks,
    });
    return {
      currentVersion: skeletonCommit.newVersion,
      committedPhaseKeys: input.planning.skeleton.phases.map((phase) => phase.phaseKey),
      committedTaskNodeKeys: [],
    };
  } catch (error) {
    return {
      ok: false,
      reason: 'commit_rejected',
      message: 'The starter schedule structure could not be committed.',
      committedPhaseKeys: [],
      committedTaskNodeKeys: [],
      commitResponse: error && typeof error === 'object' && 'accepted' in error ? error as Exclude<CommitProjectCommandResponse, { accepted: true }> : undefined,
    };
  }
}

export async function commitExpandedPhase(
  input: ExecuteIncrementalInitialGenerationInput,
  context: IncrementalCommitContext,
  expandedPhases: ExpandedPhasePlanningResult[],
  currentPhase: ExpandedPhasePlanningResult,
): Promise<IncrementalCommitContext | Exclude<ExecuteIncrementalInitialGenerationResult, { ok: true }>> {
  try {
    const partialPlan = buildPartialPlan(input.planning, expandedPhases);
    const compiled = compileInitialProjectPlan({
      projectId: input.projectId,
      baseVersion: context.currentVersion,
      serverDate: input.serverDate,
      plan: partialPlan,
    });
    const phaseTasks = extractCurrentPhaseTasks(input.projectId, currentPhase.phaseKey, compiled.command.tasks);
    if (phaseTasks.length === 0) {
      return {
        ok: false,
        reason: 'commit_rejected',
        message: `Phase ${currentPhase.phaseKey} produced no executable child tasks.`,
        committedPhaseKeys: context.committedPhaseKeys,
        committedTaskNodeKeys: context.committedTaskNodeKeys,
      };
    }

    const createCommit = await commitCommand(input, context.currentVersion, {
      type: 'create_tasks_batch',
      tasks: phaseTasks,
    });

    return {
      currentVersion: createCommit.newVersion,
      committedPhaseKeys: context.committedPhaseKeys,
      committedTaskNodeKeys: [
        ...context.committedTaskNodeKeys,
        ...currentPhase.expansion.tasks.map((task) => task.nodeKey),
      ],
    };
  } catch (error) {
    return {
      ok: false,
      reason: 'commit_rejected',
      message: `The starter schedule phase ${currentPhase.phaseKey} could not be committed.`,
      committedPhaseKeys: context.committedPhaseKeys,
      committedTaskNodeKeys: context.committedTaskNodeKeys,
      commitResponse: error && typeof error === 'object' && 'accepted' in error ? error as Exclude<CommitProjectCommandResponse, { accepted: true }> : undefined,
    };
  }
}
