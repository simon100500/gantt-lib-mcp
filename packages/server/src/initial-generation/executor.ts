import type { ActorType, CommitProjectCommandRequest, CommitProjectCommandResponse } from '@gantt/mcp/types';

import {
  compileInitialProjectPlan,
  InitialPlanCompileError,
  type CompileIssue,
  type CompiledInitialSchedule,
} from './compiler.js';
import type { ProjectPlan, ProjectPlanDependency, ProjectPlanNode } from './types.js';

const MIN_RETAINED_NODE_RATIO = 0.6; // 60%
const MIN_RETAINED_TOP_LEVEL_PHASES = 3; // 3 top-level phases

export type ExecuteInitialProjectPlanInput = {
  projectId: string;
  baseVersion: number;
  clientRequestId: string;
  actorId?: string;
  plan: ProjectPlan;
  commandService: {
    commitCommand(
      request: CommitProjectCommandRequest,
      actorType: ActorType,
      actorId?: string,
    ): Promise<CommitProjectCommandResponse>;
  };
  serverDate: string;
};

export type ExecuteInitialProjectPlanResult =
  | {
      ok: true;
      outcome: 'complete' | 'partial';
      message: string;
      compiledSchedule: CompiledInitialSchedule;
      commitResponse: Extract<CommitProjectCommandResponse, { accepted: true }>;
      droppedNodeKeys: string[];
      droppedDependencyNodeKeys: string[];
    }
  | {
      ok: false;
      reason: 'controlled_rejection' | 'commit_rejected';
      message: string;
      droppedNodeKeys: string[];
      droppedDependencyNodeKeys: string[];
      retainedNodeCount: number;
      retainedNodeRatio: number;
      retainedTopLevelPhaseCount: number;
      everyRetainedPhaseHasAChildTask: boolean;
      hasBrokenReferences: boolean;
      commitResponse?: Exclude<CommitProjectCommandResponse, { accepted: true }>;
    };

type SanitizedPlanState = {
  plan: ProjectPlan;
  droppedNodeKeys: Set<string>;
  droppedDependencyNodeKeys: Set<string>;
};

export async function executeInitialProjectPlan(
  input: ExecuteInitialProjectPlanInput,
): Promise<ExecuteInitialProjectPlanResult> {
  try {
    const compiledSchedule = compileInitialProjectPlan({
      projectId: input.projectId,
      baseVersion: input.baseVersion,
      serverDate: input.serverDate,
      plan: input.plan,
    });

    return commitCompiledPlan(input, compiledSchedule, {
      outcome: 'complete',
      message: 'Built the starter schedule.',
      droppedNodeKeys: [],
      droppedDependencyNodeKeys: [],
    });
  } catch (error) {
    if (!(error instanceof InitialPlanCompileError)) {
      throw error;
    }

    const salvaged = attemptPartialPlanCleanup(input, error);
    if (!salvaged) {
      return buildControlledRejection(input.plan, {
        droppedNodeKeys: [],
        droppedDependencyNodeKeys: [],
      });
    }

    if (!salvaged.thresholds.met) {
      return {
        ok: false,
        reason: 'controlled_rejection',
        message: 'We could not build a reliable starter schedule from this request.',
        droppedNodeKeys: Array.from(salvaged.state.droppedNodeKeys).sort(),
        droppedDependencyNodeKeys: Array.from(salvaged.state.droppedDependencyNodeKeys).sort(),
        retainedNodeCount: salvaged.compiled.retainedNodeCount,
        retainedNodeRatio: salvaged.thresholds.retainedNodeRatio,
        retainedTopLevelPhaseCount: salvaged.thresholds.retainedTopLevelPhaseCount,
        everyRetainedPhaseHasAChildTask: salvaged.thresholds.everyRetainedPhaseHasAChildTask,
        hasBrokenReferences: salvaged.thresholds.hasBrokenReferences,
      };
    }

    return commitCompiledPlan(input, salvaged.compiled, {
      outcome: 'partial',
      message: 'Built a partial starter schedule and skipped a few invalid plan references.',
      droppedNodeKeys: Array.from(salvaged.state.droppedNodeKeys).sort(),
      droppedDependencyNodeKeys: Array.from(salvaged.state.droppedDependencyNodeKeys).sort(),
    });
  }
}

