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
import { authStore } from '@gantt/mcp/auth-store';

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
    console.log('[AUTH MIDDLEWARE] Missing or invalid Authorization header');
    reply.status(401).send({ error: 'Unauthorized' });
    return;
  }

  // 3. Extract token
  const token = authHeader.slice(7);
  const tokenPrefix = token.substring(0, 20) + '...';

  // 4. Verify JWT
  let payload: JwtPayload;
  try {
    payload = verifyToken(token);
    console.log('[AUTH MIDDLEWARE] JWT verified:', { userId: payload.sub, projectId: payload.projectId, sessionId: payload.sessionId });
  } catch (err) {
    console.log('[AUTH MIDDLEWARE] JWT verification failed:', err);
    reply.status(401).send({ error: 'Unauthorized' });
    return;
  }

  // 5. (Optional) Verify session still exists in DB
  console.log('[AUTH MIDDLEWARE] Looking up session by access token:', tokenPrefix);
  const session = await authStore.findSessionByAccessToken(token);
  if (!session) {
    console.log('[AUTH MIDDLEWARE] Session not found in database for token:', tokenPrefix);
    reply.status(401).send({ error: 'Unauthorized' });
    return;
  }
  console.log('[AUTH MIDDLEWARE] Session found:', { sessionId: session.id, projectId: session.projectId });

  // 6. Attach decoded payload to req.user
  request.user = {
    userId: payload.sub,
    email: payload.email,
    projectId: payload.projectId,
    sessionId: payload.sessionId,
  };
}
