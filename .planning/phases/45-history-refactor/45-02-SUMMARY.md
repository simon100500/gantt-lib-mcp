---
phase: 45-history-refactor
plan: 02
subsystem: api
tags: [history, fastify, react, typescript, restore, versioning]
requires:
  - phase: 45-01
    provides: version-oriented history service list, snapshot, and restore behavior
provides:
  - public history HTTP routes for version rows, snapshot preview, and restore
  - web history API contracts aligned to list/snapshot/restore payloads
  - workspace history UI consumers updated off undo/redo semantics
affects: [packages/server, packages/web, history-panel, api-contracts]
tech-stack:
  added: []
  patterns: [product-oriented history routes, typed restore workflow, contract-locked route tests]
key-files:
  created: []
  modified:
    - packages/server/src/routes/history-routes.ts
    - packages/server/src/routes/history-routes.test.ts
    - packages/mcp/src/services/index.ts
    - packages/web/src/lib/apiTypes.ts
    - packages/web/src/hooks/useProjectHistory.ts
    - packages/web/src/components/HistoryPanel.tsx
    - packages/web/src/components/workspace/ProjectWorkspace.tsx
key-decisions:
  - "The server route layer treats history validation failures as typed 400 responses via shape guards instead of coupling to a service-class import."
  - "Web history consumers now use restore-to-version semantics, with Ctrl+Z mapped to restore the latest non-current version instead of public undo endpoints."
patterns-established:
  - "Public history APIs expose visible versions and restore actions only; internal append-only undo/redo mechanics remain hidden in the service layer."
  - "History route tests grep-lock endpoint paths and product fields to prevent rollback terminology from leaking back into the HTTP surface."
requirements-completed: []
duration: 7min
completed: 2026-04-18
---

# Phase 45 Plan 02: Public history routes and web contracts Summary

**Version-oriented history list, snapshot preview, and restore contracts now back both the Fastify API surface and the web workspace history flow**

## Performance

- **Duration:** 7 min
- **Started:** 2026-04-18T10:00:39Z
- **Completed:** 2026-04-18T10:07:27Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Replaced public undo/redo routes with authenticated `/api/history`, `/api/history/:groupId/snapshot`, and `/api/history/:groupId/restore` handlers.
- Locked the new route surface with a RED-to-GREEN contract test and preserved `version_conflict` as HTTP 409 plus validation failures as HTTP 400.
- Aligned web history contracts and direct consumers to version/restore semantics so the web build passes against the new API.

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: add failing history route contract test** - `d88c539` (test)
2. **Task 1 GREEN: replace public history endpoints** - `ba81699` (feat)
3. **Task 2: synchronize web history contracts** - `19b02ed` (feat)

## Files Created/Modified
- `packages/server/src/routes/history-routes.ts` - public history list, snapshot, and restore handlers
- `packages/server/src/routes/history-routes.test.ts` - route contract grep-lock for new endpoints and fields
- `packages/mcp/src/services/index.ts` - barrel export update kept aligned with history service surface
- `packages/web/src/lib/apiTypes.ts` - version-oriented history list, snapshot, and restore types
- `packages/web/src/hooks/useProjectHistory.ts` - restore and snapshot-aware client hook
- `packages/web/src/components/HistoryPanel.tsx` - restore-based history actions and current-version presentation
- `packages/web/src/components/workspace/ProjectWorkspace.tsx` - workspace history wiring updated to restore semantics

## Decisions Made
- Used structural error guards in the server route to map history validation failures without depending on a runtime class export.
- Updated affected web consumers immediately when the contract changed instead of leaving `apiTypes.ts` correct but the workspace broken.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated web history consumers that still referenced undo/redo fields**
- **Found during:** Task 2 (Synchronize web API contracts with the new version-oriented history surface)
- **Issue:** `npm run build -w packages/web` failed because the history hook, panel, and workspace still expected `status`, `undoable`, `redoable`, and `HistoryMutationResponse`.
- **Fix:** Replaced those consumers with restore-based behavior and added typed snapshot/restore parsing in the history hook.
- **Files modified:** `packages/web/src/hooks/useProjectHistory.ts`, `packages/web/src/components/HistoryPanel.tsx`, `packages/web/src/components/workspace/ProjectWorkspace.tsx`
- **Verification:** `npm run build -w packages/web`
- **Committed in:** `19b02ed`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary to keep the web package compiling and consuming the new history contract correctly. No architectural scope change.

## Issues Encountered
- `npm run build -w packages/server` remains blocked by an upstream Prisma Windows file-lock error during `packages/mcp` prebuild: `EPERM` while renaming `packages/mcp/dist/prisma-client/query_engine-windows.dll.node`. Route tests and direct TypeScript compiles for `packages/mcp` and `packages/server` passed, so the plan-specific code was still verified.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Public server and web contracts now describe versions, snapshots, and restore operations only.
- Next work can build on the new `/api/history` surface without exposing undo/redo mechanics back to the client.

## Self-Check: PASSED
