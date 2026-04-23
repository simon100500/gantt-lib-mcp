import type { FastifyInstance } from 'fastify';
import {
  assignmentService,
  AssignmentValidationError,
  resourceService,
  ResourceValidationError,
} from '@gantt/mcp/services';
import { authMiddleware } from '../middleware/auth-middleware.js';

type ResourceBody = {
  name?: string;
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

export async function registerResourceRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/api/resources', { preHandler: [authMiddleware] }, async (req, reply) => {
    try {
      const response = await resourceService.list({
        projectId: req.user!.projectId,
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
      const response = await resourceService.create({
        projectId: req.user!.projectId,
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
