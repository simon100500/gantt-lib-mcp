import type { FastifyInstance } from 'fastify';
import { templateService, TemplateValidationError } from '@gantt/mcp/services';
import type { TemplateWorkspaceSnapshot } from '@gantt/mcp/types';
import { authMiddleware } from '../middleware/auth-middleware.js';
import { requireActiveSubscriptionForMutation } from '../middleware/constraint-middleware.js';

function parseName(body: unknown): string | undefined {
  if (!body || typeof body !== 'object' || !('name' in body)) {
    return undefined;
  }
  const value = (body as { name?: unknown }).name;
  return typeof value === 'string' ? value.trim() : undefined;
}

function isTemplateValidationError(error: unknown): error is TemplateValidationError {
  return error instanceof TemplateValidationError
    || (
      typeof error === 'object'
      && error !== null
      && 'code' in error
      && (error as { code?: string }).code === 'validation_error'
    );
}

export async function registerTemplateRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/api/templates', { preHandler: [authMiddleware] }, async (req, reply) => {
    try {
      const response = await templateService.listTemplates({
        ownerUserId: req.user!.userId,
      });
      return reply.send(response);
    } catch (error) {
      if (isTemplateValidationError(error)) {
        return reply.status(400).send({ reason: 'validation_error', error: error.message });
      }
      throw error;
    }
  });

  fastify.get('/api/templates/:templateId', { preHandler: [authMiddleware] }, async (req, reply) => {
    const templateId = (req.params as { templateId?: string }).templateId?.trim();
    if (!templateId) {
      return reply.status(400).send({ reason: 'validation_error', error: 'templateId required' });
    }

    try {
      const response = await templateService.getTemplateWorkspaceSnapshot({
        ownerUserId: req.user!.userId,
        templateId,
      });
      return reply.send(response);
    } catch (error) {
      if (isTemplateValidationError(error)) {
        return reply.status(400).send({ reason: 'validation_error', error: error.message });
      }
      throw error;
    }
  });

  fastify.post('/api/templates/project', { preHandler: [authMiddleware, requireActiveSubscriptionForMutation] }, async (req, reply) => {
    const name = parseName(req.body);
    if (!name) {
      return reply.status(400).send({ reason: 'validation_error', error: 'name required' });
    }

    try {
      const response = await templateService.createFromProject({
        ownerUserId: req.user!.userId,
        projectId: req.user!.projectId,
        name,
      });
      return reply.status(201).send(response);
    } catch (error) {
      if (isTemplateValidationError(error)) {
        return reply.status(400).send({ reason: 'validation_error', error: error.message });
      }
      throw error;
    }
  });

  fastify.post('/api/templates/selection', { preHandler: [authMiddleware, requireActiveSubscriptionForMutation] }, async (req, reply) => {
    const body = (req.body ?? {}) as { name?: string; rootTaskIds?: unknown };
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const rootTaskIds = Array.isArray(body.rootTaskIds) ? body.rootTaskIds.filter((id): id is string => typeof id === 'string') : [];
    if (!name) {
      return reply.status(400).send({ reason: 'validation_error', error: 'name required' });
    }

    try {
      const response = await templateService.createFromSelection({
        ownerUserId: req.user!.userId,
        projectId: req.user!.projectId,
        name,
        rootTaskIds,
      });
      return reply.status(201).send(response);
    } catch (error) {
      if (isTemplateValidationError(error)) {
        return reply.status(400).send({ reason: 'validation_error', error: error.message });
      }
      throw error;
    }
  });

  fastify.patch('/api/templates/:templateId', { preHandler: [authMiddleware, requireActiveSubscriptionForMutation] }, async (req, reply) => {
    const templateId = (req.params as { templateId?: string }).templateId?.trim();
    const name = parseName(req.body);
    if (!templateId || !name) {
      return reply.status(400).send({ reason: 'validation_error', error: 'templateId and name required' });
    }

    try {
      const response = await templateService.updateTemplateMetadata({
        ownerUserId: req.user!.userId,
        templateId,
        name,
      });
      return reply.send(response);
    } catch (error) {
      if (isTemplateValidationError(error)) {
        return reply.status(400).send({ reason: 'validation_error', error: error.message });
      }
      throw error;
    }
  });

  fastify.put('/api/templates/:templateId/snapshot', { preHandler: [authMiddleware, requireActiveSubscriptionForMutation] }, async (req, reply) => {
    const templateId = (req.params as { templateId?: string }).templateId?.trim();
    const body = (req.body ?? {}) as { name?: string; snapshot?: unknown };
    if (!templateId || !body.snapshot || typeof body.snapshot !== 'object') {
      return reply.status(400).send({ reason: 'validation_error', error: 'templateId and snapshot required' });
    }

    try {
      const response = await templateService.updateTemplateSnapshot({
        ownerUserId: req.user!.userId,
        templateId,
        name: typeof body.name === 'string' ? body.name.trim() : undefined,
        snapshot: body.snapshot as TemplateWorkspaceSnapshot,
      });
      return reply.send(response);
    } catch (error) {
      if (isTemplateValidationError(error)) {
        return reply.status(400).send({ reason: 'validation_error', error: error.message });
      }
      throw error;
    }
  });

  fastify.delete('/api/templates/:templateId', { preHandler: [authMiddleware, requireActiveSubscriptionForMutation] }, async (req, reply) => {
    const templateId = (req.params as { templateId?: string }).templateId?.trim();
    if (!templateId) {
      return reply.status(400).send({ reason: 'validation_error', error: 'templateId required' });
    }

    try {
      const response = await templateService.deleteTemplate({
        ownerUserId: req.user!.userId,
        templateId,
      });
      return reply.send(response);
    } catch (error) {
      if (isTemplateValidationError(error)) {
        return reply.status(400).send({ reason: 'validation_error', error: error.message });
      }
      throw error;
    }
  });

  fastify.post('/api/templates/:templateId/insert', { preHandler: [authMiddleware, requireActiveSubscriptionForMutation] }, async (req, reply) => {
    const templateId = (req.params as { templateId?: string }).templateId?.trim();
    const body = (req.body ?? {}) as { anchorTaskId?: string; placement?: 'after' | 'inside' };
    if (!templateId || !body.anchorTaskId?.trim()) {
      return reply.status(400).send({ reason: 'validation_error', error: 'templateId and anchorTaskId required' });
    }

    try {
      const response = await templateService.insertIntoProject({
        ownerUserId: req.user!.userId,
        projectId: req.user!.projectId,
        templateId,
        anchorTaskId: body.anchorTaskId,
        placement: body.placement === 'inside' ? 'inside' : 'after',
      }, 'user', req.user!.userId);

      if (response.accepted) {
        return reply.send(response);
      }

      const statusCode = response.reason === 'version_conflict' ? 409 : 400;
      return reply.status(statusCode).send(response);
    } catch (error) {
      if (isTemplateValidationError(error)) {
        return reply.status(400).send({ reason: 'validation_error', error: error.message });
      }
      throw error;
    }
  });
}
