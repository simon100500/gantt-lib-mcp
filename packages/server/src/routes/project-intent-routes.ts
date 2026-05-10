import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { getPrisma } from '@gantt/runtime-core/prisma';
import { commandService, messageService, taskService, authService } from '@gantt/mcp/services';
import { authMiddleware } from '../middleware/auth-middleware.js';
import { requireTrackedLimit } from '../middleware/constraint-middleware.js';
import { resolveGroupAccess, resolveProjectAccess } from '../access-control.js';
import { signAccessToken } from '../auth.js';
import { runInitialGeneration } from '../initial-generation/orchestrator.js';
import { writeServerDebugLog } from '../debug-log.js';
import { broadcastToSession } from '../ws.js';
import { completeTextPrompt } from '../agent/pi-model.js';

const DEFAULT_INTENT_TTL_HOURS = 24;
const MIN_TEXT_LENGTH = 10;
const MAX_TEXT_LENGTH = 4000;
const MAX_SOURCE_LENGTH = 100;
const MAX_TEMPLATE_SLUG_LENGTH = 200;
const DEFAULT_PUBLIC_SITE_ORIGINS = [
  'https://getgantt.ru',
  'https://www.getgantt.ru',
  'http://localhost:4321',
  'http://127.0.0.1:4321',
];
const requireProjectLimit = requireTrackedLimit('projects', {
  code: 'PROJECT_LIMIT_REACHED',
  upgradeHint: 'Upgrade your plan to create another project.',
});

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function getAllowedSiteOrigins(): string[] {
  const rawOrigins = [
    process.env.SITE_ORIGIN,
    process.env.SITE_URL,
    process.env.PUBLIC_SITE_URL,
    process.env.CORS_SITE_ORIGIN,
  ]
    .flatMap((value) => (typeof value === 'string' ? value.split(',') : []))
    .map((value) => value.trim())
    .filter(Boolean);

  return [...new Set([...DEFAULT_PUBLIC_SITE_ORIGINS, ...rawOrigins])];
}

function applyPublicIntentCors(reply: FastifyReply, origin: string | undefined): void {
  const allowedOrigins = getAllowedSiteOrigins();
  if (!origin || !allowedOrigins.includes(origin)) {
    return;
  }

  reply.header('Access-Control-Allow-Origin', origin);
  reply.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  reply.header('Access-Control-Allow-Headers', 'Content-Type');
  reply.header('Vary', 'Origin');
}

function isIntentUnavailable(intent: { expiresAt: Date; consumedAt: Date | null }): boolean {
  return Boolean(intent.consumedAt) || intent.expiresAt.getTime() <= Date.now();
}

function getIntentUnavailableMessage(intent: { expiresAt: Date; consumedAt: Date | null }): string {
  if (intent.consumedAt) {
    return 'Intent already consumed';
  }

  return 'Intent expired';
}

function getIntentUserConnectUpdate(userId: string) {
  return {
    user: {
      connect: { id: userId },
    },
  };
}

async function executeInitialGenerationPlannerQuery(
  input: { prompt: string; model: string; onTextDelta?: (delta: string, fullText: string) => Promise<void> | void },
): Promise<{ content: string }> {
  const apiKey = process.env.OPENAI_API_KEY ?? process.env.ANTHROPIC_AUTH_TOKEN ?? '';
  if (!apiKey) {
    throw new Error('API key not configured. Set OPENAI_API_KEY or ANTHROPIC_AUTH_TOKEN in .env');
  }

  const content = await completeTextPrompt({
    env: {
      OPENAI_API_KEY: apiKey,
      OPENAI_BASE_URL: process.env.OPENAI_BASE_URL ?? 'https://api.z.ai/api/paas/v4/',
      OPENAI_MODEL: input.model,
    },
    prompt: input.prompt,
    onTextDelta: input.onTextDelta,
  });

  return { content };
}

async function executeInitialGenerationInterpretationQuery(
  input: { prompt: string; model: string },
): Promise<{ content: string }> {
  return executeInitialGenerationPlannerQuery(input);
}

