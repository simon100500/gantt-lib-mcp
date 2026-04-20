import type { MutationPlan, MutationPlanOperation, MutationTaskSnapshot } from './types.js';
import type { ResolvedSemanticMutationPlan } from './semantic-types.js';

type CompileSemanticMutationInput = {
  projectId: string;
  tasksBefore: MutationTaskSnapshot[];
  resolvedPlan: ResolvedSemanticMutationPlan;
};

type CompileSemanticMutationResult =
  | {
      ambiguity: 'none';
      plan: MutationPlan;
    }
  | {
      ambiguity: 'unsupported';
      explanation: string;
    };

function slugify(value: string): string {
  const map: Record<string, string> = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
    к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
    х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ы: 'y', э: 'e', ю: 'yu', я: 'ya', ь: '', ъ: '',
  };

  return value
    .toLowerCase()
    .split('')
    .map((char) => map[char] ?? char)
    .join('')
    .replace(/[^a-z0-9а-яё]+/giu, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
}

function titleCase(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return 'Новая задача';
  }

  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function buildDeterministicTaskId(anchorId: string, hint: string, existingTaskIds: Set<string>): string {
  const slug = slugify(hint) || 'task';
  const baseId = `${anchorId}:${slug}`;
  if (!existingTaskIds.has(baseId)) {
    return baseId;
  }

  let suffix = 2;
  while (existingTaskIds.has(`${baseId}-${suffix}`)) {
    suffix += 1;
  }

  return `${baseId}-${suffix}`;
}

function getInclusiveDurationDays(task: MutationTaskSnapshot | undefined): number | undefined {
  if (!task?.startDate || !task?.endDate) {
    return undefined;
  }

  const start = new Date(`${task.startDate}T00:00:00Z`);
  const end = new Date(`${task.endDate}T00:00:00Z`);
  const diffMs = end.getTime() - start.getTime();
  if (Number.isNaN(diffMs) || diffMs < 0) {
    return undefined;
  }

  return Math.floor(diffMs / 86_400_000) + 1;
}

function findTask(tasks: MutationTaskSnapshot[], taskId: string): MutationTaskSnapshot | undefined {
  return tasks.find((task) => task.id === taskId);
}

function mapActionToPlanType(operation: ResolvedSemanticMutationPlan['operations'][number]): MutationPlan['planType'] {
  switch (operation.action) {
    case 'add_task':
      return 'add_single_task';
    case 'change_duration':
      return 'change_duration';
    case 'move_task':
      if (operation.moveMode === 'relative_delta') {
        return 'shift_relative';
      }
      if (operation.moveMode === 'to_date') {
        return 'move_to_date';
      }
      return 'move_in_hierarchy';
    case 'rename_task':
      return 'rename_task';
    case 'delete_task':
      return 'delete_task';
    case 'link_tasks':
      return 'link_tasks';
    case 'unlink_tasks':
      return 'unlink_tasks';
    case 'move_in_hierarchy':
      return 'move_in_hierarchy';
  }
}

