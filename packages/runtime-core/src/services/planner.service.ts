import { getPrisma } from '../prisma.js';
import type { PrismaClient } from '../prisma.js';
import type {
  GetResourcePlannerInput,
  ResourceAssignmentValidationIssue,
  ResourcePlannerInterval,
  ResourcePlannerResource,
  ResourcePlannerResult,
} from '../types.js';

export class PlannerValidationError extends Error {
  readonly code = 'validation_error';
  readonly issue: ResourceAssignmentValidationIssue;

  constructor(message: string, issue: ResourceAssignmentValidationIssue) {
    super(message);
    this.name = 'PlannerValidationError';
    this.issue = issue;
  }
}

type ProjectOwnerRow = {
  id: string;
  userId: string;
};

type PlannerProjectRow = {
  id: string;
  name: string;
  userId: string;
};

type PlannerAssignmentRow = {
  id: string;
  createdAt: Date;
  projectId: string;
  taskId: string;
  resource: {
    id: string;
    projectId: string | null;
    userId: string;
    name: string;
    isActive: boolean;
  } | null;
  task: {
    id: string;
    name: string;
    projectId: string;
    startDate: Date;
    endDate: Date;
    project: {
      id: string;
      name: string;
      userId: string;
    } | null;
  } | null;
};

type PlannerPrismaClient = {
  project: {
    findUnique(args: { where: { id: string }; select: { id: true; userId: true } }): Promise<ProjectOwnerRow | null>;
    findMany(args: {
      where: { userId: string; status?: { not: 'deleted' } };
      select: { id: true; name: true; userId: true };
      orderBy?: Array<{ createdAt?: 'asc' | 'desc' } | { name?: 'asc' | 'desc' }>;
    }): Promise<PlannerProjectRow[]>;
  };
  taskAssignment: {
    findMany(args: {
      where: {
        projectId: { in: string[] };
        resource: {
          userId: string;
          projectId: null;
        };
      };
      select: {
        id: true;
        createdAt: true;
        projectId: true;
        taskId: true;
        resource: { select: { id: true; projectId: true; userId: true; name: true; isActive: true } };
        task: {
          select: {
            id: true;
            name: true;
            projectId: true;
            startDate: true;
            endDate: true;
            project: { select: { id: true; name: true; userId: true } };
          };
        };
      };
      orderBy?: Array<
        | { resourceId?: 'asc' | 'desc' }
        | { projectId?: 'asc' | 'desc' }
        | { taskId?: 'asc' | 'desc' }
        | { createdAt?: 'asc' | 'desc' }
      >;
    }): Promise<PlannerAssignmentRow[]>;
  };
};

type PlannerServiceDeps = {
  prisma?: PlannerPrismaClient;
};

function adaptPrismaClient(prisma: PrismaClient): PlannerPrismaClient {
  return prisma as unknown as PlannerPrismaClient;
}

function requireTrimmed(value: string, field: 'projectId'): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new PlannerValidationError(`${field} is required`, {
      code: 'invalid_input',
      field,
    });
  }
  return normalized;
}

function toIsoDate(value: Date): string {
  return value.toISOString().split('T')[0]!;
}

export class PlannerService {
  private _prisma?: PlannerPrismaClient;

  constructor(deps: PlannerServiceDeps = {}) {
    this._prisma = deps.prisma;
  }

  private get prisma(): PlannerPrismaClient {
    if (!this._prisma) {
      this._prisma = adaptPrismaClient(getPrisma());
    }
    return this._prisma;
  }

  private async getWorkspaceBoundaryProject(projectId: string): Promise<ProjectOwnerRow> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, userId: true },
    });

    if (!project) {
      throw new PlannerValidationError(`Project ${projectId} was not found`, {
        code: 'project_not_found',
        field: 'projectId',
      });
    }

    return project;
  }

  async getResourcePlanner(input: GetResourcePlannerInput): Promise<ResourcePlannerResult> {
    const projectId = requireTrimmed(input.projectId, 'projectId');
    const currentProject = await this.getWorkspaceBoundaryProject(projectId);

    const workspaceProjects = await this.prisma.project.findMany({
      where: {
        userId: currentProject.userId,
        status: { not: 'deleted' },
      },
      select: { id: true, name: true, userId: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' } as never],
    });

    const workspaceProjectIds = workspaceProjects.map((project) => project.id);
    if (!workspaceProjectIds.includes(projectId)) {
      throw new PlannerValidationError(`Project ${projectId} does not resolve inside its workspace boundary`, {
        code: 'planner_scope_invalid',
        field: 'projectId',
        detail: projectId,
      });
    }

    const plannerRows = await this.prisma.taskAssignment.findMany({
      where: {
        projectId: { in: workspaceProjectIds },
        resource: {
          userId: currentProject.userId,
          projectId: null,
        },
      },
      select: {
        id: true,
        createdAt: true,
        projectId: true,
        taskId: true,
        resource: {
          select: {
            id: true,
            projectId: true,
            userId: true,
            name: true,
            isActive: true,
          },
        },
        task: {
          select: {
            id: true,
            name: true,
            projectId: true,
            startDate: true,
            endDate: true,
            project: {
              select: {
                id: true,
                name: true,
                userId: true,
              },
            },
          },
        },
      },
      orderBy: [{ resourceId: 'asc' }, { projectId: 'asc' }, { taskId: 'asc' }, { createdAt: 'asc' }],
    });

    const resourceMap = new Map<string, ResourcePlannerResource>();

    for (const row of plannerRows) {
      const resource = row.resource;
      const task = row.task;
      const taskProject = task?.project;

      if (!resource || !task || !taskProject) {
        continue;
      }

      if (resource.projectId !== null || resource.userId !== currentProject.userId) {
        continue;
      }

      if (task.projectId !== row.projectId) {
        continue;
      }

      if (taskProject.id !== row.projectId || taskProject.userId !== currentProject.userId) {
        continue;
      }

      const interval: ResourcePlannerInterval = {
        assignmentId: row.id,
        resourceId: resource.id,
        resourceName: resource.name,
        projectId: taskProject.id,
        projectName: taskProject.name,
        taskId: task.id,
        taskName: task.name,
        startDate: toIsoDate(task.startDate),
        endDate: toIsoDate(task.endDate),
        assignmentCreatedAt: row.createdAt.toISOString(),
      };

      const existing = resourceMap.get(resource.id);
      if (existing) {
        existing.intervals.push(interval);
        continue;
      }

      resourceMap.set(resource.id, {
        resourceId: resource.id,
        resourceName: resource.name,
        intervals: [interval],
      });
    }

    const resources = Array.from(resourceMap.values())
      .map((resource) => ({
        ...resource,
        intervals: resource.intervals.sort((left, right) => {
          return (
            left.startDate.localeCompare(right.startDate)
            || left.endDate.localeCompare(right.endDate)
            || left.projectName.localeCompare(right.projectName)
            || left.taskName.localeCompare(right.taskName)
            || left.assignmentId.localeCompare(right.assignmentId)
          );
        }),
      }))
      .sort((left, right) => left.resourceName.localeCompare(right.resourceName) || left.resourceId.localeCompare(right.resourceId));

    return {
      projectId,
      workspaceUserId: currentProject.userId,
      resources,
    };
  }
}

export const plannerService = new PlannerService();
