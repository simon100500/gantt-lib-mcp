import { randomUUID } from 'node:crypto';

import type { CommitProjectCommandResponse, ProjectCommand } from '@gantt/mcp/types';
import type {
  MutationExecutionResult,
  MutationPlan,
  MutationPlanOperation,
  MutationTaskSnapshot,
} from './types.js';

type ExecuteMutationPlanInput = {
  projectId: string;
  projectVersion: number;
  tasksBefore: MutationTaskSnapshot[];
  plan: MutationPlan;
  commandService: {
    commitCommand(
      request: { projectId: string; clientRequestId: string; baseVersion: number; command: ProjectCommand },
      actorType: 'agent',
      actorId?: string,
    ): Promise<CommitProjectCommandResponse>;
  };
};

function parseDate(value?: string): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(value: string, delta: number): string {
  const date = parseDate(value) ?? new Date('2026-01-01T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + delta);
  return formatDate(date);
}

function toEndDate(startDate: string, durationDays: number): string {
  return addDays(startDate, Math.max(durationDays - 1, 0));
}

function findTask(tasks: MutationTaskSnapshot[], taskId: string): MutationTaskSnapshot | undefined {
  return tasks.find((task) => task.id === taskId);
}

function compareChangedSet(actual: string[], expected: string[]): boolean {
  const actualSorted = [...new Set(actual)].sort();
  const expectedSorted = [...new Set(expected)].sort();
  return actualSorted.length === expectedSorted.length
    && actualSorted.every((taskId, index) => taskId === expectedSorted[index]);
}

function compileOperation(
  operation: MutationPlanOperation,
  tasksBefore: MutationTaskSnapshot[],
): ProjectCommand[] {
  switch (operation.kind) {
    case 'append_task_after': {
      const predecessor = findTask(tasksBefore, operation.predecessorTaskId);
      const startDate = addDays(predecessor?.endDate ?? predecessor?.startDate ?? '2026-01-01', 1);
      return [
        {
          type: 'create_task',
          task: {
            id: operation.taskId,
            name: operation.title,
            startDate,
            endDate: toEndDate(startDate, operation.durationDays),
            parentId: operation.parentId ?? undefined,
          },
        },
        {
          type: 'create_dependency',
          taskId: operation.taskId,
          dependency: {
            taskId: operation.predecessorTaskId,
            type: 'FS',
          },
        },
      ];
    }

    case 'append_task_before': {
      const successor = findTask(tasksBefore, operation.successorTaskId);
      const endDate = addDays(successor?.startDate ?? '2026-01-02', -1);
      const startDate = addDays(endDate, -(Math.max(operation.durationDays, 1) - 1));
      return [
        {
          type: 'create_task',
          task: {
            id: operation.taskId,
            name: operation.title,
            startDate,
            endDate,
            parentId: operation.parentId ?? undefined,
          },
        },
        {
          type: 'create_dependency',
          taskId: operation.successorTaskId,
          dependency: {
            taskId: operation.taskId,
            type: 'FS',
          },
        },
      ];
    }

    case 'append_task_to_container': {
      const container = findTask(tasksBefore, operation.containerId);
      const startDate = addDays(container?.endDate ?? container?.startDate ?? '2026-01-01', 1);
      return [{
        type: 'create_task',
        task: {
          id: operation.taskId,
          name: operation.title,
          startDate,
          endDate: toEndDate(startDate, operation.durationDays),
          parentId: operation.containerId,
        },
      }];
    }

    case 'shift_task_by_delta': {
      const task = findTask(tasksBefore, operation.taskId);
      const startDate = addDays(task?.startDate ?? '2026-01-01', operation.deltaDays);
      return [{ type: 'move_task', taskId: operation.taskId, startDate }];
    }

    case 'move_task_to_date':
      return [{ type: 'move_task', taskId: operation.taskId, startDate: operation.targetDate }];

    case 'move_task_in_hierarchy':
      return [{ type: 'reparent_task', taskId: operation.taskId, newParentId: operation.newParentId }];

    case 'link_tasks':
      return [{ type: 'create_dependency', taskId: operation.taskId, dependency: operation.dependency }];

    case 'unlink_tasks':
      return [{ type: 'remove_dependency', taskId: operation.taskId, depTaskId: operation.depTaskId }];

    case 'delete_task':
      return [{ type: 'delete_task', taskId: operation.taskId }];

    case 'rename_task':
      return [{ type: 'update_task_fields', taskId: operation.taskId, fields: { name: operation.name } }];

    case 'update_task_metadata':
      return [{ type: 'update_task_fields', taskId: operation.taskId, fields: operation.fields }];

    case 'fanout_fragment_to_groups': {
      const tasks = operation.groupIds.flatMap((groupId) => operation.fragmentPlan.nodes.map((node) => {
        const group = findTask(tasksBefore, groupId);
        const startDate = addDays(group?.startDate ?? group?.endDate ?? '2026-01-01', 1);
        return {
          id: `${groupId}:${node.nodeKey}`,
          name: node.title,
          startDate,
          endDate: toEndDate(startDate, node.durationDays),
          parentId: groupId,
        };
      }));
      const dependencyCommands = operation.groupIds.flatMap((groupId) => operation.fragmentPlan.nodes.flatMap((node) =>
        node.dependsOnNodeKeys.map((depNodeKey) => ({
          type: 'create_dependency' as const,
          taskId: `${groupId}:${node.nodeKey}`,
          dependency: {
            taskId: `${groupId}:${depNodeKey}`,
            type: 'FS' as const,
          },
        }))));
      return [{ type: 'create_tasks_batch', tasks }, ...dependencyCommands];
    }

    case 'expand_branch_from_plan': {
      const anchor = findTask(tasksBefore, operation.anchorTaskId);
      const startDate = addDays(anchor?.startDate ?? anchor?.endDate ?? '2026-01-01', 1);
      const tasks = operation.fragmentPlan.nodes.map((node) => ({
        id: `${operation.anchorTaskId}:${node.nodeKey}`,
        name: node.title,
        startDate,
        endDate: toEndDate(startDate, node.durationDays),
        parentId: operation.anchorTaskId,
      }));
      const dependencyCommands = operation.fragmentPlan.nodes.flatMap((node) =>
        node.dependsOnNodeKeys.map((depNodeKey) => ({
          type: 'create_dependency' as const,
          taskId: `${operation.anchorTaskId}:${node.nodeKey}`,
          dependency: {
            taskId: `${operation.anchorTaskId}:${depNodeKey}`,
            type: 'FS' as const,
          },
        })));
      return [{ type: 'create_tasks_batch', tasks }, ...dependencyCommands];
    }
  }
}

export async function executeMutationPlan(
  input: ExecuteMutationPlanInput,
): Promise<MutationExecutionResult> {
  let baseVersion = input.projectVersion;
  const committedCommandTypes: string[] = [];
  const changedTaskIds: string[] = [];

  for (const operation of input.plan.operations) {
    const commands = compileOperation(operation, input.tasksBefore);

    for (const command of commands) {
      const response = await input.commandService.commitCommand({
        projectId: input.projectId,
        clientRequestId: randomUUID(),
        baseVersion,
        command,
      }, 'agent');

      committedCommandTypes.push(command.type);

      if (!response.accepted) {
        return {
          status: 'failed',
          executionMode: input.plan.canExecuteDeterministically ? 'deterministic' : 'hybrid',
          committedCommandTypes,
          changedTaskIds,
          verificationVerdict: 'failed',
          userFacingMessage: response.error ?? 'Команда не была принята authoritative command path.',
          failureReason: 'deterministic_execution_failed',
        };
      }

      changedTaskIds.push(...response.result.changedTaskIds);
      baseVersion = response.newVersion;
    }
  }

  const verificationVerdict = compareChangedSet(changedTaskIds, input.plan.expectedChangedTaskIds)
    ? 'accepted'
    : 'failed';

  return {
    status: verificationVerdict === 'accepted' ? 'completed' : 'failed',
    executionMode: input.plan.canExecuteDeterministically ? 'deterministic' : 'hybrid',
    committedCommandTypes,
    changedTaskIds: Array.from(new Set(changedTaskIds)),
    verificationVerdict,
    userFacingMessage: verificationVerdict === 'accepted'
      ? 'Изменения применены.'
      : 'Authoritative changed set не совпал с ожидаемым планом.',
    failureReason: verificationVerdict === 'accepted' ? undefined : 'verification_failed',
  };
}
