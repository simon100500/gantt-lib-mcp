import type { Task, TaskDependency } from '../types';

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
}

export interface UseTaskMutationResult {
  mutateTask: (task: Task) => Promise<Task>;
  createTask: (input: CreateTaskInput) => Promise<Task>;
  deleteTask: (id: string) => Promise<boolean>;
}

/**
 * Hook for individual task mutations (create, update, delete).
 * Provides thin wrapper around fetch API for individual task operations.
 *
 * This hook does NOT manage state - callers are responsible for optimistic updates
 * and state management. This is intentional to keep the hook simple and flexible.
 *
 * @param accessToken - JWT access token for authentication
 * @returns Object with mutateTask, createTask, and deleteTask functions
 */
export function useTaskMutation(accessToken: string | null): UseTaskMutationResult {
  const getHeaders = () => ({
    'Content-Type': 'application/json',
    ...(accessToken ? { 'Authorization': `Bearer ${accessToken}` } : {}),
  });

  const mutateTask = async (task: Task): Promise<Task> => {
    const response = await fetch(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify({
        name: task.name,
        startDate: typeof task.startDate === 'string' ? task.startDate : task.startDate.toISOString().split('T')[0],
        endDate: typeof task.endDate === 'string' ? task.endDate : task.endDate.toISOString().split('T')[0],
        color: task.color,
        parentId: task.parentId,
        progress: task.progress,
        dependencies: task.dependencies,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to update task: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<Task>;
  };

  const createTask = async (input: CreateTaskInput): Promise<Task> => {
    const response = await fetch('/api/tasks', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      throw new Error(`Failed to create task: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<Task>;
  };

  const deleteTask = async (id: string): Promise<boolean> => {
    const response = await fetch(`/api/tasks/${id}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to delete task: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as { deleted: boolean };
    return data.deleted;
  };

  return { mutateTask, createTask, deleteTask };
}
