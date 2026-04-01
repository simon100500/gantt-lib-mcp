/**
 * Fastify authentication middleware
 *
 * PreHandler hook that:
 * - Extracts Bearer token from Authorization header
 * - Verifies JWT signature and expiry
 * - Attaches decoded payload to req.user
 * - Returns 401 if token missing, malformed, or expired
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { verifyToken, type JwtPayload } from '../auth.js';
import { authService } from '@gantt/mcp/services';

// ---------------------------------------------------------------------------
// Module augmentation
// ---------------------------------------------------------------------------

declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      userId: string;
      email: string;
      projectId: string;
      sessionId: string;
    };
  }
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

/**
 * Fastify preHandler hook for JWT authentication.
 *
 * Workflow:
 * 1. Read Authorization header
 * 2. Validate format: "Bearer <token>"
 * 3. Verify JWT signature and expiry
 * 4. (Optional) Verify session still exists in DB
 * 5. Attach decoded payload to req.user
 * 6. Return 401 if any step fails
 *
 * @param request - Fastify request object
 * @param reply - Fastify reply object
 */
export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // 1. Read Authorization header
  const authHeader = request.headers.authorization;

  // 2. Validate format
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    reply.status(401).send({ error: 'Unauthorized' });
    return;
  }

  // 3. Extract token
  const token = authHeader.slice(7);

  // 4. Verify JWT
  let payload: JwtPayload;
  try {
    payload = verifyToken(token);
  } catch (err) {
    console.warn('[AUTH] JWT verification failed:', err);
    reply.status(401).send({ error: 'Unauthorized' });
    return;
  }

  // 5. Verify session still exists in DB
  const session = await authService.findSessionByAccessToken(token);
  if (!session) {
    console.warn('[AUTH] Session not found in database');
    reply.status(401).send({ error: 'Unauthorized' });
    return;
  }

  const project = await authService.findProjectById(session.projectId);
  if (!project) {
    reply.status(403).send({ error: 'Project unavailable' });
    return;
  }

  // 6. Attach decoded payload to req.user
  request.user = {
    userId: payload.sub,
    email: payload.email,
    projectId: payload.projectId,
    sessionId: payload.sessionId,
  };
}
