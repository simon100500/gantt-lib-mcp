/**
 * @gantt/server — Fastify entry point
 *
 * Registers:
 * - GET  /health      — liveness probe
 * - GET  /api/project — return authoritative project snapshot + version
 * - POST /api/chat    — fire-and-forget agent run (streaming goes via WebSocket)
 * - POST /api/commands/commit — commit typed ProjectCommand with optimistic concurrency
 * - GET  /ws          — WebSocket endpoint (streaming tokens + task snapshots)
 *
 * NOTE: This file is imported via bootstrap.ts which loads .env first.
 */

import Fastify from 'fastify';
import { randomUUID } from 'node:crypto';
import websocket from '@fastify/websocket';
import {
  commandService,
  messageService,
  taskService,
  assignmentService,
  resourceService,
  projectService,
} from '@gantt/mcp/services';
import { getProjectCalendarSettings } from '@gantt/mcp/services';
import { authService } from '@gantt/mcp/services';
import type {
  ProjectSnapshot,
  TaskDependency,
  DependencyType,
} from '@gantt/mcp/types';
import { registerWsRoutes, broadcast, broadcastToSession, onChatMessage } from './ws.js';
import { runAgentWithHistory } from './agent.js';
import { authMiddleware } from './middleware/auth-middleware.js';
import { requireCurrentProjectEditor } from './access-control.js';
import { requireActiveSubscriptionForMutation, requireTrackedLimit } from './middleware/constraint-middleware.js';
import { incrementAiUsage } from './middleware/subscription-middleware.js';
import { registerAdminRoutes } from './admin.js';
import { registerAdminApiRoutes } from './routes/admin-routes.js';
import { registerAuthRoutes } from './routes/auth-routes.js';
import { registerBackupRoutes } from './routes/backup-routes.js';
import { registerBillingRoutes } from './routes/billing-routes.js';
import { registerBaselineRoutes } from './routes/baseline-routes.js';
import { registerCommandRoutes } from './routes/command-routes.js';
import { registerExcelImportRoutes } from './routes/excel-import-routes.js';
import { registerExcelExportRoutes } from './routes/excel-export-routes.js';
import { registerFeedbackRoutes } from './routes/feedback-routes.js';
import { registerFinanceRoutes } from './routes/finance-routes.js';
import { registerGrandSmetaImportRoutes } from './routes/grand-smeta-import-routes.js';
import { registerHistoryRoutes } from './routes/history-routes.js';
import { registerProjectIntentRoutes } from './routes/project-intent-routes.js';
import { registerResourceRoutes } from './routes/resource-routes.js';
import { registerTemplateRoutes } from './routes/template-routes.js';
import { registerTemplatePublicationRoutes } from './routes/template-publication-routes.js';
import { registerWorkProgressRoutes } from './routes/work-progress-routes.js';
import { writeServerDebugLog } from './debug-log.js';
import { isAdminEmail } from './middleware/admin-middleware.js';
import { runDirectSplitTask } from './split-task.js';
import { normalizeStoredTaskStatus } from '@gantt/runtime-core/services/task-status';
import {
  markProjectGenerationJobCanceled,
  markProjectGenerationJobFailed,
  markProjectGenerationJobPreviewAvailable,
  markProjectGenerationJobRunning,
  markProjectGenerationJobSucceeded,
  serializeProjectGenerationJob,
  startProjectGenerationJob,
  getProjectGenerationJobById,
} from './services/project-generation-service.js';
import {
  cancelGenerationJob,
  registerGenerationJobCancelHandler,
  unregisterGenerationJobCancelHandler,
} from './generation-job-control.js';

