/**
 * ProjectService: Project CRUD operations using Prisma
 *
 * Provides type-safe project management with Prisma Client.
 * All operations replace raw SQL queries from auth-store.ts.
 */

import { getPrisma } from '../prisma.js';
import type { Project } from '../types.js';
import { randomUUID } from 'node:crypto';
import { ensureSystemDefaultCalendar, loadEffectiveCalendarDays } from './projectScheduleOptions.js';

export class ProjectService {
  private prisma = getPrisma();

  /**
   * Convert Prisma Project to domain Project
   * Handles DateTime → string conversion for createdAt
   */
  private async projectToDomain(project: any): Promise<Project> {
    const calendarDays = await loadEffectiveCalendarDays(this.prisma, project.calendarId ?? null);
    return {
      id: project.id,
      userId: project.userId,
      name: project.name,
      ganttDayMode: project.ganttDayMode,
      calendarId: project.calendarId ?? null,
      calendarDays,
      createdAt: project.createdAt.toISOString(),
    };
  }

  /**
   * Create a new project for a user
   *
   * @param userId - User ID to create project for
   * @param name - Project name
   * @returns Newly created Project
   */
  async create(userId: string, name: string): Promise<Project> {
    const calendarId = await ensureSystemDefaultCalendar(this.prisma);
    const project = await this.prisma.project.create({
      data: {
        id: randomUUID(),
        userId,
        name,
        ganttDayMode: 'business',
        calendarId,
      },
    });

    return this.projectToDomain(project);
  }

  /**
   * Create default project for a new user
   *
   * @param userId - User ID to create default project for
   * @returns Newly created default Project
   */
  async createDefaultProject(userId: string): Promise<Project> {
    return this.create(userId, 'Default Project');
  }

  /**
   * Get a project by ID
   *
   * @param projectId - Project ID to find
   * @returns Project if found, null otherwise
   */
  async findById(projectId: string): Promise<Project | null> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) return null;

    return this.projectToDomain(project);
  }

  /**
   * List all projects for a user with task counts
   *
   * Uses Prisma's _count feature for efficient aggregation.
   *
   * @param userId - User ID to list projects for
   * @returns Array of projects with task counts, ordered by creation date
   */
  async listByUser(userId: string): Promise<Array<Project & { taskCount: number }>> {
    const projects = await this.prisma.project.findMany({
      where: { userId },
      include: {
        _count: {
          select: { tasks: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return Promise.all(projects.map(async (project) => ({
      ...(await this.projectToDomain(project)),
      taskCount: project._count.tasks,
    })));
  }

  /**
   * Update project settings
   *
   * Verifies project belongs to user before updating.
   *
   * @param projectId - Project ID to update
   * @param userId - User ID for ownership verification
   * @param updates - New project fields
   * @returns Updated Project if found and owned, null otherwise
   */
  async update(
    projectId: string,
    userId: string,
    updates: { name?: string; ganttDayMode?: 'business' | 'calendar'; calendarId?: string | null },
  ): Promise<Project | null> {
    // Verify ownership
    const existing = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { userId: true },
    });

    if (!existing || existing.userId !== userId) {
      return null;
    }

    let resolvedCalendarId = updates.calendarId;
    if (updates.calendarId !== undefined && updates.calendarId !== null) {
      const calendar = await this.prisma.workCalendar.findUnique({
        where: { id: updates.calendarId },
        select: { id: true, scope: true, projectId: true },
      });

      if (!calendar) {
        return null;
      }

      if (calendar.scope === 'project' && calendar.projectId !== projectId) {
        return null;
      }

      resolvedCalendarId = calendar.id;
    }

    const updated = await this.prisma.project.update({
      where: { id: projectId },
      data: {
        ...(updates.name !== undefined ? { name: updates.name } : {}),
        ...(updates.ganttDayMode !== undefined ? { ganttDayMode: updates.ganttDayMode } : {}),
        ...(updates.calendarId !== undefined ? { calendarId: resolvedCalendarId } : {}),
      },
    });

    return this.projectToDomain(updated);
  }

  /**
   * Delete a project
   *
   * Verifies project belongs to user before deleting.
   * Cascade deletes tasks, sessions, messages via Prisma schema.
   *
   * @param projectId - Project ID to delete
   * @param userId - User ID for ownership verification
   * @returns true if deleted, false if not found or not owned
   */
  async delete(projectId: string, userId: string): Promise<boolean> {
    // Verify ownership
    const existing = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { userId: true },
    });

    if (!existing || existing.userId !== userId) {
      return false;
    }

    await this.prisma.project.delete({
      where: { id: projectId },
    });

    return true;
  }
}

/**
 * Singleton ProjectService instance
 */
export const projectService = new ProjectService();
