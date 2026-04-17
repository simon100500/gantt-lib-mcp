---
phase: 44-undo-redo
plan: 02
subsystem: api
tags: [history, undo-redo, fastify, prisma, command-service]
requires:
  - phase: 44-01
    provides: "MutationGroup persistence, inverse commands, and history-aware command commits"
provides:
  - "HistoryService grouped listing with append-only undo/redo orchestration"
  - "Authenticated HTTP history list, undo, and redo endpoints"
  - "Route-contract and service-level replay coverage for divergence and ordering"
affects: [44-03, 44-04, history-panel, agent-grouping]
tech-stack:
  added: []
  patterns: ["append-only history replay through commandService.commitCommand", "HTTP 409/400 mapping for typed undo-redo failures"]
key-files:
  created:
    - packages/mcp/src/services/history.service.ts
    - packages/mcp/src/services/history.service.test.ts
    - packages/server/src/routes/history-routes.ts
    - packages/server/src/routes/history-routes.test.ts
  modified:
    - packages/mcp/src/services/index.ts
    - packages/server/src/index.ts
key-decisions:
  - "Replay stays orchestration-only in HistoryService and reuses commandService.commitCommand for every inverse/redo command."
  - "Grouped history pagination uses group-id cursors while redoability is derived from undo linkage plus later applied-group inspection."
  - "HTTP replay routes return authoritative snapshot/version payloads and map version_conflict to 409 while typed redo refusals stay 400."
patterns-established:
  - "History mutations append new undo/redo groups instead of rewriting prior ProjectEvent rows."
  - "Fastify route-contract tests grep-lock endpoint registration, auth preHandlers, and response-field guarantees."
requirements-completed: [HIS-02, HIS-03]
duration: 4min
completed: 2026-04-18
---

# Phase 44 Plan 02: Append-only grouped history replay and authenticated history API

**Grouped undo/redo orchestration via `HistoryService` plus authenticated Fastify history endpoints that return authoritative snapshot/version payloads**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-17T21:16:54Z
- **Completed:** 2026-04-17T21:20:44Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Added `HistoryService` with paginated grouped-history reads, append-only undo, append-only redo, and typed divergence/redo refusal handling.
- Exposed `GET /api/history`, `POST /api/history/undo`, `POST /api/history/:groupId/undo`, and `POST /api/history/:groupId/redo` behind `authMiddleware`.
- Added service and route-contract tests covering reverse-order undo, forward-order redo, grouped pagination, and typed HTTP replay failures.

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement `HistoryService` with append-only undo, redo, and divergence checks** - `dff8782`, `18aa5e5`, `610f8c2` (test/feat/fix)
2. **Task 2: Expose paginated history, undo, and redo over authenticated HTTP routes** - `d9a35b8`, `e5d9cf2` (test/feat)

_Note: TDD tasks used separate failing-test and implementation commits._

## Files Created/Modified
- `packages/mcp/src/services/history.service.ts` - Grouped history listing plus undo/redo replay orchestration.
- `packages/mcp/src/services/history.service.test.ts` - Mocked replay-order, divergence, and pagination coverage.
- `packages/mcp/src/services/index.ts` - Service barrel export for `HistoryService`.
- `packages/server/src/routes/history-routes.ts` - Authenticated list/undo/redo HTTP routes.
- `packages/server/src/routes/history-routes.test.ts` - Route-contract grep tests for paths, auth, and response fields.
- `packages/server/src/index.ts` - History route registration.
- `.planning/phases/44-undo-redo/deferred-items.md` - Out-of-scope server build blocker log.

## Decisions Made

- Reused `commandService.commitCommand(...)` as the only replay executor so undo/redo stays inside the authoritative commit path.
- Derived `redoable` from undo linkage and later applied-group inspection instead of storing an additional persisted flag.
- Kept route validation and failure mapping local to `history-routes.ts` to preserve the current snapshot/version recovery contract shape.

## Deviations from Plan

None in implemented scope. Verification found unrelated pre-existing server type errors outside Plan 44-02 files; those were documented in `deferred-items.md` rather than changed here.

## Issues Encountered

- `npm run build -w packages/server` is currently blocked by unrelated dirty mutation-flow changes that require new history metadata fields. The failing files were logged to `.planning/phases/44-undo-redo/deferred-items.md` and were left untouched per scope-boundary rules.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 44-03 can now propagate agent-run group metadata into the existing grouped history API and replay service.
- Phase 44-04 can consume the authenticated history endpoints for the web history panel and keyboard undo/redo UX.

## Known Stubs

None.

## Self-Check: PASSED

- FOUND: `.planning/phases/44-undo-redo/44-02-SUMMARY.md`
- FOUND: `dff8782`
- FOUND: `18aa5e5`
- FOUND: `610f8c2`
- FOUND: `d9a35b8`
- FOUND: `e5d9cf2`
