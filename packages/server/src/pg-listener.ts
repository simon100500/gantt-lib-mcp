/**
 * PostgreSQL LISTEN client for real-time notifications.
 *
 * Uses a separate pg.Client (not pool) for LISTEN as notifications
 * are connection-specific. Listens on 'tasks_channel' for NOTIFY events
 * from PostgreSQL triggers on tasks/dependencies tables.
 *
 * On notification: parses JSON payload and broadcasts to SSE clients.
 * Reconnects with exponential backoff on connection errors.
 */

import { Client } from 'pg';
import { taskStore } from '@gantt/mcp/store';
import { broadcastToProject } from './sse.js';

let listenerClient: Client | null = null;
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
let retryDelay = 1000;

/**
 * Start the PostgreSQL LISTEN client.
 * Connects to DATABASE_URL, executes LISTEN tasks_channel,
 * and forwards notifications to SSE broadcasts.
 *
 * @param prisma - Prisma client (unused but kept for interface compatibility)
 */
export async function startPGListener(prisma?: unknown): Promise<void> {
  if (listenerClient) {
    console.log('[pg-listener] Already running');
    return;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.warn('[pg-listener] DATABASE_URL not set, skipping LISTEN setup');
    return;
  }

  const client = new Client({
    connectionString: databaseUrl,
  });

  try {
    await client.connect();
    console.log('[pg-listener] Connected to PostgreSQL');

    await client.query('LISTEN tasks_channel');
    console.log('[pg-listener] Listening on tasks_channel');

    listenerClient = client;
    retryDelay = 1000; // Reset backoff on successful connection

    client.on('notification', async (msg: { channel: string; payload?: string }) => {
      if (msg.channel !== 'tasks_channel') return;
      if (!msg.payload) return;

      try {
        const payload = JSON.parse(msg.payload);

        // Extract projectId from notification
        const projectId = payload.project_id;
        if (!projectId) {
          console.warn('[pg-listener] Notification missing project_id:', payload);
          return;
        }

        // Broadcast the current snapshot so the client never applies a
        // placeholder empty array as the source of truth.
        const tasks = await taskStore.list(projectId, true);
        const sseMessage: { type: 'tasks'; tasks: unknown[] } = {
          type: 'tasks',
          tasks,
        };

        broadcastToProject(projectId, sseMessage);
        console.log('[pg-listener] Broadcasted snapshot to project:', projectId, 'tasks:', tasks.length);
      } catch (err) {
        console.error('[pg-listener] Failed to parse notification:', err);
      }
    });

    client.on('error', (err: Error) => {
      console.error('[pg-listener] Client error:', err);
      // Trigger reconnection
      stopPGListener();
      scheduleReconnect(prisma);
    });

    client.on('end', () => {
      console.warn('[pg-listener] Connection ended');
      // Trigger reconnection
      stopPGListener();
      scheduleReconnect(prisma);
    });
  } catch (err) {
    console.error('[pg-listener] Failed to start:', err);
    client.end().catch(() => {});
    scheduleReconnect(prisma);
  }
}

/**
 * Schedule a reconnection attempt with exponential backoff.
 */
function scheduleReconnect(prisma?: unknown): void {
  if (reconnectTimeout) {
    return; // Already scheduled
  }

  const delay = retryDelay;
  console.log(`[pg-listener] Scheduling reconnect in ${delay}ms`);

  reconnectTimeout = setTimeout(() => {
    reconnectTimeout = null;
    retryDelay = Math.min(retryDelay * 2, 30000); // Max 30s backoff
    startPGListener(prisma).catch((err) => {
      console.error('[pg-listener] Reconnect failed:', err);
    });
  }, delay);
}

/**
 * Stop the PostgreSQL LISTEN client.
 * Closes the connection and clears reconnection timeout.
 */
export function stopPGListener(): void {
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }

  if (listenerClient) {
    listenerClient
      .end()
      .then(() => {
        console.log('[pg-listener] Stopped');
      })
      .catch((err: Error) => {
        console.error('[pg-listener] Error stopping:', err);
      });
    listenerClient = null;
  }
}
