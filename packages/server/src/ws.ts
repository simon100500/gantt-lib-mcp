/**
 * WebSocket connection registry, broadcast helper, and route registration.
 *
 * Architecture:
 * - Maintains a Set<WebSocket> of all open connections
 * - broadcast() sends a JSON message to every open socket
 * - registerWsRoutes() adds GET /ws handler to the Fastify instance
 * - onChatMessage() decouples the WS layer from the agent runner via a callback list
 */

import type { WebSocket } from 'ws';
import type { FastifyInstance } from 'fastify';

// ---------------------------------------------------------------------------
// Message types (shared protocol between server and web client)
// ---------------------------------------------------------------------------

export type ServerMessage =
  | { type: 'token'; content: string }
  | { type: 'tasks'; tasks: unknown[] }
  | { type: 'error'; message: string }
  | { type: 'done' }
  | { type: 'connected' };

// ---------------------------------------------------------------------------
// Connection registry
// ---------------------------------------------------------------------------

const connections = new Set<WebSocket>();
const chatHandlers: Array<(msg: string) => void> = [];

/**
 * Broadcast a JSON-serialised ServerMessage to all open WebSocket connections.
 */
export function broadcast(msg: ServerMessage): void {
  const json = JSON.stringify(msg);
  for (const socket of connections) {
    // WebSocket.OPEN === 1
    if (socket.readyState === 1) {
      socket.send(json);
    }
  }
}

/**
 * Register a handler that is called whenever a client sends a chat message
 * over WebSocket. Decouples the WS layer from the agent runner.
 */
export function onChatMessage(handler: (msg: string) => void): void {
  chatHandlers.push(handler);
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

/**
 * Register the GET /ws WebSocket route on the given Fastify instance.
 * Must be called after `fastify.register(websocket)`.
 */
export function registerWsRoutes(fastify: FastifyInstance): void {
  fastify.get('/ws', { websocket: true }, (socket: WebSocket) => {
    connections.add(socket);
    socket.send(JSON.stringify({ type: 'connected' }));

    socket.on('message', (raw: Buffer | string) => {
      try {
        const data = JSON.parse(raw.toString()) as { type: string; message?: string };
        if (data.type === 'chat' && data.message) {
          for (const h of chatHandlers) {
            h(data.message);
          }
        }
      } catch {
        // Ignore malformed JSON — clients should send valid messages
      }
    });

    socket.on('close', () => {
      connections.delete(socket);
    });
  });
}
