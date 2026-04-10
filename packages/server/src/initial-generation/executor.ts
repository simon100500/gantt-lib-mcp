import type { ActorType, CommitProjectCommandRequest, CommitProjectCommandResponse } from '@gantt/mcp/types';
import type { ScheduleCommandOptions } from '@gantt/mcp/types';

import {
  compileInitialProjectPlan,
  InitialPlanCompileError,
  materializeInitialProjectPlan,
  type CompiledInitialSchedule,
  type CompiledInitialStructure,
} from './compiler.js';
import type { ExecutableProjectPlan } from './types.js';

export type ExecuteInitialProjectPlanInput = {
  projectId: string;
  baseVersion: number;
  clientRequestId: string;
  actorId?: string;
  plan: ExecutableProjectPlan;
  commandService: {
    commitCommand(
      request: CommitProjectCommandRequest,
      actorType: ActorType,
      actorId?: string,
    ): Promise<CommitProjectCommandResponse>;
  };
  serverDate: string;
  scheduleOptions?: Pick<ScheduleCommandOptions, 'businessDays' | 'weekendPredicate'>;
  onCompiled?: (compiledSchedule: CompiledInitialSchedule) => Promise<void> | void;
};

export type ExecuteInitialProjectPlanResult =
  | {
      ok: true;
      outcome: 'complete';
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
      compiledTaskCount: number;
      compiledDependencyCount: number;
      crossPhaseDependencyCount: number;
      everyRetainedPhaseHasAChildTask: boolean;
      hasBrokenReferences: boolean;
      commitResponse?: Exclude<CommitProjectCommandResponse, { accepted: true }>;
    };

export async function executeInitialProjectPlan(
  input: ExecuteInitialProjectPlanInput,
): Promise<ExecuteInitialProjectPlanResult> {
  let compiledStructure: CompiledInitialStructure;
  let compiledSchedule: CompiledInitialSchedule;

  try {
    compiledStructure = compileInitialProjectPlan({
      projectId: input.projectId,
      baseVersion: input.baseVersion,
      serverDate: input.serverDate,
      plan: input.plan,
    });
    compiledSchedule = materializeInitialProjectPlan(compiledStructure, input.scheduleOptions);
  } catch (error) {
    if (!(error instanceof InitialPlanCompileError)) {
      throw error;
    }

    const topLevelPhaseCount = input.plan.nodes.filter((node) => node.kind === 'phase' && !node.parentNodeKey).length;
    const taskNodeCount = input.plan.nodes.filter((node) => node.kind === 'task').length;
    const dependencyCount = input.plan.nodes
      .filter((node) => node.kind === 'task')
      .reduce((sum, node) => sum + node.dependsOn.length, 0);

    return {
      ok: false,
      reason: 'controlled_rejection',
      message: 'We could not build a reliable starter schedule from this request.',
      droppedNodeKeys: [],
      droppedDependencyNodeKeys: [],
      retainedNodeCount: input.plan.nodes.length,
      retainedNodeRatio: 1,
      retainedTopLevelPhaseCount: topLevelPhaseCount,
      compiledTaskCount: taskNodeCount,
      compiledDependencyCount: dependencyCount,
      crossPhaseDependencyCount: 0,
      everyRetainedPhaseHasAChildTask: true,
      hasBrokenReferences: error.issues.length > 0,
    };
  }

  await input.onCompiled?.(compiledSchedule);

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
      droppedNodeKeys: [],
      droppedDependencyNodeKeys: [],
      retainedNodeCount: compiledStructure.retainedNodeCount,
      retainedNodeRatio: 1,
      retainedTopLevelPhaseCount: compiledStructure.topLevelPhaseCount,
      compiledTaskCount: compiledStructure.compiledTaskCount,
      compiledDependencyCount: compiledStructure.compiledDependencyCount,
      crossPhaseDependencyCount: compiledStructure.crossPhaseDependencyCount,
      everyRetainedPhaseHasAChildTask: true,
      hasBrokenReferences: false,
      commitResponse,
    };
  }

  return {
    ok: true,
    outcome: 'complete',
    message: 'Built the starter schedule.',
    compiledSchedule,
    commitResponse,
    droppedNodeKeys: [],
    droppedDependencyNodeKeys: [],
  };
}