export function compileSemanticMutationPlan(
  input: CompileSemanticMutationInput,
): CompileSemanticMutationResult {
  if (input.resolvedPlan.operations.length === 0) {
    return {
      ambiguity: 'unsupported',
      explanation: 'Resolved semantic plan contained no operations.',
    };
  }

  const existingTaskIds = new Set(input.tasksBefore.map((task) => task.id));
  const operations: MutationPlanOperation[] = [];
  const expectedChangedTaskIds: string[] = [];

  for (const operation of input.resolvedPlan.operations) {
    switch (operation.action) {
      case 'change_duration': {
        const task = findTask(input.tasksBefore, operation.targetId);
        const currentDurationDays = getInclusiveDurationDays(task) ?? 1;
        const durationDays = operation.durationMode === 'absolute_days'
          ? Math.max(1, Math.round(operation.durationValue))
          : operation.durationMode === 'delta_days'
            ? Math.max(1, currentDurationDays + Math.round(operation.durationValue))
            : Math.max(1, Math.round(currentDurationDays * operation.durationValue));
        operations.push({
          kind: 'change_task_duration',
          taskId: operation.targetId,
          durationDays,
          anchor: operation.anchor,
        });
        expectedChangedTaskIds.push(operation.targetId);
        break;
      }

      case 'add_task': {
        const anchorId = operation.placement.anchorTaskId
          ?? operation.placement.parentId
          ?? input.projectId;
        const taskId = buildDeterministicTaskId(anchorId, operation.title, existingTaskIds);
        existingTaskIds.add(taskId);

        if (operation.placement.mode === 'after' || (operation.placement.mode === 'inside_tail' && operation.placement.anchorTaskId)) {
          operations.push({
            kind: 'append_task_after',
            taskId,
            title: titleCase(operation.title),
            taskType: operation.taskType,
            predecessorTaskId: operation.placement.anchorTaskId ?? '',
            parentId: operation.placement.parentId ?? null,
            durationDays: operation.durationDays,
          });
        } else if (operation.placement.mode === 'before') {
          operations.push({
            kind: 'append_task_before',
            taskId,
            title: titleCase(operation.title),
            taskType: operation.taskType,
            successorTaskId: operation.placement.anchorTaskId ?? '',
            parentId: operation.placement.parentId ?? null,
            durationDays: operation.durationDays,
          });
        } else {
          operations.push({
            kind: 'append_task_to_container',
            taskId,
            title: titleCase(operation.title),
            taskType: operation.taskType,
            containerId: operation.placement.parentId ?? '',
            durationDays: operation.durationDays,
          });
        }

        expectedChangedTaskIds.push(taskId);
        break;
      }

      case 'move_task':
        if (operation.moveMode === 'to_date') {
          operations.push({
            kind: 'move_task_to_date',
            taskId: operation.targetId,
            targetDate: operation.targetDate ?? '',
          });
          expectedChangedTaskIds.push(operation.targetId);
          break;
        }

        if (operation.moveMode === 'relative_delta') {
          operations.push({
            kind: 'shift_task_by_delta',
            taskId: operation.targetId,
            deltaDays: operation.deltaDays ?? 0,
          });
          expectedChangedTaskIds.push(operation.targetId);
          break;
        }

        operations.push({
          kind: 'move_task_in_hierarchy',
          taskId: operation.targetId,
          newParentId: operation.parentId ?? null,
        });
        expectedChangedTaskIds.push(operation.targetId, operation.parentId ?? '');
        break;

      case 'rename_task':
        operations.push({
          kind: 'rename_task',
          taskId: operation.targetId,
          name: titleCase(operation.newTitle),
        });
        expectedChangedTaskIds.push(operation.targetId);
        break;

      case 'delete_task':
        operations.push({
          kind: 'delete_task',
          taskId: operation.targetId,
        });
        expectedChangedTaskIds.push(operation.targetId);
        break;

      case 'link_tasks':
        operations.push({
          kind: 'link_tasks',
          taskId: operation.successorId,
          dependency: {
            taskId: operation.predecessorId,
            type: operation.dependencyType,
            lag: operation.lagDays,
          },
        });
        expectedChangedTaskIds.push(operation.predecessorId, operation.successorId);
        break;

      case 'unlink_tasks':
        operations.push({
          kind: 'unlink_tasks',
          taskId: operation.successorId,
          depTaskId: operation.predecessorId,
        });
        expectedChangedTaskIds.push(operation.predecessorId, operation.successorId);
        break;

      case 'move_in_hierarchy':
        operations.push({
          kind: 'move_task_in_hierarchy',
          taskId: operation.targetId,
          newParentId: operation.parentId,
        });
        expectedChangedTaskIds.push(operation.targetId, operation.parentId ?? '');
        break;
    }
  }

  return {
    ambiguity: 'none',
    plan: {
      planType: mapActionToPlanType(input.resolvedPlan.operations[0]),
      operations,
      why: 'Semantic planner operations compiled into authoritative typed commands.',
      expectedChangedTaskIds: unique(expectedChangedTaskIds),
      canExecuteDeterministically: true,
      needsAgentExecution: false,
      skipChangedSetVerification: true,
    },
  };
}

