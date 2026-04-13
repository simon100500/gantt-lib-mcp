import type {
  MutationIntent,
  MutationResolutionEntity,
  PlacementPolicy,
  ResolvedMutationContext,
} from './types.js';

type TaskSearchMatch = {
  taskId: string;
  name: string;
  parentId: string | null;
  path: string[];
  startDate: string;
  endDate: string;
  matchType: 'exact' | 'includes' | 'token';
  score: number;
};

type GroupScopeMatch = {
  key: string;
  label: string;
  rootTaskId: string;
  memberTaskIds: string[];
  memberNames: string[];
};

type MutationResolverTaskService = {
  list(projectId: string): Promise<{ tasks: Array<{ id: string; name: string; parentId?: string; startDate?: string; endDate?: string }> }>;
  findTasksByName(projectId: string, query: string, limit?: number): Promise<TaskSearchMatch[]>;
  findContainerCandidates(projectId: string, query: string, limit?: number): Promise<TaskSearchMatch[]>;
  listBranchTasks(projectId: string, rootTaskId: string): Promise<TaskSearchMatch[]>;
  findGroupScopes(projectId: string, hint: string): Promise<GroupScopeMatch[]>;
};

export type ResolveMutationContextInput = {
  projectId: string;
  projectVersion: number | null;
  intent: MutationIntent;
  userMessage: string;
  taskService: MutationResolverTaskService;
};

