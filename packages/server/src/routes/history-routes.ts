import type { FastifyInstance } from 'fastify';
import { historyService } from '@gantt/mcp/services';
import { authMiddleware } from '../middleware/auth-middleware.js';

type HistoryFailureCode = 'version_conflict' | 'redo_not_available' | 'history_diverged' | 'target_not_undone' | 'validation_error';

function getHistoryFailureStatus(reason: HistoryFailureCode): number {
  if (reason === 'version_conflict') {
    return 409;
  }

  return 400;
}

function parseLimit(rawLimit: unknown): number | undefined {
  if (rawLimit === undefined) {
    return undefined;
  }

  const parsed = Number(rawLimit);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return undefined;
  }

  return parsed;
}

export async function registerHistoryRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/api/history', { preHandler: [authMiddleware] }, async (req, reply) => {
    const query = (req.query ?? {}) as { cursor?: string; limit?: string | number };
    const limit = parseLimit(query.limit);

    if (query.limit !== undefined && limit === undefined) {
      return reply.status(400).send({
        reason: 'validation_error',
        error: 'limit must be a positive integer',
      });
    }

    const response = await historyService.listHistoryGroups({
      projectId: req.user!.projectId,
      cursor: query.cursor,
      limit,
    });

    return reply.send({
      items: response.items.map((item) => ({
        id: item.id,
        actorType: item.actorType,
        title: item.title,
        status: item.status,
        baseVersion: item.baseVersion,
        newVersion: item.newVersion,
        commandCount: item.commandCount,
        createdAt: item.createdAt,
        undoable: item.undoable,
        redoable: item.redoable,
      })),
      nextCursor: response.nextCursor,
    });
  });

  fastify.post('/api/history/undo', { preHandler: [authMiddleware] }, async (req, reply) => {
    const response = await historyService.undoLatestGroup({
      projectId: req.user!.projectId,
      actorType: 'user',
      actorId: req.user!.userId,
      requestContextId: req.user!.sessionId,
    });

    if (!response.accepted) {
      return reply.status(getHistoryFailureStatus(response.reason)).send(response);
    }

    return reply.send({
      snapshot: response.snapshot,
      version: response.version,
      groupId: response.groupId,
      targetGroupId: response.targetGroupId,
    });
  });

  fastify.post('/api/history/:groupId/undo', { preHandler: [authMiddleware] }, async (req, reply) => {
    const params = req.params as { groupId?: string };
    if (!params.groupId) {
      return reply.status(400).send({
        reason: 'validation_error',
        error: 'groupId required',
      });
    }

    const response = await historyService.undoGroup({
      projectId: req.user!.projectId,
      groupId: params.groupId,
      actorType: 'user',
      actorId: req.user!.userId,
      requestContextId: req.user!.sessionId,
    });

    if (!response.accepted) {
      return reply.status(getHistoryFailureStatus(response.reason)).send(response);
    }

    return reply.send({
      snapshot: response.snapshot,
      version: response.version,
      groupId: response.groupId,
      targetGroupId: response.targetGroupId,
    });
  });

  fastify.post('/api/history/:groupId/redo', { preHandler: [authMiddleware] }, async (req, reply) => {
    const params = req.params as { groupId?: string };
    if (!params.groupId) {
      return reply.status(400).send({
        reason: 'validation_error',
        error: 'groupId required',
      });
    }

    const response = await historyService.redoGroup({
      projectId: req.user!.projectId,
      groupId: params.groupId,
      actorType: 'user',
      actorId: req.user!.userId,
      requestContextId: req.user!.sessionId,
    });

    if (!response.accepted) {
      return reply.status(getHistoryFailureStatus(response.reason)).send(response);
    }

    return reply.send({
      snapshot: response.snapshot,
      version: response.version,
      groupId: response.groupId,
      targetGroupId: response.targetGroupId,
    });
  });
}
