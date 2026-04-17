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
import { commandService, messageService, taskService } from '@gantt/mcp/services';
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
import { requireActiveSubscriptionForMutation, requireTrackedLimit } from './middleware/constraint-middleware.js';
import { incrementAiUsage } from './middleware/subscription-middleware.js';
import { registerAdminRoutes } from './admin.js';
import { registerAdminApiRoutes } from './routes/admin-routes.js';
import { registerAuthRoutes } from './routes/auth-routes.js';
import { registerBillingRoutes } from './routes/billing-routes.js';
import { registerCommandRoutes } from './routes/command-routes.js';
import { registerHistoryRoutes } from './routes/history-routes.js';
import { writeServerDebugLog } from './debug-log.js';
import { isAdminEmail } from './middleware/admin-middleware.js';
import { runDirectSplitTask } from './split-task.js';

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
await registerCommandRoutes(fastify);
await registerHistoryRoutes(fastify);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function buildProjectLoadResponse(projectId: string, requesterEmail?: string): Promise<{
  version: number;
  snapshot: ProjectSnapshot;
  project: {
    ganttDayMode: 'business' | 'calendar';
    calendarId: string | null;
    calendarDays: Array<{ date: string; kind: 'working' | 'non_working' | 'shortened' }>;
  };
}> {
  const { getPrisma } = await import('@gantt/mcp/prisma');
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

  const [project, tasks, dependencies, projectCalendar] = await Promise.all([
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
    getProjectCalendarSettings(prisma, projectId),
  ]);

  return {
    version: project?.version ?? 0,
    project: projectCalendar,
    snapshot: {
      tasks: tasks.map((task: any) => ({
        id: task.id,
        name: task.name,
        startDate: task.startDate.toISOString().split('T')[0],
        endDate: task.endDate.toISOString().split('T')[0],
        type: task.type ?? 'task',
        color: task.color ?? undefined,
        parentId: task.parentId ?? undefined,
        progress: task.progress,
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
    },
  };
}

// ---------------------------------------------------------------------------
// REST routes
// ---------------------------------------------------------------------------

fastify.get('/api/health', async () => ({ status: 'ok' }));

fastify.get('/api/project', { preHandler: [authMiddleware] }, async (req, reply) => {
  const project = await buildProjectLoadResponse(req.user!.projectId, req.user!.email);
  return reply.send(project);
});

fastify.post('/api/chat', { preHandler: [authMiddleware, requireActiveSubscriptionForMutation, requireAiQueryLimit] }, async (req, reply) => {
  const body = req.body as { message?: string };
  const message = body?.message;
  if (!message) {
    return reply.status(400).send({ error: 'message required' });
  }
  // Increment AI counter (D-07: 1 message = 1 generation)
  await incrementAiUsage(req.user!.userId);
  await writeServerDebugLog('rest_chat_received', {
    userId: req.user!.userId,
    projectId: req.user!.projectId,
    sessionId: req.user!.sessionId,
    message,
  });
  // Fire-and-forget — streaming goes via WebSocket
  runAgentWithHistory(message, req.user!.projectId, req.user!.sessionId, req.user!.userId).catch((err: unknown) => {
    broadcastToSession(req.user!.sessionId, { type: 'error', message: String(err) });
    fastify.log.error(err, 'agent error');
  });
  return reply.send({ status: 'processing' });
});

fastify.post('/api/tasks/:taskId/split', { preHandler: [authMiddleware, requireActiveSubscriptionForMutation, requireAiQueryLimit] }, async (req, reply) => {
  const params = req.params as { taskId?: string };
  const body = (req.body ?? {}) as { details?: string };
  const taskId = params.taskId?.trim();

  if (!taskId) {
    return reply.status(400).send({ error: 'taskId required' });
  }

  await incrementAiUsage(req.user!.userId);
  const runId = randomUUID();

  void runDirectSplitTask({
    runId,
    projectId: req.user!.projectId,
    sessionId: req.user!.sessionId,
    taskId,
    details: typeof body.details === 'string' ? body.details : '',
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
  }).catch((err: unknown) => {
    broadcastToSession(req.user!.sessionId, { type: 'error', message: String(err) });
    fastify.log.error(err, 'direct split task error');
  });

  return reply.send({ status: 'processing', runId });
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
  void writeServerDebugLog('ws_chat_received', {
    userId,
    projectId,
    sessionId,
    message: msg,
  });
  runAgentWithHistory(msg, projectId, sessionId, userId).catch((err: unknown) => {
    broadcastToSession(sessionId, { type: 'error', message: String(err) });
    fastify.log.error(err, 'agent error (ws)');
  });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const PORT = Number(process.env.PORT ?? 3000);
await fastify.listen({ port: PORT, host: '0.0.0.0' });
console.log(`[server] Listening on :${PORT}`);
