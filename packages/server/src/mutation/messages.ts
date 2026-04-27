import type {
  MutationFailureReason,
  MutationIntentType,
  MutationRoute,
  MutationTaskSnapshot,
  ResolvedMutationContext,
} from './types.js';

type MutationFailureMessageContext = {
  details?: string;
  resolutionContext?: ResolvedMutationContext | null;
  route?: MutationRoute;
  intentType?: MutationIntentType;
  failedStep?: 'routing' | 'resolution' | 'specialized_execution' | 'agent_escalation';
};

type MutationSuccessMessageInput = {
  changedTaskIds: string[];
  changedTasks?: MutationTaskSnapshot[];
  createdTasks?: MutationTaskSnapshot[];
  targetTaskIds?: string[];
  route?: MutationRoute;
  intentType?: MutationIntentType;
  warnings?: string[];
  specializedTargetName?: string;
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

function formatCascadeCount(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (count === 1) {
    return 'Пересчитана ещё 1 связанная задача.';
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `Пересчитаны ещё ${count} связанные задачи.`;
  }

  return `Пересчитано ещё ${count} связанных задач.`;
}

export function buildMutationFailureMessage(
  reason: MutationFailureReason,
  context: MutationFailureMessageContext = {},
): string {
  const failurePrefix = context.route === 'specialized_fast_path'
    ? `Специализированный маршрут ${context.route}`
    : context.route === 'agent_path'
      ? `Маршрут ${context.route}`
      : null;
  const failureStep = context.failedStep
    ? ` на этапе ${context.failedStep}`
    : '';
  const details = typeof context.details === 'string' && context.details.trim().length > 0
    ? ` ${context.details.trim()}`
    : '';

  switch (reason) {
    case 'anchor_not_found':
      if (failurePrefix) {
        return `${failurePrefix}${failureStep} не смог надежно определить целевую задачу.${details}`.trim();
      }
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
  const createdTasks = input.createdTasks ?? [];
  const targetTaskSet = new Set(input.targetTaskIds ?? []);
  const targetTasks = targetTaskSet.size > 0
    ? changedTasks.filter((task) => targetTaskSet.has(task.id))
    : changedTasks;
  const warningsSuffix = input.warnings && input.warnings.length > 0
    ? ` Предупреждения: ${input.warnings.join('; ')}`
    : '';

  if (input.route === 'specialized_fast_path' && input.intentType === 'decompose_task') {
    const childTasks = changedTasks.filter((task) => task.name !== input.specializedTargetName);
    const targetName = input.specializedTargetName ?? changedTasks[0]?.name ?? 'выбранная задача';
    const childCount = childTasks.length > 0 ? childTasks.length : changedTaskSet.size;
    return `Специализированный маршрут распознан: задача «${targetName}» детализирована, изменено ${childCount} подзадач.${warningsSuffix}`.trim();
  }

  if (input.intentType === 'add_single_task' && createdTasks.length > 0) {
    if (createdTasks.length === 1) {
      return `Распознано изменение по маршруту ${input.route ?? 'fast_path'}: добавлена задача${formatTaskList(createdTasks)}.${warningsSuffix}`.trim();
    }
    return `Распознано изменение по маршруту ${input.route ?? 'fast_path'}: добавлены задачи${formatTaskList(createdTasks)}.${warningsSuffix}`.trim();
  }

  if (input.intentType === 'change_duration' && targetTasks.length > 0) {
    const subject = targetTasks.length === 1 ? 'задачи' : 'задач';
    const cascadeCount = changedTaskSet.size - targetTaskSet.size;
    const cascadeSuffix = cascadeCount > 0
      ? ` ${formatCascadeCount(cascadeCount)}`
      : '';
    return `Распознано изменение по маршруту ${input.route ?? 'fast_path'}: изменена длительность ${subject}${formatTaskList(targetTasks)}.${cascadeSuffix}${warningsSuffix}`.trim();
  }

  if (changedTasks.length > 0) {
    const subject = changedTasks.length === 1 ? 'задача' : 'задачи';
    return `Распознано изменение по маршруту ${input.route ?? 'fast_path'}: обновлены ${subject}${formatTaskList(changedTasks)}.${warningsSuffix}`.trim();
  }

  const count = changedTaskSet.size;
  if (count === 1) {
    return `Распознано изменение по маршруту ${input.route ?? 'fast_path'}: обновлена 1 задача.${warningsSuffix}`.trim();
  }

  return `Распознано изменение по маршруту ${input.route ?? 'fast_path'}: обновлены ${count} задач.${warningsSuffix}`.trim();
}
