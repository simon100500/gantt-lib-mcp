import { randomUUID } from 'node:crypto';
import { getPrisma } from '../prisma.js';
import type { PrismaClient } from '../prisma.js';
import type {
  ListTaskAssignmentsInput,
  ProjectResource,
  ReplaceTaskAssignmentsInput,
  ResourceAssignmentValidationIssue,
  TaskAssignmentDetails,
  TaskAssignmentRecord,
} from '../types.js';

export class AssignmentValidationError extends Error {
  readonly code = 'validation_error';
  readonly issue: ResourceAssignmentValidationIssue;

  constructor(message: string, issue: ResourceAssignmentValidationIssue) {
    super(message);
    this.name = 'AssignmentValidationError';
    this.issue = issue;
  }
}

type ProjectRow = { id: string };
type TaskRow = {
  id: string;
  projectId: string;
  parentId: string | null;
  children?: Array<{ id: string }>;
};
type ResourceRow = {
  id: string;
  projectId: string;
  name: string;
  type: ProjectResource['type'];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  deactivatedAt: Date | null;
};
type AssignmentRow = {
  id: string;
  projectId: string;
  taskId: string;
  resourceId: string;
  createdAt: Date;
  resource?: ResourceRow;
};

type AssignmentPrismaClient = {
  project: {
    findUnique(args: { where: { id: string }; select: { id: true } }): Promise<ProjectRow | null>;
  };
  task: {
    findUnique(args: {
      where: { id: string };
      include?: { children: { select: { id: true } } };
      select?: { id: true; projectId: true };
    }): Promise<TaskRow | { id: string; projectId: string } | null>;
  };
  resource: {
    findMany(args: {
      where: { projectId: string; id?: { in: string[] } };
      orderBy?: Array<{ name?: 'asc' | 'desc' }>;
    }): Promise<ResourceRow[]>;
  };
  taskAssignment: {
    findMany(args: {
      where: { projectId: string; taskId: string };
      include?: { resource: true };
      orderBy?: Array<{ createdAt?: 'asc' | 'desc' } | { resourceId?: 'asc' | 'desc' }>;
    }): Promise<AssignmentRow[]>;
    deleteMany(args: { where: { projectId: string; taskId: string; resourceId?: { in: string[] } } }): Promise<{ count: number }>;
    createMany(args: { data: Array<{ id: string; projectId: string; taskId: string; resourceId: string }>; skipDuplicates?: boolean }): Promise<{ count: number }>;
  };
  $transaction?<T>(fn: (tx: AssignmentPrismaClient) => Promise<T>): Promise<T>;
};

type AssignmentServiceDeps = {
  prisma?: AssignmentPrismaClient;
};

function adaptPrismaClient(prisma: PrismaClient): AssignmentPrismaClient {
  return prisma as unknown as AssignmentPrismaClient;
}

function requireTrimmed(value: string, field: 'projectId' | 'taskId'): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new AssignmentValidationError(`${field} is required`, {
      code: 'invalid_input',
      field,
    });
  }
  return normalized;
}

function toResource(resource: ResourceRow): ProjectResource {
  return {
    id: resource.id,
    projectId: resource.projectId,
    name: resource.name,
    type: resource.type,
    isActive: resource.isActive,
    createdAt: resource.createdAt.toISOString(),
    updatedAt: resource.updatedAt.toISOString(),
    deactivatedAt: resource.deactivatedAt ? resource.deactivatedAt.toISOString() : null,
  };
}

function toAssignment(row: AssignmentRow): TaskAssignmentRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    taskId: row.taskId,
    resourceId: row.resourceId,
    createdAt: row.createdAt.toISOString(),
  };
}

export class AssignmentService {
  private _prisma?: AssignmentPrismaClient;

  constructor(deps: AssignmentServiceDeps = {}) {
    this._prisma = deps.prisma;
  }

  private get prisma(): AssignmentPrismaClient {
    if (!this._prisma) {
      this._prisma = adaptPrismaClient(getPrisma());
    }
    return this._prisma;
  }

