import { DEFAULT_MUTATION_DURATIONS } from './domain-defaults.js';
import { planStructuredFragment } from './fragment-planner.js';
import type {
  MutationIntent,
  MutationPlan,
  MutationPlanOperation,
  MutationTaskSnapshot,
  ResolvedMutationContext,
} from './types.js';

type BuildMutationPlanInput = {
  intent: MutationIntent;
  resolutionContext: ResolvedMutationContext;
  userMessage: string;
  tasksBefore: MutationTaskSnapshot[];
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

function buildDeterministicTaskId(anchorId: string, hint: string): string {
  const slug = slugify(hint) || 'task';
  return `${anchorId}:${slug}`;
}

function findDuration(hint: string): number {
  const normalized = hint.toLowerCase();
  const entry = Object.entries(DEFAULT_MUTATION_DURATIONS).find(([key]) => normalized.includes(key));
  return entry?.[1] ?? 1;
}

function extractTaskTitle(userMessage: string): string {
  const normalized = userMessage.toLowerCase();

  if (normalized.includes('сдач')) {
    return 'Сдача';
  }
  if (normalized.includes('технадзор')) {
    return 'Технадзор';
  }
  if (normalized.includes('исполнительная документация')) {
    return 'Исполнительная документация';
  }
  if (normalized.includes('приемк')) {
    return 'Приемка';
  }
  if (normalized.includes('пусконалад')) {
    return 'Пусконаладка';
  }
  if (normalized.includes('покраска обоев')) {
    return 'Покраска обоев';
  }
  if (normalized.includes('чистовая отделка')) {
    return 'Чистовая отделка';
  }

  return titleCase(userMessage.replace(/^добавь\s+/iu, '').trim());
}

function extractDeltaDays(userMessage: string): number {
  const lower = userMessage.toLowerCase();
  const weeks = lower.match(/на\s+(-?\d+)\s+недел/iu);
  if (weeks) {
    return Number.parseInt(weeks[1] ?? '0', 10) * 7;
  }

  const days = lower.match(/на\s+(-?\d+)\s+дн/iu);
  return Number.parseInt(days?.[1] ?? '0', 10);
}

function extractTargetDate(userMessage: string): string {
  return userMessage.match(/\d{4}-\d{2}-\d{2}/u)?.[0] ?? '';
}

function extractColorFields(userMessage: string): { color?: string | null } {
  if (/красн/iu.test(userMessage)) {
    return { color: '#ff4d4f' };
  }

  return {};
}

function extractRenamedTitle(userMessage: string, fallbackName: string): string {
  const quoted = userMessage.match(/["«](.+?)["»]/u)?.[1]?.trim();
  if (quoted) {
    return quoted;
  }

  const renamed = userMessage.replace(/^переименуй\s+/iu, '').trim();
  return titleCase(renamed || fallbackName);
}

function extractEntityNames(userMessage: string): string[] {
  const quoted = Array.from(userMessage.matchAll(/["«](.+?)["»]/gu)).map((match) => match[1]?.trim()).filter(Boolean);
  if (quoted.length >= 2) {
    return quoted as string[];
  }

  const split = userMessage
    .replace(/^свяжи\s+/iu, '')
    .replace(/^убери\s+связь\s+между\s+/iu, '')
    .split(/\s+и\s+/iu)
    .map((part) => part.trim())
    .filter(Boolean);
  return split.slice(0, 2);
}

function resolveTaskId(context: ResolvedMutationContext, fallbackIndex = 0): string {
  return context.selectedPredecessorTaskId
    ?? context.tasks[fallbackIndex]?.id
    ?? context.predecessors[fallbackIndex]?.id
    ?? '';
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

export async function buildMutationPlan(input: BuildMutationPlanInput): Promise<MutationPlan> {
  const { intent, resolutionContext, userMessage } = input;
  const targetTaskId = resolveTaskId(resolutionContext);
  const taskTitle = extractTaskTitle(userMessage);

  let operations: MutationPlanOperation[] = [];
  let why = '';
  let expectedChangedTaskIds: string[] = [];

  switch (intent.intentType) {
    case 'add_single_task': {
      const taskId = buildDeterministicTaskId(
        resolutionContext.selectedPredecessorTaskId
          ?? resolutionContext.selectedSuccessorTaskId
          ?? resolutionContext.selectedContainerId
          ?? resolutionContext.projectId,
        taskTitle,
      );
      const durationDays = findDuration(taskTitle.toLowerCase());

      if (resolutionContext.selectedPredecessorTaskId) {
        operations = [{
          kind: 'append_task_after',
          taskId,
          title: taskTitle,
          predecessorTaskId: resolutionContext.selectedPredecessorTaskId,
          parentId: resolutionContext.selectedContainerId,
          durationDays,
        }];
        expectedChangedTaskIds = [taskId, resolutionContext.selectedPredecessorTaskId];
      } else if (resolutionContext.selectedSuccessorTaskId) {
        operations = [{
          kind: 'append_task_before',
          taskId,
          title: taskTitle,
          successorTaskId: resolutionContext.selectedSuccessorTaskId,
          parentId: resolutionContext.selectedContainerId,
          durationDays,
        }];
        expectedChangedTaskIds = [taskId, resolutionContext.selectedSuccessorTaskId];
      } else {
        operations = [{
          kind: 'append_task_to_container',
          taskId,
          title: taskTitle,
          containerId: resolutionContext.selectedContainerId ?? '',
          durationDays,
        }];
        expectedChangedTaskIds = [taskId];
      }
      why = `Сформирован семантический append-план для "${taskTitle}" без свободной генерации payload.`;
      break;
    }

    case 'shift_relative':
      operations = [{
        kind: 'shift_task_by_delta',
        taskId: targetTaskId,
        deltaDays: extractDeltaDays(userMessage),
      }];
      why = `Сдвиг задачи "${targetTaskId}" вычислен как server-side relative delta.`;
      expectedChangedTaskIds = [targetTaskId];
      break;

    case 'move_to_date':
      operations = [{
        kind: 'move_task_to_date',
        taskId: targetTaskId,
        targetDate: extractTargetDate(userMessage),
      }];
      why = `Задача "${targetTaskId}" переносится через schedule command semantics на явную дату.`;
      expectedChangedTaskIds = [targetTaskId];
      break;

    case 'move_in_hierarchy':
      operations = [{
        kind: 'move_task_in_hierarchy',
        taskId: targetTaskId,
        newParentId: resolutionContext.selectedContainerId,
      }];
      why = `Перемещение в иерархии выполняется через typed reparent operation.`;
      expectedChangedTaskIds = unique([targetTaskId, resolutionContext.selectedContainerId ?? '']);
      break;

    case 'link_tasks': {
      const linkedIds = unique([
        resolutionContext.tasks[0]?.id ?? targetTaskId,
        resolutionContext.tasks[1]?.id ?? resolutionContext.successors[0]?.id ?? '',
      ]);
      operations = [{
        kind: 'link_tasks',
        taskId: linkedIds[1] ?? '',
        dependency: {
          taskId: linkedIds[0] ?? '',
          type: 'FS',
        },
      }];
      why = `Связь между задачами строится через authoritative dependency command.`;
      expectedChangedTaskIds = linkedIds;
      break;
    }

    case 'unlink_tasks': {
      const linkedIds = unique([
        resolutionContext.tasks[0]?.id ?? targetTaskId,
        resolutionContext.tasks[1]?.id ?? resolutionContext.successors[0]?.id ?? '',
      ]);
      operations = [{
        kind: 'unlink_tasks',
        taskId: linkedIds[1] ?? '',
        depTaskId: linkedIds[0] ?? '',
      }];
      why = `Удаление связи строится через typed remove_dependency command.`;
      expectedChangedTaskIds = linkedIds;
      break;
    }

    case 'delete_task':
      operations = [{ kind: 'delete_task', taskId: targetTaskId }];
      why = `Удаление задачи идет через детерминированный delete_task command.`;
      expectedChangedTaskIds = [targetTaskId];
      break;

    case 'rename_task': {
      const fallbackName = resolutionContext.tasks[0]?.name ?? 'Задача';
      operations = [{
        kind: 'rename_task',
        taskId: targetTaskId,
        name: extractRenamedTitle(userMessage, fallbackName),
      }];
      why = `Переименование оформлено как typed field update без legacy mutation payload.`;
      expectedChangedTaskIds = [targetTaskId];
      break;
    }

    case 'update_metadata':
      operations = [{
        kind: 'update_task_metadata',
        taskId: targetTaskId,
        fields: extractColorFields(userMessage),
      }];
      why = `Обновление метаданных оформлено как typed update_task_metadata plan.`;
      expectedChangedTaskIds = [targetTaskId];
      break;

    case 'add_repeated_fragment': {
      const fragmentPlan = await planStructuredFragment({
        intentType: 'add_repeated_fragment',
        userMessage,
        anchorTaskId: resolutionContext.selectedContainerId ?? resolutionContext.projectId,
        hint: intent.entitiesMentioned[0] ?? taskTitle,
      });
      const groupIds = resolutionContext.containers.map((container) => container.id);
      operations = [{
        kind: 'fanout_fragment_to_groups',
        groupIds,
        fragmentPlan,
      }];
      why = `Повторяемый фрагмент ограничен структурным fragment contract и исполняется server-side.`;
      expectedChangedTaskIds = groupIds.flatMap((groupId) =>
        fragmentPlan.nodes.map((node) => `${groupId}:${node.nodeKey}`));
      break;
    }

    case 'expand_wbs': {
      const anchorTaskId = targetTaskId;
      const fragmentPlan = await planStructuredFragment({
        intentType: 'expand_wbs',
        userMessage,
        anchorTaskId,
        hint: intent.entitiesMentioned[0] ?? resolutionContext.tasks[0]?.name ?? 'Ветка',
      });
      operations = [{
        kind: 'expand_branch_from_plan',
        anchorTaskId,
        fragmentPlan,
      }];
      why = `WBS expansion проходит через structured fragment plan, а не через свободный tool payload.`;
      expectedChangedTaskIds = [anchorTaskId, ...fragmentPlan.nodes.map((node) => `${anchorTaskId}:${node.nodeKey}`)];
      break;
    }

    case 'restructure_branch':
    case 'unsupported_or_ambiguous':
    case 'validate_only':
      why = 'Этот intent должен оставаться на agent-only path.';
      break;
  }

  return {
    planType: intent.intentType,
    operations,
    why,
    expectedChangedTaskIds,
    canExecuteDeterministically: intent.executionMode === 'deterministic',
    needsAgentExecution: intent.intentType === 'restructure_branch' || intent.intentType === 'unsupported_or_ambiguous',
  };
}
