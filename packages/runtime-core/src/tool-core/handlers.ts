import { parseDateOnly, shiftBusinessDayOffset, validateDependencies } from 'gantt-lib/core/scheduling';
import { getToolDefinition } from './catalog.js';
import type {
  FindTasksResult,
  MutationAggregation,
  NormalizedToolInputMap,
  NormalizedToolName,
  NormalizedToolResultMap,
  ToolCallContext,
  ToolCallResult,
} from './types.js';
import type {
  NormalizedMutationReason,
  NormalizedMutationResult,
  ProjectCommand,
  Task,
  ValidateScheduleResult,
} from '../types.js';

type ToolHandlerMap = {
  [TName in NormalizedToolName]: (input: NormalizedToolInputMap[TName]) => Promise<NormalizedToolResultMap[TName]>;
};

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const VALID_DEPENDENCY_TYPES = new Set(['FS', 'SS', 'FF', 'SF']);

function formatDateOnly(date: Date): string {
  return date.toISOString().split('T')[0];
}

function normalizeReason(reason: string | undefined): NormalizedMutationReason {
  switch (reason) {
    case 'version_conflict':
    case 'validation_error':
    case 'conflict':
    case 'not_found':
    case 'invalid_request':
    case 'unsupported_operation':
    case 'limit_reached':
      return reason;
    default:
      return 'validation_error';
  }
}

function emptyMutation(baseVersion: number, reason: NormalizedMutationReason): NormalizedMutationResult {
  return {
    status: 'rejected',
    reason,
    baseVersion,
    changedTaskIds: [],
    changedTasks: [],
    changedDependencyIds: [],
    conflicts: [],
  };
}

function mutationFromCommit(
  baseVersion: number,
  response: Awaited<ReturnType<ToolCallContext['commitCommand']>>['response'],
  includeSnapshot: boolean,
  partial?: Pick<NormalizedMutationResult, 'changedTaskIds' | 'changedTasks' | 'changedDependencyIds' | 'conflicts'>,
): NormalizedMutationResult {
  if (!response.accepted) {
    return {
      status: 'rejected',
      reason: normalizeReason(response.reason),
      baseVersion,
      changedTaskIds: partial?.changedTaskIds ?? [],
      changedTasks: partial?.changedTasks ?? [],
      changedDependencyIds: partial?.changedDependencyIds ?? [],
      conflicts: partial?.conflicts ?? [],
      ...(includeSnapshot && response.snapshot ? { snapshot: response.snapshot } : {}),
    };
  }

  const changedTaskIds = response.result.changedTaskIds;
  const changedTasks = changedTaskIds
    .map((taskId) => response.snapshot.tasks.find((task) => task.id === taskId))
    .filter((task): task is Task => Boolean(task));

  return {
    status: 'accepted',
    baseVersion,
    newVersion: response.newVersion,
    changedTaskIds,
    changedTasks,
    changedDependencyIds: response.result.changedDependencyIds,
    conflicts: response.result.conflicts,
    ...(includeSnapshot ? { snapshot: response.snapshot } : {}),
  };
}

function mergeConflicts(
  existing: MutationAggregation['conflicts'],
  incoming: MutationAggregation['conflicts'],
): MutationAggregation['conflicts'] {
  const byKey = new Map<string, MutationAggregation['conflicts'][number]>();
  for (const conflict of [...existing, ...incoming]) {
    byKey.set(`${conflict.entityType}:${conflict.entityId}:${conflict.reason}:${conflict.detail ?? ''}`, conflict);
  }
  return [...byKey.values()];
}

function toPartialAggregate(aggregation: MutationAggregation): Pick<NormalizedMutationResult, 'changedTaskIds' | 'changedTasks' | 'changedDependencyIds' | 'conflicts'> {
  const changedTaskIds = [...aggregation.changedTaskIds].sort();
  const changedTasks = changedTaskIds
    .map((taskId) => aggregation.snapshot?.tasks.find((task) => task.id === taskId))
    .filter((task): task is Task => Boolean(task));

  return {
    changedTaskIds,
    changedTasks,
    changedDependencyIds: [...aggregation.changedDependencyIds].sort(),
    conflicts: aggregation.conflicts,
  };
}

