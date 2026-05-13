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
import { authService, projectService, taskService } from '@gantt/mcp/services';
import type { Task } from '@gantt/mcp/types';
import { getPrisma } from '@gantt/runtime-core/prisma';
import { sendOtpEmail, sendProjectGroupInviteEmail } from '../email.js';
import {
  generateOtp,
  signAccessToken,
  signRefreshToken,
  verifyToken,
} from '../auth.js';
import { authMiddleware } from '../middleware/auth-middleware.js';
import { isAdminEmail } from '../middleware/admin-middleware.js';
import { requireTrackedLimit } from '../middleware/constraint-middleware.js';
import { BillingService } from '../services/billing-service.js';
import { YandexAuthError, YandexAuthService } from '../services/yandex-auth-service.js';
import { resolveGroupAccess, resolveProjectAccess } from '../access-control.js';
import { randomBytes, randomUUID } from 'node:crypto';
import type { ProjectSectionAccessLevel, ProjectSectionPermissions } from '@gantt/runtime-core/types';

const requireProjectLimit = requireTrackedLimit('projects', {
  code: 'PROJECT_LIMIT_REACHED',
  upgradeHint: 'Upgrade your plan to create or restore more active projects.',
});
const billingService = new BillingService();

type AuthSuccessResponse = {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string };
  project: {
    id: string;
    name: string;
    groupId: string;
    status: 'active' | 'archived' | 'deleted';
    ganttDayMode: 'business' | 'calendar';
    calendarId: string | null;
    calendarDays: Array<{ date: string; kind: 'working' | 'non_working' | 'shortened' }>;
    timelineMarkers: Array<{ date: string; color?: string | null; name?: string | null }>;
    hiddenTaskListColumnsDefault: string[] | null;
    archivedAt: string | null;
    deletedAt: string | null;
  };
};

function normalizeTimelineMarkersInput(value: unknown): Array<{ date: string; color?: string; name?: string }> | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const normalized: Array<{ date: string; color?: string; name?: string }> = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') {
      return null;
    }

    const marker = entry as { date?: unknown; color?: unknown; name?: unknown };
    const date = typeof marker.date === 'string' ? marker.date.trim().slice(0, 10) : '';
    if (!date) {
      return null;
    }

    const nextMarker: { date: string; color?: string; name?: string } = { date };
    if (marker.color !== undefined) {
      if (typeof marker.color !== 'string') {
        return null;
      }
      const color = marker.color.trim();
      if (color) {
        nextMarker.color = color;
      }
    }
    if (marker.name !== undefined) {
      if (typeof marker.name !== 'string') {
        return null;
      }
      const name = marker.name.trim();
      if (name) {
        nextMarker.name = name.slice(0, 200);
      }
    }

    normalized.push(nextMarker);
  }

  return normalized;
}

function normalizeHiddenTaskListColumnsInput(value: unknown): string[] | null {
  if (value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    return null;
  }

  return value.flatMap((entry) => (
    typeof entry === 'string' && entry.trim()
      ? [entry.trim()]
      : []
  ));
}

async function issueLocalAuthSession(email: string): Promise<AuthSuccessResponse> {
  const user = await authService.findOrCreateUser(email);
  await authService.syncPendingGroupInvitesForUser(user.id, user.email);
  const project = await authService.ensurePrimaryProject(user.id);
  const session = await authService.createSession(user.id, project.id, '', '');

  const tokenPayload = {
    sub: user.id,
    email: user.email,
    projectId: project.id,
    sessionId: session.id,
  };

  const accessToken = signAccessToken(tokenPayload);
  const refreshToken = signRefreshToken(tokenPayload);

  await authService.updateSessionTokens(session.id, accessToken, refreshToken);

  return {
    accessToken,
    refreshToken,
    user: { id: user.id, email: user.email },
    project: {
      id: project.id,
      name: project.name,
      groupId: project.groupId ?? '',
      status: project.status,
      ganttDayMode: project.ganttDayMode,
      calendarId: project.calendarId,
      calendarDays: project.calendarDays,
      timelineMarkers: project.timelineMarkers,
      hiddenTaskListColumnsDefault: project.hiddenTaskListColumnsDefault,
      archivedAt: project.archivedAt,
      deletedAt: project.deletedAt,
    },
  };
}

const yandexAuthService = new YandexAuthService();

function mapYandexAuthError(error: unknown): { status: number; body: { error: string } } {
  if (!(error instanceof YandexAuthError)) {
    return { status: 500, body: { error: 'Yandex auth failed' } };
  }

  switch (error.code) {
    case 'missing_token':
    case 'profile_without_email':
      return { status: 400, body: { error: error.message } };
    case 'invalid_token':
      return { status: 401, body: { error: error.message } };
    case 'upstream_failure':
    default:
      return { status: 502, body: { error: error.message } };
  }
}

type CreateShareLinkBody = {
  scope?: 'project' | 'task_selection';
  includedTaskIds?: string[];
  label?: string;
};

type UpdateShareLinkBody = {
  label?: string;
};

type InviteRole = 'editor' | 'viewer';
type SectionPermissionsBody = Partial<Record<'schedule' | 'resources' | 'finance', unknown>>;
type NormalizedSectionPermissions = ProjectSectionPermissions;

function normalizeInviteRole(role: unknown): InviteRole {
  return role === 'viewer' ? 'viewer' : 'editor';
}

function normalizeSectionAccessLevel(value: unknown, fallback: ProjectSectionAccessLevel): ProjectSectionAccessLevel {
  return value === 'none' || value === 'view' || value === 'edit' ? value : fallback;
}

