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
import type { Task } from '@gantt/mcp/types';
import { broadcastToProject } from './sse.js';

let listenerClient: Client | null = null;
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
let retryDelay = 1000;
const pendingBroadcasts = new Map<string, ReturnType<typeof setTimeout>>();
const suppressedProjects = new Map<string, { active: number; until: number }>();
const lastBroadcastHashes = new Map<string, string>();
const BROADCAST_DEBOUNCE_MS = 75;
const SUPPRESSION_COOLDOWN_MS = 1500;

export function suppressProjectBroadcasts(projectId: string, durationMs = 1000): void {
  const existing = suppressedProjects.get(projectId);
  suppressedProjects.set(projectId, {
    active: existing?.active ?? 0,
    until: Math.max(existing?.until ?? 0, Date.now() + durationMs),
  });
}

function isProjectSuppressed(projectId: string): boolean {
  const entry = suppressedProjects.get(projectId);
  if (!entry) return false;
  if (entry.active <= 0 && Date.now() >= entry.until) {
    suppressedProjects.delete(projectId);
    return false;
  }
  return entry.active > 0 || Date.now() < entry.until;
}

export function beginProjectBroadcastSuppression(projectId: string, cooldownMs = SUPPRESSION_COOLDOWN_MS): () => void {
  const entry = suppressedProjects.get(projectId) ?? { active: 0, until: 0 };
  suppressedProjects.set(projectId, {
    active: entry.active + 1,
    until: Math.max(entry.until, Date.now() + cooldownMs),
  });

  return () => {
    const current = suppressedProjects.get(projectId);
    if (!current) return;

    const next = {
      active: Math.max(0, current.active - 1),
      until: Math.max(current.until, Date.now() + cooldownMs),
    };

    if (next.active === 0 && Date.now() >= next.until) {
      suppressedProjects.delete(projectId);
      return;
    }

    suppressedProjects.set(projectId, next);
  };
}

function computeSnapshotHash(tasks: Task[]): string {
  return JSON.stringify(tasks.map((task, index) => ({
    id: task.id,
    order: task.order ?? index,
    name: task.name,
    startDate: task.startDate,
    endDate: task.endDate,
    color: task.color ?? null,
    progress: task.progress ?? 0,
    dependencies: (task.dependencies ?? [])
      .map(dep => ({
        taskId: dep.taskId,
        type: dep.type,
        lag: dep.lag ?? 0,
      }))
      .sort((a, b) => a.taskId.localeCompare(b.taskId) || a.type.localeCompare(b.type) || a.lag - b.lag),
  })));
}

export function rememberProjectSnapshot(projectId: string, tasks: Task[]): void {
  lastBroadcastHashes.set(projectId, computeSnapshotHash(tasks));
}

async function scheduleProjectBroadcast(projectId: string): Promise<void> {
  const existing = pendingBroadcasts.get(projectId);
  if (existing) {
    clearTimeout(existing);
  }

  const timeout = setTimeout(async () => {
    pendingBroadcasts.delete(projectId);

    try {
      const tasks = await taskStore.list(projectId, true);
      const snapshotHash = computeSnapshotHash(tasks);
      if (lastBroadcastHashes.get(projectId) === snapshotHash) {
        console.log('[pg-listener] Skipped duplicate snapshot for project:', projectId, 'tasks:', tasks.length);
        return;
      }

      lastBroadcastHashes.set(projectId, snapshotHash);
      broadcastToProject(projectId, { type: 'tasks', tasks });
      console.log('[pg-listener] Broadcasted debounced snapshot to project:', projectId, 'tasks:', tasks.length);
    } catch (err) {
      console.error('[pg-listener] Failed to broadcast snapshot for project:', projectId, err);
    }
  }, BROADCAST_DEBOUNCE_MS);

  pendingBroadcasts.set(projectId, timeout);
}

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

        if (isProjectSuppressed(projectId)) {
          console.log('[pg-listener] Suppressed echo notification for project:', projectId);
          return;
        }

        await scheduleProjectBroadcast(projectId);
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

  for (const timeout of pendingBroadcasts.values()) {
    clearTimeout(timeout);
  }
  pendingBroadcasts.clear();
  suppressedProjects.clear();
  lastBroadcastHashes.clear();

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
