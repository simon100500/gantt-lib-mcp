import type { Task } from '../../types.ts';

export type PreviewState = {
  tasks: Task[];
  active: boolean;
  mode: 'rendering' | 'failed';
  message: string | null;
  wave: number;
};

export type ProjectGenerationJobView = {
  id: string;
  projectId: string | null;
  intentId: string | null;
  userId: string;
  source: string;
  type: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';
  stage: 'queued' | 'interpreting' | 'planning' | 'compiling' | 'committing' | 'finalizing' | 'succeeded' | 'failed';
  statusMessage: string | null;
  requestContextId: string | null;
  historyGroupId: string | null;
  progressPercent: number | null;
  previewMode: 'none' | 'ephemeral' | 'persisted';
  previewAvailable: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type StoredGenerationPreview = {
  jobId: string;
  projectId: string;
  tasks: Task[];
  mode: 'rendering' | 'failed';
  message: string | null;
  wave: number;
};

type NormalizedChatMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  requestContextId: string | null;
  historyGroupId: string | null;
};

export function buildDependencyRowsFromTasks(tasks: Task[]) {
  return tasks.flatMap((task) =>
    (task.dependencies ?? []).map((dependency, index) => ({
      id: `${task.id}:${dependency.taskId}:${dependency.type}:${index}`,
      taskId: task.id,
      depTaskId: dependency.taskId,
      type: dependency.type,
      lag: dependency.lag ?? 0,
    })),
  );
}

export function summarizeTasksForLog(tasks: Task[]) {
  return tasks.slice(0, 20).map((task) => ({
    id: task.id,
    name: task.name,
    startDate: typeof task.startDate === 'string' ? task.startDate : task.startDate.toISOString().split('T')[0],
    endDate: typeof task.endDate === 'string' ? task.endDate : task.endDate.toISOString().split('T')[0],
    dependencies: (task.dependencies ?? []).map((dependency) => ({
      taskId: dependency.taskId,
      type: dependency.type,
      lag: dependency.lag ?? 0,
    })),
  }));
}

export function isActiveProjectGenerationJob(job: ProjectGenerationJobView | null): boolean {
  return Boolean(job && (job.status === 'queued' || job.status === 'running'));
}

function isSameChatMessage(left: NormalizedChatMessage, right: NormalizedChatMessage): boolean {
  if (left.id === right.id) {
    return true;
  }

  if (left.requestContextId && right.requestContextId && left.requestContextId === right.requestContextId) {
    return true;
  }

  if (left.historyGroupId && right.historyGroupId && left.historyGroupId === right.historyGroupId) {
    return true;
  }

  return left.role === right.role && left.content === right.content;
}

export function mergeOptimisticChatMessages(
  serverMessages: NormalizedChatMessage[],
  localMessages: NormalizedChatMessage[],
): NormalizedChatMessage[] {
  const trailingOptimisticUsers: NormalizedChatMessage[] = [];

  for (let index = localMessages.length - 1; index >= 0; index -= 1) {
    const message = localMessages[index];
    if (message.role !== 'user') {
      break;
    }

    if (message.requestContextId || message.historyGroupId) {
      break;
    }

    if (serverMessages.some((serverMessage) => isSameChatMessage(serverMessage, message))) {
      break;
    }

    trailingOptimisticUsers.unshift(message);
  }

  if (trailingOptimisticUsers.length === 0) {
    return serverMessages;
  }

  return [...serverMessages, ...trailingOptimisticUsers];
}

function getGenerationStageFallbackMessage(stage: ProjectGenerationJobView['stage']): string | null {
  switch (stage) {
    case 'queued':
      return 'Ручное редактирование пока недоступно';
    case 'interpreting':
      return 'Понимаем запрос';
    case 'planning':
      return 'Планируем график';
    case 'compiling':
      return 'Собираем график';
    case 'committing':
      return 'Сохраняем изменения в проект';
    case 'finalizing':
      return 'Фиксируем результат';
    default:
      return null;
  }
}

export function resolveGenerationLockMessage(
  job: ProjectGenerationJobView | null,
  currentMessage: string | null,
): string | null {
  if (!job) {
    return currentMessage;
  }

  return job.statusMessage ?? getGenerationStageFallbackMessage(job.stage) ?? currentMessage;
}
