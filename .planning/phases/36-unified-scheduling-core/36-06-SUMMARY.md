---
phase: 36-unified-scheduling-core
plan: 06
subsystem: api, mcp
tags: [command-service, optimistic-concurrency, event-log, mcp-tools, api-routes, versioned-events]

# Dependency graph
requires:
  - phase: 36-04
    provides: CommandService with commitCommand method handling all 13 ProjectCommand types
provides:
  - MCP tools (move_task, resize_task, recalculate_schedule, create_task, delete_task) routed through CommandService
  - API routes (POST/PATCH/DELETE /api/tasks) routed through CommandService for schedule mutations
  - Backward-compatible response shapes for both MCP and API consumers
  - Legacy fallback paths when projectId unavailable
affects: [36-07]

# Tech tracking
tech-stack:
  added: []
patterns: [command-routing-mcp, schedule-change-detection, backward-compatible-command-routing]

key-files:
  created: []
  modified:
    - packages/mcp/src/index.ts
    - packages/mcp/src/services/task.service.ts
    - packages/server/src/index.ts

key-decisions:
  - "MCP tools use CommandService when projectId available, fallback to legacy taskService when not"
  - "API PATCH detects schedule changes (startDate/endDate) and routes through CommandService, non-schedule changes use existing updateWithResult"
  - "update_task MCP tool builds appropriate command from update fields: both dates -> move_task, start only -> resize_task(start), end only -> resize_task(end)"
  - "DELETE /api/tasks/:id routes through CommandService for cascade tracking, no legacy fallback"

patterns-established:
  - "MCP handlers check resolveProjectId() before attempting CommandService routing"
  - "API handlers use getProjectVersionForReq() for optimistic concurrency via JWT projectId"
  - "Response shapes match existing {task, changedTasks, changedIds} contract for backward compatibility"

requirements-completed: [MCP-AGENT-COMMANDS, IMPORT-PARITY, NO-BYPASS-SCHEDULING]

# Metrics
duration: 6min
completed: 2026-03-31
---

# Phase 36 Plan 06: MCP & API Command Routing Summary

**All MCP schedule tools and API schedule mutations route through CommandService.commitCommand, producing versioned ProjectEvent records with no bypass paths for schedule-affecting mutations**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-31T22:09:30Z
- **Completed:** 2026-03-31T22:15:51Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- MCP tools (move_task, resize_task, recalculate_schedule, create_task, delete_task) produce versioned events via CommandService
- API routes (POST, PATCH, DELETE) detect schedule changes and route through CommandService with optimistic concurrency
- update_task MCP tool maps changed fields to appropriate command type (move_task or resize_task)
- @deprecated annotation on executeScheduleCommand in TaskService
- Both MCP and server packages compile successfully

## Task Commits

Each task was committed atomically:

1. **Task 1: Route MCP schedule tools through CommandService** - `fde961a` (feat)
2. **Task 2: Route API schedule mutations through CommandService** - `9805605` (feat)

## Files Created/Modified
- `packages/mcp/src/index.ts` - MCP tool handlers now route through commandService.commitCommand with legacy fallback
- `packages/mcp/src/services/task.service.ts` - Added @deprecated annotation to executeScheduleCommand
- `packages/server/src/index.ts` - API routes with schedule-change detection and command routing, helper functions

## Decisions Made
- **MCP tools preserve legacy fallback** -- when projectId is not resolvable, MCP tools fall back to taskService.executeScheduleCommand for backward compatibility
- **API POST/DELETE always route through CommandService** -- since API always has JWT with projectId, no fallback needed
- **PATCH /api/tasks/:id only routes schedule changes** -- non-schedule updates (name, color, progress) use existing taskService.updateWithResult path for efficiency
- **update_task MCP tool field mapping** -- both startDate+endDate changed => move_task; startDate only => resize_task(start); endDate only => resize_task(end)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- UpdateTaskInput type does not have projectId field -- resolved by using resolveProjectId(undefined) which falls back to env variable

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All schedule-affecting mutations from any channel route through CommandService
- CommandService produces versioned ProjectEvent records for audit trail
- Ready for Plan 07: integration testing and verification of the complete command pipeline

## Self-Check: PASSED

- FOUND: packages/mcp/src/index.ts
- FOUND: packages/mcp/src/services/task.service.ts
- FOUND: packages/server/src/index.ts
- FOUND: .planning/phases/36-unified-scheduling-core/36-06-SUMMARY.md
- FOUND: fde961a (Task 1 commit)
- FOUND: 9805605 (Task 2 commit)

---
*Phase: 36-unified-scheduling-core*
*Completed: 2026-03-31*