  private async assertProjectExists(projectId: string, prismaClient: AssignmentPrismaClient): Promise<void> {
    const project = await prismaClient.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });

    if (!project) {
      throw new AssignmentValidationError(`Project ${projectId} was not found`, {
        code: 'project_not_found',
        field: 'projectId',
      });
    }
  }

  private async loadTaskOrThrow(projectId: string, taskId: string, prismaClient: AssignmentPrismaClient): Promise<TaskRow> {
    const task = await prismaClient.task.findUnique({
      where: { id: taskId },
      include: {
        children: { select: { id: true } },
      },
    });

    if (!task) {
      throw new AssignmentValidationError(`Task ${taskId} was not found`, {
        code: 'task_not_found',
        field: 'taskId',
      });
    }

    if (task.projectId !== projectId) {
      throw new AssignmentValidationError(`Task ${taskId} does not belong to project ${projectId}`, {
        code: 'cross_project_mismatch',
        field: 'taskId',
      });
    }

    if ((task.children?.length ?? 0) > 0) {
      throw new AssignmentValidationError(`Task ${taskId} is not a leaf task`, {
        code: 'task_not_leaf',
        field: 'taskId',
      });
    }

    return task;
  }

  private normalizeResourceIds(resourceIds: string[]): string[] {
    const normalized = resourceIds.map((value) => value?.trim?.() ?? '').filter(Boolean);

    if (normalized.length !== resourceIds.length) {
      throw new AssignmentValidationError('resourceIds must not contain empty values', {
        code: 'invalid_input',
        field: 'resourceIds',
      });
    }

    const unique = new Set<string>();
    for (const resourceId of normalized) {
      if (unique.has(resourceId)) {
        throw new AssignmentValidationError(`Duplicate resource id ${resourceId} in assignment request`, {
          code: 'duplicate_resource_id',
          field: 'resourceIds',
          detail: resourceId,
        });
      }
      unique.add(resourceId);
    }

    return normalized;
  }

  private async assertResourcesAssignable(
    projectId: string,
    resourceIds: string[],
    prismaClient: AssignmentPrismaClient,
  ): Promise<ResourceRow[]> {
    if (resourceIds.length === 0) {
      return [];
    }

    const resources = await prismaClient.resource.findMany({
      where: {
        projectId,
        id: { in: resourceIds },
      },
    });

    const resourceById = new Map(resources.map((resource) => [resource.id, resource]));

    for (const resourceId of resourceIds) {
      const resource = resourceById.get(resourceId);
      if (!resource) {
        throw new AssignmentValidationError(`Resource ${resourceId} was not found in project ${projectId}`, {
          code: 'resource_not_found',
          field: 'resourceId',
          detail: resourceId,
        });
      }

      if (resource.projectId !== projectId) {
        throw new AssignmentValidationError(`Resource ${resourceId} does not belong to project ${projectId}`, {
          code: 'cross_project_mismatch',
          field: 'resourceId',
          detail: resourceId,
        });
      }

      if (!resource.isActive) {
        throw new AssignmentValidationError(`Resource ${resourceId} is inactive`, {
          code: 'resource_inactive',
          field: 'resourceId',
          detail: resourceId,
        });
      }
    }

    return resourceIds.map((resourceId) => resourceById.get(resourceId)!);
  }

  async list({ projectId, taskId }: ListTaskAssignmentsInput): Promise<TaskAssignmentDetails> {
    const normalizedProjectId = requireTrimmed(projectId, 'projectId');
    const normalizedTaskId = requireTrimmed(taskId, 'taskId');

    await this.assertProjectExists(normalizedProjectId, this.prisma);
    await this.loadTaskOrThrow(normalizedProjectId, normalizedTaskId, this.prisma);

    const assignments = await this.prisma.taskAssignment.findMany({
      where: { projectId: normalizedProjectId, taskId: normalizedTaskId },
      include: { resource: true },
      orderBy: [{ createdAt: 'asc' }, { resourceId: 'asc' }],
    });

    const resources = assignments
      .map((assignment) => assignment.resource)
      .filter((resource): resource is ResourceRow => Boolean(resource))
      .map((resource) => toResource(resource));

    return {
      taskId: normalizedTaskId,
      resources,
      assignments: assignments.map((assignment) => toAssignment(assignment)),
    };
  }

  async replaceForTask(input: ReplaceTaskAssignmentsInput): Promise<TaskAssignmentDetails> {
    const projectId = requireTrimmed(input.projectId, 'projectId');
    const taskId = requireTrimmed(input.taskId, 'taskId');
    const resourceIds = this.normalizeResourceIds(input.resourceIds ?? []);

    const run = async (prismaClient: AssignmentPrismaClient): Promise<TaskAssignmentDetails> => {
      await this.assertProjectExists(projectId, prismaClient);
      await this.loadTaskOrThrow(projectId, taskId, prismaClient);
      const requestedResources = await this.assertResourcesAssignable(projectId, resourceIds, prismaClient);

      const existingAssignments = await prismaClient.taskAssignment.findMany({
        where: { projectId, taskId },
        orderBy: [{ createdAt: 'asc' }, { resourceId: 'asc' }],
      });

      const existingIds = new Set(existingAssignments.map((assignment) => assignment.resourceId));
      const requestedIds = new Set(resourceIds);

      const toDelete = existingAssignments
        .map((assignment) => assignment.resourceId)
        .filter((resourceId) => !requestedIds.has(resourceId));
      const toCreate = resourceIds.filter((resourceId) => !existingIds.has(resourceId));

      if (toDelete.length > 0) {
        await prismaClient.taskAssignment.deleteMany({
          where: { projectId, taskId, resourceId: { in: toDelete } },
        });
      }

      if (toCreate.length > 0) {
        await prismaClient.taskAssignment.createMany({
          data: toCreate.map((resourceId) => ({
            id: randomUUID(),
            projectId,
            taskId,
            resourceId,
          })),
          skipDuplicates: true,
        });
      }

      const assignments = await prismaClient.taskAssignment.findMany({
        where: { projectId, taskId },
        include: { resource: true },
        orderBy: [{ createdAt: 'asc' }, { resourceId: 'asc' }],
      });

      const resourceById = new Map(requestedResources.map((resource) => [resource.id, resource]));
      const resources = assignments
        .map((assignment) => assignment.resource ?? resourceById.get(assignment.resourceId))
        .filter((resource): resource is ResourceRow => Boolean(resource))
        .map((resource) => toResource(resource));

      return {
        taskId,
        resources,
        assignments: assignments.map((assignment) => toAssignment(assignment)),
      };
    };

    return this.prisma.$transaction ? this.prisma.$transaction((tx) => run(tx)) : run(this.prisma);
  }
}

export const assignmentService = new AssignmentService();
