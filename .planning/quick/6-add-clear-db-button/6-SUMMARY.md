---
phase: quick
plan: 6
subsystem: ui, api, database
tags: fastify, sqlite, react, websocket

# Dependency graph
requires:
  - phase: quick-5
    provides: taskStore.list(), taskStore.delete(), WebSocket broadcast system
provides:
  - TaskStore.deleteAll() method for clearing all tasks
  - DELETE /api/tasks REST endpoint for database clearing
  - Clear Database button in UI with confirmation dialog
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Cascade delete pattern: DELETE FROM tasks removes dependencies automatically"
    - "Confirmation dialog pattern for destructive operations"
    - "WebSocket broadcast after state mutation"

key-files:
  created: []
  modified:
    - packages/mcp/src/store.ts
    - packages/server/src/index.ts
    - packages/web/src/App.tsx

key-decisions:
  - "Added confirmation dialog before clearing database to prevent accidental data loss"
  - "Used DELETE /api/tasks endpoint (RESTful convention) instead of POST /api/tasks/clear"

patterns-established: []

requirements-completed: []

# Metrics
duration: 41s
completed: 2026-03-04T20:45:31Z
---

# Quick Task 6: Add Clear Database Button Summary

**Added TaskStore.deleteAll() method, DELETE /api/tasks endpoint, and red "Clear Database" button with confirmation dialog**

## Performance

- **Duration:** 41s
- **Started:** 2025-03-04T20:44:50Z
- **Completed:** 2025-03-04T20:45:31Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Added `deleteAll()` method to TaskStore that clears all tasks using CASCADE delete
- Created DELETE /api/tasks REST endpoint that calls deleteAll() and broadcasts empty state
- Added red "Clear Database" button to UI control bar with browser confirmation dialog
- Ensured all connected clients receive empty tasks array via WebSocket broadcast

## Task Commits

Each task was committed atomically:

1. **Task 1: Add deleteAll() method to TaskStore** - `740b1d1` (feat)
2. **Task 2: Add DELETE /api/tasks endpoint** - `89a6a49` (feat)
3. **Task 3: Add Clear Database button to UI** - `8a2d5c4` (feat)

**Plan metadata:** (none - quick task)

## Files Created/Modified

- `packages/mcp/src/store.ts` - Added deleteAll() method after delete() method
- `packages/server/src/index.ts` - Added DELETE /api/tasks endpoint with WebSocket broadcast
- `packages/web/src/App.tsx` - Added handleClearDatabase callback and "Clear Database" button

## Decisions Made

- Used DELETE HTTP method instead of POST for RESTful API convention
- Added browser confirmation dialog to prevent accidental data loss
- Positioned button after "Scroll to Today" in control bar
- Used red color scheme (#ef4444) to indicate destructive action

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - all tasks completed successfully without issues.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Clear Database functionality complete and verified
- No blockers for future quick tasks
- TaskStore now has full CRUD operations (create, read, update, delete, deleteAll)

---
*Phase: quick-6*
*Completed: 2026-03-04*
