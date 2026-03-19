/**
 * DependencyService - Prisma-backed dependency CRUD operations
 *
 * Provides type-safe dependency management using Prisma Client.
 * All operations use Prisma queries with no raw SQL.
 */

import { getPrisma } from '../prisma.js';
import type { TaskDependency } from '../types.js';

export class DependencyService {
  private _prisma: ReturnType<typeof getPrisma> | undefined;

  private get prisma() {
    if (!this._prisma) {
      this._prisma = getPrisma();
    }
    return this._prisma;
  }

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
   * Delete all dependencies for a task (where taskId is the source)
   * Called before updating dependencies in TaskService.update()
   */
  async deleteByTaskId(taskId: string): Promise<void> {
    await this.prisma.dependency.deleteMany({
      where: { taskId },
    });
  }

  /**
   * Delete dependencies that reference a task as their depTaskId (target)
   * Called when a task is deleted - other tasks depending on this task should have those deps removed
   */
  async deleteDependentOnTask(taskId: string): Promise<void> {
    await this.prisma.dependency.deleteMany({
      where: { depTaskId: taskId },
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

  /**
   * Clean up orphaned dependencies (dependencies referencing non-existent tasks)
   * Returns the count of cleaned up records
   */
  async cleanupOrphaned(): Promise<number> {
    // Find dependencies where depTaskId references a non-existent task
    const allDeps = await this.prisma.dependency.findMany({
      select: { id: true, depTaskId: true },
    });

    const depTaskIds = allDeps.map(d => d.depTaskId);
    const existingTasks = await this.prisma.task.findMany({
      where: { id: { in: depTaskIds } },
      select: { id: true },
    });

    const existingIds = new Set(existingTasks.map(t => t.id));
    const orphanedIds = allDeps
      .filter(d => !existingIds.has(d.depTaskId))
      .map(d => d.id);

    if (orphanedIds.length > 0) {
      await this.prisma.dependency.deleteMany({
        where: { id: { in: orphanedIds } },
      });
    }

    return orphanedIds.length;
  }
}

export const dependencyService = new DependencyService();
