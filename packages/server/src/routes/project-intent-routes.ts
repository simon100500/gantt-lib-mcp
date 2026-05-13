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
import {
  markProjectGenerationJobCanceled,
  findActiveProjectGenerationJobForProject,
  findLatestProjectGenerationJobForIntent,
  findLatestProjectGenerationJobForProject,
  getProjectGenerationJobById,
  markProjectGenerationJobFailed,
  markProjectGenerationJobPreviewAvailable,
  markProjectGenerationJobRunning,
  markProjectGenerationJobSucceeded,
  reconcileProjectGenerationJobState,
  serializeProjectGenerationJob,
  startProjectGenerationJob,
} from '../services/project-generation-service.js';
import {
  registerGenerationJobCancelHandler,
  unregisterGenerationJobCancelHandler,
} from '../generation-job-control.js';
import { BillingService } from '../services/billing-service.js';
import { ConstraintService } from '../services/constraint-service.js';

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
const billingService = new BillingService();
const constraintService = new ConstraintService();

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
  input: { prompt: string; model: string; onTextDelta?: (delta: string, fullText: string) => Promise<void> | void; signal?: AbortSignal },
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
    signal: input.signal,
  });

  return { content };
}

async function executeInitialGenerationInterpretationQuery(
  input: { prompt: string; model: string; signal?: AbortSignal },
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
    calendarWeeklyPattern: project.calendarWeeklyPattern,
    calendarDays: Array.isArray(project.calendarDays) ? project.calendarDays : [],
    timelineMarkers: Array.isArray(project.timelineMarkers) ? project.timelineMarkers : [],
    taskCount,
    accessRole: project.accessRole ?? 'owner',
    permissions: project.permissions ?? { schedule: 'edit', resources: 'edit', finance: 'edit' },
    archivedAt: project.archivedAt ?? null,
    deletedAt: project.deletedAt ?? null,
  };
}

type ProjectIntentRecord = {
  id: string;
  source: string;
  text: string;
  templateSlug: string | null;
  userId: string | null;
  projectId: string | null;
  requestContextId: string | null;
  historyGroupId: string | null;
  createdAt: Date;
  expiresAt: Date;
  consumedAt: Date | null;
};

type PreparedIntentProject = {
  project: any;
  requestContextId: string | null;
  historyGroupId: string | null;
};

type SessionSwitchResult = {
  accessToken: string;
  refreshToken: string;
};

type ProjectIntentGenerationStartResult = {
  job: ReturnType<typeof serializeProjectGenerationJob> | null;
  generationStarted: boolean;
  alreadyStarted: boolean;
};

async function buildProjectLimitDenial(userId: string) {
  const [status, result] = await Promise.all([
    billingService.getSubscriptionStatus(userId),
    constraintService.checkLimit(userId, 'projects'),
  ]);

  if (result.allowed) {
    return null;
  }

  return {
    code: 'PROJECT_LIMIT_REACHED',
    limitKey: result.limitKey,
    reasonCode: result.reasonCode,
    remaining: result.remaining.remaining,
    plan: status.plan,
    planLabel: status.planMeta.label,
    upgradeHint: 'Upgrade your plan to create another project.',
    ...(result.usage.usageState === 'tracked' ? { used: result.usage.used } : {}),
    ...(result.remaining.remainingState === 'tracked' || result.remaining.remainingState === 'unlimited'
      ? { limit: result.remaining.limit }
      : {}),
  };
}

async function resolveIntentForUser(prisma: any, intentId: string, userId: string): Promise<ProjectIntentRecord | null> {
  const intent = await prisma.projectCreationIntent.findUnique({
    where: { id: intentId },
  });

  if (!intent) {
    return null;
  }

  if (intent.userId && intent.userId !== userId) {
    return null;
  }

  if (intent.userId) {
    return intent as ProjectIntentRecord;
  }

  return prisma.projectCreationIntent.update({
    where: { id: intent.id },
    data: getIntentUserConnectUpdate(userId),
  }) as Promise<ProjectIntentRecord>;
}

