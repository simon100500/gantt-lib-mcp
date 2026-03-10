/**
 * SSE (Server-Sent Events) connection registry and endpoint handlers.
 *
 * Architecture:
 * - Maintains a Map<projectId, Set<reply.raw>> for project-scoped connections
 * - broadcastToProject() sends JSON messages to all SSE connections for a project
 * - registerSSERoutes() registers /stream/tasks and /stream/ai endpoints
 * - Heartbeat every 30s to detect dead connections
 *
 * SSE format: standard text/event-stream with data: prefixed JSON
 * - Connection: data: {"type":"connected"}
 * - Tasks: data: {"type":"tasks","tasks":[...]}
 * - AI token: data: {"type":"token","content":"..."}
 * - Done: data: {"type":"done"}
 * - Error: data: {"type":"error","message":"..."}
 * - Heartbeat: :heartbeat\n\n (comment-style, ignored by clients)
 *
 * Auth pattern:
 * - JWT verification via Authorization header on connect
 * -projectId extracted from JWT for connection routing
 */

import type { FastifyInstance } from 'fastify';
import { verifyToken, type JwtPayload } from './auth.js';

// ---------------------------------------------------------------------------
// Message types (shared protocol between server and web client)
// ---------------------------------------------------------------------------

export type SSEMessage =
  | { type: 'connected' }
  | { type: 'token'; content: string }
  | { type: 'tasks'; tasks: unknown[] }
  | { type: 'error'; message: string }
  | { type: 'done' };

export type SSEClientMessage =
  | { type: 'chat'; message: string };

// ---------------------------------------------------------------------------
// Connection registries
// ---------------------------------------------------------------------------

const projectConnections = new Map<string, Set<NodeJS.WritableStream>>();
const aiConnections = new Map<string, NodeJS.WritableStream>();

// ---------------------------------------------------------------------------
// Broadcast helpers
// ---------------------------------------------------------------------------

/**
 * Broadcast a JSON-serializable SSEMessage to all open SSE connections
 * for a specific project. Handles write errors (dead connections).
 *
 * @param projectId - The project ID to target
 * @param data - The SSE message to broadcast
 */
export function broadcastToProject(projectId: string, data: SSEMessage): void {
  const connections = projectConnections.get(projectId);
  if (!connections) return;

  const json = JSON.stringify(data);
  const deadConnections: NodeJS.WritableStream[] = [];

  for (const conn of connections) {
    try {
      conn.write(`data: ${json}\n\n`);
    } catch (err) {
      // Connection is dead, mark for cleanup
      deadConnections.push(conn);
    }
  }

  // Remove dead connections
  for (const dead of deadConnections) {
    connections.delete(dead);
  }

  // Clean up empty project entries
  if (connections.size === 0) {
    projectConnections.delete(projectId);
  }
}

/**
 * Broadcast to a specific AI stream connection (by sessionId)
 */
export function broadcastToAI(sessionId: string, data: SSEMessage): void {
  const conn = aiConnections.get(sessionId);
  if (!conn) return;

  try {
    const json = JSON.stringify(data);
    conn.write(`data: ${json}\n\n`);
  } catch (err) {
    // Connection is dead, remove from registry
    aiConnections.delete(sessionId);
  }
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

/**
 * Register SSE routes on the given Fastify instance.
 * - GET /stream/tasks - Real-time task updates for a project
 * - GET /stream/ai - AI response token streaming
 *
 * Both endpoints require JWT auth via Authorization header.
 */
export function registerSSERoutes(fastify: FastifyInstance): void {
  // Task stream endpoint
  fastify.get('/stream/tasks', async (req, reply) => {
    // Verify JWT from Authorization header or query parameter (EventSource doesn't support custom headers)
    let token: string | undefined;
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.slice(7);
      console.log('[SSE /stream/tasks] Token from Authorization header');
    } else {
      // Fallback to query parameter for EventSource
      const queryToken = (req.query as { token?: string }).token;
      if (queryToken) {
        token = queryToken;
        console.log('[SSE /stream/tasks] Token from query parameter');
      }
    }

    if (!token) {
      console.log('[SSE /stream/tasks] No token found, returning 401');
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    let payload: JwtPayload;
    try {
      console.log('[SSE /stream/tasks] Verifying token...');
      payload = verifyToken(token);
      console.log('[SSE /stream/tasks] Token verified successfully, projectId:', payload.projectId);
    } catch (err) {
      console.error('[SSE /stream/tasks] Token verification failed:', err);
      return reply.status(401).send({ error: 'Invalid token' });
    }

    const projectId = payload.projectId;

    // Set SSE headers
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    // Add connection to registry
    if (!projectConnections.has(projectId)) {
      projectConnections.set(projectId, new Set());
    }
    projectConnections.get(projectId)!.add(reply.raw);

    // Send initial connected message
    reply.raw.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

    // Cleanup on connection close
    reply.raw.on('close', () => {
      const conns = projectConnections.get(projectId);
      if (conns) {
        conns.delete(reply.raw);
        if (conns.size === 0) {
          projectConnections.delete(projectId);
        }
      }
    });
  });

  // AI stream endpoint
  fastify.get('/stream/ai', async (req, reply) => {
    // Verify JWT from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    let payload: JwtPayload;
    try {
      const token = authHeader.slice(7);
      payload = verifyToken(token);
    } catch (err) {
      return reply.status(401).send({ error: 'Invalid token' });
    }

    const sessionId = payload.sessionId;

    // Set SSE headers
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    // Add connection to AI registry
    aiConnections.set(sessionId, reply.raw);

    // Send initial connected message
    reply.raw.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

    // Cleanup on connection close
    reply.raw.on('close', () => {
      aiConnections.delete(sessionId);
    });
  });
}

// ---------------------------------------------------------------------------
// Heartbeat
// ---------------------------------------------------------------------------

/**
 * Send a heartbeat comment to all SSE connections every 30 seconds.
 * Comment-style messages (:heartbeat\n\n) are ignored by EventSource
 * but keep the connection alive through proxies.
 */
setInterval(() => {
  for (const conn of projectConnections.values()) {
    for (const stream of conn) {
      try {
        stream.write(':heartbeat\n\n');
      } catch {
        // Will be cleaned up on next broadcast
      }
    }
  }

  for (const stream of aiConnections.values()) {
    try {
      stream.write(':heartbeat\n\n');
    } catch {
      // Will be cleaned up on next broadcast
    }
  }
}, 30000);
