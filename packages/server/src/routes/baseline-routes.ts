import type { FastifyInstance } from 'fastify';
import { baselineService, BaselineValidationError } from '@gantt/mcp/services';
import { authMiddleware } from '../middleware/auth-middleware.js';
import { requireCurrentProjectEditor } from '../access-control.js';

type CreateBaselineBody = {
  name?: string;
};

function parseBaselineName(body: unknown): string | undefined {
  if (!body || typeof body !== 'object' || !(('name' in body))) {
    return undefined;
  }

  const { name } = body as CreateBaselineBody;
  if (typeof name !== 'string') {
    return undefined;
  }

  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function isBaselineValidationError(error: unknown): error is BaselineValidationError {
  return error instanceof BaselineValidationError || (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'validation_error' &&
    'message' in error &&
    typeof error.message === 'string'
  );
}

export async function registerBaselineRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/api/baselines', { preHandler: [authMiddleware] }, async (req, reply) => {
    try {
      const response = await baselineService.listBaselines({
        projectId: req.user!.projectId,
      });

      return reply.send({
        baselines: response.baselines,
      });
    } catch (error) {
      if (isBaselineValidationError(error)) {
        return reply.status(400).send({
          reason: 'validation_error',
          error: error.message,
        });
      }

      throw error;
    }
  });

  fastify.get('/api/baselines/:baselineId', { preHandler: [authMiddleware] }, async (req, reply) => {
    const params = req.params as { baselineId?: string };
    if (!params.baselineId?.trim()) {
      return reply.status(400).send({
        reason: 'validation_error',
        error: 'baselineId required',
      });
    }

    try {
      const response = await baselineService.getBaseline({
        projectId: req.user!.projectId,
        baselineId: params.baselineId,
      });

      const payload = {
        id: response.id,
        projectId: response.projectId,
        name: response.name,
        source: response.source,
        sourceHistoryGroupId: response.sourceHistoryGroupId,
        createdAt: response.createdAt,
        snapshot: response.snapshot,
      };

      return reply.send(payload);
    } catch (error) {
      if (isBaselineValidationError(error)) {
        return reply.status(400).send({
          reason: 'validation_error',
          error: error.message,
        });
      }

      throw error;
    }
  });

  fastify.post('/api/baselines/current', { preHandler: [authMiddleware, requireCurrentProjectEditor] }, async (req, reply) => {
    const name = parseBaselineName(req.body);
    if (!name) {
      return reply.status(400).send({
        reason: 'validation_error',
        error: 'name required',
      });
    }

    try {
      const response = await baselineService.createFromCurrent({
        projectId: req.user!.projectId,
        name,
      });

      return reply.status(201).send({
        id: response.id,
        projectId: response.projectId,
        name: response.name,
        source: response.source,
        sourceHistoryGroupId: response.sourceHistoryGroupId,
        createdAt: response.createdAt,
        snapshot: response.snapshot,
      });
    } catch (error) {
      if (isBaselineValidationError(error)) {
        return reply.status(400).send({
          reason: 'validation_error',
          error: error.message,
        });
      }

      throw error;
    }
  });

  fastify.post('/api/baselines/history/:groupId', { preHandler: [authMiddleware, requireCurrentProjectEditor] }, async (req, reply) => {
    const params = req.params as { groupId?: string };
    if (!params.groupId?.trim()) {
      return reply.status(400).send({
        reason: 'validation_error',
        error: 'groupId required',
      });
    }

    const name = parseBaselineName(req.body);
    if (!name) {
      return reply.status(400).send({
        reason: 'validation_error',
        error: 'name required',
      });
    }

    try {
      const response = await baselineService.createFromHistory({
        projectId: req.user!.projectId,
        historyGroupId: params.groupId,
        name,
      });

      return reply.status(201).send({
        id: response.id,
        projectId: response.projectId,
        name: response.name,
        source: response.source,
        sourceHistoryGroupId: response.sourceHistoryGroupId,
        createdAt: response.createdAt,
        snapshot: response.snapshot,
      });
    } catch (error) {
      if (isBaselineValidationError(error)) {
        return reply.status(400).send({
          reason: 'validation_error',
          error: error.message,
        });
      }

      throw error;
    }
  });

  fastify.delete('/api/baselines/:baselineId', { preHandler: [authMiddleware, requireCurrentProjectEditor] }, async (req, reply) => {
    const params = req.params as { baselineId?: string };
    if (!params.baselineId?.trim()) {
      return reply.status(400).send({
        reason: 'validation_error',
        error: 'baselineId required',
      });
    }

    try {
      const response = await baselineService.deleteBaseline({
        projectId: req.user!.projectId,
        baselineId: params.baselineId,
      });

      return reply.send({
        id: response.id,
      });
    } catch (error) {
      if (isBaselineValidationError(error)) {
        return reply.status(400).send({
          reason: 'validation_error',
          error: error.message,
        });
      }

      throw error;
    }
  });

  fastify.patch('/api/baselines/:baselineId', { preHandler: [authMiddleware, requireCurrentProjectEditor] }, async (req, reply) => {
    const params = req.params as { baselineId?: string };
    if (!params.baselineId?.trim()) {
      return reply.status(400).send({
        reason: 'validation_error',
        error: 'baselineId required',
      });
    }

    const name = parseBaselineName(req.body);
    if (!name) {
      return reply.status(400).send({
        reason: 'validation_error',
        error: 'name required',
      });
    }

    try {
      const response = await baselineService.updateBaseline({
        projectId: req.user!.projectId,
        baselineId: params.baselineId,
        name,
      });

      return reply.send({
        id: response.id,
        projectId: response.projectId,
        name: response.name,
        source: response.source,
        sourceHistoryGroupId: response.sourceHistoryGroupId,
        createdAt: response.createdAt,
        snapshot: response.snapshot,
      });
    } catch (error) {
      if (isBaselineValidationError(error)) {
        return reply.status(400).send({
          reason: 'validation_error',
          error: error.message,
        });
      }

      throw error;
    }
  });
}