async function commitCompiledPlan(
  input: ExecuteInitialProjectPlanInput,
  compiledSchedule: CompiledInitialSchedule,
  outcome: {
    outcome: 'complete' | 'partial';
    message: string;
    droppedNodeKeys: string[];
    droppedDependencyNodeKeys: string[];
  },
): Promise<ExecuteInitialProjectPlanResult> {
  const commitResponse = await input.commandService.commitCommand({
    projectId: input.projectId,
    clientRequestId: input.clientRequestId,
    baseVersion: input.baseVersion,
    command: compiledSchedule.command,
  }, 'agent', input.actorId);

  if (!commitResponse.accepted) {
    return {
      ok: false,
      reason: 'commit_rejected',
      message: 'The starter schedule could not be committed.',
      droppedNodeKeys: outcome.droppedNodeKeys,
      droppedDependencyNodeKeys: outcome.droppedDependencyNodeKeys,
      retainedNodeCount: compiledSchedule.retainedNodeCount,
      retainedNodeRatio: 1,
      retainedTopLevelPhaseCount: countTopLevelPhases(compiledSchedule.command.tasks),
      everyRetainedPhaseHasAChildTask: true,
      hasBrokenReferences: false,
      commitResponse,
    };
  }

  return {
    ok: true,
    outcome: outcome.outcome,
    message: outcome.message,
    compiledSchedule,
    commitResponse,
    droppedNodeKeys: outcome.droppedNodeKeys,
    droppedDependencyNodeKeys: outcome.droppedDependencyNodeKeys,
  };
}

function attemptPartialPlanCleanup(
  input: ExecuteInitialProjectPlanInput,
  initialError: InitialPlanCompileError,
): {
  compiled: CompiledInitialSchedule;
  state: SanitizedPlanState;
  thresholds: ReturnType<typeof evaluateCleanupThresholds>;
} | null {
  const state: SanitizedPlanState = {
    plan: clonePlan(input.plan),
    droppedNodeKeys: new Set<string>(),
    droppedDependencyNodeKeys: new Set<string>(),
  };

  let currentError: InitialPlanCompileError = initialError;

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const changed = applyCompileIssues(state, currentError.issues);
    if (!changed) {
      return null;
    }

    cleanupEmptyPhases(state);

    try {
      const compiled = compileInitialProjectPlan({
        projectId: input.projectId,
        baseVersion: input.baseVersion,
        serverDate: input.serverDate,
        plan: state.plan,
      });
      const thresholds = evaluateCleanupThresholds(input.plan, state.plan, compiled.retainedNodeCount);
      return { compiled, state, thresholds };
    } catch (error) {
      if (!(error instanceof InitialPlanCompileError)) {
        throw error;
      }
      currentError = error;
    }
  }

  return null;
}

function applyCompileIssues(state: SanitizedPlanState, issues: CompileIssue[]): boolean {
  let changed = false;

  for (const issue of issues) {
    switch (issue.code) {
      case 'missing_parent':
      case 'top_level_task':
      case 'phase_has_dependencies':
      case 'empty_phase':
        if (issue.nodeKey && dropNode(state, issue.nodeKey)) {
          changed = true;
        }
        break;
      case 'invalid_dependency_reference':
      case 'dependency_target_not_task':
        if (issue.nodeKey && issue.dependencyNodeKey && dropDependency(state, issue.nodeKey, issue.dependencyNodeKey)) {
          changed = true;
        }
        break;
      case 'cycle_detected': {
        const cyclePath = issue.relatedNodeKeys ?? [];
        const ownerNodeKey = cyclePath[cyclePath.length - 2];
        const dependencyNodeKey = cyclePath[cyclePath.length - 1];
        if (ownerNodeKey && dependencyNodeKey && dropDependency(state, ownerNodeKey, dependencyNodeKey)) {
          changed = true;
        }
        break;
      }
      case 'duplicate_node_key':
      case 'invalid_plan':
        break;
    }
  }

  return changed;
}

function dropNode(state: SanitizedPlanState, nodeKey: string): boolean {
  const nodeExists = state.plan.nodes.some((node) => node.nodeKey === nodeKey);
  if (!nodeExists) {
    return false;
  }

  const removedNodeKeys = new Set<string>();
  const queue = [nodeKey];

  while (queue.length > 0) {
    const currentNodeKey = queue.pop()!;
    if (removedNodeKeys.has(currentNodeKey)) {
      continue;
    }
    removedNodeKeys.add(currentNodeKey);
    for (const child of state.plan.nodes.filter((node) => node.parentNodeKey === currentNodeKey)) {
      queue.push(child.nodeKey);
    }
  }

  for (const removedNodeKey of removedNodeKeys) {
    state.droppedNodeKeys.add(removedNodeKey);
  }

  state.plan = {
    ...state.plan,
    nodes: state.plan.nodes
      .filter((node) => !removedNodeKeys.has(node.nodeKey))
      .map((node) => ({
        ...node,
        dependsOn: (node.dependsOn ?? []).filter((dependency) => {
          if (!removedNodeKeys.has(dependency.nodeKey)) {
            return true;
          }
          state.droppedDependencyNodeKeys.add(dependency.nodeKey);
          return false;
        }),
      })),
  };

  return true;
}

