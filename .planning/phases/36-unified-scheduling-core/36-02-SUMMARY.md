---
phase: 36-unified-scheduling-core
plan: 02
subsystem: api, database
tags: [typescript, prisma, discriminated-union, event-log, versioning, command-model]

# Dependency graph
requires:
  - phase: 36-01
    provides: gantt-lib subpath export with DTS generation
provides:
  - ProjectCommand discriminated union (13 command types)
  - CommitProjectCommandRequest/Response contracts
  - ScheduleExecutionResult with patches and conflicts
  - ProjectEventRecord type for persisted events
  - Prisma ProjectEvent model with JSON command/result/patches
  - Project.version field for monotonic versioning
  - ActorType enum (user, agent, system, import_actor)
affects: [36-03, 36-04, 36-05, 36-06, 36-07]

# Tech tracking
tech-stack:
  added: []
  patterns: [discriminated-union-commands, snapshot-plus-log, monotonic-versioning, optimistic-concurrency]

key-files:
  created: []
  modified:
    - packages/mcp/src/types.ts
    - packages/mcp/prisma/schema.prisma

key-decisions:
  - "Prisma enum value import_actor instead of import (Prisma reserves the keyword)"
  - "ProjectEventRecord naming avoids collision with Prisma-generated ProjectEvent type"

patterns-established:
  - "Discriminated union by `type` field for command model — no payload: unknown allowed"
  - "Patch.reason limited to 5 fixed enum values for explainability"
  - "Snapshot + log architecture — not pure event sourcing"

requirements-completed: [COMMAND-TYPES, EVENT-LOG-SCHEMA, VERSION-SCHEMA, PATCH-MODEL]

# Metrics
duration: 2min
completed: 2026-03-31
---

# Phase 36 Plan 02: Command Types and Event Schema Summary

**ProjectCommand discriminated union (13 variants) with CommitProjectCommandRequest/Response contracts, Patch model with 5 reason enums, and Prisma ProjectEvent model with monotonic versioning**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-31T21:45:12Z
- **Completed:** 2026-03-31T21:47:24Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Defined all Phase 36 type contracts in types.ts — ProjectCommand, Conflict, Patch, ScheduleExecutionResult, CommitProjectCommandRequest/Response, ProjectEventRecord, ProjectSnapshot
- Extended Prisma schema with ProjectEvent model (JSON fields for command/result/patches), ActorType enum, and Project.version field for monotonic versioning
- All existing types preserved for backward compatibility (ScheduleCommand remains untouched)

## Task Commits

Each task was committed atomically:

1. **Task 1: Define ProjectCommand and related types in types.ts** - `62a5b8f` (feat)
2. **Task 2: Add ProjectEvent model and Project.version to Prisma schema** - `28d70f2` (feat)

## Files Created/Modified
- `packages/mcp/src/types.ts` - Added 9 new type exports: ProjectSnapshot, ProjectCommand, Conflict, JsonValue, Patch, ActorType, ScheduleExecutionResult, CommitProjectCommandRequest/Response, ProjectEventRecord
- `packages/mcp/prisma/schema.prisma` - Added ProjectEvent model, ActorType enum, Project.version field, projectEvents relation

## Decisions Made
- Used `import_actor` as Prisma enum value instead of `import` (Prisma reserves JS keywords). TypeScript ActorType uses `'import'`; adapter layer maps between them.
- Named persisted event type `ProjectEventRecord` to avoid collision with Prisma-generated `ProjectEvent` class.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Prisma generate failed first time with EPERM error on Windows (file lock on query_engine DLL). Resolved by deleting dist/prisma-client directory and regenerating.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All type contracts are in place for Plans 03+ (scheduler adapter, commit endpoint, frontend state)
- Plan 03 can build the scheduler adapter importing these types
- Plan 04 can build the commit endpoint using CommitProjectCommandRequest/Response
- TypeScript compilation and Prisma generate both pass cleanly

---
*Phase: 36-unified-scheduling-core*
*Completed: 2026-03-31*

## Self-Check: PASSED

- FOUND: packages/mcp/src/types.ts
- FOUND: packages/mcp/prisma/schema.prisma
- FOUND: 36-02-SUMMARY.md
- FOUND: 62a5b8f (Task 1 commit)
- FOUND: 28d70f2 (Task 2 commit)
