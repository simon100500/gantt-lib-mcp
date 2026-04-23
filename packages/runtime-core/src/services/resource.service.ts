import { randomUUID } from 'node:crypto';
import { getPrisma } from '../prisma.js';
import type { PrismaClient, ResourceType as PrismaResourceType } from '../prisma.js';
import type {
  CreateProjectResourceInput,
  ListProjectResourcesInput,
  ProjectResource,
  ResourceType,
  ResourceAssignmentValidationIssue,
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

type ResourceRow = {
  id: string;
  projectId: string;
  name: string;
  type: PrismaResourceType | ResourceType;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  deactivatedAt: Date | null;
};

type ResourcePrismaClient = {
  project: {
    findUnique(args: { where: { id: string }; select: { id: true } }): Promise<{ id: string } | null>;
  };
  resource: {
    findMany(args: {
      where: { projectId: string; isActive?: boolean };
      orderBy: Array<{ isActive?: 'asc' | 'desc' } | { name?: 'asc' | 'desc' } | { createdAt?: 'asc' | 'desc' }>;
    }): Promise<ResourceRow[]>;
    findFirst(args: {
      where: { id?: string; projectId: string; name?: string };
      select?: { id: true };
    }): Promise<{ id: string } | ResourceRow | null>;
    create(args: {
      data: {
        id: string;
        projectId: string;
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
        deactivatedAt?: Date | null;
      };
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

function toDomain(row: ResourceRow): ProjectResource {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    type: row.type as ResourceType,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deactivatedAt: row.deactivatedAt ? row.deactivatedAt.toISOString() : null,
  };
}

function requireTrimmed(value: string, field: 'projectId' | 'name'): string {
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

  private async assertProjectExists(projectId: string): Promise<void> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });

    if (!project) {
      throw new ResourceValidationError(`Project ${projectId} was not found`, {
        code: 'project_not_found',
        field: 'projectId',
      });
    }
  }

  private async assertNameAvailable(projectId: string, name: string, resourceId?: string): Promise<void> {
    const existing = await this.prisma.resource.findFirst({
      where: { projectId, name },
      select: { id: true },
    });

    if (existing && existing.id !== resourceId) {
      throw new ResourceValidationError(`Resource name "${name}" already exists in project ${projectId}`, {
        code: 'resource_name_conflict',
        field: 'name',
        detail: name,
      });
    }
  }

  async list({ projectId, includeInactive = false }: ListProjectResourcesInput): Promise<{ resources: ProjectResource[] }> {
    const normalizedProjectId = requireTrimmed(projectId, 'projectId');
    await this.assertProjectExists(normalizedProjectId);

    const resources = await this.prisma.resource.findMany({
      where: includeInactive ? { projectId: normalizedProjectId } : { projectId: normalizedProjectId, isActive: true },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }, { createdAt: 'asc' }],
    });

    return { resources: resources.map((resource) => toDomain(resource)) };
  }

  async create(input: CreateProjectResourceInput): Promise<ProjectResource> {
    const projectId = requireTrimmed(input.projectId, 'projectId');
    const name = requireTrimmed(input.name, 'name');
    const type = normalizeResourceType(input.type);

    await this.assertProjectExists(projectId);
    await this.assertNameAvailable(projectId, name);

    const created = await this.prisma.resource.create({
      data: {
        id: randomUUID(),
        projectId,
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

    await this.assertProjectExists(projectId);

    const existing = await this.prisma.resource.findFirst({
      where: { id: resourceId, projectId },
    });

    if (!existing) {
      throw new ResourceValidationError(`Resource ${resourceId} was not found in project ${projectId}`, {
        code: 'resource_not_found',
        field: 'resourceId',
      });
    }

    if (nextName !== undefined) {
      await this.assertNameAvailable(projectId, nextName, existing.id);
    }

    const nextIsActive = input.isActive;
    const updated = await this.prisma.resource.update({
      where: { id: existing.id },
      data: {
        ...(nextName !== undefined ? { name: nextName } : {}),
        ...(nextType !== undefined ? { type: nextType } : {}),
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
}

export const resourceService = new ResourceService();
