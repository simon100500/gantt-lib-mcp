/**
 * @gantt/server — Fastify entry point
 *
 * Registers:
 * - GET  /health      — liveness probe
 * - GET  /api/tasks   — return current tasks from PostgreSQL
 * - POST /api/chat    — fire-and-forget agent run (streaming goes via SSE)
 * - GET  /stream/tasks — SSE endpoint for real-time task updates
 * - GET  /stream/ai   — SSE endpoint for AI token streaming
 *
 * NOTE: This file is imported via bootstrap.ts which loads .env first.
 */

import Fastify from 'fastify';
import { taskStore } from '@gantt/mcp/store';
import { registerSSERoutes, broadcastToAI, broadcastToProject } from './sse.js';
import { runAgentWithHistory } from './agent.js';
import { authMiddleware } from './middleware/auth-middleware.js';
import { registerAuthRoutes } from './routes/auth-routes.js';

const fastify = Fastify({ logger: true });
await registerAuthRoutes(fastify);

// ---------------------------------------------------------------------------
// REST routes
// ---------------------------------------------------------------------------

fastify.get('/health', async () => ({ status: 'ok' }));

fastify.get('/api/tasks', { preHandler: [authMiddleware] }, async (req, reply) => {
  // Get both project-specific tasks and global tasks (project_id=null)
  // This allows tasks created via MCP (without projectId) to be visible in the web UI
  console.log('[TASKS DEBUG] GET /api/tasks - projectId from JWT:', req.user!.projectId, 'includeGlobal: true');
  const tasks = await taskStore.list(req.user!.projectId, true); // includeGlobal = true
  console.log('[TASKS DEBUG] Returning tasks:', tasks.length, 'tasks');
  return reply.send(tasks);
});

fastify.post('/api/chat', { preHandler: [authMiddleware] }, async (req, reply) => {
  const body = req.body as { message?: string };
  const message = body?.message;
  if (!message) {
    return reply.status(400).send({ error: 'message required' });
  }
  // Fire-and-forget — streaming goes via SSE
  runAgentWithHistory(message, req.user!.projectId, req.user!.sessionId).catch((err: unknown) => {
    broadcastToAI(req.user!.sessionId, { type: 'error', message: String(err) });
    broadcastToProject(req.user!.projectId, { type: 'error', message: String(err) });
    fastify.log.error(err, 'agent error');
  });
  return reply.send({ status: 'processing' });
});

fastify.get('/api/messages', { preHandler: [authMiddleware] }, async (req, reply) => {
  const messages = await taskStore.getMessages(req.user!.projectId);
  return reply.send(messages.slice(-50));
});

fastify.delete('/api/tasks', { preHandler: [authMiddleware] }, async (req, reply) => {
  const count = await taskStore.deleteAll(req.user!.projectId);
  return reply.send({ deleted: count });
});

fastify.put('/api/tasks', { preHandler: [authMiddleware] }, async (req, reply) => {
  const tasks = req.body as unknown[];
  if (!Array.isArray(tasks)) {
    return reply.status(400).send({ error: 'body must be an array of tasks' });
  }
  // Client-authoritative: server stores snapshot without recalculation
  const count = await taskStore.importTasks(JSON.stringify(tasks), req.user!.projectId);
  return reply.send({ saved: count });
});

// ---------------------------------------------------------------------------
// SSE routes
// ---------------------------------------------------------------------------

registerSSERoutes(fastify);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const PORT = Number(process.env.PORT ?? 3000);
await fastify.listen({ port: PORT, host: '0.0.0.0' });
console.log(`[server] Listening on :${PORT}`);