async function prepareIntentProject(input: {
  prisma: any;
  intent: ProjectIntentRecord;
  userId: string;
  projectName: string;
  groupId: string;
}): Promise<PreparedIntentProject> {
  let preparedProjectId = typeof input.intent.projectId === 'string' && input.intent.projectId.trim() ? input.intent.projectId : null;
  let preparedProject = preparedProjectId ? await authService.findProjectById(preparedProjectId) : null;

  if (preparedProjectId && (!preparedProject || preparedProject.status !== 'active')) {
    preparedProjectId = null;
    preparedProject = null;
  }

  if (!preparedProjectId) {
    const groupAccess = await resolveGroupAccess(input.userId, input.groupId);
    if (!groupAccess) {
      throw new Error('Project group not found');
    }
    if (!groupAccess.canEdit) {
      throw new Error('Project group is read-only for this user');
    }

    const project = await authService.createProject(groupAccess.ownerUserId, input.projectName, input.groupId);
    preparedProjectId = project.id;
    preparedProject = project;

    await messageService.add('user', input.intent.text, project.id, {
      requestContextId: randomUUID(),
      historyGroupId: 'initial',
    });

    const latestMessage = (await messageService.list(project.id, 1))[0];
    const updatedIntent = await input.prisma.projectCreationIntent.update({
      where: { id: input.intent.id },
      data: {
        ...getIntentUserConnectUpdate(input.userId),
        projectId: project.id,
        requestContextId: latestMessage?.requestContextId ?? null,
        historyGroupId: latestMessage?.historyGroupId ?? null,
      },
    });

    return {
      project: preparedProject,
      requestContextId: updatedIntent.requestContextId ?? null,
      historyGroupId: updatedIntent.historyGroupId ?? null,
    };
  }

  const preparedAccess = await resolveProjectAccess(input.userId, preparedProjectId);
  if (!preparedAccess) {
    throw new Error('Prepared project not found');
  }

  let requestContextId = input.intent.requestContextId;
  let historyGroupId = input.intent.historyGroupId;
  if (!requestContextId || !historyGroupId) {
    await messageService.add('user', input.intent.text, preparedProjectId, {
      requestContextId: randomUUID(),
      historyGroupId: 'initial',
    });

    const latestMessage = (await messageService.list(preparedProjectId, 1))[0];
    const updatedIntent = await input.prisma.projectCreationIntent.update({
      where: { id: input.intent.id },
      data: {
        requestContextId: latestMessage?.requestContextId ?? null,
        historyGroupId: latestMessage?.historyGroupId ?? null,
      },
    });
    requestContextId = updatedIntent.requestContextId ?? null;
    historyGroupId = updatedIntent.historyGroupId ?? null;
  }

  return {
    project: preparedProject!,
    requestContextId,
    historyGroupId,
  };
}

async function switchSessionToProject(input: {
  req: any;
  targetProjectId: string;
}): Promise<SessionSwitchResult> {
  const authHeader = input.req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('Unauthorized');
  }

  const currentAccessToken = authHeader.slice(7);
  const currentSession = await authService.findSessionByAccessToken(currentAccessToken);
  if (!currentSession) {
    throw new Error('Session not found');
  }

  const newAccessToken = signAccessToken({
    sub: input.req.user!.userId,
    email: input.req.user!.email,
    projectId: input.targetProjectId,
    sessionId: input.req.user!.sessionId,
  });

  authService.clearSessionCache(currentAccessToken);
  await authService.updateSessionTokens(input.req.user!.sessionId, newAccessToken, currentSession.refreshToken);
  await authService.updateSessionProject(input.req.user!.sessionId, input.targetProjectId);

  return {
    accessToken: newAccessToken,
    refreshToken: currentSession.refreshToken,
  };
}

