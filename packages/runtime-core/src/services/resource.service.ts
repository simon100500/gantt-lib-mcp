import { randomUUID } from 'node:crypto';
import { getPrisma } from '../prisma.js';
import type { PrismaClient, ResourceType as PrismaResourceType } from '../prisma.js';
import type {
  CreateProjectResourceInput,
  DeleteProjectResourceInput,
  DeleteProjectResourceResponse,
  ListProjectResourcesInput,
  ProjectResource,
  ResourceAssignmentValidationIssue,
  ResourceScope,
  ResourceType,
  UpdateProjectResourceInput,
} from '../types.js';

export class ResourceValidationError extends Error {
  readonly code = 'validation_error';
  readonly issue: ResourceAssignmentValidationIssue;

  constructor(message: string, issue: ResourceAssignmentValidationIssue) {
    super(message);
    this.name = 'ResourceValidationError';
    this.issue = issue;
  }
}

type ProjectOwnerRow = {
  id: string;
  userId: string;
  groupId: string;
};

type ResourceRow = {
  id: string;
  userId: string;
  projectId: string | null;
  projectGroupId: string | null;
  name: string;
  type: PrismaResourceType | ResourceType;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  deactivatedAt: Date | null;
};

type ProjectOwnerSelection = { id: string; userId: string; groupId: string };
type ResourceIdSelection = { id: string };

type ResourceFindFirstArgs = {
  where: {
    id?: string;
    userId?: string;
    name?: string;
    OR?: Array<{ projectGroupId: string } | { projectId: string }>;
    projectId?: string | null;
    projectGroupId?: string | null;
  };
  select?: { id: true };
};

type ResourcePrismaClient = {
  project: {
    findUnique(args: { where: { id: string }; select: { id: true; userId: true; groupId: true } }): Promise<ProjectOwnerSelection | null>;
  };
  resource: {
    findMany(args: {
      where: {
        userId: string;
        isActive?: boolean;
        OR: Array<{ projectGroupId: string } | { projectId: string }>;
      };
      orderBy: Array<{ isActive?: 'asc' | 'desc' } | { name?: 'asc' | 'desc' } | { createdAt?: 'asc' | 'desc' }>;
    }): Promise<ResourceRow[]>;
    findFirst(args: ResourceFindFirstArgs): Promise<ResourceIdSelection | ResourceRow | null>;
    create(args: {
      data: {
        id: string;
        userId: string;
        projectId: string | null;
        projectGroupId: string | null;
        name: string;
        type: PrismaResourceType;
      };
    }): Promise<ResourceRow>;
    update(args: {
      where: { id: string };
      data: {
        name?: string;
        type?: PrismaResourceType;
        isActive?: boolean;
        projectId?: string | null;
        projectGroupId?: string | null;
        deactivatedAt?: Date | null;
      };
    }): Promise<ResourceRow>;
    delete(args: {
      where: { id: string };
    }): Promise<ResourceRow>;
  };
};

type ResourceServiceDeps = {
  prisma?: ResourcePrismaClient;
};

function adaptPrismaClient(prisma: PrismaClient): ResourcePrismaClient {
  return prisma as unknown as ResourcePrismaClient;
}

function normalizeResourceType(type?: ResourceType): PrismaResourceType {
  switch (type) {
    case undefined:
    case 'human':
      return 'human';
    case 'equipment':
    case 'material':
    case 'other':
      return type;
    default:
      throw new ResourceValidationError(`Unsupported resource type: ${String(type)}`, {
        code: 'invalid_input',
        field: 'type',
      });
  }
}

function normalizeScope(scope?: ResourceScope): ResourceScope {
  switch (scope) {
    case undefined:
    case 'project':
    case 'shared':
      return scope ?? 'project';
    default:
      throw new ResourceValidationError(`Unsupported resource scope: ${String(scope)}`, {
        code: 'invalid_input',
        field: 'type',
      });
  }
}

function toDomain(row: ResourceRow): ProjectResource {
  return {
    id: row.id,
    userId: row.userId,
    projectId: row.projectId,
    projectGroupId: row.projectGroupId,
    scope: row.projectId === null ? 'shared' : 'project',
    name: row.name,
    type: row.type as ResourceType,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deactivatedAt: row.deactivatedAt ? row.deactivatedAt.toISOString() : null,
  };
}

function requireTrimmed(value: string, field: 'projectId' | 'resourceId' | 'name'): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new ResourceValidationError(`${field} is required`, {
      code: 'invalid_input',
      field,
    });
  }
  return normalized;
}

export class ResourceService {
  private _prisma?: ResourcePrismaClient;

  constructor(deps: ResourceServiceDeps = {}) {
    this._prisma = deps.prisma;
  }

  private get prisma(): ResourcePrismaClient {
    if (!this._prisma) {
      this._prisma = adaptPrismaClient(getPrisma());
    }
    return this._prisma;
  }