function createAggregation(): MutationAggregation {
  return {
    baseVersion: 0,
    changedTaskIds: [],
    changedTasks: [],
    changedDependencyIds: [],
    conflicts: [],
  };
}

function addCommitToAggregation(
  aggregation: MutationAggregation,
  baseVersion: number,
  response: Awaited<ReturnType<ToolCallContext['commitCommand']>>['response'],
): void {
  if (aggregation.baseVersion === 0) {
    aggregation.baseVersion = baseVersion;
  }

  if (!response.accepted) {
    if (response.snapshot) {
      aggregation.snapshot = response.snapshot;
    }
    aggregation.reason = normalizeReason(response.reason);
    return;
  }

  aggregation.newVersion = response.newVersion;
  aggregation.snapshot = response.snapshot;
  aggregation.changedTaskIds = [...new Set([...aggregation.changedTaskIds, ...response.result.changedTaskIds])];
  aggregation.changedDependencyIds = [...new Set([...aggregation.changedDependencyIds, ...response.result.changedDependencyIds])];
  aggregation.conflicts = mergeConflicts(aggregation.conflicts, response.result.conflicts);
}

function finalizeAccepted(aggregation: MutationAggregation, includeSnapshot: boolean): NormalizedMutationResult {
  const partial = toPartialAggregate(aggregation);
  return {
    status: 'accepted',
    baseVersion: aggregation.baseVersion,
    newVersion: aggregation.newVersion,
    ...partial,
    ...(includeSnapshot && aggregation.snapshot ? { snapshot: aggregation.snapshot } : {}),
  };
}

function finalizeRejected(
  aggregation: MutationAggregation,
  baseVersion: number,
  reason: NormalizedMutationReason,
  includeSnapshot: boolean,
  snapshotOverride?: NormalizedMutationResult['snapshot'],
): NormalizedMutationResult {
  return {
    status: 'rejected',
    reason,
    baseVersion: aggregation.baseVersion || baseVersion,
    ...toPartialAggregate(aggregation),
    ...(includeSnapshot && (snapshotOverride ?? aggregation.snapshot) ? { snapshot: snapshotOverride ?? aggregation.snapshot } : {}),
  };
}

