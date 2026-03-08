---
phase: quick-010
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/server/src/index.ts
  - packages/web/src/hooks/useAutoSave.ts
  - packages/web/src/App.tsx
autonomous: true
requirements: [QUICK-010]

must_haves:
  truths:
    - "Изменения в диаграмме (перетаскивание, переименование задачи, смена сроков, зависимости) автоматически сохраняются на сервере без ручного действия пользователя"
    - "Сохранение дебаунсируется: частые изменения подряд отправляют только один запрос"
    - "Для неавторизованных пользователей автосохранение не вызывается (useLocalTasks уже сохраняет в localStorage)"
  artifacts:
    - path: "packages/server/src/index.ts"
      provides: "PUT /api/tasks endpoint"
      contains: "fastify.put('/api/tasks'"
    - path: "packages/web/src/hooks/useAutoSave.ts"
      provides: "Debounced autosave hook"
      exports: ["useAutoSave"]
  key_links:
    - from: "packages/web/src/App.tsx"
      to: "PUT /api/tasks"
      via: "useAutoSave hook triggers on tasks change"
      pattern: "useAutoSave"
---

<objective>
Add autosave: whenever the Gantt chart changes (drag dates, rename task, add/remove dependency, change progress), the updated tasks array is automatically persisted to the server for authenticated users.

Purpose: Changes made directly in the chart (not via AI) are currently lost on page refresh for authenticated users. localStorage already handles demo mode. We need the same persistence for server-backed sessions.

Output:
- `PUT /api/tasks` endpoint — accepts Task[] body, calls `taskStore.importTasks()` for the project
- `useAutoSave` hook — debounces saves (500ms), skips when not authenticated, shows no UI noise
- Wire `useAutoSave` into `App.tsx`
</objective>

<execution_context>
@C:/Users/Volobuev/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Volobuev/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

Key patterns already established:
- `taskStore.importTasks(jsonData, projectId)` — bulk replace tasks for a project (used in store.ts lines 412–451)
- All authenticated routes use `{ preHandler: [authMiddleware] }` and read `req.user!.projectId` / `req.user!.sessionId`
- `useLocalTasks` already auto-saves to localStorage on every `setTasks` call (no change needed there)
- `tasks` state in App.tsx flows: `onChange={setTasks}` on GanttChart → React state → we need to hook here
- Access token is available as `auth.accessToken` in App.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add PUT /api/tasks endpoint to server</name>
  <files>packages/server/src/index.ts</files>
  <action>
Add a new authenticated endpoint after the existing DELETE /api/tasks handler:

```typescript
fastify.put('/api/tasks', { preHandler: [authMiddleware] }, async (req, reply) => {
  const tasks = req.body as unknown[];
  if (!Array.isArray(tasks)) {
    return reply.status(400).send({ error: 'body must be an array of tasks' });
  }
  const count = await taskStore.importTasks(JSON.stringify(tasks), req.user!.projectId);
  // Broadcast updated tasks to all sessions for this project so other browser tabs sync
  broadcastToSession(req.user!.sessionId, { type: 'tasks', tasks });
  return reply.send({ saved: count });
});
```

`taskStore.importTasks` already handles:
- Deleting existing tasks for the project
- Re-inserting all tasks with dependencies
- Using the projectId scope

No new imports needed — `taskStore`, `broadcastToSession`, `authMiddleware` are already imported.
  </action>
  <verify>
    <automated>curl -s -X PUT http://localhost:3000/api/tasks -H "Content-Type: application/json" -d '[]' | grep -E "saved|error|Unauthorized"</automated>
  </verify>
  <done>PUT /api/tasks returns 401 without token, 200 with { saved: N } with valid token</done>
</task>

<task type="auto">
  <name>Task 2: Create useAutoSave hook with debounce</name>
  <files>packages/web/src/hooks/useAutoSave.ts</files>
  <action>
Create new file `packages/web/src/hooks/useAutoSave.ts`:

```typescript
import { useEffect, useRef } from 'react';
import type { Task } from '../types.ts';

const DEBOUNCE_MS = 500;

/**
 * Automatically saves tasks to the server whenever the tasks array changes.
 * Only fires for authenticated users (accessToken present).
 * Debounced to avoid sending a request on every keystroke.
 */
export function useAutoSave(
  tasks: Task[],
  accessToken: string | null,
): void {
  // Track whether this is the initial load (skip first save)
  const isFirstRender = useRef(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Skip autosave for demo/local mode
    if (!accessToken) return;

    // Skip the very first render (tasks just loaded from server — no need to save back)
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    // Debounce: cancel previous pending save
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

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
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [tasks, accessToken]);
}
```

Notes:
- `isFirstRender` ref resets when `accessToken` changes (project switch) — but that's fine because on project switch `tasks` is reset to `[]` first, then re-fetched, so we'll get two renders: the `[]` reset (skip due to flag) and then the loaded tasks (skip due to flag). The flag only needs to prevent saving the first tasks value received after mount/token change.
- Actually: the flag should reset when accessToken changes. Use a separate ref or just track prevAccessToken to reset isFirstRender when token changes.

Revised version (handles project switch correctly):

```typescript
import { useEffect, useRef } from 'react';
import type { Task } from '../types.ts';

const DEBOUNCE_MS = 500;

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
```
  </action>
  <verify>
    <automated>test -f packages/web/src/hooks/useAutoSave.ts && echo "file exists"</automated>
  </verify>
  <done>useAutoSave.ts exists, exports useAutoSave function, handles skip logic for initial load and project switch</done>
</task>

<task type="auto">
  <name>Task 3: Wire useAutoSave into App.tsx</name>
  <files>packages/web/src/App.tsx</files>
  <action>
1. Add import at the top of App.tsx with the other hook imports:
```typescript
import { useAutoSave } from './hooks/useAutoSave.ts';
```

2. Inside the `App` component, after the line `const { tasks, setTasks, loading, error } = auth.isAuthenticated ? authenticatedTasks : localTasks;`, add:
```typescript
// Autosave to server on any chart change (authenticated only; demo mode saves to localStorage in useLocalTasks)
useAutoSave(tasks, auth.isAuthenticated ? auth.accessToken : null);
```

That's all — no other changes needed. The `tasks` state already contains the latest chart state after every user interaction (GanttChart's `onChange` calls `setTasks`).
  </action>
  <verify>
    <automated>grep -n "useAutoSave" packages/web/src/App.tsx</automated>
  </verify>
  <done>App.tsx imports useAutoSave and calls it with (tasks, accessToken); TypeScript build passes with no errors</done>
</task>

</tasks>

<verification>
1. Build check: `cd packages/web && npx tsc --noEmit` — no TypeScript errors
2. Server build: `cd packages/server && npx tsc --noEmit` — no TypeScript errors
3. Manual smoke test (if server running):
   - Log in, load project with tasks
   - Drag a task to change its dates
   - Wait 500ms
   - Reload the page — task should retain the new dates
</verification>

<success_criteria>
- `PUT /api/tasks` endpoint exists and accepts Task[] body
- `useAutoSave` hook debounces saves at 500ms, skips initial load and project-switch transitions
- App.tsx wires the hook for authenticated users only
- TypeScript compiles without errors in both packages
- Page refresh after chart edit retains all changes for authenticated users
</success_criteria>

<output>
After completion, create `.planning/quick/010-autosave-on-chart-change/010-SUMMARY.md`
</output>
