import type { FastifyInstance } from 'fastify';
import {
  assignmentService,
  AssignmentValidationError,
  plannerService,
  PlannerValidationError,
  resourceService,
  ResourceValidationError,
} from '@gantt/mcp/services';
import { getPrisma } from '@gantt/runtime-core/prisma';
import { authMiddleware } from '../middleware/auth-middleware.js';

type ResourceBody = {
  name?: string;
  projectId?: string;
  type?: 'human' | 'equipment' | 'material' | 'other';
  scope?: 'shared' | 'project';
  isActive?: boolean;
};

type AssignmentBody = {
  resourceIds?: string[];
};

function parseResourceName(body: unknown): string | undefined {
  if (!body || typeof body !== 'object' || !('name' in body)) {
    return undefined;
  }

  const { name } = body as ResourceBody;
  if (typeof name !== 'string') {
    return undefined;
  }

  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseAssignmentResourceIds(body: unknown): string[] | undefined {
  if (!body || typeof body !== 'object' || !('resourceIds' in body)) {
    return undefined;
  }

  const { resourceIds } = body as AssignmentBody;
  return Array.isArray(resourceIds) ? resourceIds : undefined;
}

async function resolveOwnedProjectId(requestedProjectId: unknown, userId: string, fallbackProjectId: string): Promise<string | null> {
  const targetProjectId = typeof requestedProjectId === 'string' && requestedProjectId.trim().length > 0
    ? requestedProjectId.trim()
    : fallbackProjectId;
  const project = await getPrisma().project.findFirst({
    where: {
      id: targetProjectId,
      userId,
      status: { not: 'deleted' },
    },
    select: { id: true },
  });

  return project?.id ?? null;
}

function isResourceValidationError(error: unknown): error is ResourceValidationError {
  return error instanceof ResourceValidationError || (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'validation_error' &&
    'message' in error &&
    typeof error.message === 'string'
  );
}

function isAssignmentValidationError(error: unknown): error is AssignmentValidationError {
  return error instanceof AssignmentValidationError || (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'validation_error' &&
    'message' in error &&
    typeof error.message === 'string' &&
    'issue' in error
  );
}

function isPlannerValidationError(error: unknown): error is PlannerValidationError {
  return error instanceof PlannerValidationError || (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'validation_error' &&
    'message' in error &&
    typeof error.message === 'string' &&
    'issue' in error
  );
}

export async function registerResourceRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/api/resources/planner', { preHandler: [authMiddleware] }, async (req, reply) => {
    try {
      const query = req.query as { scope?: string };
      const response = await plannerService.getResourcePlanner({
        projectId: req.user!.projectId,
        scope: query.scope,
      });

      return reply.send(response);
    } catch (error) {
      if (isPlannerValidationError(error)) {
        return reply.status(400).send({
          reason: 'validation_error',
          error: error.message,
          issue: error.issue,
        });
      }

      throw error;
    }
  });

  fastify.get('/api/resources', { preHandler: [authMiddleware] }, async (req, reply) => {
    try {
      const query = req.query as { projectId?: string };
      const targetProjectId = await resolveOwnedProjectId(query.projectId, req.user!.userId, req.user!.projectId);
      if (!targetProjectId) {
        return reply.status(400).send({
          reason: 'validation_error',
          error: 'projectId unavailable',
        });
      }

      const response = await resourceService.list({
        projectId: targetProjectId,
        includeInactive: true,
      });

      return reply.send({ resources: response.resources });
    } catch (error) {
      if (isResourceValidationError(error)) {
        return reply.status(400).send({
          reason: 'validation_error',
          error: error.message,
          issue: error.issue,
        });
      }

      throw error;
    }
  });

  fastify.post('/api/resources', { preHandler: [authMiddleware] }, async (req, reply) => {
    const name = parseResourceName(req.body);
    if (!name) {
      return reply.status(400).send({
        reason: 'validation_error',
        error: 'name required',
      });
    }

    try {
      const body = (req.body ?? {}) as ResourceBody;
      const targetProjectId = await resolveOwnedProjectId(body.projectId, req.user!.userId, req.user!.projectId);
      if (!targetProjectId) {
        return reply.status(400).send({
          reason: 'validation_error',
          error: 'projectId unavailable',
        });
      }

      const response = await resourceService.create({
        projectId: targetProjectId,
        name,
        type: body.type,
        scope: body.scope,
      });

      return reply.status(201).send(response);
    } catch (error) {
      if (isResourceValidationError(error)) {
        return reply.status(400).send({
          reason: 'validation_error',
          error: error.message,
          issue: error.issue,
        });
      }

      throw error;
    }
  });

  fastify.patch('/api/resources/:resourceId', { preHandler: [authMiddleware] }, async (req, reply) => {
    const params = req.params as { resourceId?: string };
    if (!params.resourceId?.trim()) {
      return reply.status(400).send({
        reason: 'validation_error',
        error: 'resourceId required',
      });
    }

    try {
      const body = (req.body ?? {}) as ResourceBody;
      const response = await resourceService.update({
        projectId: req.user!.projectId,
        resourceId: params.resourceId,
        name: typeof body.name === 'string' ? body.name : undefined,
        type: body.type,
        scope: body.scope,
        isActive: typeof body.isActive === 'boolean' ? body.isActive : undefined,
      });

      return reply.send(response);
    } catch (error) {
      if (isResourceValidationError(error)) {
        return reply.status(400).send({
          reason: 'validation_error',
          error: error.message,
          issue: error.issue,
        });
      }

      throw error;
    }
  });

  fastify.delete('/api/resources/:resourceId', { preHandler: [authMiddleware] }, async (req, reply) => {
    const params = req.params as { resourceId?: string };
    if (!params.resourceId?.trim()) {
      return reply.status(400).send({
        reason: 'validation_error',
        error: 'resourceId required',
      });
    }

    try {
      const response = await resourceService.delete({
        projectId: req.user!.projectId,
        resourceId: params.resourceId,
      });

      return reply.send(response);
    } catch (error) {
      if (isResourceValidationError(error)) {
        return reply.status(400).send({
          reason: 'validation_error',
          error: error.message,
          issue: error.issue,
        });
      }

      throw error;
    }
  });

  fastify.post('/api/tasks/:taskId/assignments', { preHandler: [authMiddleware] }, async (req, reply) => {
    const params = req.params as { taskId?: string };
    if (!params.taskId?.trim()) {
      return reply.status(400).send({
        reason: 'validation_error',
        error: 'taskId required',
      });
    }

    const resourceIds = parseAssignmentResourceIds(req.body);
    if (!resourceIds) {
      return reply.status(400).send({
        reason: 'validation_error',
        error: 'resourceIds array required',
      });
    }

    try {
      const response = await assignmentService.replaceForTask({
        projectId: req.user!.projectId,
        taskId: params.taskId,
        resourceIds,
      });

      return reply.send(response);
    } catch (error) {
      if (isAssignmentValidationError(error)) {
        return reply.status(400).send({
          reason: 'validation_error',
          error: error.message,
          issue: error.issue,
        });
      }

      throw error;
    }
  });

  fastify.post('/api/tasks/:taskId/assignments/materialize', { preHandler: [authMiddleware] }, async (req, reply) => {
    const params = req.params as { taskId?: string };
    if (!params.taskId?.trim()) {
      return reply.status(400).send({
        reason: 'validation_error',
        error: 'taskId required',
      });
    }

    const resourceIds = parseAssignmentResourceIds(req.body);
    if (!resourceIds) {
      return reply.status(400).send({
        reason: 'validation_error',
        error: 'resourceIds array required',
      });
    }

    try {
      const response = await assignmentService.materializeForParentTask({
        projectId: req.user!.projectId,
        taskId: params.taskId,
        resourceIds,
      });

      return reply.send(response);
    } catch (error) {
      if (isAssignmentValidationError(error)) {
        return reply.status(400).send({
          reason: 'validation_error',
          error: error.message,
          issue: error.issue,
        });
      }

      throw error;
    }
  });
}
