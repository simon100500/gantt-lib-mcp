import { useEffect, useRef, useState } from 'react';
import type { Task, TaskDependency } from '../types.ts';

/**
 * @deprecated This hook is deprecated. Use useBatchTaskUpdate instead.
 *
 * useAutoSave sent ALL tasks on every change via PUT /api/tasks, which was inefficient.
 * gantt-lib's onTasksChange callback only sends changed tasks, not the full array.
 * It also cannot apply authoritative server `changedTasks` cascades for linked schedule edits.
 *
 * useBatchTaskUpdate properly handles gantt-lib's partial onChange behavior:
 * - Individual task mutations via PATCH/POST/DELETE endpoints
 * - Optimistic updates for better UX
 * - Proper error handling with rollback
 *
 * Migration guide:
 * Before: const { savingState } = useAutoSave(tasks, accessToken);
 * After:  const batchUpdate = useBatchTaskUpdate({ tasks, setTasks, accessToken });
 *         const { handleTasksChange, handleAdd, handleDelete, ... } = batchUpdate;
 */

// Export saving state so components can display it
export type SavingState = 'idle' | 'saving' | 'saved' | 'error';

export interface UseAutoSaveResult {
  savingState: SavingState;
}

// Track saving state globally (single instance)
let globalSavingState: SavingState = 'idle';
const listeners = new Set<(state: SavingState) => void>();

function notifyListeners(state: SavingState) {
  globalSavingState = state;
  listeners.forEach(listener => listener(state));
}

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
    parentId: t.parentId,
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

  return JSON.stringify(normalizedTasks);
}

/**
 * Automatically saves tasks to the server whenever the tasks array changes.
 * Only fires for authenticated users (accessToken present).
 * Saves immediately without debouncing to ensure changes are persisted.
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
  skipVersion = 0,
): UseAutoSaveResult {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevTokenRef = useRef<string | null>(null);
  const skipCountRef = useRef(0);
  const lastSkipVersionRef = useRef(skipVersion);
  const lastSavedHashRef = useRef<string>('');
  const saveInProgressRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [savingState, setSavingState] = useState<SavingState>(globalSavingState);

  // Subscribe to global saving state changes
  useEffect(() => {
    const listener = (state: SavingState) => setSavingState(state);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    if (!accessToken) {
      prevTokenRef.current = null;
      lastSkipVersionRef.current = skipVersion;
      lastSavedHashRef.current = '';
      console.log('[autosave] No access token, skipping save');
      return;
    }

    // When token changes (login or project switch), skip the next 1 task update
    // (load from server via useTasks) to avoid immediately overwriting server data.
    // The reset-to-[] call goes through replaceTasksFromSystem which increments skipVersion,
    // so that update is intercepted by the skipVersion branch below — it does NOT consume
    // skipCount. Only the direct setTasks(loadedData) from useTasks needs to be skipped here.
    if (accessToken !== prevTokenRef.current) {
      prevTokenRef.current = accessToken;
      skipCountRef.current = 1;
      lastSkipVersionRef.current = skipVersion;
      lastSavedHashRef.current = '';
      console.log('[autosave] Token changed, skipping next 1 update, token:', accessToken.substring(0, 10) + '...');
      return;
    }

    if (skipVersion !== lastSkipVersionRef.current) {
      lastSkipVersionRef.current = skipVersion;
      lastSavedHashRef.current = computeTasksHash(tasks);
      console.log('[autosave] Skipping save for system task snapshot, tasks:', tasks.length);
      return;
    }

    if (skipCountRef.current > 0) {
      console.log('[autosave] Skipping update due to skipCount, remaining:', skipCountRef.current);
      skipCountRef.current--;
      return;
    }

    // Compute hash of current tasks
    const currentHash = computeTasksHash(tasks);

    // Skip save if data hasn't changed
    if (currentHash === lastSavedHashRef.current) {
      console.log('[autosave] Skipping save - data unchanged');
      return;
    }

    // Skip if a save is already in progress for the same data
    if (saveInProgressRef.current && currentHash === lastSavedHashRef.current) {
      console.log('[autosave] Save already in progress for this data');
      return;
    }

    console.log('[autosave] Saving immediately, tasks:', tasks.length);

    // Clear any pending timer
    if (timerRef.current) clearTimeout(timerRef.current);

    // Cancel any in-flight save request to prevent race conditions
    if (abortControllerRef.current) {
      console.log('[autosave] Aborting previous in-flight save request');
      abortControllerRef.current.abort();
    }

    // Create new abort controller for this save
    abortControllerRef.current = new AbortController();

    // Capture the skipVersion at save-start so we can detect if a system
    // snapshot (replaceTasksFromSystem) arrived while the save was in-flight.
    // If skipVersion advanced during the fetch, the lastSavedHash was already
    // set by the skipVersion branch to hash(newSystemTasks) — do NOT overwrite
    // it with the stale currentHash or the next render will trigger a wipe save.
    const savedSkipVersionRef = lastSkipVersionRef.current;

    // Save immediately (no debounce)
    const saveTasks = async () => {
      saveInProgressRef.current = true;
      notifyListeners('saving');

      console.log('[autosave] Executing save now, tasks:', tasks.length);
      try {
        const response = await fetch('/api/tasks', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify(tasks),
          signal: abortControllerRef.current?.signal,
        });

        if (response.ok) {
          // Only update hash after successful save — but only if no system
          // snapshot arrived while the save was in-flight (skipVersion unchanged).
          if (lastSkipVersionRef.current === savedSkipVersionRef) {
            lastSavedHashRef.current = currentHash;
          } else {
            console.log('[autosave] skipVersion changed during save — not overwriting lastSavedHash');
          }
          console.log('[autosave] Save successful');
          notifyListeners('saved');

          // Reset to 'idle' after 2 seconds
          setTimeout(() => {
            if (globalSavingState === 'saved') {
              notifyListeners('idle');
            }
          }, 2000);
        } else {
          console.warn('[autosave] Failed to save tasks:', response.status, response.statusText);
          notifyListeners('error');

          // Reset to 'idle' after 2 seconds
          setTimeout(() => {
            if (globalSavingState === 'error') {
              notifyListeners('idle');
            }
          }, 2000);
        }
      } catch (err) {
        // Don't log error if request was aborted (intentional cancellation)
        if (err instanceof Error && err.name === 'AbortError') {
          console.log('[autosave] Save request aborted due to newer update');
          return;
        }
        console.warn('[autosave] Failed to save tasks:', err);
        notifyListeners('error');

        // Reset to 'idle' after 2 seconds
        setTimeout(() => {
          if (globalSavingState === 'error') {
            notifyListeners('idle');
          }
        }, 2000);
      } finally {
        saveInProgressRef.current = false;
        abortControllerRef.current = null;
      }
    };

    // Execute the save
    saveTasks();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [tasks, accessToken, skipVersion]);

  return { savingState };
}
