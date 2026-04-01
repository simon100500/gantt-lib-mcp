---
phase: 35-scheduling-core-adoption
plan: 02
subsystem: api
tags: [mcp, taskservice, scheduling, prisma]
requires:
  - phase: 35-01
    provides: Headless schedule command core and changed-set contracts
provides:
  - TaskService schedule command execution path with transactional persistence
  - MCP tools for move_task, resize_task, and recalculate_schedule
  - Compatibility update_task responses that return changed tasks instead of full snapshots
affects: [35-03, server, agent, web]
tech-stack:
  added: []
  patterns: [authoritative server changed-set responses, schedule-aware compatibility updates]
key-files:
  created: []
  modified:
    - packages/mcp/src/services/task.service.ts
    - packages/mcp/src/index.ts
key-decisions:
  - "Kept `update()` as a compatibility wrapper and added `updateWithResult()` for changed-set aware consumers."
  - "Added explicit MCP schedule tools rather than overloading every linked edit through raw update semantics."
patterns-established:
  - "TaskService is the authoritative server-side scheduling execution layer."
  - "MCP mutation responses use changedTasks/changedIds when cascade semantics matter."
requirements-completed: []
duration: 55min
completed: 2026-03-31
---

# Phase 35: Scheduling Core Adoption Summary

**TaskService and MCP tool surface now execute schedule intent server-side and return authoritative changed sets for linked edits**

## Performance

- **Duration:** 55 min
- **Started:** 2026-03-31T17:05:00Z
- **Completed:** 2026-03-31T18:05:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Introduced `executeScheduleCommand()` plus transactional persistence of changed tasks and dependency rows in `TaskService`.
- Added `move_task`, `resize_task`, and `recalculate_schedule` to the MCP tool registry with schedule-aware descriptions and validation.
- Stopped `update_task` from returning `allTasks` when a precise changed set is enough, while preserving a compatibility wrapper for existing callers.

## Task Commits

Each task was committed atomically:

1. **Task 1: Refactor TaskService onto schedule commands** - `7679a7d` (feat)
2. **Task 2: Expose explicit MCP schedule tools and compatibility routing** - `7679a7d` (feat)

**Plan metadata:** Pending in docs checkpoint commit

## Files Created/Modified
- `packages/mcp/src/services/task.service.ts` - Schedule command execution, transactional persistence, compatibility result wrapper
- `packages/mcp/src/index.ts` - Explicit schedule tools and changed-set aware `update_task` responses

## Decisions Made
- Used project `ganttDayMode` to build schedule options in the service layer so command execution respects business vs calendar days.
- Returned `changedTasks`/`changedIds` from compatibility updates without forcing every existing caller to migrate immediately.

## Deviations from Plan

None - plan executed with the intended server-side command flow and compatibility routing.

## Issues Encountered

- The original wave-1 subagents exited after partial edits without finishing commits or summaries, so the orchestration had to be recovered locally and recommitted cleanly.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Agent verification and web save flows can now consume authoritative server changed sets.
- Wave 2 can update prompt guidance and client reconciliation without changing the MCP contract again.

---
*Phase: 35-scheduling-core-adoption*
*Completed: 2026-03-31*
