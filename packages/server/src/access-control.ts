import type { FastifyReply, FastifyRequest } from 'fastify';
import { getPrisma } from '@gantt/runtime-core/prisma';

export type ProjectAccessRole = 'owner' | 'editor' | 'viewer';

export type AccessContext = {
  role: ProjectAccessRole;
  canEdit: boolean;
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
  return {
    role,
    canEdit: role !== 'viewer',
    ownerUserId,
    billingUserId: ownerUserId,
    groupId,
  };
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
    select: { role: true },
  });

  if (!member) {
    return null;
  }

  return toAccessContext(member.role === 'editor' ? 'editor' : 'viewer', group.userId, group.id);
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
  await requireCurrentProjectAccess(request, reply);
  if (reply.sent) {
    return;
  }

  if (!request.projectAccess?.canEdit) {
    reply.status(403).send({ error: 'Project is read-only for this user' });
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
