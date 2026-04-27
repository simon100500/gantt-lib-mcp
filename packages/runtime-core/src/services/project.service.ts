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

export type ArchiveProjectResult =
  | { ok: true; project: Project }
  | { ok: false; reason: 'not_found' | 'already_archived' };

export type RestoreProjectResult =
  | { ok: true; project: Project }
  | { ok: false; reason: 'not_found' | 'not_archived' };

export type SoftDeleteProjectResult =
  | { ok: true }
  | { ok: false; reason: 'not_found' };

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
      status: project.status,
      ganttDayMode: project.ganttDayMode,
      calendarId: project.calendarId ?? null,
      calendarDays,
      archivedAt: project.archivedAt ? project.archivedAt.toISOString() : null,
      deletedAt: project.deletedAt ? project.deletedAt.toISOString() : null,
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
        ganttDayMode: 'calendar',
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
    return this.create(userId, 'Первый проект');
  }

  /**
   * Get a project by ID
   *
   * @param projectId - Project ID to find
   * @returns Project if found, null otherwise
   */
  async findById(projectId: string): Promise<Project | null> {
    const project = await this.prisma.project.findFirst({
      where: {
        id: projectId,
        status: { not: 'deleted' },
      },
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
      where: {
        userId,
        status: { not: 'deleted' },
      },
      include: {
        _count: {
          select: { tasks: true },
        },
      },
      orderBy: [
        { status: 'asc' },
        { createdAt: 'asc' },
      ],
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
      select: { userId: true, status: true },
    });

    if (!existing || existing.userId !== userId || existing.status === 'deleted') {
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

  async archive(projectId: string, userId: string): Promise<ArchiveProjectResult> {
    const existing = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { userId: true, status: true },
    });

    if (!existing || existing.userId !== userId) {
      return { ok: false, reason: 'not_found' };
    }

    if (existing.status === 'archived') {
      return { ok: false, reason: 'already_archived' };
    }

    const archived = await this.prisma.project.update({
      where: { id: projectId },
      data: {
        status: 'archived',
        archivedAt: new Date(),
      },
    });

    return {
      ok: true,
      project: await this.projectToDomain(archived),
    };
  }

  async restore(projectId: string, userId: string): Promise<RestoreProjectResult> {
    const existing = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { userId: true, status: true },
    });

    if (!existing || existing.userId !== userId) {
      return { ok: false, reason: 'not_found' };
    }

    if (existing.status !== 'archived') {
      return { ok: false, reason: 'not_archived' };
    }

    const restored = await this.prisma.project.update({
      where: { id: projectId },
      data: {
        status: 'active',
        archivedAt: null,
      },
    });

    return {
      ok: true,
      project: await this.projectToDomain(restored),
    };
  }

  async softDelete(projectId: string, userId: string): Promise<SoftDeleteProjectResult> {
    const existing = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { userId: true, status: true },
    });

    if (!existing || existing.userId !== userId) {
      return { ok: false, reason: 'not_found' };
    }

    await this.prisma.project.update({
      where: { id: projectId },
      data: {
        status: 'deleted',
        deletedAt: new Date(),
      },
    });

    return { ok: true };
  }
}

/**
 * Singleton ProjectService instance
 */
export const projectService = new ProjectService();
