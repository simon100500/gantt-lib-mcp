/**
 * @gantt/server — Fastify entry point
 *
 * Registers:
 * - GET  /health      — liveness probe
 * - GET  /api/tasks   — return current tasks from PostgreSQL via Prisma
 * - POST /api/chat    — fire-and-forget agent run (streaming goes via WebSocket)
 * - GET  /ws          — WebSocket endpoint (streaming tokens + task snapshots)
 *
 * NOTE: This file is imported via bootstrap.ts which loads .env first.
 */

import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import { taskService, messageService } from '@gantt/mcp/services';
import type { CreateTaskInput, UpdateTaskInput } from '@gantt/mcp/types';
import { registerWsRoutes, broadcast, broadcastToSession, onChatMessage } from './ws.js';
import { runAgentWithHistory } from './agent.js';
import { authMiddleware } from './middleware/auth-middleware.js';
import { registerAdminRoutes } from './admin.js';
import { registerAuthRoutes } from './routes/auth-routes.js';
import { registerBillingRoutes } from './routes/billing-routes.js';
import { writeServerDebugLog } from './debug-log.js';

const fastify = Fastify({ logger: true });
await fastify.register(websocket);
await registerAuthRoutes(fastify);
await registerAdminRoutes(fastify);
await registerBillingRoutes(fastify);

// ---------------------------------------------------------------------------
// REST routes
// ---------------------------------------------------------------------------

fastify.get('/api/health', async () => ({ status: 'ok' }));

fastify.get('/api/tasks', { preHandler: [authMiddleware] }, async (req, reply) => {
  console.log('[TASKS DEBUG] GET /api/tasks - projectId from JWT:', req.user!.projectId);
  const { tasks } = await taskService.list(req.user!.projectId);
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
  const messages = await messageService.list(req.user!.projectId);
  return reply.send(messages.slice(-50));
});

fastify.delete('/api/tasks', { preHandler: [authMiddleware] }, async (req, reply) => {
  const count = await taskService.deleteAll(req.user!.projectId, 'api');
  // No WebSocket broadcast - user edits use optimistic updates, WS is only for AI responses
  return reply.send({ deleted: count });
});

// ---------------------------------------------------------------------------
// Individual task operations (PATCH, POST, DELETE with :id)
// ---------------------------------------------------------------------------

// PATCH /api/tasks/:id - Update single task
fastify.patch('/api/tasks/:id', { preHandler: [authMiddleware] }, async (req, reply) => {
  const taskId = (req.params as { id: string }).id;
  const updates = req.body as UpdateTaskInput;

  console.log(`%c[SERVER] PATCH /api/tasks/${taskId}`, 'background: #cc5de8; color: white; font-weight: bold; padding: 4px 8px; border-radius: 4px;');
  console.log('[SERVER] Request body (updates):', updates);
  console.log('[SERVER] Full updates:', JSON.stringify(updates, null, 2));

  if (!taskId) {
    return reply.status(400).send({ error: 'taskId is required' });
  }

  if (!updates || Object.keys(updates).length === 0) {
    return reply.status(400).send({ error: 'updates object is required' });
  }

  try {
    const task = await taskService.update(taskId, updates, 'manual-save');

    if (!task) {
      console.log('[SERVER] Task not found:', taskId);
      return reply.status(404).send({ error: 'Task not found' });
    }

    console.log('%c[SERVER] Task updated successfully', 'background: #51cf66; color: white; font-weight: bold; padding: 4px 8px; border-radius: 4px;');
    console.log('[SERVER] Updated task:', {
      id: task.id,
      name: task.name,
      parentId: task.parentId,
      startDate: task.startDate,
      endDate: task.endDate,
    });
    return reply.send(task);
  } catch (error) {
    console.error('[SERVER] Failed to update task:', error);
    fastify.log.error(error, 'Failed to update task');
    return reply.status(500).send({ error: 'Failed to update task' });
  }
});

// POST /api/tasks - Create single task
fastify.post('/api/tasks', { preHandler: [authMiddleware] }, async (req, reply) => {
  const input = req.body as CreateTaskInput;

  if (!input || Object.keys(input).length === 0) {
    return reply.status(400).send({ error: 'task input is required' });
  }

  try {
    const task = await taskService.create(input, req.user!.projectId, 'manual-save');
    return reply.status(201).send(task);
  } catch (error) {
    fastify.log.error(error, 'Failed to create task');
    const message = error instanceof Error ? error.message : 'Failed to create task';
    return reply.status(500).send({ error: message });
  }
});

// DELETE /api/tasks/:id - Delete single task
fastify.delete('/api/tasks/:id', { preHandler: [authMiddleware] }, async (req, reply) => {
  const taskId = (req.params as { id: string }).id;

  if (!taskId) {
    return reply.status(400).send({ error: 'taskId is required' });
  }

  try {
    const deleted = await taskService.delete(taskId, 'manual-save');

    if (!deleted) {
      return reply.status(404).send({ error: 'Task not found' });
    }

    return reply.send({ deleted: true });
  } catch (error) {
    fastify.log.error(error, 'Failed to delete task');
    return reply.status(500).send({ error: 'Failed to delete task' });
  }
});

// ---------------------------------------------------------------------------
// Bulk operations (PUT /api/tasks - kept for AI/import operations)
// ---------------------------------------------------------------------------

fastify.put('/api/tasks', { preHandler: [authMiddleware] }, async (req, reply) => {
  const tasks = req.body as unknown[];
  console.log(`%c[SERVER] PUT /api/tasks (BATCH UPDATE)`, 'background: #e64980; color: white; font-weight: bold; padding: 4px 8px; border-radius: 4px;');
  console.log('[SERVER] Tasks count:', tasks.length);
  console.log('[SERVER] Tasks:', tasks.map((t: any) => ({ id: t.id, name: t.name, startDate: t.startDate, endDate: t.endDate })));

  if (!Array.isArray(tasks)) {
    return reply.status(400).send({ error: 'body must be an array of tasks' });
  }
  // Use batchUpdateTasks instead of importTasks to avoid deleting all existing tasks
  // gantt-lib sends only changed tasks, not the full task list
  const count = await taskService.batchUpdateTasks(JSON.stringify(tasks), req.user!.projectId, 'manual-save');

  console.log(`%c[SERVER] BATCH updated ${count} tasks`, 'background: #51cf66; color: white; font-weight: bold; padding: 4px 8px; border-radius: 4px;');
  // No WebSocket broadcast - user edits use optimistic updates, WS is only for AI responses
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
