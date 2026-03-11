---
status: awaiting_human_verify
trigger: "Investigate issue: manual-reorder-sse-order-jump"
created: 2026-03-11T00:00:00Z
updated: 2026-03-11T12:55:00Z
---

## Current Focus

hypothesis: fixed. server-originated snapshots now become the autosave baseline explicitly, and server HTTP mutations remain suppressed from PG echo long enough for the direct route broadcast to be the only client-visible echo.
test: user verification in the real browser workflow: manual reorder, wait for SSE/AI completion, reload, then edit again while watching for repeated PATCH and repeated `[pg-listener] Broadcasted debounced snapshot`.
expecting: one user edit should yield at most one autosave PATCH; reload should not trigger an immediate PATCH; PG listener should not enter repeated broadcast waves from the same browser-originated mutation.
next_action: wait for user to verify the original workflow against the patched build

## Symptoms

expected: Manual drag/reorder and subsequent edits should remain stable. When AI/server finishes and pushes updates, task row order should not jump unexpectedly.
actual: User reorders tasks by drag-and-drop. After agent completes silently on server side, starting further edits causes tasks to jump again. Likely server snapshot or autosave re-applies a different order.
errors: No explicit user-facing error. Server console was quiet around the jump.
reproduction: 1) Start AI task/agent that can mutate tasks. 2) Before it finishes, manually reorder tasks in chart/task list. 3) After agent finishes, start editing again. 4) Observe tasks jumping/reverting order.
started: Bug observed after introducing manual task adding/editing/reordering around gantt-lib integration and SSE/autosave behavior.

## Eliminated

## Evidence

- timestamp: 2026-03-11T00:05:00Z
  checked: packages/web/src/components/GanttChart.tsx and packages/web/src/App.tsx
  found: The app passes the raw `tasks` array directly into `gantt-lib` and uses `setTasks` as `onChange`, so local row order is the array order coming back from the chart.
  implication: Any later replacement of `tasks` from SSE or refetch will immediately change visible row order.

- timestamp: 2026-03-11T00:07:00Z
  checked: packages/web/src/hooks/useAutoSave.ts
  found: `computeTasksHash()` sorts tasks by `id` before hashing, so a pure reorder produces the same hash and is not autosaved.
  implication: Manual drag reorder can remain local-only and be lost when another server snapshot arrives.

- timestamp: 2026-03-11T00:09:00Z
  checked: packages/mcp/src/store.ts, prisma/schema.prisma, packages/server/src/agent.ts, packages/server/src/pg-listener.ts
  found: The database schema has no task order column, `taskStore.list()` has no `orderBy`, and both agent completion and PG notifications rebroadcast full snapshots from `taskStore.list()`.
  implication: Even if client order changes locally, server snapshots have no stable way to preserve that row order and can reapply a different order after AI/server mutations.

- timestamp: 2026-03-11T00:14:00Z
  checked: node_modules/gantt-lib/README.md and node_modules/gantt-lib/dist/index.d.ts/index.mjs
  found: gantt-lib renders `tasks.map(...)` in array order and its task-list drag reorder callback produces a reordered array; it has no built-in persisted row-order field.
  implication: Our app must persist row order itself and feed gantt-lib a correctly sorted array.

- timestamp: 2026-03-11T00:34:00Z
  checked: packages/web/src/main.tsx and packages/web/src/hooks/useAutoSave.ts
  found: the app mounts under React `StrictMode`, while `useAutoSave` still uses a token-change `skipCountRef = 2` heuristic instead of marking fetched/SSE-applied snapshots as acknowledged server state.
  implication: mount/reload can consume the heuristic without establishing a durable synced baseline, allowing server-originated task arrays to be treated as unsaved local edits and re-PATCHed.

- timestamp: 2026-03-11T12:47:00Z
  checked: prisma migration triggers, packages/mcp/src/store.ts, packages/server/src/pg-listener.ts, and packages/server/src/index.ts
  found: PostgreSQL emits one `NOTIFY` per task/dependency row change, so a reorder PATCH that updates many rows can produce many listener notifications; the server already counters this by suppressing PG echoes around HTTP mutations and deduplicating identical snapshots before SSE broadcast.
  implication: repeated listener broadcasts after one edit are expected unless browser-originated mutations are suppressed as a batch and duplicate snapshots are dropped.

- timestamp: 2026-03-11T12:51:00Z
  checked: packages/web/src/App.tsx, packages/web/src/hooks/useTasks.ts, and packages/web/src/hooks/useAutoSave.ts
  found: before the fix, fetched/SSE-applied tasks were set into React state without telling autosave they came from the server; after token change or reload, `useAutoSave` could therefore treat those tasks as a new unsaved local state and enqueue PATCH again.
  implication: this closes the causal loop reported by the user: reload/fetch or PG-driven SSE snapshot -> local state set -> autosave PATCH -> DB notifications -> PG rebroadcast -> another server snapshot.

- timestamp: 2026-03-11T12:53:00Z
  checked: packages/web/src/hooks/useAutoSave.test.ts, `npm exec vitest run packages/web/src/hooks/useAutoSave.test.ts`, `npm run build -w packages/web`, and `npm run build -w packages/server`
  found: new autosave tests pass, including “adopt server snapshot without PATCH” and “PATCH only after a later local edit”; both web and server TypeScript builds succeed.
  implication: the explicit server-snapshot acknowledgement path compiles and prevents the client-side replay loop in automated verification.
## Resolution

root_cause: two feedback-loop legs interacted. First, one logical browser PATCH can emit many row-level PostgreSQL notifications, which the listener rebroadcasts unless HTTP-originated mutations are suppressed as a batch. Second, on the client, fetched/SSE-applied task snapshots were not recorded as “already saved”, so reload/reconnect could cause `useAutoSave` to PATCH the server’s own snapshot back to `/api/tasks`, restarting the notification/broadcast cycle.
fix: keep the existing server-side mutation suppression/deduplicated snapshot broadcast path, and replace the client’s token-based autosave skip heuristic with explicit server-snapshot acknowledgement. `useTasks()` now marks fetched tasks as synced, `App.tsx` marks accepted SSE snapshots as synced, and `useAutoSave()` adopts that synced hash as the saved baseline instead of re-saving it.
verification: `cmd /c npm exec vitest run packages/web/src/hooks/useAutoSave.test.ts` passed with 4 tests; `npm.cmd run build -w packages/web` passed; `cmd /c npm run build -w packages/server` passed.
files_changed:
  - packages/web/src/App.tsx
  - packages/web/src/hooks/useAutoSave.ts
  - packages/web/src/hooks/useAutoSave.test.ts
  - packages/web/src/hooks/useTasks.ts