const fastify = Fastify({ logger: true });
const requireAiQueryLimit = requireTrackedLimit('ai_queries', {
  code: 'AI_LIMIT_REACHED',
  upgradeHint: 'Upgrade your plan to continue AI-assisted changes.',
});
await fastify.register(websocket);
await registerAuthRoutes(fastify);
await registerAdminRoutes(fastify);
await registerAdminApiRoutes(fastify);
await registerBillingRoutes(fastify);
await registerBackupRoutes(fastify);
await registerBaselineRoutes(fastify);
await registerCommandRoutes(fastify);
await registerExcelImportRoutes(fastify);
await registerExcelExportRoutes(fastify);
await registerFeedbackRoutes(fastify);
await registerFinanceRoutes(fastify);
await registerGrandSmetaImportRoutes(fastify);
await registerHistoryRoutes(fastify);
await registerProjectIntentRoutes(fastify);
await registerResourceRoutes(fastify);
await registerTemplateRoutes(fastify);
await registerTemplatePublicationRoutes(fastify);
await registerWorkProgressRoutes(fastify);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function buildProjectLoadResponse(projectId: string, requesterEmail?: string, requesterUserId?: string): Promise<{
  version: number;
  snapshot: ProjectSnapshot & {
    resources: Array<{
      id: string;
      userId: string;
      projectId: string | null;
      scope: 'shared' | 'project';
      name: string;
      type: 'human' | 'equipment' | 'material' | 'other';
      isActive: boolean;
      createdAt: string;
      updatedAt: string;
      deactivatedAt: string | null;
    }>;
    assignments: Array<{
      id: string;
      projectId: string;
      taskId: string;
      resourceId: string;
      createdAt: string;
    }>;
    progressEntries: Array<{
      id: string;
      projectId: string;
      taskId: string;
      entryDate: string;
      amount: number;
      createdAt: string;
      updatedAt: string;
    }>;
  };
  project: {
    id: string;
    name: string;
    status: 'active' | 'archived' | 'deleted';
    ganttDayMode: 'business' | 'calendar';
    calendarId: string | null;
    calendarDays: Array<{ date: string; kind: 'working' | 'non_working' | 'shortened' }>;
    timelineMarkers: Array<{ date: string; color?: string | null; name?: string | null }>;
    hiddenTaskListColumnsDefault: string[] | null;
    taskCount: number;
    archivedAt: string | null;
    deletedAt: string | null;
  };
  userHiddenTaskListColumnsOverride: string[] | null;
}> {
  const { getPrisma } = await import('@gantt/runtime-core/prisma');
  const prisma = getPrisma();
  const accessibleProject = await authService.findProjectById(projectId);
  const deletedProject = !accessibleProject && isAdminEmail(requesterEmail)
    ? await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    })
    : null;

  if (!accessibleProject && !deletedProject) {
    throw new Error('Project unavailable');
  }

  const [projectVersion, tasks, dependencies, resourceCatalog, assignments, progressEntries, projectCalendar] = await Promise.all([
    prisma.project.findFirst({
      where: {
        id: projectId,
      },
      select: { version: true },
    }),
    prisma.task.findMany({
      where: { projectId },
      include: { dependencies: true },
      orderBy: { sortOrder: 'asc' },
    }),
    prisma.dependency.findMany({
      where: { task: { projectId } },
      select: { id: true, taskId: true, depTaskId: true, type: true, lag: true },
    }),
    resourceService.list({
      projectId,
      includeInactive: true,
    }),
    prisma.taskAssignment.findMany({
      where: { projectId },
      select: { id: true, projectId: true, taskId: true, resourceId: true, createdAt: true },
      orderBy: [{ taskId: 'asc' }, { resourceId: 'asc' }],
    }),
    prisma.taskProgressEntry.findMany({
      where: { projectId },
      orderBy: [{ entryDate: 'asc' }, { createdAt: 'asc' }],
    }),
    getProjectCalendarSettings(prisma, projectId),
  ]);
  const viewPreference = requesterUserId
    ? await projectService.getViewPreference(projectId, requesterUserId)
    : null;

  return {
    version: projectVersion?.version ?? 0,
    project: {
      id: accessibleProject?.id ?? projectId,
      name: accessibleProject?.name ?? 'Deleted project',
      status: accessibleProject?.status ?? 'deleted',
      ganttDayMode: projectCalendar.ganttDayMode,
      calendarId: projectCalendar.calendarId,
      calendarDays: projectCalendar.calendarDays,
      timelineMarkers: accessibleProject?.timelineMarkers ?? [],
      hiddenTaskListColumnsDefault: accessibleProject?.hiddenTaskListColumnsDefault ?? null,
      taskCount: tasks.length,
      archivedAt: accessibleProject?.archivedAt ?? null,
      deletedAt: accessibleProject?.deletedAt ?? null,
    },
    userHiddenTaskListColumnsOverride: viewPreference?.hiddenTaskListColumns ?? null,
    snapshot: {
      tasks: tasks.map((task: any) => ({
        id: task.id,
        name: task.name,
        startDate: task.startDate.toISOString().split('T')[0],
        endDate: task.endDate.toISOString().split('T')[0],
        type: task.type ?? 'task',
        color: task.color ?? undefined,
        parentId: task.parentId ?? undefined,
        status: normalizeStoredTaskStatus(task.status),
        progress: task.progress,
        workVolume: task.workVolume ?? null,
        workUnit: task.workUnit ?? null,
        completedVolume: task.completedVolume ?? 0,
        sortOrder: task.sortOrder,
        dependencies: task.dependencies.map((dependency: any): TaskDependency => ({
          taskId: dependency.depTaskId,
          type: dependency.type as DependencyType,
          lag: dependency.lag,
        })),
      })),
      dependencies: dependencies.map((dependency: any) => ({
        id: dependency.id,
        taskId: dependency.taskId,
        depTaskId: dependency.depTaskId,
        type: dependency.type as DependencyType,
        lag: dependency.lag,
      })),
      resources: resourceCatalog.resources.map((resource) => ({
        id: resource.id,
        userId: resource.userId,
        projectId: resource.projectId,
        scope: resource.scope,
        name: resource.name,
        type: resource.type,
        isActive: resource.isActive,
        createdAt: resource.createdAt,
        updatedAt: resource.updatedAt,
        deactivatedAt: resource.deactivatedAt,
      })),
      assignments: assignments.map((assignment: any) => ({
        id: assignment.id,
        projectId: assignment.projectId,
        taskId: assignment.taskId,
        resourceId: assignment.resourceId,
        createdAt: assignment.createdAt.toISOString(),
      })),
      progressEntries: progressEntries.map((entry: any) => ({
        id: entry.id,
        projectId: entry.projectId,
        taskId: entry.taskId,
        entryDate: entry.entryDate.toISOString().split('T')[0],
        amount: entry.amount,
        createdAt: entry.createdAt.toISOString(),
        updatedAt: entry.updatedAt.toISOString(),
      })),
    },
  };
}