function mapProjectForAuth(project: any, taskCount = 0) {
  return {
    id: project.id,
    name: project.name,
    groupId: project.groupId,
    status: project.status,
    ganttDayMode: project.ganttDayMode,
    calendarId: project.calendarId ?? null,
    calendarDays: Array.isArray(project.calendarDays) ? project.calendarDays : [],
    timelineMarkers: Array.isArray(project.timelineMarkers) ? project.timelineMarkers : [],
    taskCount,
    accessRole: project.accessRole ?? 'owner',
    permissions: project.permissions ?? { schedule: 'edit', resources: 'edit', finance: 'edit' },
    archivedAt: project.archivedAt ?? null,
    deletedAt: project.deletedAt ?? null,
  };
}

export async function registerProjectIntentRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.options('/api/public/project-intents', async (req, reply) => {
    applyPublicIntentCors(reply, typeof req.headers.origin === 'string' ? req.headers.origin : undefined);
    return reply.status(204).send();
  });

  fastify.post('/api/public/project-intents', async (req, reply) => {
    applyPublicIntentCors(reply, typeof req.headers.origin === 'string' ? req.headers.origin : undefined);

    const body = (req.body ?? {}) as { text?: unknown; source?: unknown; templateSlug?: unknown };
    const source = asNonEmptyString(body.source);
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    const templateSlug = typeof body.templateSlug === 'string' ? body.templateSlug.trim() : '';

    if (!source) {
      return reply.status(400).send({ reason: 'validation_error', error: 'source required' });
    }

    if (source.length > MAX_SOURCE_LENGTH) {
      return reply.status(400).send({ reason: 'validation_error', error: `source must be at most ${MAX_SOURCE_LENGTH} characters` });
    }

    if (text.length < MIN_TEXT_LENGTH) {
      return reply.status(400).send({ reason: 'validation_error', error: `text must be at least ${MIN_TEXT_LENGTH} characters` });
    }

    if (text.length > MAX_TEXT_LENGTH) {
      return reply.status(400).send({ reason: 'validation_error', error: `text must be at most ${MAX_TEXT_LENGTH} characters` });
    }

    if (templateSlug.length > MAX_TEMPLATE_SLUG_LENGTH) {
      return reply.status(400).send({ reason: 'validation_error', error: `templateSlug must be at most ${MAX_TEMPLATE_SLUG_LENGTH} characters` });
    }

    const prisma = getPrisma() as any;
    const intent = await prisma.projectCreationIntent.create({
      data: {
        source,
        text,
        templateSlug: templateSlug || null,
        expiresAt: new Date(Date.now() + DEFAULT_INTENT_TTL_HOURS * 60 * 60 * 1000),
      },
      select: { id: true },
    });

    return reply.status(201).send({ intentId: intent.id });
  });

  fastify.get('/api/project-intents/:intentId', { preHandler: [authMiddleware] }, async (req, reply) => {
    const intentId = asNonEmptyString((req.params as { intentId?: unknown }).intentId);
    if (!intentId) {
      return reply.status(400).send({ reason: 'validation_error', error: 'intentId required' });
    }

    const prisma = getPrisma() as any;
    const intent = await prisma.projectCreationIntent.findUnique({
      where: { id: intentId },
    });

    if (!intent) {
      return reply.status(404).send({ reason: 'not_found', error: 'Intent not found' });
    }

    if (intent.userId && intent.userId !== req.user!.userId) {
      return reply.status(404).send({ reason: 'not_found', error: 'Intent not found' });
    }

    if (isIntentUnavailable(intent)) {
      return reply.status(410).send({ reason: 'expired', error: getIntentUnavailableMessage(intent) });
    }

    const boundIntent = intent.userId
      ? intent
      : await prisma.projectCreationIntent.update({
          where: { id: intent.id },
          data: getIntentUserConnectUpdate(req.user!.userId),
        });

    return reply.send({
      id: boundIntent.id,
      text: boundIntent.text,
      source: boundIntent.source,
      projectId: boundIntent.projectId,
      requestContextId: boundIntent.requestContextId,
      historyGroupId: boundIntent.historyGroupId,
      templateSlug: boundIntent.templateSlug,
      createdAt: boundIntent.createdAt,
      expiresAt: boundIntent.expiresAt,
      consumedAt: boundIntent.consumedAt,
    });
  });

  fastify.post('/api/project-intents/:intentId/create-project', { preHandler: [authMiddleware, requireProjectLimit] }, async (req, reply) => {
    const intentId = asNonEmptyString((req.params as { intentId?: unknown }).intentId);
    const body = (req.body ?? {}) as { projectName?: unknown; groupId?: unknown };
    const projectName = typeof body.projectName === 'string' ? body.projectName.trim() : '';
    const requestedGroupId = typeof body.groupId === 'string' ? body.groupId.trim() : '';

    if (!intentId) {
      return reply.status(400).send({ reason: 'validation_error', error: 'intentId required' });
    }

    if (!projectName) {
      return reply.status(400).send({ reason: 'validation_error', error: 'projectName required' });
    }

    const prisma = getPrisma() as any;
    const intent = await prisma.projectCreationIntent.findUnique({
      where: { id: intentId },
    });

    if (!intent) {
      return reply.status(404).send({ reason: 'not_found', error: 'Intent not found' });
    }

    if (intent.userId && intent.userId !== req.user!.userId) {
      return reply.status(404).send({ reason: 'not_found', error: 'Intent not found' });
    }

    if (isIntentUnavailable(intent)) {
      return reply.status(410).send({ reason: 'expired', error: getIntentUnavailableMessage(intent) });
    }

    const currentProject = await authService.findProjectById(req.user!.projectId);
    const groupId = requestedGroupId || currentProject?.groupId;
    const groupAccess = groupId ? await resolveGroupAccess(req.user!.userId, groupId) : null;
    if (!groupAccess) {
      return reply.status(404).send({ error: 'Project group not found' });
    }
    if (!groupAccess.canEdit) {
      return reply.status(403).send({ error: 'Project group is read-only for this user' });
    }

    let preparedProjectId = typeof intent.projectId === 'string' && intent.projectId.trim() ? intent.projectId : null;
    const preparedProject = preparedProjectId ? await authService.findProjectById(preparedProjectId) : null;
    if (preparedProjectId && !preparedProject) {
      preparedProjectId = null;
    }

    if (!preparedProjectId) {
      const project = await authService.createProject(groupAccess.ownerUserId, projectName, groupId);
      preparedProjectId = project.id;

      await messageService.add('user', intent.text, project.id, {
        requestContextId: randomUUID(),
        historyGroupId: 'initial',
      });

      const latestMessage = (await messageService.list(project.id, 1))[0];
      await prisma.projectCreationIntent.update({
        where: { id: intent.id },
        data: {
          ...getIntentUserConnectUpdate(req.user!.userId),
          projectId: project.id,
          requestContextId: latestMessage?.requestContextId ?? null,
          historyGroupId: latestMessage?.historyGroupId ?? null,
        },
      });
    } else {
      const preparedAccess = await resolveProjectAccess(req.user!.userId, preparedProjectId);
      if (!preparedAccess) {
        return reply.status(404).send({ error: 'Prepared project not found' });
      }

      if (!intent.requestContextId || !intent.historyGroupId) {
        await messageService.add('user', intent.text, preparedProjectId, {
          requestContextId: randomUUID(),
          historyGroupId: 'initial',
        });

        const latestMessage = (await messageService.list(preparedProjectId, 1))[0];
        await prisma.projectCreationIntent.update({
          where: { id: intent.id },
          data: {
            requestContextId: latestMessage?.requestContextId ?? null,
            historyGroupId: latestMessage?.historyGroupId ?? null,
          },
        });
      }
    }

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
    const currentAccessToken = authHeader.slice(7);
    const currentSession = await authService.findSessionByAccessToken(currentAccessToken);
    if (!currentSession) {
      return reply.status(401).send({ error: 'Session not found' });
    }

    const nextProject = await authService.findProjectById(preparedProjectId!);
    if (!nextProject) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    const newAccessToken = signAccessToken({
      sub: req.user!.userId,
      email: req.user!.email,
      projectId: nextProject.id,
      sessionId: req.user!.sessionId,
    });

    authService.clearSessionCache(currentAccessToken);
    await authService.updateSessionTokens(req.user!.sessionId, newAccessToken, currentSession.refreshToken);
    await authService.updateSessionProject(req.user!.sessionId, nextProject.id);

    return reply.status(201).send({
      accessToken: newAccessToken,
      refreshToken: currentSession.refreshToken,
      project: mapProjectForAuth(nextProject, 0),
      generationPrepared: true,
    });
  });

  fastify.post('/api/project-intents/:intentId/start-generation', { preHandler: [authMiddleware] }, async (req, reply) => {
    const intentId = asNonEmptyString((req.params as { intentId?: unknown }).intentId);
    if (!intentId) {
      return reply.status(400).send({ reason: 'validation_error', error: 'intentId required' });
    }

    const prisma = getPrisma() as any;
    const intent = await prisma.projectCreationIntent.findUnique({
      where: { id: intentId },
    });

    if (!intent) {
      return reply.status(404).send({ reason: 'not_found', error: 'Intent not found' });
    }

    if (intent.userId && intent.userId !== req.user!.userId) {
      return reply.status(404).send({ reason: 'not_found', error: 'Intent not found' });
    }

    if (intent.consumedAt) {
      return reply.send({ ok: true, alreadyStarted: true });
    }

    if (intent.expiresAt.getTime() <= Date.now()) {
      return reply.status(410).send({ reason: 'expired', error: getIntentUnavailableMessage(intent) });
    }

    if (!intent.projectId || intent.projectId !== req.user!.projectId) {
      return reply.status(409).send({ reason: 'project_mismatch', error: 'Intent is not prepared for the active project' });
    }

    if (!intent.requestContextId || !intent.historyGroupId) {
      return reply.status(409).send({ reason: 'not_prepared', error: 'Intent is not prepared for generation' });
    }

    const { tasks } = await taskService.list(intent.projectId);
    if (tasks.length > 0) {
      return reply.status(409).send({ reason: 'project_not_empty', error: 'Initial generation requires an empty project' });
    }

    await prisma.projectCreationIntent.update({
      where: { id: intent.id },
      data: {
        consumedAt: new Date(),
      },
    });

    const runId = intent.requestContextId;
    void runInitialGeneration({
      projectId: intent.projectId,
      sessionId: req.user!.sessionId,
      runId,
      userMessage: intent.text,
      tasksBefore: [],
      baseVersion: 0,
      interpretationQuery: executeInitialGenerationInterpretationQuery,
      plannerQuery: executeInitialGenerationPlannerQuery,
      routingEnv: {
        OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? process.env.ANTHROPIC_AUTH_TOKEN ?? '',
        OPENAI_BASE_URL: process.env.OPENAI_BASE_URL ?? 'https://api.z.ai/api/paas/v4/',
        OPENAI_MODEL: process.env.OPENAI_MODEL ?? process.env.ANTHROPIC_DEFAULT_SONNET_MODEL ?? 'glm-4.7',
        OPENAI_CHEAP_MODEL: process.env.OPENAI_CHEAP_MODEL ?? process.env.cheap_model ?? undefined,
      },
      services: {
        commandService,
        messageService,
        taskService,
      },
      logger: {
        debug(event, payload) {
          void writeServerDebugLog(event, payload);
        },
      },
      broadcastToSession,
    }).catch((error: unknown) => {
      broadcastToSession(req.user!.sessionId, { type: 'error', message: String(error) });
      fastify.log.error(error, 'project intent initial generation error');
    });

    return reply.send({ ok: true, started: true });
  });

  fastify.post('/api/project-intents/:intentId/consume', { preHandler: [authMiddleware] }, async (req, reply) => {
    const intentId = asNonEmptyString((req.params as { intentId?: unknown }).intentId);
    if (!intentId) {
      return reply.status(400).send({ reason: 'validation_error', error: 'intentId required' });
    }

    const prisma = getPrisma() as any;
    const intent = await prisma.projectCreationIntent.findUnique({
      where: { id: intentId },
    });

    if (!intent) {
      return reply.status(404).send({ reason: 'not_found', error: 'Intent not found' });
    }

    if (intent.userId && intent.userId !== req.user!.userId) {
      return reply.status(404).send({ reason: 'not_found', error: 'Intent not found' });
    }

    if (isIntentUnavailable(intent)) {
      return reply.status(410).send({ reason: 'expired', error: getIntentUnavailableMessage(intent) });
    }

    await prisma.projectCreationIntent.update({
      where: { id: intent.id },
      data: {
        ...(intent.userId ? {} : getIntentUserConnectUpdate(req.user!.userId)),
        consumedAt: new Date(),
      },
    });

    return reply.send({ ok: true });
  });
}
