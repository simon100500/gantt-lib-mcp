import type { FastifyInstance } from 'fastify';
import { historyService } from '@gantt/mcp/services';
import { messageService } from '@gantt/mcp/services';
import { authMiddleware } from '../middleware/auth-middleware.js';
import { broadcastToSession } from '../ws.js';

type HistoryFailureCode = 'version_conflict' | 'validation_error';

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

function getActorContext(req: { user?: { projectId: string; userId: string; sessionId: string } }) {
  return {
    projectId: req.user!.projectId,
    actorType: 'user' as const,
    actorId: req.user!.userId,
    requestContextId: req.user!.sessionId,
  };
}

function isHistoryFailure(error: unknown): error is { reason: HistoryFailureCode } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'reason' in error &&
    (error.reason === 'version_conflict' || error.reason === 'validation_error')
  );
}

function isHistoryValidationError(error: unknown): error is { code: 'validation_error'; message: string } {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'validation_error';
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
        createdAt: item.createdAt,
        baseVersion: item.baseVersion,
        newVersion: item.newVersion,
        commandCount: item.commandCount,
        isCurrent: item.isCurrent,
        canRestore: item.canRestore,
      })),
      nextCursor: response.nextCursor,
    });
  });

  fastify.get('/api/history/:groupId/snapshot', { preHandler: [authMiddleware] }, async (req, reply) => {
    const params = req.params as { groupId?: string };
    if (!params.groupId) {
      return reply.status(400).send({
        reason: 'validation_error',
        error: 'groupId required',
      });
    }

    try {
      const response = await historyService.getHistorySnapshot({
        projectId: req.user!.projectId,
        groupId: params.groupId,
      });

      return reply.send({
        groupId: response.groupId,
        isCurrent: response.isCurrent,
        currentVersion: response.currentVersion,
        snapshot: response.snapshot,
      });
    } catch (error) {
      if (isHistoryValidationError(error)) {
        return reply.status(400).send({
          reason: error.code,
          error: error.message,
        });
      }

      throw error;
    }
  });

  fastify.post('/api/history/:groupId/restore', { preHandler: [authMiddleware] }, async (req, reply) => {
    const params = req.params as { groupId?: string };
    if (!params.groupId) {
      return reply.status(400).send({
        reason: 'validation_error',
        error: 'groupId required',
      });
    }

    try {
      const response = await historyService.restoreToGroup({
        ...getActorContext(req),
        groupId: params.groupId,
      });
      const chatCleanup = await messageService.softDeleteConversationTail(
        req.user!.projectId,
        response.targetGroupId,
      );
      broadcastToSession(req.user!.sessionId, { type: 'history_changed' });

      return reply.send({
        groupId: response.groupId,
        targetGroupId: response.targetGroupId,
        version: response.version,
        snapshot: response.snapshot,
        chatCleanup,
      });
    } catch (error) {
      if (isHistoryValidationError(error)) {
        return reply.status(getHistoryFailureStatus(error.code)).send({
          reason: error.code,
          error: error.message,
        });
      }

      if (isHistoryFailure(error)) {
        return reply.status(getHistoryFailureStatus(error.reason)).send(error);
      }

      throw error;
    }
  });
}