// ---------------------------------------------------------------------------
// REST routes
// ---------------------------------------------------------------------------

fastify.get('/api/health', async () => ({ status: 'ok' }));

fastify.get('/api/project', { preHandler: [authMiddleware] }, async (req, reply) => {
  const project = await buildProjectLoadResponse(req.user!.projectId, req.user!.email, req.user!.userId);
  return reply.send(project);
});

fastify.post('/api/chat', { preHandler: [authMiddleware, requireCurrentProjectEditor, requireActiveSubscriptionForMutation, requireAiQueryLimit] }, async (req, reply) => {
  const body = req.body as { message?: string };
  const message = body?.message;
  if (!message) {
    return reply.status(400).send({ error: 'message required' });
  }
  const runId = randomUUID();
  // Increment AI counter (D-07: 1 message = 1 generation)
  await incrementAiUsage(req.projectAccess?.billingUserId ?? req.user!.userId);
  const { job } = await startProjectGenerationJob({
    projectId: req.user!.projectId,
    userId: req.user!.userId,
    source: 'chat_request',
    type: 'chat_request',
    requestContextId: runId,
    previewMode: 'ephemeral',
  });
  await writeServerDebugLog('rest_chat_received', {
    userId: req.user!.userId,
    projectId: req.user!.projectId,
    sessionId: req.user!.sessionId,
    message,
  });
  const controller = new AbortController();
  registerGenerationJobCancelHandler(job.id, () => {
    controller.abort();
  });
  // Fire-and-forget — streaming goes via WebSocket
  runAgentWithHistory(message, req.user!.projectId, req.user!.sessionId, req.user!.userId, {
    id: job.id,
    async markRunning(stage, statusMessage) {
      await markProjectGenerationJobRunning(job.id, stage, statusMessage);
    },
    async markPreviewAvailable() {
      await markProjectGenerationJobPreviewAvailable(job.id);
    },
    async markCanceled(input) {
      await markProjectGenerationJobCanceled(job.id, input);
    },
    async markSucceeded(input) {
      await markProjectGenerationJobSucceeded(job.id, input);
    },
    async markFailed(input) {
      await markProjectGenerationJobFailed(job.id, input);
    },
  }, controller.signal).catch((err: unknown) => {
    if (controller.signal.aborted) {
      void markProjectGenerationJobCanceled(job.id, {
        requestContextId: runId,
        statusMessage: 'Операция отменена пользователем.',
      });
    } else {
      void markProjectGenerationJobFailed(job.id, {
        statusMessage: 'AI-запрос завершился ошибкой.',
        errorMessage: String(err),
      });
      broadcastToSession(req.user!.sessionId, { type: 'error', message: String(err) });
      fastify.log.error(err, 'agent error');
    }
  }).finally(() => {
    unregisterGenerationJobCancelHandler(job.id);
  });
  return reply.send({ status: 'processing', runId, job: serializeProjectGenerationJob(job) });
});