async function runBatch(
  context: ToolCallContext,
  projectId: string,
  commands: ProjectCommand[],
  includeSnapshot: boolean,
): Promise<NormalizedMutationResult> {
  const aggregation = createAggregation();

  for (const command of commands) {
    const { baseVersion, response } = await context.commitCommand(projectId, command);
    addCommitToAggregation(aggregation, baseVersion, response);
    if (!response.accepted) {
      return finalizeRejected(
        aggregation,
        baseVersion,
        normalizeReason(response.reason),
        includeSnapshot,
        response.snapshot,
      );
    }
  }

  return finalizeAccepted(aggregation, includeSnapshot);
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildParentPath(task: Task, byId: Map<string, Task>): string[] {
  const path: string[] = [];
  let currentParentId = task.parentId;
  while (currentParentId) {
    const parent = byId.get(currentParentId);
    if (!parent) {
      break;
    }
    path.unshift(parent.name);
    currentParentId = parent.parentId;
  }
  return path;
}

function computeMatchScore(task: Task, query: string, tokens: string[]): number {
  const name = normalizeText(task.name);
  if (name === query) {
    return 1000;
  }
  let score = name.includes(query) ? 400 : 0;
  for (const token of tokens) {
    if (token.length === 0) {
      continue;
    }
    if (name.includes(token)) {
      score += 100;
    }
  }
  if (score === 0) {
    return 0;
  }
  return score - Math.max(0, name.length - query.length);
}

function resolveProjectIdOrThrow(context: ToolCallContext, projectId?: string | null, message?: string): string {
  const resolvedProjectId = context.resolveProjectId(projectId);
  if (!resolvedProjectId) {
    throw new Error(message ?? 'Project ID is required');
  }
  return resolvedProjectId;
}

function hasValidDateRange(startDate: string, endDate: string): boolean {
  return DATE_REGEX.test(startDate) && DATE_REGEX.test(endDate) && startDate <= endDate;
}

export function createToolHandlers(context: ToolCallContext): ToolHandlerMap {
  return {
    get_project_summary: async (input) => {
      const projectId = resolveProjectIdOrThrow(context, input.projectId, 'Project summary requires a project ID');
      return context.getProjectSummary(projectId);
    },
    get_schedule_slice: async (input) => {
      const projectId = resolveProjectIdOrThrow(context, input.projectId, 'Schedule slice requires a project ID');
      const summary = await context.getProjectSummary(projectId);
      const allTasks = await context.listAllProjectTasks(projectId);

      if (input.taskIds && input.taskIds.length > 0) {
        const requestedIds = new Set(input.taskIds);
        return {
          version: summary.version,
          scope: {
            mode: 'task_ids',
            taskIds: input.taskIds,
            returnedTaskCount: allTasks.filter((task) => requestedIds.has(task.id)).length,
          },
          tasks: allTasks.filter((task) => requestedIds.has(task.id)),
        };
      }

      if (input.branchRootId) {
        const descendants = new Set<string>([input.branchRootId]);
        let changed = true;
        while (changed) {
          changed = false;
          for (const task of allTasks) {
            if (task.parentId && descendants.has(task.parentId) && !descendants.has(task.id)) {
              descendants.add(task.id);
              changed = true;
            }
          }
        }

        const tasks = allTasks.filter((task) => descendants.has(task.id));
        return {
          version: summary.version,
          scope: {
            mode: 'branch_root',
            branchRootId: input.branchRootId,
            returnedTaskCount: tasks.length,
          },
          tasks,
        };
      }

      if (input.startDate || input.endDate) {
        const startDate = input.startDate ?? '0000-01-01';
        const endDate = input.endDate ?? '9999-12-31';
        const tasks = allTasks.filter((task) => task.startDate <= endDate && task.endDate >= startDate);
        return {
          version: summary.version,
          scope: {
            mode: 'date_window',
            startDate: input.startDate,
            endDate: input.endDate,
            returnedTaskCount: tasks.length,
          },
          tasks,
        };
      }

      return emptyMutation(summary.version, 'invalid_request');
    },
    find_tasks: async (input) => {
      const projectId = resolveProjectIdOrThrow(context, input.projectId, 'Task search requires a project ID');
      const summary = await context.getProjectSummary(projectId);
      const allTasks = await context.listAllProjectTasks(projectId);
      const normalizedQuery = normalizeText(input.query);
      const tokens = normalizedQuery.split(' ').filter(Boolean);
      const byId = new Map(allTasks.map((task) => [task.id, task]));

      const matches = allTasks
        .map((task) => ({
          taskId: task.id,
          name: task.name,
          score: computeMatchScore(task, normalizedQuery, tokens),
          parentPath: buildParentPath(task, byId),
          startDate: task.startDate,
          endDate: task.endDate,
        }))
        .filter((match) => match.score > 0)
        .sort((left, right) => (
          right.score - left.score
          || left.name.localeCompare(right.name)
          || left.taskId.localeCompare(right.taskId)
        ))
        .slice(0, Math.min(Math.max(input.limit ?? 10, 1), 50));

      return {
        version: summary.version,
        query: input.query,
        matches,
      } satisfies FindTasksResult;
    },
    get_task_context: async (input) => {
      const projectId = resolveProjectIdOrThrow(context, input.projectId, 'Task context requires a project ID');
      const summary = await context.getProjectSummary(projectId);
      const allTasks = await context.listAllProjectTasks(projectId);
      const task = allTasks.find((candidate) => candidate.id === input.taskId);

      if (!task) {
        return emptyMutation(summary.version, 'not_found');
      }

      const byId = new Map(allTasks.map((candidate) => [candidate.id, candidate]));
      const parents: Task[] = [];
      let currentParentId = task.parentId;
      while (currentParentId) {
        const parent = byId.get(currentParentId);
        if (!parent) {
          break;
        }
        parents.unshift(parent);
        currentParentId = parent.parentId;
      }

      return {
        version: summary.version,
        task,
        parents,
        children: allTasks.filter((candidate) => candidate.parentId === task.id),
        siblings: allTasks.filter((candidate) => candidate.parentId === task.parentId && candidate.id !== task.id),
        predecessors: (task.dependencies ?? []).map((dependency) => ({
          ...dependency,
          lag: dependency.lag ?? 0,
          task: byId.get(dependency.taskId),
        })),
        successors: allTasks
          .flatMap((candidate) => (candidate.dependencies ?? []).map((dependency) => ({
            taskId: candidate.id,
            type: dependency.type,
            lag: dependency.lag ?? 0,
            predecessorTaskId: dependency.taskId,
          })))
          .filter((dependency) => dependency.predecessorTaskId === task.id)
          .map((dependency) => ({
            taskId: dependency.taskId,
            type: dependency.type,
            lag: dependency.lag,
            task: byId.get(dependency.taskId),
          })),
      };
    },
    create_tasks: async (input) => {
      const projectId = resolveProjectIdOrThrow(context, input.projectId, 'Task creation requires a project ID');
      if (!input.tasks || input.tasks.length === 0) {
        return emptyMutation(0, 'invalid_request');
      }
      for (const task of input.tasks) {
        if (!hasValidDateRange(task.startDate, task.endDate)) {
          return emptyMutation(0, 'invalid_request');
        }
      }
      const { baseVersion, response } = await context.commitCommand(
        projectId,
        input.tasks.length === 1 ? { type: 'create_task', task: input.tasks[0] } : { type: 'create_tasks_batch', tasks: input.tasks },
      );
      return mutationFromCommit(baseVersion, response, input.includeSnapshot ?? false);
    },
    update_tasks: async (input) => {
      const projectId = resolveProjectIdOrThrow(context, input.projectId, 'Task updates require a project ID');
      if (!input.updates || input.updates.length === 0) {
        return emptyMutation(0, 'invalid_request');
      }
      const updates: Extract<ProjectCommand, { type: 'update_tasks_fields_batch' }>['updates'] = [];
      for (const update of input.updates) {
        const hasMetadata = update.name !== undefined || update.color !== undefined || update.progress !== undefined;
        if (!update.id || !hasMetadata) {
          return emptyMutation(0, 'invalid_request');
        }
        updates.push({
          taskId: update.id,
          fields: {
            ...(update.name !== undefined ? { name: update.name } : {}),
            ...(update.color !== undefined ? { color: update.color } : {}),
            ...(update.progress !== undefined ? { progress: update.progress } : {}),
          },
        });
      }
      return runBatch(context, projectId, [{ type: 'update_tasks_fields_batch', updates }], input.includeSnapshot ?? false);
    },
    move_tasks: async (input) => {
      const projectId = resolveProjectIdOrThrow(context, input.projectId, 'Task moves require a project ID');
      if (!input.moves || input.moves.length === 0) {
        return emptyMutation(0, 'invalid_request');
      }
      const commands: ProjectCommand[] = [];
      for (const move of input.moves) {
        if (!move.taskId) {
          return emptyMutation(0, 'invalid_request');
        }
        if (move.parentId !== undefined && move.sortOrder !== undefined) {
          return emptyMutation(0, 'unsupported_operation');
        }
        if (move.parentId !== undefined) {
          commands.push({ type: 'reparent_task', taskId: move.taskId, newParentId: move.parentId ?? null });
          continue;
        }
        if (move.sortOrder !== undefined) {
          commands.push({ type: 'reorder_tasks', updates: [{ taskId: move.taskId, sortOrder: move.sortOrder }] });
          continue;
        }
        return emptyMutation(0, 'invalid_request');
      }
      return runBatch(context, projectId, commands, input.includeSnapshot ?? false);
    },
    shift_tasks: async (input) => {
      const projectId = resolveProjectIdOrThrow(context, input.projectId, 'Task shifts require a project ID');
      if (!input.shifts || input.shifts.length === 0) {
        return emptyMutation(0, 'invalid_request');
      }
      const aggregation = createAggregation();
      for (const shift of input.shifts) {
        const task = await context.getTask(projectId, shift.taskId);
        if (!task) {
          const summary = await context.getProjectSummary(projectId);
          return finalizeRejected(aggregation, summary.version, 'not_found', input.includeSnapshot ?? false);
        }
        const options = await context.getProjectScheduleOptions(projectId);
        const startDate = parseDateOnly(task.startDate);
        const mode = shift.mode ?? (options.businessDays ? 'working' : 'calendar');
        const nextStart = mode === 'working' && options.weekendPredicate
          ? shiftBusinessDayOffset(startDate, shift.delta, options.weekendPredicate)
          : new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate() + shift.delta));
        const { baseVersion, response } = await context.commitCommand(projectId, {
          type: 'move_task',
          taskId: shift.taskId,
          startDate: formatDateOnly(nextStart),
        });
        addCommitToAggregation(aggregation, baseVersion, response);
        if (!response.accepted) {
          return finalizeRejected(
            aggregation,
            baseVersion,
            normalizeReason(response.reason),
            input.includeSnapshot ?? false,
            response.snapshot,
          );
        }
      }
      return finalizeAccepted(aggregation, input.includeSnapshot ?? false);
    },
    delete_tasks: async (input) => {
      const projectId = resolveProjectIdOrThrow(context, input.projectId, 'Task deletion requires a project ID');
      if (!input.taskIds || input.taskIds.length === 0) {
        return emptyMutation(0, 'invalid_request');
      }
      const { baseVersion, response } = await context.commitCommand(
        projectId,
        input.taskIds.length === 1 ? { type: 'delete_task', taskId: input.taskIds[0] } : { type: 'delete_tasks', taskIds: input.taskIds },
      );
      return mutationFromCommit(baseVersion, response, input.includeSnapshot ?? false);
    },
    link_tasks: async (input) => {
      const projectId = resolveProjectIdOrThrow(context, input.projectId, 'Task linking requires a project ID');
      if (!input.links || input.links.length === 0) {
        return emptyMutation(0, 'invalid_request');
      }
      const commands: ProjectCommand[] = [];
      for (const link of input.links) {
        if (!link.predecessorTaskId || !link.successorTaskId) {
          return emptyMutation(0, 'invalid_request');
        }
        if (link.type && !VALID_DEPENDENCY_TYPES.has(link.type)) {
          return emptyMutation(0, 'invalid_request');
        }
        commands.push({
          type: 'create_dependency',
          taskId: link.successorTaskId,
          dependency: {
            taskId: link.predecessorTaskId,
            type: (link.type ?? 'FS') as NonNullable<typeof link.type>,
            lag: link.lag ?? 0,
          },
        });
      }
      return runBatch(context, projectId, commands, input.includeSnapshot ?? false);
    },
    unlink_tasks: async (input) => {
      const projectId = resolveProjectIdOrThrow(context, input.projectId, 'Task unlinking requires a project ID');
      if (!input.links || input.links.length === 0) {
        return emptyMutation(0, 'invalid_request');
      }
      const commands: ProjectCommand[] = [];
      for (const link of input.links) {
        if (!link.predecessorTaskId || !link.successorTaskId) {
          return emptyMutation(0, 'invalid_request');
        }
        commands.push({
          type: 'remove_dependency',
          taskId: link.successorTaskId,
          depTaskId: link.predecessorTaskId,
        });
      }
      return runBatch(context, projectId, commands, input.includeSnapshot ?? false);
    },
    recalculate_project: async (input) => {
      const projectId = resolveProjectIdOrThrow(context, input.projectId, 'Project recalculation requires a project ID');
      const { baseVersion, response } = await context.commitCommand(projectId, { type: 'recalculate_schedule' });
      return mutationFromCommit(baseVersion, response, input.includeSnapshot ?? false);
    },
    validate_schedule: async (input) => {
      const projectId = resolveProjectIdOrThrow(context, input.projectId, 'Schedule validation requires a project ID');
      const summary = await context.getProjectSummary(projectId);
      const tasks = await context.listAllProjectTasks(projectId);
      const validation = validateDependencies(tasks.map((task) => ({
        ...task,
        dependencies: (task.dependencies ?? []).map((dependency) => ({
          ...dependency,
          lag: dependency.lag ?? 0,
        })),
      })));

      return {
        version: summary.version,
        isValid: validation.isValid,
        errors: validation.errors,
      } satisfies ValidateScheduleResult;
    },
  };
}

export async function executeToolCall<TName extends NormalizedToolName>(
  name: TName,
  input: NormalizedToolInputMap[TName],
  context: ToolCallContext,
): Promise<ToolCallResult<NormalizedToolResultMap[TName]>> {
  const definition = getToolDefinition(name);
  if (!definition) {
    return {
      ok: false,
      error: {
        code: 'unsupported_tool',
        message: `Unknown tool: ${name}`,
      },
    };
  }

  const handlers = createToolHandlers(context);
  return {
    ok: true,
    data: await handlers[name](input),
  };
}
