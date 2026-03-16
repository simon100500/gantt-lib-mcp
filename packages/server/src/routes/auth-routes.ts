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
import { authService, taskService } from '@gantt/mcp/services';
import { sendOtpEmail } from '../email.js';
import {
  generateOtp,
  signAccessToken,
  signRefreshToken,
  verifyToken,
} from '../auth.js';
import { authMiddleware } from '../middleware/auth-middleware.js';

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
    const email = body?.email?.trim().toLowerCase();

    if (!email) {
      return reply.status(400).send({ error: 'email required' });
    }

    try {
      const code = generateOtp();
      await authService.createOtp(email, code);
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
    const email = body?.email?.trim().toLowerCase();
    const code = body?.code?.trim();

    if (!email || !code) {
      return reply.status(400).send({ error: 'email and code required' });
    }

    const valid = await authService.consumeOtp(email, code);
    if (!valid) {
      return reply.status(400).send({ error: 'Invalid or expired code' });
    }

    // Find or create user
    const user = await authService.findOrCreateUser(email);

    // Get or create default project
    let projects = await authService.listProjects(user.id);
    if (projects.length === 0) {
      await authService.createDefaultProject(user.id);
      projects = await authService.listProjects(user.id);
    }

    const project = projects[0]!;

    // Create session first to get the actual session ID from database
    const session = await authService.createSession(user.id, project.id, '', '');

    // Generate tokens with the actual session ID
    const tokenPayload = {
      sub: user.id,
      email: user.email,
      projectId: project.id,
      sessionId: session.id,
    };

    const accessToken = signAccessToken(tokenPayload);
    const refreshToken = signRefreshToken(tokenPayload);

    // Update session with the actual tokens
    await authService.updateSessionTokens(session.id, accessToken, refreshToken);

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
    const session = await authService.findSessionByRefreshToken(refreshToken);
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
    const sessionUser = await authService.findUserById(session.userId);
    const tokenPayload = {
      sub: session.userId,
      email: sessionUser?.email ?? '',
      projectId: session.projectId,
      sessionId: session.id,
    };

    const newAccessToken = signAccessToken(tokenPayload);
    const newRefreshToken = signRefreshToken(tokenPayload);

    // Update session
    await authService.updateSessionTokens(session.id, newAccessToken, newRefreshToken);

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
    const session = await authService.findSessionByAccessToken(accessToken);
    if (!session) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    // Delete session
    await authService.deleteSession(session.id);

    return reply.send({ ok: true });
  });

  // ---------------------------------------------------------------------------
  // POST /api/auth/switch-project
  // ---------------------------------------------------------------------------
  fastify.post('/api/auth/switch-project', { preHandler: [authMiddleware] }, async (req, reply) => {
    console.log('[SWITCH-PROJECT DEBUG] Request received');
    const body = req.body as { projectId?: string };
    const { projectId } = body;
    const { userId, sessionId } = req.user!;
    console.log('[SWITCH-PROJECT DEBUG] userId:', userId, 'requested projectId:', projectId, 'current projectId:', req.user!.projectId);

    if (!projectId) {
      return reply.status(400).send({ error: 'projectId required' });
    }

    // Verify project belongs to user
    const projects = await authService.listProjects(userId);
    const project = projects.find(p => p.id === projectId);

    if (!project) {
      return reply.status(403).send({ error: 'Project not found or access denied' });
    }

    // Create new session for the switched project
    const tokenPayload = {
      sub: userId,
      email: req.user!.email,
      projectId: project.id,
      sessionId,
    };

    const newAccessToken = signAccessToken(tokenPayload);
    const newRefreshToken = signRefreshToken(tokenPayload);

    console.log('[SWITCH-PROJECT DEBUG] About to update session tokens in DB');
    console.log('[SWITCH-PROJECT DEBUG] Session ID:', sessionId);
    console.log('[SWITCH-PROJECT DEBUG] New access token prefix:', newAccessToken.substring(0, 20) + '...');

    // Update session tokens and project
    await authService.updateSessionTokens(sessionId, newAccessToken, newRefreshToken);

    console.log('[SWITCH-PROJECT DEBUG] Session tokens updated, now updating project');
    await authService.updateSessionProject(sessionId, project.id);

    console.log('[SWITCH-PROJECT DEBUG] Verifying session exists with new token...');
    const verifySession = await authService.findSessionByAccessToken(newAccessToken);
    if (verifySession) {
      console.log('[SWITCH-PROJECT DEBUG] VERIFIED: Session found with new token!', {
        sessionId: verifySession.id,
        projectId: verifySession.projectId
      });
    } else {
      console.log('[SWITCH-PROJECT DEBUG] ERROR: Session NOT found with new token!');
    }

    console.log('[SWITCH-PROJECT DEBUG] Sending response:', {
      projectId: project.id,
      projectName: project.name,
      accessTokenPrefix: newAccessToken.substring(0, 20) + '...'
    });

    return reply.send({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      project: { id: project.id, name: project.name },
    });
  });

  fastify.post<{ Params: { id: string } }>('/api/projects/:id/share', { preHandler: [authMiddleware] }, async (req, reply) => {
    const { id: projectId } = req.params;
    const projects = await authService.listProjects(req.user!.userId);
    const project = projects.find((item) => item.id === projectId);

    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    const shareLink = await authService.createShareLink(projectId);
    const proto = (req.headers['x-forwarded-proto'] as string | undefined) ?? 'http';
    const host = req.headers.host ?? 'localhost:3000';
    const origin = req.headers.origin ?? `${proto}://${host}`;
    const url = `${origin}/?share=${encodeURIComponent(shareLink.id)}`;

    return reply.send({
      token: shareLink.id,
      url,
      project: { id: project.id, name: project.name },
    });
  });

  fastify.get<{ Querystring: { token?: string } }>('/api/share', async (req, reply) => {
    const token = req.query.token;
    if (!token) {
      return reply.status(400).send({ error: 'token required' });
    }

    const shareLink = await authService.findShareLinkById(token);
    if (!shareLink) {
      return reply.status(404).send({ error: 'Share link not found' });
    }

    const project = await authService.findProjectById(shareLink.projectId);
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    const tasks = await taskService.list(project.id);
    return reply.send({
      project: { id: project.id, name: project.name },
      tasks,
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/projects
  // ---------------------------------------------------------------------------
  fastify.get('/api/projects', { preHandler: [authMiddleware] }, async (req, reply) => {
    const projects = await authService.listProjects(req.user!.userId);
    return reply.send({ projects });
  });

  // ---------------------------------------------------------------------------
  // POST /api/projects
  // ---------------------------------------------------------------------------
  fastify.post('/api/projects', { preHandler: [authMiddleware] }, async (req, reply) => {
    const body = req.body as { name?: string };
    const { name } = body;

    if (!name || !name.trim()) {
      return reply.status(400).send({ error: 'name required' });
    }

    const project = await authService.createProject(req.user!.userId, name.trim());
    return reply.send({ project });
  });

  // ---------------------------------------------------------------------------
  // PATCH /api/projects/:id
  // ---------------------------------------------------------------------------
  fastify.patch<{ Params: { id: string } }>('/api/projects/:id', { preHandler: [authMiddleware] }, async (req, reply) => {
    const { id: projectId } = req.params;
    const body = req.body as { name?: string };
    const { name } = body;

    if (!name || !name.trim()) {
      return reply.status(400).send({ error: 'name required' });
    }

    const project = await authService.updateProject(projectId, req.user!.userId, name.trim());

    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    return reply.send({ project });
  });
}