fastify.post('/api/tasks/:taskId/split', { preHandler: [authMiddleware, requireCurrentProjectEditor, requireActiveSubscriptionForMutation, requireAiQueryLimit] }, async (req, reply) => {
  const params = req.params as { taskId?: string };
  const body = (req.body ?? {}) as {
    details?: string;
    explicitListMode?: boolean;
  };
  const taskId = params.taskId?.trim();

  if (!taskId) {
    return reply.status(400).send({ error: 'taskId required' });
  }

  await incrementAiUsage(req.projectAccess?.billingUserId ?? req.user!.userId);
  const runId = randomUUID();
  const { job } = await startProjectGenerationJob({
    projectId: req.user!.projectId,
    userId: req.user!.userId,
    source: 'direct_split_task',
    type: 'split_task',
    requestContextId: runId,
    previewMode: 'none',
  });
  const controller = new AbortController();
  registerGenerationJobCancelHandler(job.id, () => {
    controller.abort();
  });

  void runDirectSplitTask({
    runId,
    projectId: req.user!.projectId,
    sessionId: req.user!.sessionId,
    taskId,
    details: typeof body.details === 'string' ? body.details : '',
    explicitListMode: body.explicitListMode === true,
    env: {
      OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? process.env.ANTHROPIC_AUTH_TOKEN ?? '',
      OPENAI_BASE_URL: process.env.OPENAI_BASE_URL ?? 'https://api.z.ai/api/paas/v4/',
      OPENAI_MODEL: process.env.OPENAI_MODEL ?? process.env.ANTHROPIC_DEFAULT_SONNET_MODEL ?? 'glm-4.7',
      OPENAI_CHEAP_MODEL: process.env.OPENAI_CHEAP_MODEL ?? process.env.cheap_model ?? undefined,
    },
    services: {
      messageService,
      taskService,
      commandService,
    },
    broadcastToSession,
    generationJob: {
      async markRunning(stage, statusMessage) {
        await markProjectGenerationJobRunning(job.id, stage, statusMessage);
      },
      async markCanceled(input) {
        await markProjectGenerationJobCanceled(job.id, input);
      },
      async markSucceeded(input) {
        await markProjectGenerationJobSucceeded(job.id, input);
      },
      async markFailed(input) {
        await markProjectGenerationJobFailed(job.id, input);
      },
    },
    signal: controller.signal,
  }).catch((err: unknown) => {
    if (controller.signal.aborted) {
      void markProjectGenerationJobCanceled(job.id, {
        requestContextId: runId,
        statusMessage: 'Операция отменена пользователем.',
      });
    } else {
      void markProjectGenerationJobFailed(job.id, {
        statusMessage: 'Разбиение задачи завершилось ошибкой.',
        errorMessage: String(err),
      });
      broadcastToSession(req.user!.sessionId, { type: 'error', message: String(err) });
      fastify.log.error(err, 'direct split task error');
    }
  }).finally(() => {
    unregisterGenerationJobCancelHandler(job.id);
  });

  return reply.send({ status: 'processing', runId, job: serializeProjectGenerationJob(job) });
});

