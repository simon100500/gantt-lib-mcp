import { useEffect, useRef } from 'react';
import type { Task, TaskDependency } from '../types.ts';

const DEBOUNCE_MS = 500;

/**
 * Computes a stable hash from task data for deep equality comparison.
 * Only includes fields that are persisted to the server.
 */
function computeTasksHash(tasks: Task[]): string {
  // Normalize dates to strings for consistent hashing
  const normalizedTasks = tasks.map(t => ({
    id: t.id,
    name: t.name,
    startDate: typeof t.startDate === 'string' ? t.startDate : t.startDate.toISOString().split('T')[0],
    endDate: typeof t.endDate === 'string' ? t.endDate : t.endDate.toISOString().split('T')[0],
    color: t.color,
    progress: t.progress,
    accepted: t.accepted,
    locked: t.locked,
    divider: t.divider,
    // Sort dependencies for stable order
    dependencies: t.dependencies?.map(d => ({
      taskId: d.taskId,
      type: d.type,
      lag: d.lag,
    })).sort((a, b) => a.taskId.localeCompare(b.taskId)) || [],
  }));

  // Sort tasks by id for stable order
  normalizedTasks.sort((a, b) => a.id.localeCompare(b.id));

  return JSON.stringify(normalizedTasks);
}

/**
 * Automatically saves tasks to the server whenever the tasks array changes.
 * Only fires for authenticated users (accessToken present).
 * Debounced to avoid sending a request on every keystroke.
 *
 * Uses deep comparison via hash to prevent saves when only array references
 * change but data remains identical (fixes infinite loop with gantt-lib onChange).
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
  const lastSavedHashRef = useRef<string>('');

  useEffect(() => {
    if (!accessToken) {
      prevTokenRef.current = null;
      lastSavedHashRef.current = '';
      return;
    }

    // When token changes (login or project switch), skip the next 2 task updates
    // (reset to [] + load from server) to avoid immediately overwriting server data
    if (accessToken !== prevTokenRef.current) {
      prevTokenRef.current = accessToken;
      skipCountRef.current = 2;
      lastSavedHashRef.current = '';
      return;
    }

    if (skipCountRef.current > 0) {
      skipCountRef.current--;
      return;
    }

    // Compute hash of current tasks
    const currentHash = computeTasksHash(tasks);

    // Skip save if data hasn't changed
    if (currentHash === lastSavedHashRef.current) {
      return;
    }

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(async () => {
      try {
        const response = await fetch('/api/tasks', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify(tasks),
        });

        if (response.ok) {
          // Only update hash after successful save
          lastSavedHashRef.current = currentHash;
        } else {
          console.warn('[autosave] Failed to save tasks:', response.status, response.statusText);
        }
      } catch (err) {
        console.warn('[autosave] Failed to save tasks:', err);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [tasks, accessToken]);
}
