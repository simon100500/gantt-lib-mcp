import { normalizeTasks, type FrontendProjectCommand, type Task, type TaskDependency } from '../types';
import { useCommandCommit } from './useCommandCommit';

export interface CreateTaskInput {
  name: string;
  startDate: string;
  endDate: string;
  color?: string;
  parentId?: string;
  progress?: number;
  dependencies?: TaskDependency[];
}

export interface UpdateTaskInput {
  name?: string;
  startDate?: string;
  endDate?: string;
  color?: string;
  parentId?: string;
  progress?: number;
  dependencies?: TaskDependency[];
  sortOrder?: number;
}

export interface UseTaskMutationResult {
  mutateTask: (task: Task, originalTask?: Task) => Promise<TaskMutationResponse>;
  createTask: (input: CreateTaskInput) => Promise<Task>;
  deleteTask: (id: string) => Promise<boolean>;
  fetchTasksSnapshot: () => Promise<Task[]>;
}

export interface TaskMutationResponse {
  task: Task;
  changedTasks: Task[];
  changedIds: string[];
}

interface LoadProjectResponse {
  version: number;
  snapshot: {
    tasks: Task[];
    dependencies: Array<{ id: string; taskId: string; depTaskId: string; type: string; lag: number }>;
  };
}

function toDateString(value: Task['startDate']): string {
  return typeof value === 'string' ? value.split('T')[0] : value.toISOString().split('T')[0];
}

function normalizeDependencies(dependencies: TaskDependency[] | undefined): TaskDependency[] {
  return (dependencies ?? []).map((dependency) => ({
    taskId: dependency.taskId,
    type: dependency.type,
    lag: dependency.lag ?? 0,
  }));
}

function buildCommandsFromDiff(originalTask: Task, nextTask: Task): FrontendProjectCommand[] {
  const commands: FrontendProjectCommand[] = [];
  const nextStartDate = toDateString(nextTask.startDate);
  const nextEndDate = toDateString(nextTask.endDate);
  const originalStartDate = toDateString(originalTask.startDate);
  const originalEndDate = toDateString(originalTask.endDate);

  const startChanged = nextStartDate !== originalStartDate;
  const endChanged = nextEndDate !== originalEndDate;

  if (startChanged && endChanged) {
    commands.push({ type: 'move_task', taskId: nextTask.id, startDate: nextStartDate });
  } else if (startChanged) {
    commands.push({ type: 'resize_task', taskId: nextTask.id, anchor: 'start', date: nextStartDate });
  } else if (endChanged) {
    commands.push({ type: 'resize_task', taskId: nextTask.id, anchor: 'end', date: nextEndDate });
  }

  const fieldUpdates: Extract<FrontendProjectCommand, { type: 'update_task_fields' }>['fields'] = {};

  if (nextTask.name !== originalTask.name) {
    fieldUpdates.name = nextTask.name;
  }
  if ((nextTask.color ?? null) !== (originalTask.color ?? null)) {
    fieldUpdates.color = nextTask.color;
  }
  if ((nextTask.parentId ?? null) !== (originalTask.parentId ?? null)) {
    fieldUpdates.parentId = nextTask.parentId ?? null;
  }
  if ((nextTask.progress ?? 0) !== (originalTask.progress ?? 0)) {
    fieldUpdates.progress = nextTask.progress;
  }
  if ((nextTask.sortOrder ?? null) !== (originalTask.sortOrder ?? null)) {
    fieldUpdates.sortOrder = nextTask.sortOrder;
  }

  const nextDependencies = normalizeDependencies(nextTask.dependencies);
  const originalDependencies = normalizeDependencies(originalTask.dependencies);
  if (JSON.stringify(nextDependencies) !== JSON.stringify(originalDependencies)) {
    fieldUpdates.dependencies = nextDependencies;
  }

  if (Object.keys(fieldUpdates).length > 0) {
    commands.push({ type: 'update_task_fields', taskId: nextTask.id, fields: fieldUpdates });
  }

  return commands;
}

export function useTaskMutation(accessToken: string | null): UseTaskMutationResult {
  const { commitCommand } = useCommandCommit(accessToken);

  const fetchTasksSnapshot = async (): Promise<Task[]> => {
    if (!accessToken) {
      return [];
    }

    const response = await fetch('/api/project', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch tasks: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as LoadProjectResponse;
    return normalizeTasks(data.snapshot.tasks);
  };

  const mutateTask = async (task: Task, originalTask?: Task): Promise<TaskMutationResponse> => {
    if (!originalTask) {
      throw new Error('Original task is required for command-based mutation');
    }

    const commands = buildCommandsFromDiff(originalTask, task);
    if (commands.length === 0) {
      return {
        task,
        changedTasks: [task],
        changedIds: [task.id],
      };
    }

    let latestSnapshotTasks = normalizeTasks([task]);
    const changedIds = new Set<string>();

    for (const command of commands) {
      const result = await commitCommand(command);
      if (!result.accepted) {
        throw new Error(`Command rejected: ${result.reason}`);
      }

      latestSnapshotTasks = normalizeTasks(result.snapshot.tasks);
      result.result.changedTaskIds.forEach((id: string) => changedIds.add(id));
    }

    const changedTasks = latestSnapshotTasks.filter((candidate) => changedIds.has(candidate.id));
    const resolvedTask = latestSnapshotTasks.find((candidate) => candidate.id === task.id) ?? changedTasks[0];

    if (!resolvedTask) {
      throw new Error(`Task ${task.id} not found in server snapshot after mutation`);
    }

    return {
      task: resolvedTask,
      changedTasks,
      changedIds: Array.from(changedIds),
    };
  };

  const createTask = async (input: CreateTaskInput): Promise<Task> => {
    const result = await commitCommand({
      type: 'create_task',
      task: input,
    });

    if (!result.accepted) {
      throw new Error(`Failed to create task: ${result.reason}`);
    }

    const normalizedTasks = normalizeTasks(result.snapshot.tasks);
    const createdTask = normalizedTasks.find((task) => result.result.changedTaskIds.includes(task.id));
    if (!createdTask) {
      throw new Error('Created task missing from authoritative snapshot');
    }

    return createdTask;
  };

  const deleteTask = async (id: string): Promise<boolean> => {
    const result = await commitCommand({ type: 'delete_task', taskId: id });
    if (!result.accepted) {
      throw new Error(`Failed to delete task: ${result.reason}`);
    }
    return true;
  };

  return { mutateTask, createTask, deleteTask, fetchTasksSnapshot };
}