function normalizeSectionPermissions(
  permissions: unknown,
  fallbackRole: InviteRole = 'editor',
): NormalizedSectionPermissions {
  const fallback: NormalizedSectionPermissions = fallbackRole === 'viewer'
    ? { schedule: 'view', resources: 'view', finance: 'view' }
    : { schedule: 'edit', resources: 'edit', finance: 'edit' };

  if (!permissions || typeof permissions !== 'object') {
    return fallback;
  }

  const candidate = permissions as SectionPermissionsBody;
  return {
    schedule: normalizeSectionAccessLevel(candidate.schedule, fallback.schedule),
    resources: normalizeSectionAccessLevel(candidate.resources, fallback.resources),
    finance: normalizeSectionAccessLevel(candidate.finance, fallback.finance),
  };
}

function roleFromPermissions(permissions: NormalizedSectionPermissions): InviteRole {
  return permissions.schedule !== 'edit' && permissions.resources !== 'edit' && permissions.finance !== 'edit'
    ? 'viewer'
    : 'editor';
}

function normalizeInviteEmail(email: unknown): string | null {
  if (typeof email !== 'string') {
    return null;
  }
  const trimmed = email.trim().toLowerCase();
  return trimmed.includes('@') ? trimmed : null;
}

function generateInviteToken(): string {
  return randomBytes(24).toString('base64url');
}

function buildShareOrigin(req: {
  headers: Record<string, unknown>;
}): string {
  const proto = (req.headers['x-forwarded-proto'] as string | undefined) ?? 'http';
  const host = (req.headers.host as string | undefined) ?? 'localhost:3000';
  return (req.headers.origin as string | undefined) ?? `${proto}://${host}`;
}

function buildShareUrl(origin: string, token: string): string {
  return `${origin}/?share=${encodeURIComponent(token)}`;
}

function sanitizeShareLabel(label: string | undefined, fallback: string): string {
  const trimmed = label?.trim();
  return trimmed ? trimmed.slice(0, 120) : fallback;
}

async function listAllProjectTasks(projectId: string): Promise<Task[]> {
  const tasks: Task[] = [];
  const pageSize = 1000;
  let offset = 0;

  while (true) {
    const page = await taskService.list(projectId, undefined, pageSize, offset);
    tasks.push(...page.tasks);
    if (!page.hasMore) {
      break;
    }
    offset += pageSize;
  }

  return tasks;
}

function buildScopedShareTasks(tasks: Task[], includedTaskIds: string[]): Task[] {
  const taskMap = new Map(tasks.map((task) => [task.id, task]));
  const selectedTaskIds = Array.from(new Set(includedTaskIds.filter((taskId) => taskMap.has(taskId))));
  const visibleIds = new Set<string>();

  for (const taskId of selectedTaskIds) {
    let currentId: string | undefined = taskId;
    while (currentId) {
      if (visibleIds.has(currentId)) {
        break;
      }
      visibleIds.add(currentId);
      currentId = taskMap.get(currentId)?.parentId;
    }
  }

  return tasks
    .filter((task) => visibleIds.has(task.id))
    .map((task) => ({
      ...task,
      dependencies: (task.dependencies ?? []).filter((dependency) => visibleIds.has(dependency.taskId)),
    }));
}