async function startIntentGeneration(input: {
  fastify: FastifyInstance;
  intent: ProjectIntentRecord & { projectId: string; requestContextId: string; historyGroupId: string };
  user: { userId: string; sessionId: string };
}): Promise<ProjectIntentGenerationStartResult> {
  const latestIntentJob = await findLatestProjectGenerationJobForIntent(input.intent.id);
  if (latestIntentJob && ['queued', 'running', 'succeeded'].includes(latestIntentJob.status)) {
    return {
      job: serializeProjectGenerationJob(latestIntentJob),
      generationStarted: latestIntentJob.status === 'queued' || latestIntentJob.status === 'running',
      alreadyStarted: true,
    };
  }

  if (input.intent.consumedAt) {
    return {
      job: latestIntentJob ? serializeProjectGenerationJob(latestIntentJob) : null,
      generationStarted: false,
      alreadyStarted: true,
    };
  }

  const { tasks } = await taskService.list(input.intent.projectId);
  if (tasks.length > 0) {
    throw new Error('Initial generation requires an empty project');
  }

  const { job, reused } = await startProjectGenerationJob({
    projectId: input.intent.projectId,
    intentId: input.intent.id,
    userId: input.user.userId,
    source: 'project_creation_intent',
    type: 'initial_generation',
    requestContextId: input.intent.requestContextId,
    historyGroupId: input.intent.historyGroupId,
    previewMode: 'ephemeral',
  });

  if (reused) {
    return {
      job: serializeProjectGenerationJob(job),
      generationStarted: true,
      alreadyStarted: true,
    };
  }

  const prisma = getPrisma() as any;
  await prisma.projectCreationIntent.update({
    where: { id: input.intent.id },
    data: {
      consumedAt: new Date(),
    },
  });

  const runId = input.intent.requestContextId;
  const controller = new AbortController();
  registerGenerationJobCancelHandler(job.id, () => {
    controller.abort();
  });
  void runInitialGeneration({
    projectId: input.intent.projectId,
    sessionId: input.user.sessionId,
    runId,
    userMessage: input.intent.text,
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
    generationJob: createProjectGenerationJobTracker(job.id),
    signal: controller.signal,
  }).catch((error: unknown) => {
    if (controller.signal.aborted) {
      void markProjectGenerationJobCanceled(job.id, {
        requestContextId: runId,
        statusMessage: 'Операция отменена пользователем.',
      });
    } else {
      void markProjectGenerationJobFailed(job.id, {
        statusMessage: 'Генерация завершилась ошибкой',
        errorCode: 'unhandled_error',
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      broadcastToSession(input.user.sessionId, { type: 'error', message: String(error) });
      input.fastify.log.error(error, 'project intent initial generation error');
    }
  }).finally(() => {
    unregisterGenerationJobCancelHandler(job.id);
  });

  return {
    job: serializeProjectGenerationJob(job),
    generationStarted: true,
    alreadyStarted: false,
  };
}

function createProjectGenerationJobTracker(jobId: string) {
  return {
    id: jobId,
    async markRunning(stage: 'interpreting' | 'planning' | 'compiling' | 'committing' | 'finalizing', statusMessage: string) {
      await markProjectGenerationJobRunning(jobId, stage, statusMessage);
    },
    async markPreviewAvailable() {
      await markProjectGenerationJobPreviewAvailable(jobId);
    },
    async markCanceled(input?: {
      requestContextId?: string | null;
      historyGroupId?: string | null;
      statusMessage?: string | null;
    }) {
      await markProjectGenerationJobCanceled(jobId, input);
    },
    async markSucceeded(input?: {
      requestContextId?: string | null;
      historyGroupId?: string | null;
      statusMessage?: string | null;
    }) {
      await markProjectGenerationJobSucceeded(jobId, input);
    },
    async markFailed(input: {
      statusMessage?: string | null;
      errorCode?: string | null;
      errorMessage?: string | null;
    }) {
      await markProjectGenerationJobFailed(jobId, input);
    },
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
    const intent = await resolveIntentForUser(prisma, intentId, req.user!.userId);
    if (!intent) {
      return reply.status(404).send({ reason: 'not_found', error: 'Intent not found' });
    }

    if (isIntentUnavailable(intent)) {
      return reply.status(410).send({ reason: 'expired', error: getIntentUnavailableMessage(intent) });
    }

    const currentProject = await authService.findProjectById(req.user!.projectId);
    const groupId = requestedGroupId || currentProject?.groupId;
    if (!groupId) {
      return reply.status(400).send({ reason: 'validation_error', error: 'groupId required' });
    }
    const groupAccess = groupId ? await resolveGroupAccess(req.user!.userId, groupId) : null;
    if (!groupAccess) {
      return reply.status(404).send({ error: 'Project group not found' });
    }
    if (!groupAccess.canEdit) {
      return reply.status(403).send({ error: 'Project group is read-only for this user' });
    }

    let prepared: PreparedIntentProject;
    try {
      prepared = await prepareIntentProject({
        prisma,
        intent,
        userId: req.user!.userId,
        projectName,
        groupId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === 'Project group not found' || message === 'Prepared project not found') {
        return reply.status(404).send({ error: message });
      }
      if (message === 'Project group is read-only for this user') {
        return reply.status(403).send({ error: message });
      }
      throw error;
    }

    const tokens = await switchSessionToProject({
      req,
      targetProjectId: prepared.project.id,
    });

    return reply.status(201).send({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      project: mapProjectForAuth(prepared.project, 0),
      generationPrepared: true,
    });
  });

  fastify.post('/api/project-intents/:intentId/launch', { preHandler: [authMiddleware] }, async (req, reply) => {
    const intentId = asNonEmptyString((req.params as { intentId?: unknown }).intentId);
    const body = (req.body ?? {}) as { projectName?: unknown; groupId?: unknown };
    const projectName = typeof body.projectName === 'string' && body.projectName.trim()
      ? body.projectName.trim()
      : 'Новый проект';
    const requestedGroupId = typeof body.groupId === 'string' ? body.groupId.trim() : '';

    if (!intentId) {
      return reply.status(400).send({ reason: 'validation_error', error: 'intentId required' });
    }

    const prisma = getPrisma() as any;
    const intent = await resolveIntentForUser(prisma, intentId, req.user!.userId);
    if (!intent) {
      return reply.status(404).send({ reason: 'not_found', error: 'Intent not found' });
    }

    const latestIntentJob = await findLatestProjectGenerationJobForIntent(intent.id);
    const existingProject = intent.projectId ? await authService.findProjectById(intent.projectId) : null;
    const hasLaunchState = Boolean(intent.projectId && (intent.consumedAt || (latestIntentJob && ['queued', 'running', 'succeeded'].includes(latestIntentJob.status))));
    const canReuseExistingProject = Boolean(existingProject && existingProject.status === 'active');
    if (hasLaunchState && canReuseExistingProject) {

      const tokens = await switchSessionToProject({
        req,
        targetProjectId: existingProject!.id,
      });

      return reply.send({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        project: mapProjectForAuth(existingProject!, 0),
        archivedProject: null,
        prompt: intent.text,
        job: latestIntentJob ? serializeProjectGenerationJob(latestIntentJob) : null,
        generationStarted: Boolean(latestIntentJob && ['queued', 'running'].includes(latestIntentJob.status)),
        alreadyStarted: true,
      });
    }

    if (hasLaunchState && !canReuseExistingProject) {
      await prisma.projectCreationIntent.update({
        where: { id: intent.id },
        data: {
          projectId: null,
          requestContextId: null,
          historyGroupId: null,
          consumedAt: null,
        },
      });
      intent.projectId = null;
      intent.requestContextId = null;
      intent.historyGroupId = null;
      intent.consumedAt = null;
    }

    if (isIntentUnavailable(intent)) {
      return reply.status(410).send({ reason: 'expired', error: getIntentUnavailableMessage(intent) });
    }

    const currentProject = await authService.findProjectById(req.user!.projectId);
    const groupId = requestedGroupId || currentProject?.groupId;
    if (!groupId) {
      return reply.status(400).send({ reason: 'validation_error', error: 'groupId required' });
    }

    let archivedProject: { id: string; name: string } | null = null;
    const shouldArchiveCurrentProject = Boolean(
      currentProject
      && currentProject.status === 'active'
      && currentProject.id !== (intent.projectId ?? null),
    );

    if (shouldArchiveCurrentProject) {
      const currentAccess = await resolveProjectAccess(req.user!.userId, currentProject!.id);
      if (!currentAccess) {
        return reply.status(404).send({ error: 'Current project not found' });
      }
      if (!currentAccess.canEdit) {
        return reply.status(403).send({ error: 'Current project cannot be archived' });
      }

      const archived = await authService.archiveProject(currentProject!.id, currentAccess.ownerUserId);
      if (!archived.ok) {
        if (archived.reason === 'already_archived') {
          return reply.status(409).send({ error: 'Current project already archived' });
        }
        return reply.status(404).send({ error: 'Current project not found' });
      }

      archivedProject = {
        id: archived.project.id,
        name: archived.project.name,
      };
    } else if (!intent.projectId) {
      const denial = await buildProjectLimitDenial(req.user!.userId);
      if (denial) {
        return reply.status(403).send(denial);
      }
    }

    let prepared: PreparedIntentProject;
    try {
      prepared = await prepareIntentProject({
        prisma,
        intent,
        userId: req.user!.userId,
        projectName,
        groupId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === 'Project group not found' || message === 'Prepared project not found') {
        return reply.status(404).send({ error: message });
      }
      if (message === 'Project group is read-only for this user') {
        return reply.status(403).send({ error: message });
      }
      throw error;
    }

    const tokens = await switchSessionToProject({
      req,
      targetProjectId: prepared.project.id,
    });

    let generation: ProjectIntentGenerationStartResult;
    try {
      generation = await startIntentGeneration({
        fastify,
        intent: {
          ...intent,
          projectId: prepared.project.id,
          requestContextId: prepared.requestContextId ?? '',
          historyGroupId: prepared.historyGroupId ?? '',
        },
        user: {
          userId: req.user!.userId,
          sessionId: req.user!.sessionId,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === 'Initial generation requires an empty project') {
        return reply.status(409).send({ reason: 'project_not_empty', error: message });
      }
      throw error;
    }

    return reply.send({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      project: mapProjectForAuth(prepared.project, 0),
      archivedProject,
      prompt: intent.text,
      job: generation.job,
      generationStarted: generation.generationStarted,
      alreadyStarted: generation.alreadyStarted,
    });
  });

  fastify.get('/api/project-generation-jobs/active', { preHandler: [authMiddleware] }, async (req, reply) => {
    const projectId = asNonEmptyString((req.query as { projectId?: unknown }).projectId);
    if (!projectId) {
      return reply.status(400).send({ reason: 'validation_error', error: 'projectId required' });
    }

    const access = await resolveProjectAccess(req.user!.userId, projectId);
    if (!access) {
      return reply.status(404).send({ reason: 'not_found', error: 'Project not found' });
    }

    const job = await reconcileProjectGenerationJobState(await findActiveProjectGenerationJobForProject(projectId));
    return reply.send({ job: job ? serializeProjectGenerationJob(job) : null });
  });

  fastify.get('/api/project-generation-jobs/latest', { preHandler: [authMiddleware] }, async (req, reply) => {
    const projectId = asNonEmptyString((req.query as { projectId?: unknown }).projectId);
    if (!projectId) {
      return reply.status(400).send({ reason: 'validation_error', error: 'projectId required' });
    }

    const access = await resolveProjectAccess(req.user!.userId, projectId);
    if (!access) {
      return reply.status(404).send({ reason: 'not_found', error: 'Project not found' });
    }

    const job = await reconcileProjectGenerationJobState(await findLatestProjectGenerationJobForProject(projectId));
    return reply.send({ job: job ? serializeProjectGenerationJob(job) : null });
  });

  fastify.get('/api/project-generation-jobs/:jobId', { preHandler: [authMiddleware] }, async (req, reply) => {
    const jobId = asNonEmptyString((req.params as { jobId?: unknown }).jobId);
    if (!jobId) {
      return reply.status(400).send({ reason: 'validation_error', error: 'jobId required' });
    }

    const job = await reconcileProjectGenerationJobState(await getProjectGenerationJobById(jobId));
    if (!job || !job.projectId) {
      return reply.status(404).send({ reason: 'not_found', error: 'Generation job not found' });
    }

    const access = await resolveProjectAccess(req.user!.userId, job.projectId);
    if (!access) {
      return reply.status(404).send({ reason: 'not_found', error: 'Generation job not found' });
    }

    return reply.send({ job: serializeProjectGenerationJob(job) });
  });

  fastify.post('/api/project-intents/:intentId/start-generation', { preHandler: [authMiddleware] }, async (req, reply) => {
    const intentId = asNonEmptyString((req.params as { intentId?: unknown }).intentId);
    if (!intentId) {
      return reply.status(400).send({ reason: 'validation_error', error: 'intentId required' });
    }

    const prisma = getPrisma() as any;
    const intent = await resolveIntentForUser(prisma, intentId, req.user!.userId);
    if (!intent) {
      return reply.status(404).send({ reason: 'not_found', error: 'Intent not found' });
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

    let generation: ProjectIntentGenerationStartResult;
    try {
      generation = await startIntentGeneration({
        fastify,
        intent: {
          ...intent,
          projectId: intent.projectId,
          requestContextId: intent.requestContextId,
          historyGroupId: intent.historyGroupId,
        },
        user: {
          userId: req.user!.userId,
          sessionId: req.user!.sessionId,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === 'Initial generation requires an empty project') {
        return reply.status(409).send({ reason: 'project_not_empty', error: message });
      }
      throw error;
    }

    return reply.send({
      ok: true,
      started: generation.generationStarted,
      alreadyStarted: generation.alreadyStarted,
      job: generation.job,
    });
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
