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
import websocket from '@fastify/websocket';
import { messageService } from '@gantt/mcp/services';
import { getProjectCalendarSettings } from '@gantt/mcp/services';
import type {
  ProjectSnapshot,
  TaskDependency,
  DependencyType,
} from '@gantt/mcp/types';
import { registerWsRoutes, broadcast, broadcastToSession, onChatMessage } from './ws.js';
import { runAgentWithHistory } from './agent.js';
import { authMiddleware } from './middleware/auth-middleware.js';
import { subscriptionMiddleware, incrementAiUsage } from './middleware/subscription-middleware.js';
import { registerAdminRoutes } from './admin.js';
import { registerAuthRoutes } from './routes/auth-routes.js';
import { registerBillingRoutes } from './routes/billing-routes.js';
import { registerCommandRoutes } from './routes/command-routes.js';
import { writeServerDebugLog } from './debug-log.js';

const fastify = Fastify({ logger: true });
await fastify.register(websocket);
await registerAuthRoutes(fastify);
await registerAdminRoutes(fastify);
await registerBillingRoutes(fastify);
await registerCommandRoutes(fastify);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function buildProjectLoadResponse(projectId: string): Promise<{
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

  const [project, tasks, dependencies, projectCalendar] = await Promise.all([
    prisma.project.findUnique({
      where: { id: projectId },
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
  const project = await buildProjectLoadResponse(req.user!.projectId);
  return reply.send(project);
});

fastify.post('/api/chat', { preHandler: [authMiddleware, subscriptionMiddleware] }, async (req, reply) => {
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
  runAgentWithHistory(message, req.user!.projectId, req.user!.sessionId).catch((err: unknown) => {
    broadcastToSession(req.user!.sessionId, { type: 'error', message: String(err) });
    fastify.log.error(err, 'agent error');
  });
  return reply.send({ status: 'processing' });
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
  runAgentWithHistory(msg, projectId, sessionId).catch((err: unknown) => {
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