function parseComparableDate(value?: string): number {
  if (!value) {
    return 0;
  }

  const parsed = Date.parse(`${value}T00:00:00Z`);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function pickLatestProjectSection(
  tasks: Array<{ id: string; name: string; parentId?: string; startDate?: string; endDate?: string }>,
): TaskSearchMatch | null {
  const topLevelTasks = tasks.filter((task) => !task.parentId);
  if (topLevelTasks.length === 0) {
    return null;
  }

  const latest = [...topLevelTasks].sort((left, right) => {
    const endDiff = parseComparableDate(right.endDate) - parseComparableDate(left.endDate);
    if (endDiff !== 0) {
      return endDiff;
    }
    const startDiff = parseComparableDate(right.startDate) - parseComparableDate(left.startDate);
    if (startDiff !== 0) {
      return startDiff;
    }
    return left.name.localeCompare(right.name);
  })[0];

  if (!latest) {
    return null;
  }

  return {
    taskId: latest.id,
    name: latest.name,
    parentId: latest.parentId ?? null,
    path: [latest.name],
    startDate: latest.startDate ?? '',
    endDate: latest.endDate ?? '',
    matchType: 'token',
    score: 0.72,
  };
}

function toResolutionEntity(match: TaskSearchMatch): MutationResolutionEntity {
  return {
    id: match.taskId,
    name: match.name,
    score: match.score,
  };
}

function pickBestTaskMatch(matches: TaskSearchMatch[]): TaskSearchMatch | null {
  const exact = matches.find((match) => match.matchType === 'exact');
  return exact ?? matches[0] ?? null;
}

function buildBaseContext(input: ResolveMutationContextInput): ResolvedMutationContext {
  return {
    projectId: input.projectId,
    projectVersion: input.projectVersion,
    resolutionQuery: input.intent.normalizedRequest,
    containers: [],
    tasks: [],
    predecessors: [],
    successors: [],
    selectedContainerId: null,
    selectedPredecessorTaskId: null,
    selectedSuccessorTaskId: null,
    placementPolicy: 'unresolved',
    confidence: 0,
  };
}

function resolvePlacementPolicy(context: ResolvedMutationContext): PlacementPolicy {
  if (context.selectedPredecessorTaskId) {
    return 'after_predecessor';
  }
  if (context.selectedSuccessorTaskId) {
    return 'before_successor';
  }
  if (context.selectedContainerId) {
    return 'tail_of_container';
  }
  return 'unresolved';
}

function extractPrimaryEntity(intent: MutationIntent, userMessage: string): string {
  return intent.entitiesMentioned[0] ?? userMessage.trim();
}

function looksLikeGroupFanout(intent: MutationIntent, userMessage: string): boolean {
  if (intent.intentType !== 'add_repeated_fragment') {
    return false;
  }

  return /кажд|по всем|every|all/u.test(userMessage.toLowerCase());
}

export async function resolveMutationContext(
  input: ResolveMutationContextInput,
): Promise<ResolvedMutationContext> {
  const context = buildBaseContext(input);
  const anchorQuery = extractPrimaryEntity(input.intent, input.userMessage);

  if (
    input.intent.intentType === 'shift_relative'
    || input.intent.intentType === 'move_to_date'
    || input.intent.intentType === 'rename_task'
    || input.intent.intentType === 'update_metadata'
    || input.intent.intentType === 'delete_task'
    || input.intent.intentType === 'link_tasks'
    || input.intent.intentType === 'unlink_tasks'
    || input.intent.intentType === 'move_in_hierarchy'
  ) {
    const taskMatches = await input.taskService.findTasksByName(input.projectId, anchorQuery, 8);
    const bestTask = pickBestTaskMatch(taskMatches);

    context.tasks = taskMatches.map(toResolutionEntity);
    context.predecessors = bestTask ? [toResolutionEntity(bestTask)] : [];
    context.selectedPredecessorTaskId = bestTask?.taskId ?? null;
    context.placementPolicy = 'no_placement_required';
    context.confidence = bestTask?.score ?? 0;
    return context;
  }

  if (input.intent.intentType === 'expand_wbs') {
    const taskMatches = await input.taskService.findTasksByName(input.projectId, anchorQuery, 8);
    const bestTask = pickBestTaskMatch(taskMatches);
    const branchMatches = bestTask
      ? await input.taskService.listBranchTasks(input.projectId, bestTask.taskId)
      : [];

    context.tasks = branchMatches.length > 0
      ? branchMatches.map(toResolutionEntity)
      : taskMatches.map(toResolutionEntity);
    context.predecessors = bestTask ? [toResolutionEntity(bestTask)] : [];
    context.selectedPredecessorTaskId = bestTask?.taskId ?? null;
    context.placementPolicy = 'no_placement_required';
    context.confidence = bestTask?.score ?? 0;
    return context;
  }

  if (looksLikeGroupFanout(input.intent, input.userMessage)) {
    const groupScopes = await input.taskService.findGroupScopes(input.projectId, input.userMessage);
    const primaryGroup = groupScopes[0];

    if (primaryGroup) {
      context.containers = [{
        id: primaryGroup.rootTaskId,
        name: primaryGroup.label,
        score: 0.9,
      }];
      context.selectedContainerId = primaryGroup.rootTaskId;
      context.placementPolicy = 'group_tail';
      context.confidence = 0.9;
    } else {
      context.placementPolicy = 'unresolved';
      context.confidence = 0;
    }

    return context;
  }

  if (input.intent.intentType === 'add_single_task' || input.intent.intentType === 'restructure_branch') {
    let containerMatches = await input.taskService.findContainerCandidates(input.projectId, anchorQuery, 8);

    if (containerMatches.length === 0) {
      const tasks = await input.taskService.list(input.projectId);
      const fallbackSection = pickLatestProjectSection(tasks.tasks);
      if (fallbackSection) {
        containerMatches = [fallbackSection];
      }
    }

    const bestContainer = pickBestTaskMatch(containerMatches);

    context.containers = containerMatches.map(toResolutionEntity);
    context.selectedContainerId = bestContainer?.taskId ?? null;
    context.placementPolicy = bestContainer ? resolvePlacementPolicy(context) : 'unresolved';
    context.confidence = bestContainer?.score ?? 0;
    return context;
  }

  context.placementPolicy = 'no_placement_required';
  return context;
}
