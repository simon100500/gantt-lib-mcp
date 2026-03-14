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
  batchImportTasks: (tasks: Task[]) => Promise<number>;
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
    const body = {
      name: task.name,
      startDate: typeof task.startDate === 'string' ? task.startDate : task.startDate.toISOString().split('T')[0],
      endDate: typeof task.endDate === 'string' ? task.endDate : task.endDate.toISOString().split('T')[0],
      color: task.color,
      // Convert undefined to null for parentId - backend needs null to clear the parent
      parentId: task.parentId ?? null,
      progress: task.progress,
      dependencies: task.dependencies,
    };
    console.log('%c[useTaskMutation] SENDING PATCH /api/tasks/' + task.id, 'background: #ff922b; color: white; padding: 2px 6px; border-radius: 3px;');
    console.log('[useTaskMutation] Request body:', body);
    console.log('[useTaskMutation] Full task being sent:', task);
    const response = await fetch(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      console.error('[useTaskMutation] Response not OK:', response.status, response.statusText);
      throw new Error(`Failed to update task: ${response.status} ${response.statusText}`);
    }

    const result = await response.json() as Task;
    console.log('%c[useTaskMutation] Response OK', 'background: #51cf66; color: white; padding: 2px 6px; border-radius: 3px;');
    console.log('[useTaskMutation] Server returned:', {
      id: result.id,
      name: result.name,
      parentId: result.parentId,
      startDate: result.startDate,
      endDate: result.endDate,
    });
    console.log('[useTaskMutation] Full response:', result);
    return result;
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

  const batchImportTasks = async (tasks: Task[]): Promise<number> => {
    console.log(`%c[useTaskMutation] BATCH IMPORT - sending ${tasks.length} tasks via PUT /api/tasks`, 'background: #ff6b6b; color: white; font-weight: bold; padding: 4px 8px; border-radius: 4px;');
    console.log('[useTaskMutation] Batch tasks:', tasks.map(t => ({ id: t.id, name: t.name, startDate: t.startDate, endDate: t.endDate })));

    const response = await fetch('/api/tasks', {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(tasks),
    });

    if (!response.ok) {
      console.error('[useTaskMutation] Batch import failed:', response.status, response.statusText);
      throw new Error(`Failed to batch import tasks: ${response.status} ${response.statusText}`);
    }

    const result = await response.json() as { saved: number };
    console.log(`%c[useTaskMutation] BATCH IMPORT SUCCESS - ${result.saved} tasks saved`, 'background: #51cf66; color: white; font-weight: bold; padding: 4px 8px; border-radius: 4px;');
    return result.saved;
  };

  return { mutateTask, createTask, deleteTask, batchImportTasks };
}
