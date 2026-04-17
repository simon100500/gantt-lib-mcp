import type {
  MutationFailureReason,
  MutationTaskSnapshot,
  ResolvedMutationContext,
} from './types.js';

type MutationFailureMessageContext = {
  details?: string;
  resolutionContext?: ResolvedMutationContext | null;
};

type MutationSuccessMessageInput = {
  changedTaskIds: string[];
  changedTasks?: MutationTaskSnapshot[];
};

function looksLikeAggregatePastedWorklist(name: string): boolean {
  const trimmed = name.trim();
  if (trimmed.length < 160) {
    return false;
  }

  const enumeratedItemMatches = trimmed.match(/(?:^|\s)\d+[.)]/g) ?? [];
  if (enumeratedItemMatches.length >= 3) {
    return true;
  }

  const demolitionMentions = trimmed.match(/демонтаж/gi) ?? [];
  return demolitionMentions.length >= 3;
}

function selectDisplayTasks(tasks: MutationTaskSnapshot[]): MutationTaskSnapshot[] {
  const concreteTasks = tasks.filter((task) => !looksLikeAggregatePastedWorklist(task.name));
  return concreteTasks.length > 0 ? concreteTasks : tasks;
}

function formatTaskList(tasks: MutationTaskSnapshot[]): string {
  const names = selectDisplayTasks(tasks)
    .map((task) => task.name.trim())
    .filter((name) => name.length > 0);

  if (names.length === 0) {
    return '';
  }

  if (names.length === 1) {
    return ` «${names[0]}»`;
  }

  if (names.length === 2) {
    return ` «${names[0]}» и «${names[1]}»`;
  }

  const preview = names.slice(0, 3).map((name) => `«${name}»`).join(', ');
  const remaining = names.length - 3;
  return remaining > 0 ? ` ${preview} и ещё ${remaining}` : ` ${preview}`;
}

export function buildMutationFailureMessage(
  reason: MutationFailureReason,
  context: MutationFailureMessageContext = {},
): string {
  const details = typeof context.details === 'string' && context.details.trim().length > 0
    ? ` ${context.details.trim()}`
    : '';

  switch (reason) {
    case 'anchor_not_found':
      return `Не удалось надежно определить целевую задачу для этого изменения.${details}`.trim();
    case 'multiple_low_confidence_targets':
      return 'Нашлось несколько одинаково вероятных целей. Уточните, какую именно задачу нужно изменить.';
    case 'container_not_resolved':
      return 'Не удалось понять, в какой раздел графика добавить эту работу.';
    case 'placement_not_resolved':
      return 'Подходящий раздел найден, но не удалось определить, куда именно вставить задачу.';
    case 'group_scope_not_resolved':
      return 'Не удалось определить повторяющиеся группы, куда нужно развернуть это добавление.';
    case 'expansion_anchor_not_resolved':
      return 'Не удалось определить пункт, который нужно детализировать.';
    case 'deterministic_execution_failed':
      return `Сервер не смог применить это изменение по authoritative command path.${details}`.trim();
    case 'verification_failed':
      return 'Изменение не подтвердилось после выполнения: authoritative changed set не совпал с ожидаемым планом.';
    case 'unsupported_mutation_shape':
      return 'Этот тип изменения пока не поддерживается в staged-маршруте.';
  }
}

export function buildMutationSuccessMessage(input: MutationSuccessMessageInput): string {
  const changedTaskSet = new Set(input.changedTaskIds);
  const changedTasks = (input.changedTasks ?? []).filter((task) => changedTaskSet.has(task.id));

  if (changedTasks.length > 0) {
    const subject = changedTasks.length === 1 ? 'задача' : 'задачи';
    return `Изменение подтверждено: обновлены ${subject}${formatTaskList(changedTasks)}.`;
  }

  const count = changedTaskSet.size;
  if (count === 1) {
    return 'Изменение подтверждено: обновлена 1 задача.';
  }

  return `Изменение подтверждено: обновлены ${count} задач.`;
}
