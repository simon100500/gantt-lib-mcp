import { useEffect, useRef } from 'react';
import type { Task } from '../types.ts';

const DEBOUNCE_MS = 500;

/**
 * Automatically saves tasks to the server whenever the tasks array changes.
 * Only fires for authenticated users (accessToken present).
 * Debounced to avoid sending a request on every keystroke.
 *
 * Handles project-switch correctly: skips the next 2 task updates after a
 * token change (empty-reset + server-load) to avoid overwriting server data.
 */
export function useAutoSave(
  tasks: Task[],
  accessToken: string | null,
): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevTokenRef = useRef<string | null>(null);
  const skipCountRef = useRef(0);

  useEffect(() => {
    if (!accessToken) {
      prevTokenRef.current = null;
      return;
    }

    // When token changes (login or project switch), skip the next 2 task updates
    // (reset to [] + load from server) to avoid immediately overwriting server data
    if (accessToken !== prevTokenRef.current) {
      prevTokenRef.current = accessToken;
      skipCountRef.current = 2;
      return;
    }

    if (skipCountRef.current > 0) {
      skipCountRef.current--;
      return;
    }

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(async () => {
      try {
        await fetch('/api/tasks', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify(tasks),
        });
      } catch (err) {
        console.warn('[autosave] Failed to save tasks:', err);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [tasks, accessToken]);
}