  private async getWorkspaceBoundaryProject(projectId: string): Promise<ProjectOwnerRow> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, userId: true, groupId: true },
    });

    if (!project) {
      throw new ResourceValidationError(`Project ${projectId} was not found`, {
        code: 'project_not_found',
        field: 'projectId',
      });
    }

    return project;
  }

  private async assertNameAvailable(
    userId: string,
    ownership: { projectId: string; projectGroupId: null } | { projectId: null; projectGroupId: string },
    name: string,
    resourceId?: string,
  ): Promise<void> {
    const existing = await this.prisma.resource.findFirst({
      where: {
        userId,
        name,
        projectId: ownership.projectId,
        projectGroupId: ownership.projectGroupId,
      },
      select: { id: true },
    });

    if (existing && existing.id !== resourceId) {
      throw new ResourceValidationError(`Resource name "${name}" already exists in this ownership scope`, {
        code: 'resource_name_conflict',
        field: 'name',
        detail: name,
      });
    }
  }

  async list({ projectId, includeInactive = false }: ListProjectResourcesInput): Promise<{ resources: ProjectResource[] }> {
    const normalizedProjectId = requireTrimmed(projectId, 'projectId');
    const project = await this.getWorkspaceBoundaryProject(normalizedProjectId);

    const resources = await this.prisma.resource.findMany({
      where: includeInactive
        ? { userId: project.userId, OR: [{ projectGroupId: project.groupId }, { projectId: normalizedProjectId }] }
        : { userId: project.userId, isActive: true, OR: [{ projectGroupId: project.groupId }, { projectId: normalizedProjectId }] },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }, { createdAt: 'asc' }],
    });

    return { resources: resources.map((resource) => toDomain(resource)) };
  }

  async create(input: CreateProjectResourceInput): Promise<ProjectResource> {
    const projectId = requireTrimmed(input.projectId, 'projectId');
    const name = requireTrimmed(input.name, 'name');
    const type = normalizeResourceType(input.type);
    const scope = normalizeScope(input.scope);

    const project = await this.getWorkspaceBoundaryProject(projectId);
    const ownership = scope === 'shared'
      ? { projectId: null, projectGroupId: project.groupId }
      : { projectId: project.id, projectGroupId: null };
    await this.assertNameAvailable(project.userId, ownership, name);

    const created = await this.prisma.resource.create({
      data: {
        id: randomUUID(),
        userId: project.userId,
        projectId: ownership.projectId,
        projectGroupId: ownership.projectGroupId,
        name,
        type,
      },
    });

    return toDomain(created);
  }

  async update(input: UpdateProjectResourceInput): Promise<ProjectResource> {
    const projectId = requireTrimmed(input.projectId, 'projectId');
    const resourceId = requireTrimmed(input.resourceId, 'resourceId');
    const nextName = input.name === undefined ? undefined : requireTrimmed(input.name, 'name');
    const nextType = input.type === undefined ? undefined : normalizeResourceType(input.type);
    const nextScope = input.scope === undefined ? undefined : normalizeScope(input.scope);

    const project = await this.getWorkspaceBoundaryProject(projectId);

    const existing = await this.prisma.resource.findFirst({
      where: {
        id: resourceId,
        userId: project.userId,
        OR: [{ projectGroupId: project.groupId }, { projectId: project.id }],
      },
    }) as ResourceRow | null;

    if (!existing) {
      throw new ResourceValidationError(`Resource ${resourceId} was not found for project ${projectId}`, {
        code: 'resource_not_found',
        field: 'resourceId',
      });
    }

    const nextOwnership = nextScope === undefined
      ? { projectId: existing.projectId, projectGroupId: existing.projectGroupId }
      : nextScope === 'shared'
        ? { projectId: null, projectGroupId: project.groupId }
        : { projectId: project.id, projectGroupId: null };

    if (nextName !== undefined) {
      await this.assertNameAvailable(
        project.userId,
        nextOwnership.projectId === null
          ? { projectId: null, projectGroupId: nextOwnership.projectGroupId! }
          : { projectId: nextOwnership.projectId, projectGroupId: null },
        nextName,
        existing.id,
      );
    }

    const nextIsActive = input.isActive;
    const updated = await this.prisma.resource.update({
      where: { id: existing.id },
      data: {
        ...(nextName !== undefined ? { name: nextName } : {}),
        ...(nextType !== undefined ? { type: nextType } : {}),
        ...(nextScope !== undefined ? { projectId: nextOwnership.projectId, projectGroupId: nextOwnership.projectGroupId } : {}),
        ...(nextIsActive !== undefined
          ? {
              isActive: nextIsActive,
              deactivatedAt: nextIsActive ? null : existing.deactivatedAt ?? new Date(),
            }
          : {}),
      },
    });

    return toDomain(updated);
  }

  async deactivate(projectId: string, resourceId: string): Promise<ProjectResource> {
    return this.update({ projectId, resourceId, isActive: false });
  }

  async delete(input: DeleteProjectResourceInput): Promise<DeleteProjectResourceResponse> {
    const projectId = requireTrimmed(input.projectId, 'projectId');
    const resourceId = requireTrimmed(input.resourceId, 'resourceId');
    const project = await this.getWorkspaceBoundaryProject(projectId);

    const existing = await this.prisma.resource.findFirst({
      where: {
        id: resourceId,
        userId: project.userId,
        OR: [{ projectGroupId: project.groupId }, { projectId: project.id }],
      },
      select: { id: true },
    });

    if (!existing) {
      throw new ResourceValidationError(`Resource ${resourceId} was not found for project ${projectId}`, {
        code: 'resource_not_found',
        field: 'resourceId',
      });
    }

    const deleted = await this.prisma.resource.delete({
      where: { id: existing.id },
    });

    return { id: deleted.id };
  }
}

export const resourceService = new ResourceService();
