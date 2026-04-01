---
phase: 35-scheduling-core-adoption
plan: 01
subsystem: scheduling
tags: [scheduler, gantt-lib, dependencies, regression]
requires:
  - phase: 08
    provides: MCP task dependency model and cascade entrypoints
provides:
  - Headless scheduling core with command-level move, resize, and recalculate operations
  - Guardrails for SF semantics, strongest-constraint recalc, and changed-set diffs
  - Regression coverage for command-level scheduling behavior
affects: [35-02, 35-03, server, web]
tech-stack:
  added: []
  patterns: [headless schedule command execution, true changed-set result contract]
key-files:
  created: []
  modified:
    - packages/mcp/src/scheduler.ts
    - packages/mcp/src/scheduler.test.ts
    - packages/mcp/src/types.ts
key-decisions:
  - "Kept `TaskScheduler.recalculateDates()` as a compatibility surface while making command execution the new source of truth."
  - "Made `changedIds` a true diff while using `snapshot` only as an optional normalized output."
patterns-established:
  - "Schedule commands: move_task, resize_task, recalculate_schedule all flow through the same pure core."
  - "Regression-first parity: scheduler behavior is locked by focused node:test coverage."
requirements-completed: []
duration: 90min
completed: 2026-03-31
---

# Phase 35: Scheduling Core Adoption Summary

**Headless MCP scheduling core with command-level execution, parity-oriented cascade behavior, and explicit regression guardrails**

## Performance

- **Duration:** 90 min
- **Started:** 2026-03-31T15:50:00Z
- **Completed:** 2026-03-31T17:55:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Replaced the legacy recursive date propagation with a headless scheduling engine that supports move, resize, and project recalc commands.
- Added true changed-set semantics (`changedTasks`, `changedIds`, optional `snapshot`) instead of treating the full task list as the authoritative result.
- Expanded scheduler regression coverage to include strongest-constraint recalc, resize guardrails, negative lag/business-day behavior, and parent summary recompute.

## Task Commits

Each task was committed atomically:

1. **Task 1: Port or reconstruct headless scheduling primitives from gantt-lib** - `5492c9d` (feat)
2. **Task 2: Build exhaustive regression tests for scheduling parity and guardrails** - `5492c9d` (feat)

**Plan metadata:** Pending in docs checkpoint commit

## Files Created/Modified
- `packages/mcp/src/scheduler.ts` - New headless scheduling core and compatibility facade
- `packages/mcp/src/scheduler.test.ts` - Regression suite for dependency semantics and command behavior
- `packages/mcp/src/types.ts` - Schedule command and changed-set result contracts

## Decisions Made
- Preserved the old `recalculateDates()` entrypoint for compatibility, but backed it with the new command-level core.
- Corrected SF zero-lag behavior to finish on the predecessor start date instead of the previous day.

## Deviations from Plan

None - plan executed as intended, with the compatibility shim retained to avoid breaking existing callers during wave 1.

## Issues Encountered

- The MCP build depended on a generated Prisma client under `packages/mcp/dist/prisma-client`; regenerating it was required before TypeScript could resolve Prisma types correctly.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `TaskService` and MCP handlers can now integrate with explicit scheduling commands on top of the new core.
- Wave 2 can treat the server-returned changed set as authoritative instead of rebuilding cascade state locally.

---
*Phase: 35-scheduling-core-adoption*
*Completed: 2026-03-31*
