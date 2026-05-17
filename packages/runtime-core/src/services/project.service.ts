/**
 * ProjectService: Project CRUD operations using Prisma
 *
 * Provides type-safe project management with Prisma Client.
 * All operations replace raw SQL queries from auth-store.ts.
 */

import { Prisma, getPrisma } from '../prisma.js';
import type {
  CalendarDayKind,
  CalendarWeeklyPattern,
  EffectiveCalendarDay,
  Project,
  ProjectGroup,
  ProjectSectionPermissions,
  ProjectViewPreference,
  TimelineMarker,
} from '../types.js';
import { randomUUID } from 'node:crypto';
import {
  calendarWeeklyPatternEquals,
  ensureSystemDefaultCalendar,
  loadCalendarWeeklyPattern,
  loadEffectiveCalendarDays,
  normalizeCalendarWeeklyPattern,
} from './projectScheduleOptions.js';

export type ArchiveProjectResult =
  | { ok: true; project: Project }
  | { ok: false; reason: 'not_found' | 'already_archived' };

export type RestoreProjectResult =
  | { ok: true; project: Project }
  | { ok: false; reason: 'not_found' | 'not_archived' };

export type SoftDeleteProjectResult =
  | { ok: true }
  | { ok: false; reason: 'not_found' };

const KNOWN_TASK_LIST_COLUMN_IDS = new Set([
  'number',
  'name',
  'startDate',
  'endDate',
  'duration',
  'work-volume',
  'completed-volume',
  'status',
  'progress',
  'assigned-resources',
  'dependencies',
]);

function normalizeHiddenTaskListColumns(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (typeof entry !== 'string') {
      return [];
    }
    const normalized = entry.trim();
    return normalized && KNOWN_TASK_LIST_COLUMN_IDS.has(normalized) ? [normalized] : [];
  });
}

function normalizeCalendarDays(days: EffectiveCalendarDay[]): EffectiveCalendarDay[] {
  const normalizedByDate = new Map<string, CalendarDayKind>();
  for (const day of days) {
    const date = day.date.trim().slice(0, 10);
    if (!date) {
      continue;
    }
    normalizedByDate.set(date, day.kind);
  }

  return Array.from(normalizedByDate.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, kind]) => ({ date, kind }));
}

function calendarDaysEqual(left: EffectiveCalendarDay[], right: EffectiveCalendarDay[]): boolean {
  const normalizedLeft = normalizeCalendarDays(left);
  const normalizedRight = normalizeCalendarDays(right);
  return JSON.stringify(normalizedLeft) === JSON.stringify(normalizedRight);
}

export class ProjectService {
  private prisma = getPrisma();

  private normalizeTimelineMarkers(value: unknown): TimelineMarker[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.flatMap((entry) => {
      if (!entry || typeof entry !== 'object') {
        return [];
      }

      const marker = entry as Partial<TimelineMarker>;
      const date = typeof marker.date === 'string' ? marker.date.trim().slice(0, 10) : '';
      if (!date) {
        return [];
      }

      const normalized: TimelineMarker = { date };
      if (typeof marker.color === 'string' && marker.color.trim()) {
        normalized.color = marker.color.trim();
      }
      if (typeof marker.name === 'string' && marker.name.trim()) {
        normalized.name = marker.name.trim();
      }

      return [normalized];
    });
  }

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

