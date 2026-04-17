/**
 * Command commit route — POST /api/commands/commit
 *
 * Accepts typed ProjectCommand with baseVersion, delegates to CommandService
 * for atomic execution with optimistic concurrency, version bump, and event logging.
 *
 * Per D-06, D-07, D-09: one authoritative commit path. Server-confirmed version
 * is the single truth boundary.
 *
 * Status codes:
 * - 200: command accepted, returns CommitProjectCommandResponse with newVersion
 * - 409: version_conflict — baseVersion is stale
 * - 400: validation_error — malformed request or execution conflict
 * - 401: unauthenticated (via authMiddleware)
 * - 500: unexpected server error
 */

import type { FastifyInstance } from 'fastify';
import { commandService } from '@gantt/mcp/services';
import type { CommitProjectCommandRequest, ActorType } from '@gantt/mcp/types';
import { authMiddleware } from '../middleware/auth-middleware.js';
import { requireActiveSubscriptionForMutation } from '../middleware/constraint-middleware.js';
import { writeServerDebugLog } from '../debug-log.js';

export async function registerCommandRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post('/api/commands/commit', { preHandler: [authMiddleware, requireActiveSubscriptionForMutation] }, async (req, reply) => {
    const body = req.body as Partial<CommitProjectCommandRequest>;

    // Validate required fields
    if (!body.command || !body.clientRequestId || body.baseVersion === undefined) {
      return reply.status(400).send({
        clientRequestId: body.clientRequestId ?? '',
        accepted: false,
        reason: 'validation_error',
        currentVersion: -1,
        error: 'Missing command, clientRequestId, or baseVersion',
      });
    }

    // Build the request — projectId comes from JWT, NOT from request body (security)
    const request: CommitProjectCommandRequest = {
      projectId: req.user!.projectId,
      clientRequestId: body.clientRequestId,
      baseVersion: body.baseVersion,
      command: body.command,
      history: body.history,
    };

    // REST API calls are always 'user' actor type; agent calls go through MCP
    const actorType: ActorType = 'user';
    const actorId = req.user!.userId;

    try {
      await writeServerDebugLog('user_command_received', {
        userId: req.user!.userId,
        projectId: req.user!.projectId,
        sessionId: req.user!.sessionId,
        actorType,
        actorId,
        clientRequestId: request.clientRequestId,
        baseVersion: request.baseVersion,
        commandType: request.command.type,
        command: request.command,
        history: request.history,
      });

      const response = await commandService.commitCommand(request, actorType, actorId);

      await writeServerDebugLog('user_command_completed', {
        userId: req.user!.userId,
        projectId: req.user!.projectId,
        sessionId: req.user!.sessionId,
        actorType,
        actorId,
        clientRequestId: request.clientRequestId,
        baseVersion: request.baseVersion,
        commandType: request.command.type,
        accepted: response.accepted,
        reason: response.accepted ? undefined : response.reason,
        newVersion: response.accepted ? response.newVersion : undefined,
        currentVersion: response.accepted ? undefined : response.currentVersion,
        changedTaskIds: response.accepted ? response.result.changedTaskIds : [],
        changedDependencyIds: response.accepted ? response.result.changedDependencyIds : [],
        conflicts: response.accepted ? response.result.conflicts : [],
        history: request.history,
      });

      if (response.accepted) {
        return reply.status(200).send(response);
      }

      // Map rejection reason to HTTP status code
      const statusCode = response.reason === 'version_conflict' ? 409 : 400;
      return reply.status(statusCode).send(response);
    } catch (error) {
      await writeServerDebugLog('user_command_failed', {
        userId: req.user!.userId,
        projectId: req.user!.projectId,
        sessionId: req.user!.sessionId,
        actorType,
        actorId,
        clientRequestId: request.clientRequestId,
        baseVersion: request.baseVersion,
        commandType: request.command.type,
        command: request.command,
        history: request.history,
        error: error instanceof Error ? error.message : String(error),
      });
      fastify.log.error({
        err: error,
        clientRequestId: request.clientRequestId,
        projectId: request.projectId,
        baseVersion: request.baseVersion,
        commandType: request.command.type,
        command: request.command,
      }, 'Command commit failed');
      return reply.status(500).send({
        clientRequestId: request.clientRequestId,
        accepted: false,
        reason: 'validation_error',
        currentVersion: -1,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
}