function buildSharePreviewTitles(tasks: Task[], scope: 'project' | 'task_selection', includedTaskIds: string[]): string[] {
  if (tasks.length === 0) {
    return [];
  }

  const taskMap = new Map(tasks.map((task) => [task.id, task]));
  const orderedIds = tasks.map((task) => task.id);
  const visibleTaskIds = scope === 'task_selection'
    ? Array.from(new Set(includedTaskIds.filter((taskId) => taskMap.has(taskId))))
    : orderedIds;
  const visibleIdSet = new Set(visibleTaskIds);
  const childCounts = new Map<string, number>();

  for (const task of tasks) {
    if (task.parentId && visibleIdSet.has(task.id) && visibleIdSet.has(task.parentId)) {
      childCounts.set(task.parentId, (childCounts.get(task.parentId) ?? 0) + 1);
    }
  }

  const rootCandidates = visibleTaskIds.filter((taskId) => {
    const task = taskMap.get(taskId);
    return task && (!task.parentId || !visibleIdSet.has(task.parentId));
  });

  const preferredIds = rootCandidates.filter((taskId) => (childCounts.get(taskId) ?? 0) > 0);
  const fallbackIds = rootCandidates.filter((taskId) => (childCounts.get(taskId) ?? 0) === 0);
  const orderedPreviewIds = [...preferredIds, ...fallbackIds];
  const titles: string[] = [];
  const seenNames = new Set<string>();

  for (const taskId of orderedPreviewIds) {
    const name = taskMap.get(taskId)?.name?.trim();
    if (!name || seenNames.has(name)) {
      continue;
    }

    seenNames.add(name);
    titles.push(name);
    if (titles.length >= 5) {
      break;
    }
  }

  return titles;
}

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

    return reply.send(await issueLocalAuthSession(email));
  });

  // ---------------------------------------------------------------------------
  // POST /api/auth/yandex
  // ---------------------------------------------------------------------------
  fastify.post('/api/auth/yandex', async (req, reply) => {
    const body = req.body as { accessToken?: string };
    const accessToken = body?.accessToken?.trim();

    if (!accessToken) {
      return reply.status(400).send({ error: 'accessToken required' });
    }

    try {
      const profile = await yandexAuthService.getProfile(accessToken);
      return reply.send(await issueLocalAuthSession(profile.defaultEmail));
    } catch (error) {
      const response = mapYandexAuthError(error);
      if (response.status >= 500) {
        fastify.log.error(error, 'Yandex auth failed');
      }
      return reply.status(response.status).send(response.body);
    }
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
      const { getPrisma } = await import('@gantt/runtime-core/prisma');
      const prisma = getPrisma();
      const sessionUser = await authService.findUserById(session.userId);
      const deletedProject = isAdminEmail(sessionUser?.email)
        ? await prisma.project.findUnique({
          where: { id: session.projectId },
          select: { id: true, status: true },
        })
        : null;

      if (deletedProject) {
        resolvedProjectId = deletedProject.id;
      } else {
        const projects = await authService.listProjects(session.userId);
        const fallbackProject = projects.find((item) => item.status === 'active') ?? projects[0];
        if (fallbackProject) {
          await authService.updateSessionProject(session.id, fallbackProject.id);
          resolvedProjectId = fallbackProject.id;
        }
      }
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
        groupId: project.groupId,
        status: project.status,
        ganttDayMode: project.ganttDayMode,
        calendarId: project.calendarId,
        calendarDays: project.calendarDays,
        timelineMarkers: project.timelineMarkers,
        hiddenTaskListColumnsDefault: project.hiddenTaskListColumnsDefault,
        archivedAt: project.archivedAt,
        deletedAt: project.deletedAt,
      },
    });
  });

  fastify.get<{ Params: { id: string } }>('/api/projects/:id/share-links', { preHandler: [authMiddleware] }, async (req, reply) => {
    const { id: projectId } = req.params;
    const access = await resolveProjectAccess(req.user!.userId, projectId);
    const project = access ? await authService.findProjectById(projectId) : null;

    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    const origin = buildShareOrigin(req);
    const links = await authService.listShareLinks(projectId);
    const allTasks = links.length > 0 ? await listAllProjectTasks(projectId) : [];

    return reply.send({
      links: links.map((link) => ({
        ...link,
        previewTitles: buildSharePreviewTitles(allTasks, link.scope, link.includedTaskIds),
        url: buildShareUrl(origin, link.id),
      })),
    });
  });

  fastify.post<{ Params: { id: string } }>('/api/projects/:id/share-links', { preHandler: [authMiddleware] }, async (req, reply) => {
    const { id: projectId } = req.params;
    const body = (req.body ?? {}) as CreateShareLinkBody;
    const access = await resolveProjectAccess(req.user!.userId, projectId);
    const project = access ? await authService.findProjectById(projectId) : null;

    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }
    if (!access?.canEdit) {
      return reply.status(403).send({ error: 'Project is read-only for this user' });
    }

    const scope = body.scope === 'task_selection' ? 'task_selection' : 'project';
    const allTasks = scope === 'task_selection' ? await listAllProjectTasks(projectId) : [];
    const taskMap = new Map(allTasks.map((task) => [task.id, task]));
    const includedTaskIds = scope === 'task_selection'
      ? Array.from(new Set((body.includedTaskIds ?? []).filter((taskId): taskId is string => typeof taskId === 'string' && taskMap.has(taskId))))
      : [];

    if (scope === 'task_selection' && includedTaskIds.length === 0) {
      return reply.status(400).send({ error: 'includedTaskIds required for task_selection share links' });
    }

    const fallbackLabel = project.name;
    const shareLink = await authService.createShareLink({
      projectId,
      label: sanitizeShareLabel(body.label, fallbackLabel),
      scope,
      includedTaskIds,
    });
    const origin = buildShareOrigin(req);

    return reply.send({
      link: {
        ...shareLink,
        url: buildShareUrl(origin, shareLink.id),
      },
      project: {
        id: project.id,
        name: project.name,
        groupId: project.groupId,
        status: project.status,
        ganttDayMode: project.ganttDayMode,
        calendarId: project.calendarId,
        calendarDays: project.calendarDays,
        timelineMarkers: project.timelineMarkers,
        hiddenTaskListColumnsDefault: project.hiddenTaskListColumnsDefault,
        archivedAt: project.archivedAt,
        deletedAt: project.deletedAt,
      },
    });
  });

  fastify.post<{ Params: { id: string; shareLinkId: string } }>('/api/projects/:id/share-links/:shareLinkId/revoke', { preHandler: [authMiddleware] }, async (req, reply) => {
    const { id: projectId, shareLinkId } = req.params;
    const access = await resolveProjectAccess(req.user!.userId, projectId);
    const project = access ? await authService.findProjectById(projectId) : null;

    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }
    if (!access?.canEdit) {
      return reply.status(403).send({ error: 'Project is read-only for this user' });
    }

    const link = await authService.revokeShareLink(shareLinkId, projectId);
    if (!link) {
      return reply.status(404).send({ error: 'Share link not found' });
    }

    return reply.send({ link });
  });

  fastify.patch<{ Params: { id: string; shareLinkId: string } }>('/api/projects/:id/share-links/:shareLinkId', { preHandler: [authMiddleware] }, async (req, reply) => {
    const { id: projectId, shareLinkId } = req.params;
    const body = (req.body ?? {}) as UpdateShareLinkBody;
    const access = await resolveProjectAccess(req.user!.userId, projectId);
    const project = access ? await authService.findProjectById(projectId) : null;

    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }
    if (!access?.canEdit) {
      return reply.status(403).send({ error: 'Project is read-only for this user' });
    }

    const updated = await authService.updateShareLink(shareLinkId, projectId, {
      label: sanitizeShareLabel(body.label, project.name),
    });

    if (!updated) {
      return reply.status(404).send({ error: 'Share link not found' });
    }

    const origin = buildShareOrigin(req);
    const allTasks = updated.scope === 'task_selection' ? await listAllProjectTasks(projectId) : [];

    return reply.send({
      link: {
        ...updated,
        previewTitles: buildSharePreviewTitles(allTasks, updated.scope, updated.includedTaskIds),
        url: buildShareUrl(origin, updated.id),
      },
    });
  });

  fastify.post<{ Params: { id: string } }>('/api/projects/:id/share', { preHandler: [authMiddleware] }, async (req, reply) => {
    const { id: projectId } = req.params;
    const access = await resolveProjectAccess(req.user!.userId, projectId);
    const project = access ? await authService.findProjectById(projectId) : null;

    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }
    if (!access?.canEdit) {
      return reply.status(403).send({ error: 'Project is read-only for this user' });
    }

    const shareLink = await authService.createShareLink({
      projectId,
      scope: 'project',
      label: project.name,
    });
    const origin = buildShareOrigin(req);

    return reply.send({
      token: shareLink.id,
      url: buildShareUrl(origin, shareLink.id),
      project: {
        id: project.id,
        name: project.name,
        groupId: project.groupId,
        status: project.status,
        ganttDayMode: project.ganttDayMode,
        calendarId: project.calendarId,
        calendarDays: project.calendarDays,
        timelineMarkers: project.timelineMarkers,
        hiddenTaskListColumnsDefault: project.hiddenTaskListColumnsDefault,
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

    const shareLink = await authService.findActiveShareLinkById(token);
    if (!shareLink) {
      return reply.status(404).send({ error: 'Share link not found' });
    }

    const project = await authService.findProjectById(shareLink.projectId);
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    const allTasks = await listAllProjectTasks(project.id);
    const tasks = shareLink.scope === 'task_selection'
      ? buildScopedShareTasks(allTasks, shareLink.includedTaskIds)
      : allTasks;

    if (shareLink.scope === 'task_selection' && tasks.length === 0) {
      return reply.status(404).send({ error: 'Share link content not found' });
    }

    return reply.send({
      shareLink: {
        id: shareLink.id,
        label: shareLink.label,
        scope: shareLink.scope,
      },
      project: {
        id: project.id,
        name: project.name,
        groupId: project.groupId,
        ganttDayMode: project.ganttDayMode,
        calendarId: project.calendarId,
        calendarDays: project.calendarDays,
        timelineMarkers: project.timelineMarkers,
        hiddenTaskListColumnsDefault: project.hiddenTaskListColumnsDefault,
      },
      tasks,
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/projects
  // ---------------------------------------------------------------------------
  fastify.get('/api/projects', { preHandler: [authMiddleware] }, async (req, reply) => {
    await authService.syncPendingGroupInvitesForUser(req.user!.userId, req.user!.email);
    const projects = await authService.listProjects(req.user!.userId);
    return reply.send({ projects });
  });

  fastify.get('/api/project-groups', { preHandler: [authMiddleware] }, async (req, reply) => {
    await authService.syncPendingGroupInvitesForUser(req.user!.userId, req.user!.email);
    const groups = await projectService.listGroupsByUser(req.user!.userId);
    return reply.send({ groups });
  });

  fastify.post('/api/project-groups', { preHandler: [authMiddleware] }, async (req, reply) => {
    const body = req.body as { name?: string };
    const name = body.name?.trim();
    if (!name) {
      return reply.status(400).send({ error: 'name required' });
    }

    const billingStatus = await billingService.getSubscriptionStatus(req.user!.userId);
    if (billingStatus.plan === 'free' && billingStatus.billingState !== 'trial_active') {
      return reply.status(403).send({ error: 'Project groups are not available on the free plan' });
    }

    const group = await projectService.createGroup(req.user!.userId, name);
    return reply.status(201).send({ group });
  });

  fastify.patch<{ Params: { id: string } }>('/api/project-groups/:id', { preHandler: [authMiddleware] }, async (req, reply) => {
    const access = await resolveGroupAccess(req.user!.userId, req.params.id);
    if (!access) {
      return reply.status(404).send({ error: 'Project group not found' });
    }
    if (access.role !== 'owner') {
      return reply.status(403).send({ error: 'Project group owner access required' });
    }

    const body = req.body as { name?: string };
    const name = body.name?.trim();
    if (!name) {
      return reply.status(400).send({ error: 'name required' });
    }

    const group = await projectService.updateGroup(req.params.id, req.user!.userId, { name });
    if (!group) {
      return reply.status(404).send({ error: 'Project group not found' });
    }

    return reply.send({ group });
  });

  fastify.delete<{ Params: { id: string } }>('/api/project-groups/:id', { preHandler: [authMiddleware] }, async (req, reply) => {
    const access = await resolveGroupAccess(req.user!.userId, req.params.id);
    if (!access) {
      return reply.status(404).send({ error: 'Project group not found' });
    }
    if (access.role !== 'owner') {
      return reply.status(403).send({ error: 'Project group owner access required' });
    }

    const result = await projectService.deleteGroup(req.params.id, req.user!.userId);
    if (result.ok) {
      return reply.send({ ok: true });
    }
    if (result.reason === 'default_group') {
      return reply.status(409).send({ error: 'Default project group cannot be deleted' });
    }
    return reply.status(404).send({ error: 'Project group not found' });
  });

  fastify.get<{ Params: { id: string } }>('/api/project-groups/:id/members', { preHandler: [authMiddleware] }, async (req, reply) => {
    const access = await resolveGroupAccess(req.user!.userId, req.params.id);
    if (!access) {
      return reply.status(404).send({ error: 'Project group not found' });
    }

    const prisma = getPrisma();
    const [owner, members, invites] = await Promise.all([
      prisma.user.findUnique({
        where: { id: access.ownerUserId },
        select: { id: true, email: true },
      }),
      prisma.projectGroupMember.findMany({
        where: { groupId: req.params.id },
        include: { user: { select: { id: true, email: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      access.role === 'owner'
        ? prisma.projectGroupInvite.findMany({
          where: { groupId: req.params.id, status: 'pending' },
          orderBy: { createdAt: 'desc' },
        })
        : Promise.resolve([]),
    ]);

    return reply.send({
      owner: owner ? { id: owner.id, email: owner.email, role: 'owner' } : null,
      members: members.map((member) => ({
        userId: member.userId,
        email: member.user.email,
        role: member.role,
        permissions: {
          schedule: member.scheduleAccess,
          resources: member.resourcesAccess,
          finance: member.financeAccess,
        },
        createdAt: member.createdAt.toISOString(),
      })),
      invites: invites.map((invite) => ({
        id: invite.id,
        email: invite.email,
        role: invite.role,
        permissions: {
          schedule: invite.scheduleAccess,
          resources: invite.resourcesAccess,
          finance: invite.financeAccess,
        },
        status: invite.status,
        expiresAt: invite.expiresAt.toISOString(),
        createdAt: invite.createdAt.toISOString(),
      })),
    });
  });

  fastify.post<{ Params: { id: string } }>('/api/project-groups/:id/invites', { preHandler: [authMiddleware] }, async (req, reply) => {
    const access = await resolveGroupAccess(req.user!.userId, req.params.id);
    if (!access) {
      return reply.status(404).send({ error: 'Project group not found' });
    }
    if (access.role !== 'owner') {
      return reply.status(403).send({ error: 'Project group owner access required' });
    }

    const body = (req.body ?? {}) as { email?: unknown; role?: unknown; permissions?: unknown };
    const email = normalizeInviteEmail(body.email);
    if (!email) {
      return reply.status(400).send({ error: 'valid email required' });
    }

    const initialRole = normalizeInviteRole(body.role);
    const permissions = normalizeSectionPermissions(body.permissions, initialRole);
    const role = roleFromPermissions(permissions);
    const prisma = getPrisma();
    const existingUser = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existingUser?.id === access.ownerUserId) {
      return reply.status(409).send({ error: 'User is already the group owner' });
    }

    if (existingUser) {
      const existingMember = await prisma.projectGroupMember.findUnique({
        where: { groupId_userId: { groupId: req.params.id, userId: existingUser.id } },
        select: { id: true },
      });
      if (existingMember) {
        return reply.status(409).send({ error: 'User is already a group member' });
      }
    }

    await prisma.projectGroupInvite.updateMany({
      where: { groupId: req.params.id, email, status: 'pending' },
      data: { status: 'revoked', revokedAt: new Date() },
    });

    const invite = await prisma.projectGroupInvite.create({
      data: {
        id: randomUUID(),
        groupId: req.params.id,
        email,
        role,
        scheduleAccess: permissions.schedule,
        resourcesAccess: permissions.resources,
        financeAccess: permissions.finance,
        token: generateInviteToken(),
        invitedByUserId: req.user!.userId,
        expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      },
    });

    await sendProjectGroupInviteEmail({
      to: invite.email,
      inviterEmail: req.user!.email,
      groupName: req.params.id === access.groupId ? (await prisma.projectGroup.findUnique({
        where: { id: req.params.id },
        select: { name: true },
      }))?.name ?? 'Команда' : 'Команда',
      role: invite.role,
      expiresAt: invite.expiresAt,
    });

    return reply.status(201).send({
      invite: {
        id: invite.id,
        email: invite.email,
        role: invite.role,
        permissions,
        token: invite.token,
        status: invite.status,
        expiresAt: invite.expiresAt.toISOString(),
        createdAt: invite.createdAt.toISOString(),
      },
    });
  });

  fastify.patch<{ Params: { id: string; inviteId: string } }>('/api/project-groups/:id/invites/:inviteId', { preHandler: [authMiddleware] }, async (req, reply) => {
    const access = await resolveGroupAccess(req.user!.userId, req.params.id);
    if (!access) {
      return reply.status(404).send({ error: 'Project group not found' });
    }
    if (access.role !== 'owner') {
      return reply.status(403).send({ error: 'Project group owner access required' });
    }

    const body = (req.body ?? {}) as { role?: unknown; permissions?: unknown };
    const permissions = normalizeSectionPermissions(body.permissions, normalizeInviteRole(body.role));
    const role = roleFromPermissions(permissions);
    const invite = await getPrisma().projectGroupInvite.updateMany({
      where: { id: req.params.inviteId, groupId: req.params.id, status: 'pending' },
      data: {
        role,
        scheduleAccess: permissions.schedule,
        resourcesAccess: permissions.resources,
        financeAccess: permissions.finance,
      },
    });
    if (invite.count === 0) {
      return reply.status(404).send({ error: 'Project group invite not found' });
    }

    return reply.send({ invite: { id: req.params.inviteId, role, permissions } });
  });

  fastify.delete<{ Params: { id: string; inviteId: string } }>('/api/project-groups/:id/invites/:inviteId', { preHandler: [authMiddleware] }, async (req, reply) => {
    const access = await resolveGroupAccess(req.user!.userId, req.params.id);
    if (!access) {
      return reply.status(404).send({ error: 'Project group not found' });
    }
    if (access.role !== 'owner') {
      return reply.status(403).send({ error: 'Project group owner access required' });
    }

    const result = await getPrisma().projectGroupInvite.updateMany({
      where: { id: req.params.inviteId, groupId: req.params.id, status: 'pending' },
      data: { status: 'revoked', revokedAt: new Date() },
    });
    if (result.count === 0) {
      return reply.status(404).send({ error: 'Project group invite not found' });
    }

    return reply.send({ ok: true });
  });

  fastify.patch<{ Params: { id: string; userId: string } }>('/api/project-groups/:id/members/:userId', { preHandler: [authMiddleware] }, async (req, reply) => {
    const access = await resolveGroupAccess(req.user!.userId, req.params.id);
    if (!access) {
      return reply.status(404).send({ error: 'Project group not found' });
    }
    if (access.role !== 'owner') {
      return reply.status(403).send({ error: 'Project group owner access required' });
    }

    const body = (req.body ?? {}) as { role?: unknown; permissions?: unknown };
    const permissions = normalizeSectionPermissions(body.permissions, normalizeInviteRole(body.role));
    const role = roleFromPermissions(permissions);
    const member = await getPrisma().projectGroupMember.update({
      where: { groupId_userId: { groupId: req.params.id, userId: req.params.userId } },
      data: {
        role,
        scheduleAccess: permissions.schedule,
        resourcesAccess: permissions.resources,
        financeAccess: permissions.finance,
      },
    }).catch(() => null);
    if (!member) {
      return reply.status(404).send({ error: 'Project group member not found' });
    }

    return reply.send({ member: { userId: member.userId, role: member.role, permissions } });
  });

  fastify.delete<{ Params: { id: string; userId: string } }>('/api/project-groups/:id/members/:userId', { preHandler: [authMiddleware] }, async (req, reply) => {
    const access = await resolveGroupAccess(req.user!.userId, req.params.id);
    if (!access) {
      return reply.status(404).send({ error: 'Project group not found' });
    }
    if (access.role !== 'owner') {
      return reply.status(403).send({ error: 'Project group owner access required' });
    }

    await getPrisma().projectGroupMember.delete({
      where: { groupId_userId: { groupId: req.params.id, userId: req.params.userId } },
    }).catch(() => null);

    return reply.send({ ok: true });
  });

  fastify.post<{ Params: { id: string }; Body: { userId?: unknown } }>('/api/project-groups/:id/transfer-owner', { preHandler: [authMiddleware] }, async (req, reply) => {
    const access = await resolveGroupAccess(req.user!.userId, req.params.id);
    if (!access) {
      return reply.status(404).send({ error: 'Project group not found' });
    }
    if (access.role !== 'owner') {
      return reply.status(403).send({ error: 'Project group owner access required' });
    }

    const targetUserId = typeof req.body?.userId === 'string' ? req.body.userId.trim() : '';
    if (!targetUserId) {
      return reply.status(400).send({ error: 'userId required' });
    }
    if (targetUserId === access.ownerUserId) {
      return reply.status(409).send({ error: 'User is already the group owner' });
    }

    const prisma = getPrisma();
    const targetMember = await prisma.projectGroupMember.findUnique({
      where: { groupId_userId: { groupId: req.params.id, userId: targetUserId } },
      include: { user: { select: { email: true } } },
    });
    if (!targetMember) {
      return reply.status(404).send({ error: 'Target user must be an accepted group member' });
    }

    await prisma.$transaction(async (tx) => {
      const groupProjects = await tx.project.findMany({
        where: { groupId: req.params.id },
        select: { id: true },
      });
      const projectIds = groupProjects.map((project) => project.id);

      await tx.projectGroup.update({
        where: { id: req.params.id },
        data: { userId: targetUserId },
      });

      await tx.project.updateMany({
        where: { groupId: req.params.id },
        data: { userId: targetUserId },
      });

      await tx.resource.updateMany({
        where: {
          OR: [
            { projectGroupId: req.params.id },
            ...(projectIds.length > 0 ? [{ projectId: { in: projectIds } }] : []),
          ],
        },
        data: { userId: targetUserId },
      });

      await tx.projectGroupMember.delete({
        where: { groupId_userId: { groupId: req.params.id, userId: targetUserId } },
      });

      await tx.projectGroupMember.upsert({
        where: { groupId_userId: { groupId: req.params.id, userId: access.ownerUserId } },
        create: {
          id: randomUUID(),
          groupId: req.params.id,
          userId: access.ownerUserId,
          role: 'editor',
          scheduleAccess: 'edit',
          resourcesAccess: 'edit',
          financeAccess: 'edit',
        },
        update: {
          role: 'editor',
          scheduleAccess: 'edit',
          resourcesAccess: 'edit',
          financeAccess: 'edit',
        },
      });

      await tx.projectGroupInvite.updateMany({
        where: { groupId: req.params.id, email: targetMember.user.email, status: 'pending' },
        data: { status: 'revoked', revokedAt: new Date() },
      });
    });

    const group = await prisma.projectGroup.findUnique({
      where: { id: req.params.id },
      include: {
        members: {
          where: { userId: req.user!.userId },
          select: { role: true, scheduleAccess: true, resourcesAccess: true, financeAccess: true },
        },
        _count: {
          select: { projects: true },
        },
      },
    });

    return reply.send({
      group: group ? {
        id: group.id,
        userId: group.userId,
        name: group.name,
        isDefault: group.isDefault,
        createdAt: group.createdAt.toISOString(),
        updatedAt: group.updatedAt.toISOString(),
        projectCount: group._count.projects,
        accessRole: group.userId === req.user!.userId
          ? 'owner'
          : roleFromPermissions({
            schedule: group.members[0]?.scheduleAccess ?? 'view',
            resources: group.members[0]?.resourcesAccess ?? 'view',
            finance: group.members[0]?.financeAccess ?? 'view',
          }),
        permissions: group.userId === req.user!.userId
          ? { schedule: 'edit', resources: 'edit', finance: 'edit' }
          : {
            schedule: group.members[0]?.scheduleAccess ?? 'view',
            resources: group.members[0]?.resourcesAccess ?? 'view',
            finance: group.members[0]?.financeAccess ?? 'view',
          },
      } : null,
    });
  });

  fastify.post<{ Params: { token: string } }>('/api/invites/:token/accept', { preHandler: [authMiddleware] }, async (req, reply) => {
    const token = req.params.token.trim();
    if (!token) {
      return reply.status(400).send({ error: 'token required' });
    }

    const prisma = getPrisma();
    const invite = await prisma.projectGroupInvite.findUnique({ where: { token } });
    if (!invite || invite.status !== 'pending') {
      return reply.status(404).send({ error: 'Invite not found' });
    }
    if (invite.expiresAt.getTime() < Date.now()) {
      await prisma.projectGroupInvite.update({
        where: { id: invite.id },
        data: { status: 'expired' },
      });
      return reply.status(410).send({ error: 'Invite expired' });
    }
    if (invite.email !== req.user!.email.trim().toLowerCase()) {
      return reply.status(403).send({ error: 'Invite email does not match current user' });
    }

    const member = await prisma.$transaction(async (tx) => {
      const nextMember = await tx.projectGroupMember.upsert({
        where: { groupId_userId: { groupId: invite.groupId, userId: req.user!.userId } },
        create: {
          id: randomUUID(),
          groupId: invite.groupId,
          userId: req.user!.userId,
          role: invite.role,
          scheduleAccess: invite.scheduleAccess,
          resourcesAccess: invite.resourcesAccess,
          financeAccess: invite.financeAccess,
          invitedByUserId: invite.invitedByUserId,
        },
        update: {
          role: invite.role,
          scheduleAccess: invite.scheduleAccess,
          resourcesAccess: invite.resourcesAccess,
          financeAccess: invite.financeAccess,
        },
      });
      await tx.projectGroupInvite.update({
        where: { id: invite.id },
        data: { status: 'accepted', acceptedAt: new Date() },
      });
      return nextMember;
    });

    return reply.send({ member: { groupId: member.groupId, userId: member.userId, role: member.role } });
  });

  // ---------------------------------------------------------------------------
  // POST /api/projects
  // ---------------------------------------------------------------------------
  fastify.post('/api/projects', { preHandler: [authMiddleware, requireProjectLimit] }, async (req, reply) => {
    const body = req.body as { name?: string; groupId?: string };
    const { name } = body;

    if (!name || !name.trim()) {
      return reply.status(400).send({ error: 'name required' });
    }

    const currentProject = await authService.findProjectById(req.user!.projectId);
    const groupId = body.groupId?.trim() || currentProject?.groupId;
    const groupAccess = groupId ? await resolveGroupAccess(req.user!.userId, groupId) : null;
    if (!groupAccess) {
      return reply.status(404).send({ error: 'Project group not found' });
    }
    if (!groupAccess.canEdit) {
      return reply.status(403).send({ error: 'Project group is read-only for this user' });
    }

    const project = await authService.createProject(groupAccess.ownerUserId, name.trim(), groupId);
    return reply.send({ project });
  });

  // ---------------------------------------------------------------------------
  // PATCH /api/projects/:id
  // ---------------------------------------------------------------------------
  fastify.patch<{ Params: { id: string } }>('/api/projects/:id', { preHandler: [authMiddleware] }, async (req, reply) => {
    const { id: projectId } = req.params;
    const body = req.body as {
      name?: string;
      ganttDayMode?: 'business' | 'calendar';
      calendarId?: string | null;
      groupId?: string;
      timelineMarkers?: Array<{ date: string; color?: string | null; name?: string | null }>;
      hiddenTaskListColumnsDefault?: string[] | null;
    };
    const name = body.name?.trim();
    const groupId = body.groupId?.trim();
    const hasName = body.name !== undefined;
    const hasGanttDayMode = body.ganttDayMode === 'business' || body.ganttDayMode === 'calendar';
    const hasGroupId = body.groupId !== undefined;
    const hasTimelineMarkers = body.timelineMarkers !== undefined;
    const hasHiddenTaskListColumnsDefault = body.hiddenTaskListColumnsDefault !== undefined;
    const normalizedTimelineMarkers = hasTimelineMarkers ? normalizeTimelineMarkersInput(body.timelineMarkers) : undefined;
    const normalizedHiddenTaskListColumnsDefault = hasHiddenTaskListColumnsDefault
      ? (body.hiddenTaskListColumnsDefault === null ? null : normalizeHiddenTaskListColumnsInput(body.hiddenTaskListColumnsDefault))
      : undefined;

    if (!hasName && body.ganttDayMode === undefined && body.calendarId === undefined && !hasGroupId && !hasTimelineMarkers && !hasHiddenTaskListColumnsDefault) {
      return reply.status(400).send({ error: 'No project fields provided' });
    }

    if (hasName && !name) {
      return reply.status(400).send({ error: 'name required' });
    }

    if (body.ganttDayMode !== undefined && !hasGanttDayMode) {
      return reply.status(400).send({ error: 'Invalid ganttDayMode' });
    }

    if (hasGroupId && !groupId) {
      return reply.status(400).send({ error: 'groupId required' });
    }

    if (hasTimelineMarkers && normalizedTimelineMarkers === null) {
      return reply.status(400).send({ error: 'Invalid timelineMarkers' });
    }

    if (hasHiddenTaskListColumnsDefault && normalizedHiddenTaskListColumnsDefault === null) {
      return reply.status(400).send({ error: 'Invalid hiddenTaskListColumnsDefault' });
    }

    const access = await resolveProjectAccess(req.user!.userId, projectId);
    if (!access) {
      return reply.status(404).send({ error: 'Project not found' });
    }
    if (!access.canEdit) {
      return reply.status(403).send({ error: 'Project is read-only for this user' });
    }
    if (hasGroupId) {
      const targetGroupAccess = await resolveGroupAccess(req.user!.userId, groupId!);
      if (!targetGroupAccess || !targetGroupAccess.canEdit || targetGroupAccess.ownerUserId !== access.ownerUserId) {
        return reply.status(404).send({ error: 'Project group not found' });
      }
    }

    const project = await authService.updateProject(projectId, access.ownerUserId, {
      ...(hasName ? { name } : {}),
      ...(hasGanttDayMode ? { ganttDayMode: body.ganttDayMode } : {}),
      ...(body.calendarId !== undefined ? { calendarId: body.calendarId } : {}),
      ...(hasGroupId ? { groupId } : {}),
      ...(hasTimelineMarkers ? { timelineMarkers: normalizedTimelineMarkers ?? [] } : {}),
      ...(hasHiddenTaskListColumnsDefault ? { hiddenTaskListColumnsDefault: normalizedHiddenTaskListColumnsDefault } : {}),
    });

    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    return reply.send({ project });
  });

  fastify.get<{ Params: { id: string } }>('/api/projects/:id/task-list-columns/override', { preHandler: [authMiddleware] }, async (req, reply) => {
    const { id: projectId } = req.params;
    const access = await resolveProjectAccess(req.user!.userId, projectId);
    if (!access) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    const preference = await authService.getProjectViewPreference(projectId, req.user!.userId);
    return reply.send({ hiddenTaskListColumns: preference?.hiddenTaskListColumns ?? null });
  });

  fastify.put<{ Params: { id: string } }>('/api/projects/:id/task-list-columns/override', { preHandler: [authMiddleware] }, async (req, reply) => {
    const { id: projectId } = req.params;
    const body = req.body as { hiddenTaskListColumns?: string[] };
    const normalizedHiddenTaskListColumns = normalizeHiddenTaskListColumnsInput(body.hiddenTaskListColumns);
    if (normalizedHiddenTaskListColumns === null) {
      return reply.status(400).send({ error: 'Invalid hiddenTaskListColumns' });
    }

    const access = await resolveProjectAccess(req.user!.userId, projectId);
    if (!access) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    const preference = await authService.upsertProjectViewPreference(projectId, req.user!.userId, normalizedHiddenTaskListColumns);
    return reply.send({ hiddenTaskListColumns: preference.hiddenTaskListColumns ?? [] });
  });

  fastify.delete<{ Params: { id: string } }>('/api/projects/:id/task-list-columns/override', { preHandler: [authMiddleware] }, async (req, reply) => {
    const { id: projectId } = req.params;
    const access = await resolveProjectAccess(req.user!.userId, projectId);
    if (!access) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    await authService.clearProjectViewPreference(projectId, req.user!.userId);
    return reply.send({ hiddenTaskListColumns: null });
  });

  fastify.post<{ Params: { id: string } }>('/api/projects/:id/archive', { preHandler: [authMiddleware] }, async (req, reply) => {
    const { id: projectId } = req.params;
    const access = await resolveProjectAccess(req.user!.userId, projectId);
    if (!access) {
      return reply.status(404).send({ error: 'Project not found' });
    }
    if (!access.canEdit) {
      return reply.status(403).send({ error: 'Project is read-only for this user' });
    }

    const result = await authService.archiveProject(projectId, access.ownerUserId);

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
    const access = await resolveProjectAccess(req.user!.userId, projectId);
    if (!access) {
      return reply.status(404).send({ error: 'Project not found' });
    }
    if (!access.canEdit) {
      return reply.status(403).send({ error: 'Project is read-only for this user' });
    }

    const result = await authService.restoreProject(projectId, access.ownerUserId);

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

    const access = await resolveProjectAccess(req.user!.userId, projectId);
    if (!access) {
      return reply.status(404).send({ error: 'Project not found' });
    }
    if (!access.canEdit) {
      return reply.status(403).send({ error: 'Project is read-only for this user' });
    }

    const result = await authService.softDeleteProject(projectId, access.ownerUserId);
    if (!result.ok) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    return reply.send({ ok: true });
  });

  fastify.post<{ Params: { id: string } }>('/api/project-groups/:id/import-project', { preHandler: [authMiddleware, requireProjectLimit] }, async (req, reply) => {
    const targetGroupId = req.params.id;
    const body = (req.body ?? {}) as { projectId?: string };
    const projectId = body.projectId?.trim();
    if (!projectId) {
      return reply.status(400).send({ error: 'projectId required' });
    }

    const groupAccess = await resolveGroupAccess(req.user!.userId, targetGroupId);
    if (!groupAccess) {
      return reply.status(404).send({ error: 'Project group not found' });
    }
    if (!groupAccess.canEdit) {
      return reply.status(403).send({ error: 'Project group is read-only for this user' });
    }

    const prisma = getPrisma();
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        userId: req.user!.userId,
        status: { not: 'deleted' },
      },
      select: { id: true, groupId: true, userId: true },
    });

    if (!project) {
      return reply.status(404).send({ error: 'Personal project not found' });
    }

    if (project.userId === groupAccess.ownerUserId && project.groupId === targetGroupId) {
      const existing = await authService.findProjectById(project.id);
      return reply.send({ project: existing });
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.resource.updateMany({
        where: {
          userId: req.user!.userId,
          projectId,
        },
        data: {
          userId: groupAccess.ownerUserId,
        },
      });

      await tx.project.update({
        where: { id: projectId },
        data: {
          userId: groupAccess.ownerUserId,
          groupId: targetGroupId,
        },
      });

      return tx.project.findUniqueOrThrow({ where: { id: projectId } });
    });

    return reply.send({
      project: {
        ...(await authService.findProjectById(updated.id)),
        accessRole: groupAccess.role,
        permissions: groupAccess.permissions,
      },
    });
  });
}