  async deleteGroup(groupId: string, userId: string): Promise<{ ok: true } | { ok: false; reason: 'not_found' | 'default_group' }> {
    const existing = await this.prisma.projectGroup.findFirst({
      where: { id: groupId, userId },
      select: { id: true, isDefault: true },
    });

    if (!existing) {
      return { ok: false, reason: 'not_found' };
    }

    if (existing.isDefault) {
      return { ok: false, reason: 'default_group' };
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.project.deleteMany({
        where: {
          groupId,
          userId,
        },
      });

      await tx.projectGroup.delete({ where: { id: groupId } });
    });

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
    const [calendarWeeklyPattern, calendarDays] = await Promise.all([
      loadCalendarWeeklyPattern(this.prisma, project.calendarId ?? null),
      loadEffectiveCalendarDays(this.prisma, project.calendarId ?? null),
    ]);
    return {
      id: project.id,
      userId: project.userId,
      groupId: project.groupId,
      name: project.name,
      status: project.status,
      ganttDayMode: project.ganttDayMode,
      calendarId: project.calendarId ?? null,
      calendarWeeklyPattern,
      calendarDays,
      timelineMarkers: this.normalizeTimelineMarkers(project.timelineMarkers),
      hiddenTaskListColumnsDefault: project.hiddenTaskListColumnsDefault == null
        ? null
        : normalizeHiddenTaskListColumns(project.hiddenTaskListColumnsDefault),
      archivedAt: project.archivedAt ? project.archivedAt.toISOString() : null,
      deletedAt: project.deletedAt ? project.deletedAt.toISOString() : null,
      createdAt: project.createdAt.toISOString(),
    };
  }

  private viewPreferenceToDomain(preference: any): ProjectViewPreference {
    return {
      id: preference.id,
      userId: preference.userId,
      projectId: preference.projectId,
      hiddenTaskListColumns: preference.hiddenTaskListColumns == null
        ? null
        : normalizeHiddenTaskListColumns(preference.hiddenTaskListColumns),
      createdAt: preference.createdAt.toISOString(),
      updatedAt: preference.updatedAt.toISOString(),
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
    updates: {
      name?: string;
      ganttDayMode?: 'business' | 'calendar';
      calendarId?: string | null;
      calendarWeeklyPattern?: CalendarWeeklyPattern;
      calendarDays?: EffectiveCalendarDay[];
      groupId?: string;
      timelineMarkers?: TimelineMarker[];
      hiddenTaskListColumnsDefault?: string[] | null;
    },
  ): Promise<Project | null> {
    // Verify ownership
    const existing = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { userId: true, status: true, name: true, calendarId: true },
    });

    if (!existing || existing.userId !== userId || existing.status === 'deleted') {
      return null;
    }

    const updatesCalendarShape = updates.calendarWeeklyPattern !== undefined || updates.calendarDays !== undefined;
    let resolvedCalendarId = updates.calendarId;
    if (!updatesCalendarShape && updates.calendarId !== undefined && updates.calendarId !== null) {
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

    if (updatesCalendarShape) {
      const systemCalendarId = await ensureSystemDefaultCalendar(this.prisma);
      const [currentWeeklyPattern, currentCalendarDays, systemWeeklyPattern, systemCalendarDays] = await Promise.all([
        loadCalendarWeeklyPattern(this.prisma, existing.calendarId ?? systemCalendarId),
        loadEffectiveCalendarDays(this.prisma, existing.calendarId ?? systemCalendarId),
        loadCalendarWeeklyPattern(this.prisma, systemCalendarId),
        loadEffectiveCalendarDays(this.prisma, systemCalendarId),
      ]);

      const nextWeeklyPattern = normalizeCalendarWeeklyPattern(updates.calendarWeeklyPattern ?? currentWeeklyPattern);
      const nextCalendarDays = normalizeCalendarDays(updates.calendarDays ?? currentCalendarDays);
      const matchesSystemCalendar = calendarWeeklyPatternEquals(nextWeeklyPattern, systemWeeklyPattern)
        && calendarDaysEqual(nextCalendarDays, systemCalendarDays);

      if (updates.calendarId !== undefined && resolvedCalendarId === systemCalendarId && matchesSystemCalendar) {
        await this.deleteOwnedProjectCalendars(projectId);
        resolvedCalendarId = systemCalendarId;
      } else {
        resolvedCalendarId = await this.replaceProjectCalendar(
          projectId,
          updates.name?.trim() || existing.name,
          nextWeeklyPattern,
          nextCalendarDays,
        );
      }
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

    const data: Prisma.ProjectUncheckedUpdateInput = {
      ...(updates.name !== undefined ? { name: updates.name } : {}),
      ...(updates.ganttDayMode !== undefined ? { ganttDayMode: updates.ganttDayMode } : {}),
      ...(updates.calendarId !== undefined || updatesCalendarShape ? { calendarId: resolvedCalendarId } : {}),
      ...(updates.groupId !== undefined ? { groupId: resolvedGroupId } : {}),
      ...(updates.timelineMarkers !== undefined
        ? { timelineMarkers: updates.timelineMarkers as unknown as Prisma.InputJsonValue }
        : {}),
      ...(updates.hiddenTaskListColumnsDefault !== undefined
        ? {
            hiddenTaskListColumnsDefault: updates.hiddenTaskListColumnsDefault === null
              ? Prisma.DbNull
              : normalizeHiddenTaskListColumns(updates.hiddenTaskListColumnsDefault) as unknown as Prisma.InputJsonValue,
          }
        : {}),
    };

    const updated = await this.prisma.project.update({
      where: { id: projectId },
      data,
    });

    return this.projectToDomain(updated);
  }

  private async deleteOwnedProjectCalendars(projectId: string): Promise<void> {
    const ownedCalendars = await this.prisma.workCalendar.findMany({
      where: { projectId },
      select: { id: true },
    });

    if (ownedCalendars.length === 0) {
      return;
    }

    const ownedCalendarIds = ownedCalendars.map((calendar) => calendar.id);
    await this.prisma.calendarDay.deleteMany({ where: { calendarId: { in: ownedCalendarIds } } });
    await this.prisma.workCalendar.deleteMany({ where: { id: { in: ownedCalendarIds } } });
  }

  private async replaceProjectCalendar(
    projectId: string,
    projectName: string,
    weeklyPattern: CalendarWeeklyPattern,
    calendarDays: EffectiveCalendarDay[],
  ): Promise<string> {
    const ownedCalendars = await this.prisma.workCalendar.findMany({
      where: { projectId },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });

    const calendarId = ownedCalendars[0]?.id ?? randomUUID();
    const calendarData = {
      name: `${projectName} working calendar`,
      scope: 'project' as const,
      timezone: 'UTC',
      isDefault: false,
      mondayWorking: weeklyPattern.mon,
      tuesdayWorking: weeklyPattern.tue,
      wednesdayWorking: weeklyPattern.wed,
      thursdayWorking: weeklyPattern.thu,
      fridayWorking: weeklyPattern.fri,
      saturdayWorking: weeklyPattern.sat,
      sundayWorking: weeklyPattern.sun,
    };

    if (ownedCalendars[0]) {
      await this.prisma.workCalendar.update({
        where: { id: calendarId },
        data: calendarData,
      });
      await this.prisma.calendarDay.deleteMany({ where: { calendarId } });
    } else {
      await this.prisma.workCalendar.create({
        data: {
          id: calendarId,
          ...calendarData,
          projectId,
        },
      });
    }

    if (calendarDays.length > 0) {
      await this.prisma.calendarDay.createMany({
        data: calendarDays.map((day) => ({
          id: randomUUID(),
          calendarId,
          date: new Date(`${day.date}T00:00:00.000Z`),
          kind: day.kind,
          source: 'manual',
        })),
      });
    }

    if (ownedCalendars.length > 1) {
      const staleIds = ownedCalendars.slice(1).map((calendar) => calendar.id);
      await this.prisma.calendarDay.deleteMany({ where: { calendarId: { in: staleIds } } });
      await this.prisma.workCalendar.deleteMany({ where: { id: { in: staleIds } } });
    }

    return calendarId;
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

  async getViewPreference(projectId: string, userId: string): Promise<ProjectViewPreference | null> {
    const preference = await this.prisma.projectViewPreference.findUnique({
      where: {
        userId_projectId: {
          userId,
          projectId,
        },
      },
    });

    return preference ? this.viewPreferenceToDomain(preference) : null;
  }

  async upsertViewPreference(projectId: string, userId: string, hiddenTaskListColumns: string[]): Promise<ProjectViewPreference> {
    const preference = await this.prisma.projectViewPreference.upsert({
      where: {
        userId_projectId: {
          userId,
          projectId,
        },
      },
      update: {
        hiddenTaskListColumns: normalizeHiddenTaskListColumns(hiddenTaskListColumns) as unknown as Prisma.InputJsonValue,
      },
      create: {
        id: randomUUID(),
        userId,
        projectId,
        hiddenTaskListColumns: normalizeHiddenTaskListColumns(hiddenTaskListColumns) as unknown as Prisma.InputJsonValue,
      },
    });

    return this.viewPreferenceToDomain(preference);
  }

  async clearViewPreference(projectId: string, userId: string): Promise<void> {
    await this.prisma.projectViewPreference.deleteMany({
      where: {
        userId,
        projectId,
      },
    });
  }
}

/**
 * Singleton ProjectService instance
 */
export const projectService = new ProjectService();
