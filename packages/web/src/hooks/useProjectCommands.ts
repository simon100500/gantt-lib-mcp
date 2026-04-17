import {
  normalizeTasks,
  type FrontendHistoryGroupContext,
  type FrontendProjectCommand,
  type Task,
  type TaskDependency,
} from '../types';
import type { ProjectLoadResponse } from '../lib/apiTypes';
import { useCommandCommit } from './useCommandCommit';

export interface CreateTaskInput {
  id?: string;
  name: string;
  startDate: string;
  endDate: string;
  type?: 'task' | 'milestone';
  color?: string;
  parentId?: string;
  progress?: number;
  dependencies?: TaskDependency[];
  sortOrder?: number;
}

export interface UseProjectCommandsResult {
  applyTaskChanges: (task: Task, originalTask?: Task) => Promise<TaskCommandResult>;
  createTask: (input: CreateTaskInput) => Promise<Task>;
  deleteTask: (id: string) => Promise<boolean>;
  fetchProjectSnapshot: () => Promise<Task[]>;
}

export interface TaskCommandResult {
  task: Task;
  changedTasks: Task[];
  changedIds: string[];
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

function createHistoryGroup(title: string, finalizeGroup: boolean, seed?: {
  groupId: string;
  requestContextId: string;
}): FrontendHistoryGroupContext {
  return {
    groupId: seed?.groupId ?? crypto.randomUUID(),
    origin: 'user_ui',
    title,
    requestContextId: seed?.requestContextId ?? crypto.randomUUID(),
    finalizeGroup,
  };
}

function commandChangesSchedule(command: FrontendProjectCommand): boolean {
  return command.type === 'move_task'
    || command.type === 'resize_task'
    || command.type === 'set_task_start'
    || command.type === 'set_task_end'
    || command.type === 'change_duration'
    || command.type === 'recalculate_schedule'
    || command.type === 'reparent_task'
    || command.type === 'reorder_tasks'
    || command.type === 'create_dependency'
    || command.type === 'remove_dependency'
    || command.type === 'change_dependency_lag'
    || (
      command.type === 'update_task_fields'
      && (
        command.fields.parentId !== undefined
        || command.fields.dependencies !== undefined
      )
    );
}

function resolveApplyChangesTitle(commands: FrontendProjectCommand[]): string {
  if (commands.some(commandChangesSchedule)) {
    return 'Пользователь — Изменил график';
  }

  return 'Пользователь — Изменил задачу';
}

export function buildCommandsFromDiff(originalTask: Task, nextTask: Task): FrontendProjectCommand[] {
  const commands: FrontendProjectCommand[] = [];
  const nextStartDate = toDateString(nextTask.startDate);
  const nextEndDate = toDateString(nextTask.endDate);
  const originalStartDate = toDateString(originalTask.startDate);
  const originalEndDate = toDateString(originalTask.endDate);
  const nextDependencies = normalizeDependencies(nextTask.dependencies);
  const originalDependencies = normalizeDependencies(originalTask.dependencies);
  const dependenciesChanged = JSON.stringify(nextDependencies) !== JSON.stringify(originalDependencies);

  const startChanged = nextStartDate !== originalStartDate;
  const endChanged = nextEndDate !== originalEndDate;

  // If dependencies changed in the same interaction, let the server recalculate dates
  // from the authoritative dependency graph instead of sending an extra schedule command.
  if (!dependenciesChanged) {
    if (startChanged && endChanged) {
      commands.push({ type: 'move_task', taskId: nextTask.id, startDate: nextStartDate });
    } else if (startChanged) {
      commands.push({ type: 'resize_task', taskId: nextTask.id, anchor: 'start', date: nextStartDate });
    } else if (endChanged) {
      commands.push({ type: 'resize_task', taskId: nextTask.id, anchor: 'end', date: nextEndDate });
    }
  }

  const fieldUpdates: Extract<FrontendProjectCommand, { type: 'update_task_fields' }>['fields'] = {};

  if (nextTask.name !== originalTask.name) {
    fieldUpdates.name = nextTask.name;
  }
  if ((nextTask.type ?? 'task') !== (originalTask.type ?? 'task')) {
    fieldUpdates.type = nextTask.type ?? 'task';
  }
  if ((nextTask.color ?? null) !== (originalTask.color ?? null)) {
    fieldUpdates.color = nextTask.color ?? null;
  }
  if ((nextTask.parentId ?? null) !== (originalTask.parentId ?? null)) {
    fieldUpdates.parentId = nextTask.parentId ?? null;
  }
  if ((nextTask.progress ?? 0) !== (originalTask.progress ?? 0)) {
    fieldUpdates.progress = nextTask.progress;
  }
  if (dependenciesChanged) {
    fieldUpdates.dependencies = nextDependencies;
  }

  if (Object.keys(fieldUpdates).length > 0) {
    commands.push({ type: 'update_task_fields', taskId: nextTask.id, fields: fieldUpdates });
  }

  return commands;
}

export function useProjectCommands(accessToken: string | null): UseProjectCommandsResult {
  const { commitCommand } = useCommandCommit(accessToken);

  const fetchProjectSnapshot = async (): Promise<Task[]> => {
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

    const data = await response.json() as ProjectLoadResponse;
    return normalizeTasks(data.snapshot.tasks);
  };

  const applyTaskChanges = async (task: Task, originalTask?: Task): Promise<TaskCommandResult> => {
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
    const historySeed = {
      groupId: crypto.randomUUID(),
      requestContextId: crypto.randomUUID(),
    };
    const historyTitle = resolveApplyChangesTitle(commands);

    for (const [index, command] of commands.entries()) {
      const result = await commitCommand(
        command,
        createHistoryGroup(historyTitle, index === commands.length - 1, historySeed),
      );
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
    }, createHistoryGroup('Пользователь — Создал задачу', true));

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
    const result = await commitCommand(
      { type: 'delete_task', taskId: id },
      createHistoryGroup('Пользователь — Удалил задачу', true),
    );
    if (!result.accepted) {
      throw new Error(`Failed to delete task: ${result.reason}`);
    }
    return true;
  };

  return { applyTaskChanges, createTask, deleteTask, fetchProjectSnapshot };
}
