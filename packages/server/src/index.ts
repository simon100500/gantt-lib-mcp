/**
 * @gantt/server — Fastify entry point
 *
 * Registers:
 * - GET  /health      — liveness probe
 * - GET  /api/tasks   — return current tasks from SQLite
 * - POST /api/chat    — fire-and-forget agent run (streaming goes via WebSocket)
 * - GET  /ws          — WebSocket endpoint (streaming tokens + task snapshots)
 *
 * NOTE: This file is imported via bootstrap.ts which loads .env first.
 */

import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import { taskStore } from '@gantt/mcp/store';
import { registerWsRoutes, broadcast, broadcastToSession, onChatMessage } from './ws.js';
import { runAgentWithHistory } from './agent.js';
import { authMiddleware } from './middleware/auth-middleware.js';
import { registerAdminRoutes } from './admin.js';
import { registerAuthRoutes } from './routes/auth-routes.js';
import { writeServerDebugLog } from './debug-log.js';

const fastify = Fastify({ logger: true });
await fastify.register(websocket);
await registerAuthRoutes(fastify);
await registerAdminRoutes(fastify);

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
  const messages = await taskStore.getMessages(req.user!.projectId);
  return reply.send(messages.slice(-50));
});

fastify.delete('/api/tasks', { preHandler: [authMiddleware] }, async (req, reply) => {
  const count = await taskStore.deleteAll(req.user!.projectId);
  broadcastToSession(req.user!.sessionId, { type: 'tasks', tasks: [] });
  return reply.send({ deleted: count });
});

fastify.put('/api/tasks', { preHandler: [authMiddleware] }, async (req, reply) => {
  const tasks = req.body as unknown[];
  if (!Array.isArray(tasks)) {
    return reply.status(400).send({ error: 'body must be an array of tasks' });
  }
  const count = await taskStore.importTasks(JSON.stringify(tasks), req.user!.projectId);
  // Broadcast updated tasks to all sessions for this project so other browser tabs sync
  broadcastToSession(req.user!.sessionId, { type: 'tasks', tasks });
  return reply.send({ saved: count });
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
