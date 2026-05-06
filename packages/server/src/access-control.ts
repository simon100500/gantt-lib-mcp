import type { FastifyReply, FastifyRequest } from 'fastify';
import { getPrisma } from '@gantt/runtime-core/prisma';
import type {
  ProjectAccessRole,
  ProjectSectionAccessLevel,
  ProjectSectionKey,
  ProjectSectionPermissions,
} from '@gantt/runtime-core/types';

export type AccessContext = {
  role: ProjectAccessRole;
  canEdit: boolean;
  permissions: ProjectSectionPermissions;
  ownerUserId: string;
  billingUserId: string;
  groupId: string;
};

let prismaGetter: typeof getPrisma = getPrisma;

declare module 'fastify' {
  interface FastifyRequest {
    projectAccess?: AccessContext;
  }
}

function toAccessContext(role: ProjectAccessRole, ownerUserId: string, groupId: string): AccessContext {
  const permissions = role === 'viewer'
    ? { schedule: 'view', resources: 'view', finance: 'view' } satisfies ProjectSectionPermissions
    : { schedule: 'edit', resources: 'edit', finance: 'edit' } satisfies ProjectSectionPermissions;
  return {
    role,
    canEdit: permissions.schedule === 'edit',
    permissions,
    ownerUserId,
    billingUserId: ownerUserId,
    groupId,
  };
}

function buildAccessContext(
  role: ProjectAccessRole,
  permissions: ProjectSectionPermissions,
  ownerUserId: string,
  groupId: string,
): AccessContext {
  return {
    role,
    canEdit: permissions.schedule === 'edit',
    permissions,
    ownerUserId,
    billingUserId: ownerUserId,
    groupId,
  };
}

function normalizeRoleFromPermissions(permissions: ProjectSectionPermissions): ProjectAccessRole {
  if (permissions.schedule === 'edit' && permissions.resources === 'edit' && permissions.finance === 'edit') {
    return 'editor';
  }

  if (permissions.schedule !== 'edit' && permissions.resources !== 'edit' && permissions.finance !== 'edit') {
    return 'viewer';
  }

  return 'editor';
}

function canAccessSection(
  permissions: ProjectSectionPermissions,
  section: ProjectSectionKey,
  level: ProjectSectionAccessLevel,
): boolean {
  if (permissions[section] === 'none') {
    return false;
  }

  return level === 'view' || permissions[section] === 'edit';
}

export function setAccessControlPrismaGetterForTests(getter: typeof getPrisma): void {
  prismaGetter = getter;
}

export function resetAccessControlPrismaGetterForTests(): void {
  prismaGetter = getPrisma;
}

export async function resolveGroupAccess(userId: string, groupId: string): Promise<AccessContext | null> {
  const prisma = prismaGetter();
  const group = await prisma.projectGroup.findUnique({
    where: { id: groupId },
    select: { id: true, userId: true },
  });

  if (!group) {
    return null;
  }

  if (group.userId === userId) {
    return toAccessContext('owner', group.userId, group.id);
  }

  const member = await prisma.projectGroupMember.findUnique({
    where: {
      groupId_userId: {
        groupId,
        userId,
      },
    },
    select: {
      role: true,
      scheduleAccess: true,
      resourcesAccess: true,
      financeAccess: true,
    },
  });

  if (!member) {
    return null;
  }

  const permissions: ProjectSectionPermissions = {
    schedule: member.scheduleAccess,
    resources: member.resourcesAccess,
    finance: member.financeAccess,
  };

  return buildAccessContext(normalizeRoleFromPermissions(permissions), permissions, group.userId, group.id);
}

export async function resolveProjectAccess(userId: string, projectId: string): Promise<AccessContext | null> {
  const project = await prismaGetter().project.findFirst({
    where: {
      id: projectId,
      status: { not: 'deleted' },
    },
    select: {
      userId: true,
      groupId: true,
    },
  });

  if (!project) {
    return null;
  }

  if (project.userId === userId) {
    return toAccessContext('owner', project.userId, project.groupId);
  }

  return resolveGroupAccess(userId, project.groupId);
}

export async function requireCurrentProjectAccess(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const user = request.user;
  if (!user) {
    reply.status(401).send({ error: 'Unauthorized' });
    return;
  }

  const access = await resolveProjectAccess(user.userId, user.projectId);
  if (!access) {
    reply.status(403).send({ error: 'Project access denied' });
    return;
  }

  request.projectAccess = access;
}

export async function requireCurrentProjectEditor(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  await requireCurrentProjectSection(request, reply, 'schedule', 'edit');
}

export async function requireCurrentProjectScheduleViewer(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  await requireCurrentProjectSection(request, reply, 'schedule', 'view');
}

export async function requireCurrentProjectScheduleEditor(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  await requireCurrentProjectSection(request, reply, 'schedule', 'edit');
}

export async function requireCurrentProjectResourcesViewer(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  await requireCurrentProjectSection(request, reply, 'resources', 'view');
}

export async function requireCurrentProjectResourcesEditor(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  await requireCurrentProjectSection(request, reply, 'resources', 'edit');
}

export async function requireCurrentProjectFinanceViewer(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  await requireCurrentProjectSection(request, reply, 'finance', 'view');
}

export async function requireCurrentProjectFinanceEditor(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  await requireCurrentProjectSection(request, reply, 'finance', 'edit');
}

export async function requireCurrentProjectSection(
  request: FastifyRequest,
  reply: FastifyReply,
  section: ProjectSectionKey,
  level: ProjectSectionAccessLevel,
): Promise<void> {
  await requireCurrentProjectAccess(request, reply);
  if (reply.sent) {
    return;
  }

  if (!request.projectAccess || !canAccessSection(request.projectAccess.permissions, section, level)) {
    reply.status(403).send({
      error: level === 'edit'
        ? `Project ${section} is read-only for this user`
        : `Project ${section} is hidden for this user`,
    });
  }
}

export async function requireCurrentProjectOwner(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  await requireCurrentProjectAccess(request, reply);
  if (reply.sent) {
    return;
  }

  if (request.projectAccess?.role !== 'owner') {
    reply.status(403).send({ error: 'Project owner access required' });
  }
}
