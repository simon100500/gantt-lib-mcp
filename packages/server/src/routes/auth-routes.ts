/**
 * Authentication REST routes for Fastify
 *
 * Implements OTP-based authentication flow:
 * - POST /api/auth/request-otp - Request OTP code via email
 * - POST /api/auth/verify-otp - Verify OTP and receive JWT tokens
 * - POST /api/auth/refresh - Refresh access token
 * - POST /api/auth/logout - Invalidate session
 */

import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { authStore } from '@gantt/mcp/auth-store';
import { sendOtpEmail } from '../email.js';
import {
  generateOtp,
  signAccessToken,
  signRefreshToken,
  verifyToken,
} from '../auth.js';

/**
 * Register all authentication routes with Fastify
 *
 * @param fastify - Fastify instance
 */
export async function registerAuthRoutes(fastify: FastifyInstance): Promise<void> {
  // ---------------------------------------------------------------------------
  // POST /api/auth/request-otp
  // ---------------------------------------------------------------------------
  fastify.post('/api/auth/request-otp', async (req, reply) => {
    const body = req.body as { email?: string };
    const email = body?.email;

    if (!email) {
      return reply.status(400).send({ error: 'email required' });
    }

    try {
      const code = generateOtp();
      await authStore.createOtp(email, code);
      await sendOtpEmail(email, code);
      return reply.send({ sent: true });
    } catch (err) {
      fastify.log.error(err, 'Failed to send OTP email');
      return reply.status(500).send({ error: 'Failed to send email' });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /api/auth/verify-otp
  // ---------------------------------------------------------------------------
  fastify.post('/api/auth/verify-otp', async (req, reply) => {
    const body = req.body as { email?: string; code?: string };
    const { email, code } = body;

    if (!email || !code) {
      return reply.status(400).send({ error: 'email and code required' });
    }

    // Consume OTP (validates and marks as used)
    const valid = await authStore.consumeOtp(email, code);
    if (!valid) {
      return reply.status(400).send({ error: 'Invalid or expired code' });
    }

    // Find or create user
    const user = await authStore.findOrCreateUser(email);

    // Get or create default project
    let projects = await authStore.listProjects(user.id);
    if (projects.length === 0) {
      await authStore.createDefaultProject(user.id);
      projects = await authStore.listProjects(user.id);
    }

    const project = projects[0]!;

    // Generate session ID and tokens
    const sessionId = randomUUID();
    const tokenPayload = {
      sub: user.id,
      email: user.email,
      projectId: project.id,
      sessionId,
    };

    const accessToken = signAccessToken(tokenPayload);
    const refreshToken = signRefreshToken(tokenPayload);

    // Create session
    await authStore.createSession(user.id, project.id, accessToken, refreshToken);

    return reply.send({
      accessToken,
      refreshToken,
      user: { id: user.id, email: user.email },
      project: { id: project.id, name: project.name },
    });
  });

  // ---------------------------------------------------------------------------
  // POST /api/auth/refresh
  // ---------------------------------------------------------------------------
  fastify.post('/api/auth/refresh', async (req, reply) => {
    const body = req.body as { refreshToken?: string };
    const refreshToken = body?.refreshToken;

    if (!refreshToken) {
      return reply.status(401).send({ error: 'Invalid refresh token' });
    }

    // Find session by refresh token
    const session = await authStore.findSessionByRefreshToken(refreshToken);
    if (!session) {
      return reply.status(401).send({ error: 'Invalid refresh token' });
    }

    // Verify token
    try {
      verifyToken(refreshToken);
    } catch {
      return reply.status(401).send({ error: 'Invalid refresh token' });
    }

    // Generate new tokens
    const tokenPayload = {
      sub: session.userId,
      email: '', // Not needed for refresh, token has it
      projectId: session.projectId,
      sessionId: session.id,
    };

    const newAccessToken = signAccessToken(tokenPayload);
    const newRefreshToken = signRefreshToken(tokenPayload);

    // Update session
    await authStore.updateSessionTokens(session.id, newAccessToken, newRefreshToken);

    return reply.send({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });
  });

  // ---------------------------------------------------------------------------
  // POST /api/auth/logout
  // ---------------------------------------------------------------------------
  fastify.post('/api/auth/logout', async (req, reply) => {
    // Extract Bearer token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const accessToken = authHeader.slice(7);

    // Find session
    const session = await authStore.findSessionByAccessToken(accessToken);
    if (!session) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    // Delete session
    await authStore.deleteSession(session.id);

    return reply.send({ ok: true });
  });
}
