---
phase: quick-010
plan: "01"
subsystem: autosave
tags: [autosave, persistence, debounce, server, hooks]
dependency_graph:
  requires: [PUT /api/tasks endpoint, auth middleware, taskStore.importTasks]
  provides: [PUT /api/tasks, useAutoSave hook, chart-change persistence]
  affects: [packages/server/src/index.ts, packages/web/src/App.tsx]
tech_stack:
  added: []
  patterns: [debounce via setTimeout/clearTimeout, skip-count pattern for initial-load guard]
key_files:
  created:
    - packages/web/src/hooks/useAutoSave.ts
  modified:
    - packages/server/src/index.ts
    - packages/web/src/App.tsx
decisions:
  - "skipCountRef=2 on token change: skip empty-reset and server-load updates to prevent overwriting server data"
  - "broadcastToSession on PUT: other browser tabs for same project stay in sync after autosave"
  - "500ms debounce: balance between responsiveness and request count during drag operations"
metrics:
  duration: "1 min"
  completed_date: "2026-03-09"
  tasks_completed: 3
  files_changed: 3
---

# Phase quick-010 Plan 01: Autosave on Chart Change Summary

**One-liner:** Debounced 500ms autosave to server via PUT /api/tasks triggered on every chart change for authenticated users, with skip-count guard preventing overwrites on login/project-switch.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add PUT /api/tasks endpoint to server | f28a6af | packages/server/src/index.ts |
| 2 | Create useAutoSave hook with debounce | 0712d1a | packages/web/src/hooks/useAutoSave.ts |
| 3 | Wire useAutoSave into App.tsx | 6c1da46 | packages/web/src/App.tsx |

## What Was Built

**PUT /api/tasks endpoint** (`packages/server/src/index.ts`):
- Accepts `Task[]` body, validates it is an array
- Calls `taskStore.importTasks(JSON.stringify(tasks), projectId)` for bulk-replace
- Broadcasts updated tasks to session for multi-tab sync
- Protected by `authMiddleware` — returns 401 without token

**useAutoSave hook** (`packages/web/src/hooks/useAutoSave.ts`):
- Debounces saves at 500ms using `clearTimeout`/`setTimeout` pattern
- Skips the first 2 task updates after token change (empty-array reset + server-load) to prevent overwriting server data on login or project switch
- Skips entirely when `accessToken` is null (demo/unauthenticated mode)
- Silent network error handling via `console.warn`

**App.tsx wiring**:
- Imports `useAutoSave`
- Calls `useAutoSave(tasks, auth.isAuthenticated ? auth.accessToken : null)` immediately after task state destructuring
- Demo mode unaffected: passes `null` so hook is a no-op

## Verification

- TypeScript `--noEmit` passes on both `packages/server` and `packages/web` with zero errors
- `PUT /api/tasks` returns 401 without token (authMiddleware enforced)
- `PUT /api/tasks` accepts Task[] and returns `{ saved: N }` with valid token

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- [x] `packages/web/src/hooks/useAutoSave.ts` exists
- [x] `packages/server/src/index.ts` contains `fastify.put('/api/tasks'`
- [x] `packages/web/src/App.tsx` contains `useAutoSave`
- [x] Commits f28a6af, 0712d1a, 6c1da46 exist
- [x] Both packages compile without TypeScript errors
