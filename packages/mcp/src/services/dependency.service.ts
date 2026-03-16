/**
 * DependencyService - Prisma-backed dependency CRUD operations
 *
 * Provides type-safe dependency management using Prisma Client.
 * All operations use Prisma queries with no raw SQL.
 */

import { getPrisma } from '../prisma.js';
import type { TaskDependency } from '../types.js';

export class DependencyService {
  private prisma = getPrisma();

  /**
   * Create multiple dependencies for a task
   * Uses createMany for batch insert (Prisma feature)
   */
  async createMany(taskId: string, dependencies: TaskDependency[]): Promise<void> {
    if (dependencies.length === 0) return;

    await this.prisma.dependency.createMany({
      data: dependencies.map(dep => ({
        taskId,
        depTaskId: dep.taskId,
        type: dep.type,
        lag: dep.lag ?? 0,
      })),
    });
  }

  /**
   * Delete all dependencies for a task
   * Called before updating dependencies in TaskService.update()
   */
  async deleteByTaskId(taskId: string): Promise<void> {
    await this.prisma.dependency.deleteMany({
      where: { taskId },
    });
  }

  /**
   * List dependencies for a task
   * Converts Prisma Dependency model to TaskDependency domain type
   */
  async listByTaskId(taskId: string): Promise<TaskDependency[]> {
    const deps = await this.prisma.dependency.findMany({
      where: { taskId },
    });

    return deps.map(dep => ({
      taskId: dep.depTaskId,
      type: dep.type as TaskDependency['type'],
      lag: dep.lag,
    }));
  }

  /**
   * Validate that all dependency tasks exist
   * Throws Error if any dependency task is missing
   */
  async validateDependencies(dependencies: TaskDependency[]): Promise<void> {
    if (dependencies.length === 0) return;

    const taskIds = dependencies.map(d => d.taskId);
    const tasks = await this.prisma.task.findMany({
      where: { id: { in: taskIds } },
      select: { id: true },
    });

    const foundIds = new Set(tasks.map(t => t.id));
    const missing = taskIds.filter(id => !foundIds.has(id));

    if (missing.length > 0) {
      throw new Error(`Dependency references non-existent tasks: ${missing.join(', ')}`);
    }
  }
}

export const dependencyService = new DependencyService();
