/**
 * WebSocket connection registry, broadcast helper, and route registration.
 *
 * Architecture:
 * - Maintains a Map<sessionId, Set<WebSocket>> for session-isolated connections
 * - broadcast() sends a JSON message to every open socket (global)
 * - broadcastToSession() sends to only sockets belonging to a specific session
 * - registerWsRoutes() adds GET /ws handler with auth handshake
 * - onChatMessage() decouples the WS layer from the agent runner via a callback list
 *
 * Auth handshake pattern:
 * 1. Client connects → server waits for first message
 * 2. First message must be { type: 'auth', token: string }
 * 3. Server verifies token → stores socket in Map<sessionId, Set<WebSocket>>
 * 4. Server sends { type: 'connected' } on success
 * 5. Server sends { type: 'error', message: 'Unauthorized' } + closes socket on failure
 */

import type { WebSocket } from 'ws';
import type { FastifyInstance } from 'fastify';
import { verifyToken } from './auth.js';
import type { JwtPayload } from './auth.js';
import { writeServerDebugLog } from './debug-log.js';

// ---------------------------------------------------------------------------
// Message types (shared protocol between server and web client)
// ---------------------------------------------------------------------------

export type ServerMessage =
  | { type: 'token'; content: string }
  | { type: 'tasks'; tasks: unknown[] }
  | { type: 'error'; message: string }
  | { type: 'done' }
  | { type: 'connected' };

export type WsClientMessage =
  | { type: 'chat'; message: string }
  | { type: 'auth'; token: string };

// ---------------------------------------------------------------------------
// Connection registry
// ---------------------------------------------------------------------------

const sessionConnections = new Map<string, Set<WebSocket>>();
const chatHandlers: Array<(msg: string, userId: string, projectId: string, sessionId: string) => void> = [];

/**
 * Broadcast a JSON-serialised ServerMessage to all open WebSocket connections.
 * Iterates all sockets across all sessions (same behavior as before).
 */
export function broadcast(msg: ServerMessage): void {
  const json = JSON.stringify(msg);
  for (const sockets of sessionConnections.values()) {
    for (const socket of sockets) {
      // WebSocket.OPEN === 1
      if (socket.readyState === 1) {
        socket.send(json);
      }
    }
  }
}

/**
 * Broadcast a JSON-serialised ServerMessage to only the sockets belonging
 * to a specific session. Used for targeted AI response delivery.
 *
 * @param sessionId - The session ID to target
 * @param msg - The server message to broadcast
 */
export function broadcastToSession(sessionId: string, msg: ServerMessage): void {
  const sockets = sessionConnections.get(sessionId);
  if (!sockets) return;

  const json = JSON.stringify(msg);
  void writeServerDebugLog('ws_broadcast', {
    sessionId,
    messageType: msg.type,
    socketCount: sockets.size,
    contentLength: msg.type === 'token' ? msg.content?.length ?? 0 : undefined,
    taskCount: msg.type === 'tasks' ? msg.tasks?.length ?? 0 : undefined,
    errorMessage: msg.type === 'error' ? msg.message : undefined,
  });
  for (const socket of sockets) {
    if (socket.readyState === 1) {
      socket.send(json);
    }
  }
}

/**
 * Register a handler that is called whenever a client sends a chat message
 * over WebSocket. Decouples the WS layer from the agent runner.
 *
 * @param handler - Callback function receiving (message, userId, projectId, sessionId)
 */
export function onChatMessage(handler: (msg: string, userId: string, projectId: string, sessionId: string) => void): void {
  chatHandlers.push(handler);
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

/**
 * Register the GET /ws WebSocket route on the given Fastify instance.
 * Must be called after `fastify.register(websocket)`.
 *
 * Implements auth handshake pattern:
 * - First message must be { type: 'auth', token: string }
 * - Token is verified using verifyToken from auth.ts
 * - On success: socket added to session registry, { type: 'connected' } sent
 * - On failure: { type: 'error', message: 'Unauthorized' } sent, socket closed
 * - Subsequent 'chat' messages trigger handlers with (message, sessionId)
 */
export function registerWsRoutes(fastify: FastifyInstance): void {
  fastify.get('/ws', { websocket: true }, (socket: WebSocket) => {
    let isAuthenticated = false;
    let currentSessionId: string | null = null;
    let authUser: JwtPayload | null = null;

    socket.on('message', (raw: Buffer | string) => {
      try {
        const data = JSON.parse(raw.toString()) as WsClientMessage;

        // Auth handshake: first message must be auth
        if (!isAuthenticated) {
          if (data.type === 'auth' && data.token) {
            try {
              const payload: JwtPayload = verifyToken(data.token);
              isAuthenticated = true;
              currentSessionId = payload.sessionId;
              authUser = payload;

              // Add socket to session registry
              if (!sessionConnections.has(currentSessionId)) {
                sessionConnections.set(currentSessionId, new Set());
              }
              sessionConnections.get(currentSessionId)!.add(socket);

              socket.send(JSON.stringify({ type: 'connected' }));
              void writeServerDebugLog('ws_authenticated', {
                sessionId: currentSessionId,
                userId: payload.sub,
                projectId: payload.projectId,
              });
            } catch (err) {
              socket.send(JSON.stringify({
                type: 'error',
                message: 'Unauthorized',
              }));
              socket.close();
            }
          } else {
            socket.send(JSON.stringify({
              type: 'error',
              message: 'Authentication required',
            }));
            socket.close();
          }
          return;
        }

        // After auth: handle chat messages
        if (data.type === 'chat' && data.message && authUser) {
          void writeServerDebugLog('ws_chat_message', {
            sessionId: authUser.sessionId,
            userId: authUser.sub,
            projectId: authUser.projectId,
            message: data.message,
          });
          for (const h of chatHandlers) {
            h(data.message, authUser.sub, authUser.projectId, authUser.sessionId);
          }
        }
      } catch {
        // Ignore malformed JSON — clients should send valid messages
      }
    });

    socket.on('close', () => {
      void writeServerDebugLog('ws_closed', {
        sessionId: currentSessionId,
      });
      // Remove socket from session registry
      if (currentSessionId) {
        const sockets = sessionConnections.get(currentSessionId);
        if (sockets) {
          sockets.delete(socket);
          // Clean up empty session entries
          if (sockets.size === 0) {
            sessionConnections.delete(currentSessionId);
          }
        }
      }
    });
  });
}
