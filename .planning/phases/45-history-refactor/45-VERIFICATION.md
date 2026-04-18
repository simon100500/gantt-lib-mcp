---
phase: 45-history-refactor
plan: 05
verified: 2026-04-18T00:00:00Z
status: human_needed
score: 9/9 success criteria verified in code and test review
human_verification:
  - test: "Version preview and restore flow"
    expected: "Users can open the version list, preview an older version, return to current, restore an older version, and see preview mode block edits."
    why_human: "This requires runtime UI confirmation in the browser, including visible labels and read-only behavior."
---

# Phase 45: history-refactor Verification Report

**Phase Goal:** Перевести history UX с публичного undo/redo на version preview + version restore, сохранив append-only authoritative restore path и изоляцию preview state.
**Verified:** 2026-04-18
**Status:** human_needed

## Success Criteria Traceability

### 1. `GET /api/history` returns a user-visible version timeline

Status: `VERIFIED`

Evidence:
- Route surface returns version rows from `GET /api/history` in [history-routes.ts](/D:/Projects/gantt-lib-mcp/packages/server/src/routes/history-routes.ts#L46).
- Returned fields are version-oriented: `commandCount`, `isCurrent`, `canRestore`, `nextCursor` in [history-routes.ts](/D:/Projects/gantt-lib-mcp/packages/server/src/routes/history-routes.ts#L63).
- Route contract tests assert the list endpoint and visible row fields in [history-routes.test.ts](/D:/Projects/gantt-lib-mcp/packages/server/src/routes/history-routes.test.ts#L30).

### 2. Clicking a history row previews the selected version

Status: `VERIFIED`

Evidence:
- The web hook exposes `showVersion(...)` and loads `GET /api/history/:groupId/snapshot` for non-current rows in [useProjectHistory.ts](/D:/Projects/gantt-lib-mcp/packages/web/src/hooks/useProjectHistory.ts#L124).
- Preview data enters the dedicated history viewer store rather than the confirmed project state in [useProjectHistory.ts](/D:/Projects/gantt-lib-mcp/packages/web/src/hooks/useProjectHistory.ts#L136).
- Manual flow is documented in [45-HUMAN-UAT.md](/D:/Projects/gantt-lib-mcp/.planning/phases/45-history-refactor/45-HUMAN-UAT.md#L15).

### 3. Preview snapshot comes from the server

Status: `VERIFIED`

Evidence:
- `GET /api/history/:groupId/snapshot` delegates to `historyService.getHistorySnapshot(...)` in [history-routes.ts](/D:/Projects/gantt-lib-mcp/packages/server/src/routes/history-routes.ts#L84).
- Snapshot responses return `{ groupId, isCurrent, currentVersion, snapshot }` in [history-routes.ts](/D:/Projects/gantt-lib-mcp/packages/server/src/routes/history-routes.ts#L100).
- Service tests cover current-version and historical preview snapshots in [history.service.test.ts](/D:/Projects/gantt-lib-mcp/packages/mcp/src/services/history.service.test.ts#L378).

### 4. Frontend does not replay inverse commands for preview

Status: `VERIFIED`

Evidence:
- The frontend only fetches a server snapshot and stores it; it does not replay commands locally in [useProjectHistory.ts](/D:/Projects/gantt-lib-mcp/packages/web/src/hooks/useProjectHistory.ts#L95).
- Preview-mode semantics are locked by the PRD at [history-versioning-clean-architecture-prd.md](/D:/Projects/gantt-lib-mcp/.planning/reference/history-versioning-clean-architecture-prd.md#L118).

### 5. Restore remains distinct from preview

Status: `VERIFIED`

Evidence:
- Preview calls `fetchSnapshot(...)`, while restore calls `POST /api/history/:groupId/restore` and updates confirmed state in [useProjectHistory.ts](/D:/Projects/gantt-lib-mcp/packages/web/src/hooks/useProjectHistory.ts#L154).
- Service tests explicitly compare preview vs restore semantics and assert that restore replays the tail through `commitCommand(...)` in [history.service.test.ts](/D:/Projects/gantt-lib-mcp/packages/mcp/src/services/history.service.test.ts#L404).

### 6. Preview mode is isolated from editing state

Status: `VERIFIED`

Evidence:
- Preview writes to the history viewer store via `enterPreview(...)`, while restore is the only path that updates `setConfirmed(...)` in [useProjectHistory.ts](/D:/Projects/gantt-lib-mcp/packages/web/src/hooks/useProjectHistory.ts#L136).
- Human verification flow explicitly checks that editing is blocked during preview in [45-HUMAN-UAT.md](/D:/Projects/gantt-lib-mcp/.planning/phases/45-history-refactor/45-HUMAN-UAT.md#L45).

### 7. Restore rolls back only the active tail

Status: `VERIFIED`

Evidence:
- `resolveRollbackTail(...)` computes inverse commands only from groups newer than the target version in [history.service.ts](/D:/Projects/gantt-lib-mcp/packages/mcp/src/services/history.service.ts#L242).
- Service tests assert preview/restore parity for the same rollback tail in [history.service.test.ts](/D:/Projects/gantt-lib-mcp/packages/mcp/src/services/history.service.test.ts#L429).

### 8. Restore uses the authoritative command path

Status: `VERIFIED`

Evidence:
- `restoreToGroup(...)` replays each inverse command through `this.commandService.commitCommand(...)` in [history.service.ts](/D:/Projects/gantt-lib-mcp/packages/mcp/src/services/history.service.ts#L334).
- Route-level restore is exposed only through `POST /api/history/:groupId/restore` in [history-routes.ts](/D:/Projects/gantt-lib-mcp/packages/server/src/routes/history-routes.ts#L117).

### 9. No `as any` or hidden type workarounds remain on the history path

Status: `VERIFIED`

Evidence:
- Regression tests assert that `packages/mcp/src/services/history.service.ts`, `packages/web/src/hooks/useProjectHistory.ts`, and `packages/web/src/lib/apiTypes.ts` contain no `as any` shortcuts in [history.service.test.ts](/D:/Projects/gantt-lib-mcp/packages/mcp/src/services/history.service.test.ts#L478).
- The history service now uses explicit Prisma-side contract types instead of `as any` in [history.service.ts](/D:/Projects/gantt-lib-mcp/packages/mcp/src/services/history.service.ts#L85).
- Manual grep check: `rg -n "as any" packages/web/src/lib/apiTypes.ts packages/web/src/hooks/useProjectHistory.ts packages/server/src/routes/history-routes.ts packages/mcp/src/services/history.service.ts` returned no matches on 2026-04-18.
- This requirement explicitly covers the "no `as any` or hidden type workarounds" rule from the PRD success criteria in [history-versioning-clean-architecture-prd.md](/D:/Projects/gantt-lib-mcp/.planning/reference/history-versioning-clean-architecture-prd.md#L136).

## Automated Evidence

- `npx tsx --test packages/mcp/src/services/history.service.test.ts` — passed
- `npx tsx --test packages/server/src/routes/history-routes.test.ts` — passed
- `npm run build -w packages/web` — passed

## Verification Limits

- `npm run build -w packages/mcp` was blocked by `EPERM` during `prisma generate` when Windows failed to rename `packages/mcp/dist/prisma-client/query_engine-windows.dll.node.tmp*` to `query_engine-windows.dll.node`.
- `npm run build -w packages/server` inherits the same blocker because its prebuild runs the MCP build first.
- This appears to be parallel executor file-lock contention in generated Prisma artifacts, not a TypeScript or history-contract regression in the changed code.

## Human Verification Required

Run the flows in [45-HUMAN-UAT.md](/D:/Projects/gantt-lib-mcp/.planning/phases/45-history-refactor/45-HUMAN-UAT.md) against a project with at least three versions, including one restored older version.
