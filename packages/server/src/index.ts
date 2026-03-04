/**
 * @gantt/server — Fastify entry point
 *
 * Registers:
 * - GET  /health      — liveness probe
 * - GET  /api/tasks   — return current tasks from SQLite
 * - POST /api/chat    — fire-and-forget agent run (streaming goes via WebSocket)
 * - GET  /ws          — WebSocket endpoint (streaming tokens + task snapshots)
 */

import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import { taskStore } from '@gantt/mcp/store';
import { registerWsRoutes, broadcast, onChatMessage } from './ws.js';
import { runAgentWithHistory } from './agent.js';

const fastify = Fastify({ logger: true });
await fastify.register(websocket);

// ---------------------------------------------------------------------------
// REST routes
// ---------------------------------------------------------------------------

fastify.get('/health', async () => ({ status: 'ok' }));

fastify.get('/api/tasks', async (_req, reply) => {
  const tasks = await taskStore.list();
  return reply.send(tasks);
});

fastify.post('/api/chat', async (req, reply) => {
  const body = req.body as { message?: string };
  const message = body?.message;
  if (!message) {
    return reply.status(400).send({ error: 'message required' });
  }
  // Fire-and-forget — streaming goes via WebSocket
  runAgentWithHistory(message).catch((err: unknown) => {
    broadcast({ type: 'error', message: String(err) });
    fastify.log.error(err, 'agent error');
  });
  return reply.send({ status: 'processing' });
});

// ---------------------------------------------------------------------------
// WebSocket routes
// ---------------------------------------------------------------------------

registerWsRoutes(fastify);

// Handle chat messages arriving over WebSocket
onChatMessage((msg) => {
  runAgentWithHistory(msg).catch((err: unknown) => {
    broadcast({ type: 'error', message: String(err) });
    fastify.log.error(err, 'agent error (ws)');
  });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const PORT = Number(process.env.PORT ?? 3000);
await fastify.listen({ port: PORT, host: '0.0.0.0' });
console.log(`[server] Listening on :${PORT}`);
