---
phase: 45-history-refactor
plan: 01
subsystem: packages/mcp history
tags:
  - history
  - snapshot-preview
  - restore
requires: []
provides:
  - Shared rollback-tail resolution for history preview and restore
  - Pure typed command replay against ProjectSnapshot
  - Version-oriented HistoryService API
affects:
  - packages/mcp/src/services/project-command-apply.ts
  - packages/mcp/src/services/history.service.ts
  - packages/mcp/src/services/history.service.test.ts
  - packages/mcp/src/services/index.ts
  - packages/mcp/src/types.ts
tech_stack:
  added: []
  patterns:
    - node:test TDD for backend history semantics
    - memory-only snapshot replay via shared typed command helper
    - append-only restore replay through commandService.commitCommand
key_files:
  created:
    - packages/mcp/src/services/project-command-apply.ts
    - packages/mcp/src/services/project-command-apply.test.ts
  modified:
    - packages/mcp/src/services/history.service.ts
    - packages/mcp/src/services/history.service.test.ts
    - packages/mcp/src/services/index.ts
    - packages/mcp/src/types.ts
decisions:
  - History preview and restore now resolve one shared rollback tail, with preview replaying inverse commands in memory and restore replaying the same sequence through commitCommand.
  - Public history rows are version-oriented visible groups with isCurrent/canRestore semantics, while technical rollback groups stay internal append-only mechanics.
requirements_completed: []
metrics:
  duration: 8 min
  completed_at: 2026-04-18T12:58:04+03:00
---
# Phase 45 Plan 01: History Snapshot Refactor Summary

Version-oriented history snapshot preview and authoritative restore now share one rollback-tail model on the backend.

Start: 2026-04-18T12:50:02+03:00
End: 2026-04-18T12:58:04+03:00
Duration: 8 min
Tasks: 2
Files touched: 6

## Outcomes

- Added `applyProjectCommandToSnapshot()` as a pure server-side command replay helper for `ProjectSnapshot` values, with the same `ScheduleExecutionResult` shape used by the authoritative command pipeline.
- Added shared `HistoryGroupSnapshotResponse` and `RestoreHistoryGroupResponse` contracts and exported the snapshot-apply helper from the services barrel.
- Replaced the public undo/redo-oriented `HistoryService` surface with `listHistoryGroups()`, `getHistorySnapshot()`, and `restoreToGroup()`.
- Implemented one shared rollback-tail resolver used by both preview and restore.
- Rewrote history service tests around current-version preview, memory-only rollback preview, restore parity, and typed validation failure on missing inverse commands.

## Task Commits

- `b06a946` `test(45-01): add failing test for pure snapshot command replay`
- `6a04357` `feat(45-01): add pure snapshot command replay helper`
- `561f48b` `test(45-01): add failing tests for version history snapshots`
- `783dced` `feat(45-01): refactor history service around version snapshots`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Used direct TypeScript verification while package build was locked by Prisma engine regeneration**
- **Found during:** Task 1 and Task 2 verification
- **Issue:** `npm run build -w packages/mcp` failed in `prisma generate` with `EPERM` when renaming `packages/mcp/dist/prisma-client/query_engine-windows.dll.node`, caused by parallel executor contention on the generated Prisma engine.
- **Fix:** Verified the actual code changes with `npx tsc -p packages/mcp/tsconfig.json --pretty false` and task-level tests, then retried the full build to confirm the blocker remained isolated to Prisma engine generation rather than the changed TypeScript.
- **Files modified:** None
- **Verification:** `npx tsc -p packages/mcp/tsconfig.json --pretty false`; `npx tsx --test packages/mcp/src/services/project-command-apply.test.ts`; `npx tsx --test packages/mcp/src/services/history.service.test.ts`
- **Commit:** Not applicable

## Known Stubs

None.

## Verification

- `npx tsx --test packages/mcp/src/services/project-command-apply.test.ts`
- `npx tsx --test packages/mcp/src/services/history.service.test.ts`
- `npx tsc -p packages/mcp/tsconfig.json --pretty false`
- `npm run build -w packages/mcp` currently fails before TypeScript build on Prisma engine rename lock inside `packages/mcp/dist/prisma-client`

## Next Step

Ready for `45-02-PLAN.md`.

## Self-Check: PASSED
