import { useEffect, useRef } from 'react';
import type { Task } from '../types.ts';

type PendingSave = {
  tasks: Task[];
  accessToken: string;
};

/**
 * Automatically saves tasks to the server whenever the tasks array changes.
 * Only fires for authenticated users (accessToken present).
 * Debounced to avoid sending a request on every keystroke.
 *
 * Client-authoritative: PUTs entire task array as source of truth.
 * Server stores snapshot without recalculation or SSE broadcasts.
 */
export function useAutoSave(
  tasks: Task[],
  accessToken: string | null,
  clientId: string,
): void {
  const prevTokenRef = useRef<string | null>(null);
  const lastSavedTasksRef = useRef<Task[]>([]);
  const pendingSaveRef = useRef<PendingSave | null>(null);
  const inFlightSaveRef = useRef<Promise<void> | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushPendingSaveRef = useRef<() => Promise<void>>(async () => {});
  flushPendingSaveRef.current = async () => {
    const pending = pendingSaveRef.current;
    if (!pending) return;

    if (inFlightSaveRef.current) {
      return;
    }

    pendingSaveRef.current = null;

    const request = fetch('/api/tasks', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${pending.accessToken}`,
      },
      body: JSON.stringify(pending.tasks),
    })
      .then((response) => {
        if (response.ok) {
          lastSavedTasksRef.current = pending.tasks;
          return;
        }

        console.warn('[autosave] Failed to save tasks:', response.status, response.statusText);
        pendingSaveRef.current = pending;
      })
      .catch((err) => {
        console.warn('[autosave] Failed to save tasks:', err);
        pendingSaveRef.current = pending;
      })
      .finally(() => {
        inFlightSaveRef.current = null;
      });

    inFlightSaveRef.current = request;
    await request;

    if (pendingSaveRef.current) {
      await flushPendingSaveRef.current();
    }
  };

  useEffect(() => {
    const flushPendingSave = () => {
      const pending = pendingSaveRef.current;
      if (!pending || inFlightSaveRef.current) return;

      pendingSaveRef.current = null;
      void fetch('/api/tasks', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${pending.accessToken}`,
        },
        body: JSON.stringify(pending.tasks),
        keepalive: true,
      })
        .then((response) => {
          if (response.ok) {
            lastSavedTasksRef.current = pending.tasks;
            return;
          }

          console.warn('[autosave] Failed to flush pending tasks:', response.status, response.statusText);
          pendingSaveRef.current = pending;
        })
        .catch((err) => {
          console.warn('[autosave] Failed to flush pending tasks:', err);
          pendingSaveRef.current = pending;
        });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushPendingSave();
      }
    };

    window.addEventListener('pagehide', flushPendingSave);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('pagehide', flushPendingSave);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    // Clear existing debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    if (!accessToken) {
      prevTokenRef.current = null;
      lastSavedTasksRef.current = [];
      pendingSaveRef.current = null;
      inFlightSaveRef.current = null;
      return;
    }

    if (accessToken !== prevTokenRef.current) {
      prevTokenRef.current = accessToken;
      lastSavedTasksRef.current = [];
      pendingSaveRef.current = null;
      inFlightSaveRef.current = null;
      return;
    }

    // Skip save if data hasn't changed (simple reference check)
    if (tasks === lastSavedTasksRef.current) {
      pendingSaveRef.current = null;
      return;
    }

    // Debounce: update pending save, schedule flush after delay
    pendingSaveRef.current = {
      tasks,
      accessToken,
    };

    debounceTimerRef.current = setTimeout(() => {
      void flushPendingSaveRef.current();
    }, 500); // 500ms debounce

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [tasks, accessToken, clientId]);
}
