---
phase: 36-unified-scheduling-core
plan: 05
subsystem: frontend, state-management
tags: [zustand, react, command-pattern, optimistic-update, three-layer-state]

# Dependency graph
requires:
  - phase: 36-04
    provides: POST /api/commands/commit endpoint with optimistic concurrency and versioned snapshots
provides:
  - useProjectStore Zustand store with confirmed/pending/dragPreview three-layer state model
  - useCommandCommit hook for typed command submission with clientRequestId matching
  - useBatchTaskUpdate integration routing schedule changes through command commit
affects: [36-06, 36-07]

# Tech tracking
tech-stack:
  added: []
patterns: [three-layer-state-model, command-commit-flow, optimistic-pending-queue]

key-files:
  created:
    - packages/web/src/stores/useProjectStore.ts
    - packages/web/src/hooks/useCommandCommit.ts
  modified:
    - packages/web/src/types.ts
    - packages/web/src/hooks/useBatchTaskUpdate.ts

key-decisions:
  - "Pending replay deferred to first integration test — gantt-lib/core/scheduling subpath should resolve in Vite but not yet verified in browser build"
  - "Command commit path is additive to existing PATCH flow — single-task schedule changes use /api/commands/commit, non-schedule changes keep PATCH"
  - "buildCommandFromChange detects start-only (resize start), end-only (resize end), or both (move) changes from date field diffs"

patterns-established:
  - "FrontendProjectCommand discriminated union with 13 variants mirrors server ProjectCommand types"
  - "Optimistic pending queue: addPending before fetch, resolvePending/rejectPending on response"
  - "Version conflict recovery: rejected commands re-sync confirmed snapshot from server response"

requirements-completed: [FRONTEND-STATE-MODEL, PREVIEW-COMMIT-PARITY, FRONTEND-COMMIT-FLOW, FRONTEND-MUST-NOT]

# Metrics
duration: 2min
completed: 2026-03-31
---

# Phase 36 Plan 05: Frontend State Model and Command Commit Flow Summary

**Three-layer Zustand store (confirmed/pending/dragPreview) with typed command commit hook routing schedule mutations through POST /api/commands/commit and fallback PATCH for non-schedule changes**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-31T22:09:11Z
- **Completed:** 2026-03-31T22:11:11Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- useProjectStore Zustand store with confirmed/pending/dragPreview state layers and visible snapshot derivation
- useCommandCommit hook with optimistic pending state, server commit via POST /api/commands/commit, resolve/reject lifecycle
- useBatchTaskUpdate routes single-task schedule changes through command commit, non-schedule changes keep existing PATCH flow

## Task Commits

Each task was committed atomically:

1. **Task 1: Create useProjectStore with three-layer state model** - `e49b691` (feat)
2. **Task 2: Create useCommandCommit hook and wire into useBatchTaskUpdate** - `aa4a57b` (feat)

## Files Created/Modified
- `packages/web/src/stores/useProjectStore.ts` - Zustand store with confirmed/pending/dragPreview layers, setConfirmed/addPending/resolvePending/rejectPending/setDragPreview/getVisibleTasks methods
- `packages/web/src/types.ts` - Added FrontendProjectCommand (13 variants), ProjectSnapshot, PendingCommand, ProjectState interfaces
- `packages/web/src/hooks/useCommandCommit.ts` - Command commit hook: generates clientRequestId, adds to pending, POSTs to /api/commands/commit, resolves/rejects on response
- `packages/web/src/hooks/useBatchTaskUpdate.ts` - Added command commit routing for single-task schedule changes with isScheduleChange/buildCommandFromChange helpers

## Decisions Made
- **Pending replay deferred** -- getVisibleTasks returns confirmed tasks for now; full replay via gantt-lib/core/scheduling in browser requires Vite subpath resolution verification (deferred to first integration test)
- **Command commit is additive** -- schedule changes (move/resize) use /api/commands/commit; non-schedule changes (name, color, progress) keep existing PATCH flow unchanged
- **buildCommandFromChange logic** -- start-only changed = resize_task(start), end-only changed = resize_task(end), both changed = move_task

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## Self-Check: PASSED

- FOUND: packages/web/src/stores/useProjectStore.ts
- FOUND: packages/web/src/hooks/useCommandCommit.ts
- FOUND: packages/web/src/types.ts
- FOUND: packages/web/src/hooks/useBatchTaskUpdate.ts
- FOUND: .planning/phases/36-unified-scheduling-core/36-05-SUMMARY.md
- FOUND: e49b691 (Task 1 commit)
- FOUND: aa4a57b (Task 2 commit)

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Frontend three-layer state model ready for integration with gantt-lib/core/scheduling for pending replay
- useCommandCommit ready for drag preview coordination (Plan 06/07)
- All 13 FrontendProjectCommand variants defined, matching server ProjectCommand types

---
*Phase: 36-unified-scheduling-core*
*Completed: 2026-03-31*
