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
import { requireTrackedLimit } from '../middleware/constraint-middleware.js';

const requireProjectLimit = requireTrackedLimit('projects', {
  code: 'PROJECT_LIMIT_REACHED',
  upgradeHint: 'Upgrade your plan to create or restore more active projects.',
});

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
      project: {
        id: project.id,
        name: project.name,
        status: project.status,
        ganttDayMode: project.ganttDayMode,
        calendarId: project.calendarId,
        calendarDays: project.calendarDays,
        archivedAt: project.archivedAt,
        deletedAt: project.deletedAt,
      },
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

    let resolvedProjectId = session.projectId;
    const sessionProject = await authService.findProjectById(session.projectId);
    if (!sessionProject) {
      const projects = await authService.listProjects(session.userId);
      const fallbackProject = projects.find((item) => item.status === 'active') ?? projects[0];

      if (!fallbackProject) {
        return reply.status(403).send({ error: 'Project unavailable' });
      }

      await authService.updateSessionProject(session.id, fallbackProject.id);
      resolvedProjectId = fallbackProject.id;
    }

    // Generate new ACCESS token only (refresh token stays the same - no rotation!)
    // This prevents race condition where concurrent refresh requests invalidate each other
    const sessionUser = await authService.findUserById(session.userId);
    const tokenPayload = {
      sub: session.userId,
      email: sessionUser?.email ?? '',
      projectId: resolvedProjectId,
      sessionId: session.id,
    };

    const newAccessToken = signAccessToken(tokenPayload);

    // Update session with new access token, keep the same refresh token
    await authService.updateSessionTokens(session.id, newAccessToken, refreshToken);

    return reply.send({
      accessToken: newAccessToken,
      refreshToken: refreshToken, // Return the same refresh token
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

    // Get current session to preserve refresh token (no rotation - prevents race condition)
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
    const currentAccessToken = authHeader.slice(7);
    const currentSession = await authService.findSessionByAccessToken(currentAccessToken);
    if (!currentSession) {
      return reply.status(401).send({ error: 'Session not found' });
    }

    // Create new access token only, keep the same refresh token
    const tokenPayload = {
      sub: userId,
      email: req.user!.email,
      projectId: project.id,
      sessionId,
    };

    const newAccessToken = signAccessToken(tokenPayload);

    console.log('[SWITCH-PROJECT DEBUG] About to update session tokens in DB');
    console.log('[SWITCH-PROJECT DEBUG] Session ID:', sessionId);
    console.log('[SWITCH-PROJECT DEBUG] New access token prefix:', newAccessToken.substring(0, 20) + '...');

    // Update session with new access token, keep the same refresh token
    await authService.updateSessionTokens(sessionId, newAccessToken, currentSession.refreshToken);

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
      refreshToken: currentSession.refreshToken, // Return the same refresh token (no rotation)
      project: {
        id: project.id,
        name: project.name,
        status: project.status,
        ganttDayMode: project.ganttDayMode,
        calendarId: project.calendarId,
        calendarDays: project.calendarDays,
        archivedAt: project.archivedAt,
        deletedAt: project.deletedAt,
      },
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
      project: {
        id: project.id,
        name: project.name,
        status: project.status,
        ganttDayMode: project.ganttDayMode,
        calendarId: project.calendarId,
        calendarDays: project.calendarDays,
        archivedAt: project.archivedAt,
        deletedAt: project.deletedAt,
      },
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

    const { tasks } = await taskService.list(project.id);
    return reply.send({
      project: {
        id: project.id,
        name: project.name,
        ganttDayMode: project.ganttDayMode,
        calendarId: project.calendarId,
        calendarDays: project.calendarDays,
      },
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
  fastify.post('/api/projects', { preHandler: [authMiddleware, requireProjectLimit] }, async (req, reply) => {
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
    const body = req.body as { name?: string; ganttDayMode?: 'business' | 'calendar'; calendarId?: string | null };
    const name = body.name?.trim();
    const hasName = body.name !== undefined;
    const hasGanttDayMode = body.ganttDayMode === 'business' || body.ganttDayMode === 'calendar';

    if (!hasName && body.ganttDayMode === undefined && body.calendarId === undefined) {
      return reply.status(400).send({ error: 'No project fields provided' });
    }

    if (hasName && !name) {
      return reply.status(400).send({ error: 'name required' });
    }

    if (body.ganttDayMode !== undefined && !hasGanttDayMode) {
      return reply.status(400).send({ error: 'Invalid ganttDayMode' });
    }

    const project = await authService.updateProject(projectId, req.user!.userId, {
      ...(hasName ? { name } : {}),
      ...(hasGanttDayMode ? { ganttDayMode: body.ganttDayMode } : {}),
      ...(body.calendarId !== undefined ? { calendarId: body.calendarId } : {}),
    });

    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    return reply.send({ project });
  });

  fastify.post<{ Params: { id: string } }>('/api/projects/:id/archive', { preHandler: [authMiddleware] }, async (req, reply) => {
    const { id: projectId } = req.params;
    const result = await authService.archiveProject(projectId, req.user!.userId);

    if (!result.ok) {
      if (result.reason === 'already_archived') {
        return reply.status(409).send({ error: 'Project already archived' });
      }
      return reply.status(404).send({ error: 'Project not found' });
    }

    return reply.send({ project: result.project });
  });

  fastify.post<{ Params: { id: string } }>('/api/projects/:id/restore', { preHandler: [authMiddleware, requireProjectLimit] }, async (req, reply) => {
    const { id: projectId } = req.params;
    const result = await authService.restoreProject(projectId, req.user!.userId);

    if (!result.ok) {
      if (result.reason === 'not_archived') {
        return reply.status(409).send({ error: 'Project is not archived' });
      }
      return reply.status(404).send({ error: 'Project not found' });
    }

    return reply.send({ project: result.project });
  });

  fastify.delete<{ Params: { id: string } }>('/api/projects/:id', { preHandler: [authMiddleware] }, async (req, reply) => {
    const { id: projectId } = req.params;

    const result = await authService.softDeleteProject(projectId, req.user!.userId);
    if (!result.ok) {
      if (result.reason === 'last_project') {
        return reply.status(409).send({ error: 'Нельзя удалить последний проект' });
      }
      return reply.status(404).send({ error: 'Project not found' });
    }

    return reply.send({ ok: true });
  });
}
