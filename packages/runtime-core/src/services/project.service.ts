/**
 * ProjectService: Project CRUD operations using Prisma
 *
 * Provides type-safe project management with Prisma Client.
 * All operations replace raw SQL queries from auth-store.ts.
 */

import { getPrisma } from '../prisma.js';
import type { Project, ProjectGroup, ProjectSectionPermissions } from '../types.js';
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

  private permissionsFromMembership(membership: {
    scheduleAccess?: 'none' | 'view' | 'edit';
    resourcesAccess?: 'none' | 'view' | 'edit';
    financeAccess?: 'none' | 'view' | 'edit';
    role?: 'editor' | 'viewer';
  } | null | undefined): ProjectSectionPermissions {
    if (!membership) {
      return { schedule: 'edit', resources: 'edit', finance: 'edit' };
    }

    return {
      schedule: membership.scheduleAccess ?? (membership.role === 'viewer' ? 'view' : 'edit'),
      resources: membership.resourcesAccess ?? (membership.role === 'viewer' ? 'view' : 'edit'),
      finance: membership.financeAccess ?? (membership.role === 'viewer' ? 'view' : 'edit'),
    };
  }

  private roleFromPermissions(permissions: ProjectSectionPermissions): 'editor' | 'viewer' {
    return permissions.schedule !== 'edit' && permissions.resources !== 'edit' && permissions.finance !== 'edit'
      ? 'viewer'
      : 'editor';
  }

  private groupToDomain(group: any): ProjectGroup {
    const permissions: ProjectSectionPermissions = group.accessRole === 'owner'
      ? { schedule: 'edit', resources: 'edit', finance: 'edit' }
      : this.permissionsFromMembership(group.members?.[0]);
    const membershipRole = this.roleFromPermissions(permissions);
    return {
      id: group.id,
      userId: group.userId,
      name: group.name,
      isDefault: group.isDefault,
      createdAt: group.createdAt.toISOString(),
      updatedAt: group.updatedAt.toISOString(),
      projectCount: group._count?.projects,
      accessRole: group.accessRole ?? membershipRole,
      permissions,
    };
  }

  async ensureDefaultGroup(userId: string): Promise<ProjectGroup> {
    const existing = await this.prisma.projectGroup.findFirst({
      where: { userId, isDefault: true },
    });

    if (existing) {
      return this.groupToDomain(existing);
    }

    const created = await this.prisma.projectGroup.create({
      data: {
        id: randomUUID(),
        userId,
        name: 'Проекты',
        isDefault: true,
      },
    });

    return this.groupToDomain(created);
  }

  async listGroupsByUser(userId: string): Promise<ProjectGroup[]> {
    const groups = await (this.prisma.projectGroup as any).findMany({
      where: {
        OR: [
          { userId },
          { members: { some: { userId } } },
        ],
      },
      include: {
        members: {
          where: { userId },
          select: { role: true, scheduleAccess: true, resourcesAccess: true, financeAccess: true },
        },
        _count: {
          select: { projects: true },
        },
      },
      orderBy: [
        { isDefault: 'desc' },
        { createdAt: 'asc' },
      ],
    });

    if (groups.length > 0) {
      return groups.map((group) => this.groupToDomain(group));
    }

    const defaultGroup = await this.ensureDefaultGroup(userId);
    return [defaultGroup];
  }

  async createGroup(userId: string, name: string): Promise<ProjectGroup> {
    const group = await this.prisma.projectGroup.create({
      data: {
        id: randomUUID(),
        userId,
        name,
        isDefault: false,
      },
      include: {
        _count: {
          select: { projects: true },
        },
      },
    });

    return this.groupToDomain(group);
  }

  async updateGroup(groupId: string, userId: string, updates: { name: string }): Promise<ProjectGroup | null> {
    const existing = await this.prisma.projectGroup.findFirst({
      where: { id: groupId, userId },
      select: { id: true },
    });

    if (!existing) {
      return null;
    }

    const group = await this.prisma.projectGroup.update({
      where: { id: groupId },
      data: { name: updates.name },
      include: {
        _count: {
          select: { projects: true },
        },
      },
    });

    return this.groupToDomain(group);
  }

  async deleteGroup(groupId: string, userId: string): Promise<{ ok: true } | { ok: false; reason: 'not_found' | 'default_group' | 'not_empty' }> {
    const existing = await this.prisma.projectGroup.findFirst({
      where: { id: groupId, userId },
      include: {
        _count: {
          select: { projects: true },
        },
      },
    });

    if (!existing) {
      return { ok: false, reason: 'not_found' };
    }

    if (existing.isDefault) {
      return { ok: false, reason: 'default_group' };
    }

    if (existing._count.projects > 0) {
      return { ok: false, reason: 'not_empty' };
    }

    await this.prisma.projectGroup.delete({ where: { id: groupId } });
    return { ok: true };
  }

  private async resolveCreateGroupId(userId: string, groupId?: string): Promise<string> {
    if (groupId?.trim()) {
      const group = await this.prisma.projectGroup.findFirst({
        where: { id: groupId.trim(), userId },
        select: { id: true },
      });
      if (group) {
        return group.id;
      }
    }

    return (await this.ensureDefaultGroup(userId)).id;
  }

  /**
   * Convert Prisma Project to domain Project
   * Handles DateTime → string conversion for createdAt
   */
  private async projectToDomain(project: any): Promise<Project> {
    const calendarDays = await loadEffectiveCalendarDays(this.prisma, project.calendarId ?? null);
    return {
      id: project.id,
      userId: project.userId,
      groupId: project.groupId,
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
  async create(userId: string, name: string, groupId?: string): Promise<Project> {
    const calendarId = await ensureSystemDefaultCalendar(this.prisma);
    const resolvedGroupId = await this.resolveCreateGroupId(userId, groupId);
    const project = await this.prisma.project.create({
      data: {
        id: randomUUID(),
        userId,
        groupId: resolvedGroupId,
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
    const projects = await (this.prisma.project as any).findMany({
      where: {
        OR: [
          { userId },
          { group: { members: { some: { userId } } } },
        ],
        status: { not: 'deleted' },
      },
      include: {
        group: {
          include: {
        members: {
          where: { userId },
          select: { role: true, scheduleAccess: true, resourcesAccess: true, financeAccess: true },
        },
          },
        },
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
      accessRole: project.userId === userId
        ? 'owner'
        : this.roleFromPermissions(this.permissionsFromMembership(project.group?.members?.[0])),
      permissions: project.userId === userId
        ? { schedule: 'edit', resources: 'edit', finance: 'edit' }
        : this.permissionsFromMembership(project.group?.members?.[0]),
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
    updates: { name?: string; ganttDayMode?: 'business' | 'calendar'; calendarId?: string | null; groupId?: string },
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

    let resolvedGroupId = updates.groupId;
    if (updates.groupId !== undefined) {
      const group = await this.prisma.projectGroup.findFirst({
        where: { id: updates.groupId, userId },
        select: { id: true },
      });

      if (!group) {
        return null;
      }

      resolvedGroupId = group.id;
    }

    const updated = await this.prisma.project.update({
      where: { id: projectId },
      data: {
        ...(updates.name !== undefined ? { name: updates.name } : {}),
        ...(updates.ganttDayMode !== undefined ? { ganttDayMode: updates.ganttDayMode } : {}),
        ...(updates.calendarId !== undefined ? { calendarId: resolvedCalendarId } : {}),
        ...(updates.groupId !== undefined ? { groupId: resolvedGroupId } : {}),
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
