---
phase: 36-unified-scheduling-core
plan: 04
subsystem: api, database
tags: [gantt-lib, scheduling, command, optimistic-concurrency, event-log, prisma, fastify]

# Dependency graph
requires:
  - phase: 36-01
    provides: gantt-lib/core/scheduling subpath export with scheduling functions
  - phase: 36-02
    provides: ProjectCommand types, CommitProjectCommandRequest/Response, Patch, ProjectEvent Prisma model
  - phase: 36-03
    provides: Thin scheduler adapter over gantt-lib/core/scheduling
provides:
  - CommandService with commitCommand method handling all 13 ProjectCommand types
  - POST /api/commands/commit route with auth, optimistic concurrency, event logging
  - Atomic Prisma transaction (version check + task updates + version bump + ProjectEvent)
  - Patch computation with reason attribution (direct_command, dependency_cascade, parent_rollup)
affects: [36-05, 36-06, 36-07]

# Tech tracking
tech-stack:
  added: []
patterns: [atomic-command-commit, optimistic-concurrency-via-version-check, event-sourcing-lite]

key-files:
  created:
    - packages/mcp/src/services/command.service.ts
    - packages/server/src/routes/command-routes.ts
  modified:
    - packages/mcp/src/services/index.ts
    - packages/server/src/index.ts

key-decisions:
  - "CreateTaskInput has no id field, so command.service generates randomUUID() for new tasks"
  - "CoreTask startDate/endDate is string|Date, cast to string for domainToDate at persistence boundary"
  - "REST API always uses actorType='user'; agent calls go through MCP channel, not HTTP"
  - "projectId extracted from JWT (req.user.projectId), not from request body, for security"

patterns-established:
  - "All 13 ProjectCommand types dispatch through a single executeCommand switch"
  - "Structural changes (create/delete/reparent/reorder) produce taskChanges array persisted alongside scheduling results"
  - "Dependency changes (create/remove/update_lag) produce dependencyChanges array persisted in same transaction"

requirements-completed: [COMMAND-COMMIT-ENDPOINT, OPTIMISTIC-CONCURRENCY, EVENT-LOG-PERSISTENCE, ATOMIC-COMMIT]

# Metrics
duration: 6min
completed: 2026-03-31
---

# Phase 36 Plan 04: Command Commit Endpoint Summary

**POST /api/commands/commit endpoint with atomic versioned execution through gantt-lib/core/scheduling, optimistic concurrency via baseVersion check, and event log persistence in single Prisma transaction**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-31T21:59:41Z
- **Completed:** 2026-03-31T22:05:41Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- CommandService handles all 13 ProjectCommand types through gantt-lib/core/scheduling functions
- Atomic Prisma $transaction: version check, task/dependency CRUD, version bump, ProjectEvent creation
- POST /api/commands/commit route registered with authMiddleware, returns 200/409/400/500 status codes
- Patch computation with reason attribution (direct_command, dependency_cascade, parent_rollup)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create CommandService with commitCommand method** - `252fc04` (feat)
2. **Task 2: Create POST /api/commands/commit route** - `1346e50` (feat)

## Files Created/Modified
- `packages/mcp/src/services/command.service.ts` - CommandService with commitCommand, handles all 13 command types, atomic versioned persistence
- `packages/mcp/src/services/index.ts` - Added commandService and CommandService re-exports
- `packages/server/src/routes/command-routes.ts` - POST /api/commands/commit route with authMiddleware
- `packages/server/src/index.ts` - Added registerCommandRoutes import and registration

## Decisions Made
- **CreateTaskInput has no id field** -- generate randomUUID() in executeCommand for create_task, store as part of taskChanges for persistence
- **CoreTask type has string|Date fields** -- cast to string at the persistence boundary when calling domainToDate
- **REST API actorType is always 'user'** -- agent calls come through MCP channel (stdio transport), not the HTTP API
- **projectId from JWT, not request body** -- security: prevents cross-project command injection

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- TypeScript strict mode flagged CoreTask.startDate/endDate as `string | Date` union type -- resolved with explicit cast to string at persistence boundary
- TypeScript flagged taskChange.task as possibly undefined in the create branch -- resolved with combined action+task guard check
- MCP dist needed rebuilding (tsc) before server package could resolve the new commandService export

## Self-Check: PASSED

- FOUND: packages/mcp/src/services/command.service.ts
- FOUND: packages/server/src/routes/command-routes.ts
- FOUND: .planning/phases/36-unified-scheduling-core/36-04-SUMMARY.md
- FOUND: 252fc04 (Task 1 commit)
- FOUND: 1346e50 (Task 2 commit)

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Command commit endpoint ready for frontend consumption (Plan 05: frontend preview/commit flow)
- CommandService ready for MCP tool integration (Plan 06: MCP command surface)
- All 13 ProjectCommand types handled; new commands can be added to the switch statement

---
*Phase: 36-unified-scheduling-core*
*Completed: 2026-03-31*
