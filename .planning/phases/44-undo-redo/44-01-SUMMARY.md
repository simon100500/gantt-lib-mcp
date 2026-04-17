---
phase: 44-undo-redo
plan: 01
subsystem: api, database, testing
tags: [undo-redo, prisma, command-history, mutation-groups, event-log, tests]

# Dependency graph
requires:
  - phase: 36-04
    provides: authoritative CommandService commit pipeline, Project.version, and ProjectEvent persistence
provides:
  - MutationGroup schema and migration for grouped undo/redo history
  - Shared history request and record contracts for grouped command commits
  - History-aware CommandService.commitCommand with ordinals, inverse commands, and group finalization
  - Service tests covering grouped version boundaries, delete inverses, and undoable finalization
affects: [44-02, 44-03, 44-04, undo-api, history-ui]

# Tech tracking
tech-stack:
  added: []
patterns: [mutation-group-history, inverse-command-persistence, grouped-command-finalization]

key-files:
  created:
    - packages/mcp/prisma/migrations/20260417190000_add_mutation_groups_and_event_history/migration.sql
    - packages/mcp/src/services/command-history.test.ts
  modified:
    - packages/mcp/prisma/schema.prisma
    - packages/mcp/src/types.ts
    - packages/mcp/src/services/command.service.ts

key-decisions:
  - "Every commit now belongs to a MutationGroup; requests without history metadata synthesize a single-command system group"
  - "Delete inverses restore tasks through typed create_task/create_tasks_batch commands while preserving full delete context in metadata"
  - "Group undoability is finalized from persisted inverseCommand presence across accepted events, not from patches or caller intent"

patterns-established:
  - "MutationGroup.baseVersion is created on the first grouped commit and MutationGroup.newVersion is finalized on the last grouped commit"
  - "ProjectEvent rows persist groupId, ordinal, requestContextId, inverseCommand, and metadata through the existing commit transaction"
  - "Inverse generation stays command-typed and patch-free, with destructive commands carrying before-context in metadata"

requirements-completed: [HIS-01]

# Metrics
duration: 28min
completed: 2026-04-17
---

# Phase 44 Plan 01: History Substrate Summary

**Mutation-group history persistence with Prisma-backed grouped events, typed inverse commands, and version-aligned group finalization on the existing command commit path**

## Performance

- **Duration:** 28 min
- **Started:** 2026-04-17T20:40:00Z
- **Completed:** 2026-04-17T21:08:24Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Added shared undo/redo contracts plus Prisma schema support for `MutationGroup` and history-aware `ProjectEvent` fields.
- Extended `CommandService.commitCommand` to create/finalize mutation groups, assign ordinals, persist request context, and store typed inverse commands.
- Added command history tests covering grouped version boundaries, delete metadata, destructive inverse persistence, and undoable finalization.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add grouped-history schema and shared contracts** - `7d71228` (feat)
2. **Task 2: Persist mutation-group ordering and inverse commands in `CommandService.commitCommand`** - `e4c3780` (feat)

## Files Created/Modified
- `packages/mcp/src/types.ts` - Shared history contracts for grouped commits and history-aware project events.
- `packages/mcp/prisma/schema.prisma` - Prisma enums, `MutationGroup` model, and extended `ProjectEvent` history fields.
- `packages/mcp/prisma/migrations/20260417190000_add_mutation_groups_and_event_history/migration.sql` - SQL migration for grouped history tables, columns, indexes, and foreign keys.
- `packages/mcp/src/services/command.service.ts` - History-aware authoritative commit path with mutation-group lifecycle and inverse-command persistence.
- `packages/mcp/src/services/command-history.test.ts` - In-memory transaction tests for grouped history behavior and destructive inverse coverage.

## Decisions Made
- Synthetic history metadata is created for commands that do not provide `request.history`, ensuring every authoritative commit belongs to a persisted mutation group.
- Delete operations store rich before-context in `ProjectEvent.metadata` while encoding task recreation as typed inverse commands instead of patch diffs.
- Undoable finalization is computed from persisted event rows so later undo/redo services can trust stored history state.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- History tests initially hit project calendar loading from the real schedule-options path; resolved by adding an overridable service seam so commit-path tests can stay fully in-memory.
- Nullable inverse-command persistence required explicit `DbNull` handling in the service and test harness to preserve correct undoable finalization semantics.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- The backend now persists grouped undo/redo history on the authoritative command path, ready for history-query and undo/redo execution services.
- `MutationGroup` and extended `ProjectEvent` fields are available for upcoming API and UI phases without further schema changes.

## Self-Check: PASSED

- FOUND: packages/mcp/src/types.ts
- FOUND: packages/mcp/prisma/schema.prisma
- FOUND: packages/mcp/prisma/migrations/20260417190000_add_mutation_groups_and_event_history/migration.sql
- FOUND: packages/mcp/src/services/command.service.ts
- FOUND: packages/mcp/src/services/command-history.test.ts
- FOUND: .planning/phases/44-undo-redo/44-01-SUMMARY.md
- FOUND: 7d71228 (Task 1 commit)
- FOUND: e4c3780 (Task 2 commit)

---
*Phase: 44-undo-redo*
*Completed: 2026-04-17*
