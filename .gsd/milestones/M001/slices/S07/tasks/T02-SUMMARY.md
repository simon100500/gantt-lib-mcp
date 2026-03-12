---
id: T02
parent: S07
milestone: M001
provides: []
requires: []
affects: []
key_files: []
key_decisions: []
patterns_established: []
observability_surfaces: []
drill_down_paths: []
duration: 
verification_result: passed
completed_at: 
blocker_discovered: false
---
# T02: 07-web-ui-with-real-time-gantt-editing-via-ai-dialogue 02

**# Phase 07 Plan 02: SQLite Persistence for MCP TaskStore Summary**

## What Happened

# Phase 07 Plan 02: SQLite Persistence for MCP TaskStore Summary

SQLite-backed TaskStore via @libsql/client with 3-table schema (tasks, dependencies, messages) replacing the in-memory Map, plus async API migration across all MCP tool handlers.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Create db.ts with @libsql/client init and schema | 25bc066 | packages/mcp/src/db.ts |
| 2 | Rewrite TaskStore to SQLite, update scheduler and MCP handlers | 83d1c11 | store.ts, scheduler.ts, types.ts, index.ts, scheduler.test.ts |

## What Was Built

**db.ts** — Singleton `getDb()` function that lazy-initializes an `@libsql/client` Client and creates three tables:
- `tasks` (id, name, start_date, end_date, color, progress)
- `dependencies` (id, task_id FK CASCADE, dep_task_id, type, lag)
- `messages` (id, role, content, created_at)

**store.ts** — `TaskStore` class fully rewritten with async SQLite methods:
- `create`, `list`, `get`, `update`, `delete` — all async, all backed by SQLite
- `exportTasks` / `importTasks` — serialize/deserialize via DB
- `addMessage` / `getMessages` — new methods for AI dialog history
- Scheduler integration: reloads all tasks from DB into a `Map<string, Task>` snapshot, runs `TaskScheduler.recalculateDates()` in memory, writes back updated rows

**scheduler.ts** — Refactored to accept `Map<string, Task>` in constructor instead of a sync `TaskStore` interface. Eliminates async coupling. All DFS logic, date propagation, and cascade behavior preserved intact.

**types.ts** — Added `Message` interface for dialog history.

**index.ts** — All 8 MCP tool handlers updated to `await` store methods. `main()` now calls `await getDb()` for DB initialization on startup. `set_autosave_path` made a no-op (returns success message explaining SQLite is always-on). `TaskScheduler` import removed (not needed in index.ts). `config.ts` / `getAutoSavePath` import removed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] scheduler.test.ts used old MockTaskStore interface**
- **Found during:** Task 2 build verification
- **Issue:** Tests passed `MockTaskStore` (with `get`/`list` methods) to `TaskScheduler` constructor which now expects `Map<string, Task>`
- **Fix:** Rewrote `createMockStore` helper to return a `Map<string, Task>` directly (it already built a `Map` internally); removed `MockTaskStore` interface; removed `@ts-ignore` comment; cleaned up unused imports
- **Files modified:** packages/mcp/src/scheduler.test.ts
- **Commit:** 83d1c11

## Verification Results

- `npm run build:mcp` exits 0, zero TypeScript errors
- `DB_PATH=./test-verify.db node packages/mcp/dist/index.js` starts without crashing
- DB tables verified: `['dependencies', 'messages', 'tasks']` all present
- All `taskStore.*` calls in compiled index.js use `await` (grep confirmed 0 non-awaited calls)

## Self-Check: PASSED

- packages/mcp/src/db.ts: FOUND
- packages/mcp/src/store.ts: FOUND (rewritten)
- packages/mcp/src/types.ts: FOUND (Message type added)
- packages/mcp/src/scheduler.ts: FOUND (Map-based snapshot)
- packages/mcp/src/index.ts: FOUND (async handlers)
- Commit 25bc066: FOUND
- Commit 83d1c11: FOUND