fastify.post('/api/project-generation-jobs/:jobId/cancel', { preHandler: [authMiddleware, requireCurrentProjectEditor] }, async (req, reply) => {
  const jobId = (req.params as { jobId?: string }).jobId?.trim();
  if (!jobId) {
    return reply.status(400).send({ error: 'jobId required' });
  }

  try {
    const job = await getProjectGenerationJobById(jobId);
    if (!job || job.projectId !== req.user!.projectId) {
      return reply.status(404).send({ error: 'Generation job not found' });
    }

    if (job.status !== 'queued' && job.status !== 'running') {
      return reply.send({ ok: true, job: serializeProjectGenerationJob(job) });
    }

    await markProjectGenerationJobCanceled(jobId, {
      requestContextId: job.requestContextId,
      historyGroupId: job.historyGroupId,
      statusMessage: 'Операция отменена пользователем.',
    });

    try {
      await cancelGenerationJob(jobId);
    } catch (cancelError) {
      req.log.warn({ err: cancelError, jobId }, 'generation cancel handler failed after job was marked canceled');
    }

    const updatedJob = await getProjectGenerationJobById(jobId);
    return reply.send({ ok: true, job: updatedJob ? serializeProjectGenerationJob(updatedJob) : null });
  } catch (error) {
    req.log.error({ err: error, jobId }, 'failed to cancel generation job');
    return reply.status(500).send({ error: 'Failed to cancel generation job' });
  }
});

fastify.get('/api/messages', { preHandler: [authMiddleware] }, async (req, reply) => {
  const messages = await messageService.list(req.user!.projectId);
  return reply.send(messages.slice(-50));
});

// ---------------------------------------------------------------------------
// WebSocket routes
// ---------------------------------------------------------------------------

registerWsRoutes(fastify);

// Handle chat messages arriving over WebSocket
onChatMessage((msg, userId, projectId, sessionId) => {
  void (async () => {
    const runId = randomUUID();
    const { job } = await startProjectGenerationJob({
      projectId,
      userId,
      source: 'ws_chat_request',
      type: 'chat_request',
      requestContextId: runId,
      previewMode: 'ephemeral',
    });
    const controller = new AbortController();
    registerGenerationJobCancelHandler(job.id, () => {
      controller.abort();
    });
    try {
      await writeServerDebugLog('ws_chat_received', {
        userId,
        projectId,
        sessionId,
        message: msg,
        generationJobId: job.id,
      });
      await runAgentWithHistory(msg, projectId, sessionId, userId, {
        id: job.id,
        async markRunning(stage, statusMessage) {
          await markProjectGenerationJobRunning(job.id, stage, statusMessage);
        },
        async markPreviewAvailable() {
          await markProjectGenerationJobPreviewAvailable(job.id);
        },
        async markCanceled(input) {
          await markProjectGenerationJobCanceled(job.id, input);
        },
        async markSucceeded(input) {
          await markProjectGenerationJobSucceeded(job.id, input);
        },
        async markFailed(input) {
          await markProjectGenerationJobFailed(job.id, input);
        },
      }, controller.signal);
    } catch (err) {
      if (controller.signal.aborted) {
        await markProjectGenerationJobCanceled(job.id, {
          requestContextId: runId,
          statusMessage: 'Операция отменена пользователем.',
        });
      } else {
        broadcastToSession(sessionId, { type: 'error', message: String(err) });
        fastify.log.error(err, 'agent error (ws)');
      }
    } finally {
      unregisterGenerationJobCancelHandler(job.id);
    }
  });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const PORT = Number(process.env.PORT ?? 3000);
await fastify.listen({ port: PORT, host: '0.0.0.0' });
console.log(`[server] Listening on :${PORT}`);