function dropDependency(state: SanitizedPlanState, nodeKey: string, dependencyNodeKey: string): boolean {
  let changed = false;
  state.plan = {
    ...state.plan,
    nodes: state.plan.nodes.map((node) => {
      if (node.nodeKey !== nodeKey) {
        return node;
      }

      const filtered = (node.dependsOn ?? []).filter((dependency) => {
        const shouldDrop = dependency.nodeKey === dependencyNodeKey;
        if (shouldDrop) {
          changed = true;
          state.droppedDependencyNodeKeys.add(dependencyNodeKey);
        }
        return !shouldDrop;
      });

      return changed ? { ...node, dependsOn: filtered } : node;
    }),
  };

  return changed;
}

function cleanupEmptyPhases(state: SanitizedPlanState): void {
  let removed = true;
  while (removed) {
    removed = false;
    const phaseKeysToDrop = state.plan.nodes
      .filter((node) => node.kind === 'phase')
      .filter((phase) => !state.plan.nodes.some((node) => node.parentNodeKey === phase.nodeKey))
      .map((phase) => phase.nodeKey);

    if (phaseKeysToDrop.length === 0) {
      continue;
    }

    for (const phaseKey of phaseKeysToDrop) {
      dropNode(state, phaseKey);
      removed = true;
    }
  }
}

function evaluateCleanupThresholds(
  originalPlan: ProjectPlan,
  cleanedPlan: ProjectPlan,
  retainedNodeCount: number,
): {
  met: boolean;
  retainedNodeRatio: number;
  retainedTopLevelPhaseCount: number;
  everyRetainedPhaseHasAChildTask: boolean;
  hasBrokenReferences: boolean;
} {
  const retainedNodeRatio = originalPlan.nodes.length === 0 ? 0 : retainedNodeCount / originalPlan.nodes.length;
  const retainedTopLevelPhaseCount = cleanedPlan.nodes.filter((node) => node.kind === 'phase' && !node.parentNodeKey).length;
  const everyRetainedPhaseHasAChildTask = cleanedPlan.nodes
    .filter((node) => node.kind === 'phase')
    .every((phase) => phaseHasDescendantTask(cleanedPlan.nodes, phase.nodeKey));
  const hasBrokenReferences = cleanedPlan.nodes.some((node) => {
    if (node.parentNodeKey && !cleanedPlan.nodes.some((candidate) => candidate.nodeKey === node.parentNodeKey)) {
      return true;
    }

    return (node.dependsOn ?? []).some((dependency) => !cleanedPlan.nodes.some((candidate) => candidate.nodeKey === dependency.nodeKey));
  });

  const met = retainedNodeRatio >= MIN_RETAINED_NODE_RATIO
    && retainedTopLevelPhaseCount >= MIN_RETAINED_TOP_LEVEL_PHASES
    && everyRetainedPhaseHasAChildTask // every retained phase has a child task
    && !hasBrokenReferences; // zero broken references after cleanup

  return {
    met,
    retainedNodeRatio,
    retainedTopLevelPhaseCount,
    everyRetainedPhaseHasAChildTask,
    hasBrokenReferences,
  };
}

function phaseHasDescendantTask(nodes: ProjectPlanNode[], phaseNodeKey: string): boolean {
  const children = nodes.filter((node) => node.parentNodeKey === phaseNodeKey);
  for (const child of children) {
    if (child.kind === 'task') {
      return true;
    }
    if (phaseHasDescendantTask(nodes, child.nodeKey)) {
      return true;
    }
  }
  return false;
}

function buildControlledRejection(
  originalPlan: ProjectPlan,
  dropped: { droppedNodeKeys: string[]; droppedDependencyNodeKeys: string[] },
): ExecuteInitialProjectPlanResult {
  return {
    ok: false,
    reason: 'controlled_rejection',
    message: 'We could not build a reliable starter schedule from this request.',
    droppedNodeKeys: dropped.droppedNodeKeys,
    droppedDependencyNodeKeys: dropped.droppedDependencyNodeKeys,
    retainedNodeCount: 0,
    retainedNodeRatio: originalPlan.nodes.length === 0 ? 0 : 0,
    retainedTopLevelPhaseCount: 0,
    everyRetainedPhaseHasAChildTask: false,
    hasBrokenReferences: true,
  };
}

function clonePlan(plan: ProjectPlan): ProjectPlan {
  return {
    projectType: plan.projectType,
    assumptions: [...(plan.assumptions ?? [])],
    nodes: plan.nodes.map((node) => ({
      ...node,
      dependsOn: (node.dependsOn ?? []).map((dependency): ProjectPlanDependency => ({
        ...dependency,
      })),
    })),
  };
}

function countTopLevelPhases(tasks: Array<{ parentId?: string }>): number {
  return tasks.filter((task) => !task.parentId).length;
}
