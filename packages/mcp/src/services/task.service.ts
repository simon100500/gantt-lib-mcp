/**
 * TaskService - Prisma-backed task read operations
 *
 * Mutations now flow through CommandService. This service remains only for
 * listing and loading task snapshots for read paths.
 */

import { getPrisma } from '../prisma.js';
import type { Task, TaskDependency } from '../types.js';
import { dateToDomain } from './types.js';

export class TaskService {
  private _prisma: ReturnType<typeof getPrisma> | undefined;

  private get prisma() {
    if (!this._prisma) {
      this._prisma = getPrisma();
    }
    return this._prisma;
  }

  private taskToDomain(task: any, dependencies: TaskDependency[] = []): Task {
    return {
      id: task.id,
      name: task.name,
      startDate: dateToDomain(task.startDate),
      endDate: dateToDomain(task.endDate),
      type: task.type ?? 'task',
      color: task.color || undefined,
      parentId: task.parentId || undefined,
      progress: task.progress,
      dependencies,
      sortOrder: task.sortOrder,
    };
  }

  /**
   * List tasks by project ID with pagination.
   */
  async list(
    projectId?: string,
    parentId?: string | null,
    limit: number = 100,
    offset: number = 0,
  ): Promise<{ tasks: Task[]; hasMore: boolean; total: number }> {
    if (limit < 1 || limit > 1000) {
      throw new Error('limit must be between 1 and 1000');
    }
    if (offset < 0) {
      throw new Error('offset must be >= 0');
    }

    const whereClause: Record<string, unknown> = {};
    if (projectId) whereClause.projectId = projectId;
    if (parentId !== undefined) whereClause.parentId = parentId;

    const where = Object.keys(whereClause).length > 0 ? whereClause : undefined;

    const total = await this.prisma.task.count({ where });
    const tasks = await this.prisma.task.findMany({
      where,
      include: { dependencies: true },
      orderBy: { sortOrder: 'asc' },
      take: limit,
      skip: offset,
    });

    return {
      tasks: tasks.map((task) => this.taskToDomain(
        task,
        task.dependencies.map((dependency) => ({
          taskId: dependency.depTaskId,
          type: dependency.type as TaskDependency['type'],
          lag: dependency.lag,
        })),
      )),
      hasMore: offset + limit < total,
      total,
    };
  }

  /**
   * Get a task by ID with dependencies and optional children.
   */
  async get(id: string, includeChildren: boolean | 'shallow' | 'deep' = false): Promise<Task | undefined> {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: { dependencies: true },
    });

    if (!task) return undefined;

    const result = this.taskToDomain(
      task,
      task.dependencies.map((dependency) => ({
        taskId: dependency.depTaskId,
        type: dependency.type as TaskDependency['type'],
        lag: dependency.lag,
      })),
    );

    if (includeChildren === false) {
      return result;
    }

    const childTasks = await this.prisma.task.findMany({
      where: { parentId: id },
      include: { dependencies: true },
      orderBy: { sortOrder: 'asc' },
    });

    const children = childTasks.map((child) => this.taskToDomain(
      child,
      child.dependencies.map((dependency) => ({
        taskId: dependency.depTaskId,
        type: dependency.type as TaskDependency['type'],
        lag: dependency.lag,
      })),
    ));

    if (includeChildren === 'deep') {
      for (const child of children) {
        const nested = await this.get(child.id, 'deep');
        if (nested?.children) {
          child.children = nested.children;
        }
      }
    }

    if (children.length > 0) {
      result.children = children;
    }

    return result;
  }
}

export const taskService = new TaskService();
