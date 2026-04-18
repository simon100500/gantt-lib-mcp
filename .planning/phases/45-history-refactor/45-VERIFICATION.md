---
phase: 45-history-refactor
verified: 2026-04-18T13:30:29+03:00
status: gaps_found
score: 5/6 must-haves verified
gaps:
  - truth: "The version-oriented history path builds cleanly across affected backend packages"
    status: failed
    reason: "The core history service implementation in packages/mcp is present and behaviorally tested, but it does not type-check, which blocks MCP/server build integrity."
    artifacts:
      - path: "packages/mcp/src/services/history.service.ts"
        issue: "TypeScript errors at loadTaskSnapshot/loadDependencyRows/getScheduleOptions/getPrisma boundaries break MCP compilation."
    missing:
      - "Narrow `type` to `TaskType` and normalize dependency `lag` to a required number in snapshot loaders."
      - "Fix the default `getProjectScheduleOptionsForProject` adapter signature used by `HistoryService`."
      - "Align `HistoryPrismaClient` typing with the real Prisma client or introduce a safe adapter so `getPrisma()` satisfies the contract."
      - "Re-run `npx tsc -p packages/mcp/tsconfig.json --pretty false` and then `npm run build -w packages/server` successfully."
---

# Phase 45: history-refactor Verification Report

**Phase Goal:** Refactor history around version preview and version restore, replacing public undo/redo semantics with a version-oriented backend, API, and UI contract.
**Verified:** 2026-04-18T13:30:29+03:00
**Status:** gaps_found
**Re-verification:** No — fresh verification because the previous report had no `gaps:` section

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Preview and restore share one backend rollback-tail model, with preview side-effect-free and restore authoritative | ✓ VERIFIED | [history.service.ts](/D:/Projects/gantt-lib-mcp/packages/mcp/src/services/history.service.ts#L274), [history.service.ts](/D:/Projects/gantt-lib-mcp/packages/mcp/src/services/history.service.ts#L348), [history.service.ts](/D:/Projects/gantt-lib-mcp/packages/mcp/src/services/history.service.ts#L375), [project-command-apply.ts](/D:/Projects/gantt-lib-mcp/packages/mcp/src/services/project-command-apply.ts#L379), [history.service.test.ts](/D:/Projects/gantt-lib-mcp/packages/mcp/src/services/history.service.test.ts#L362) |
| 2 | The public HTTP surface describes versions, snapshots, and restore actions instead of public undo/redo mechanics | ✓ VERIFIED | [history-routes.ts](/D:/Projects/gantt-lib-mcp/packages/server/src/routes/history-routes.ts#L51), [history-routes.ts](/D:/Projects/gantt-lib-mcp/packages/server/src/routes/history-routes.ts#L84), [history-routes.ts](/D:/Projects/gantt-lib-mcp/packages/server/src/routes/history-routes.ts#L117), [history-routes.test.ts](/D:/Projects/gantt-lib-mcp/packages/server/src/routes/history-routes.test.ts#L8) |
| 3 | The frontend fetches authoritative preview snapshots and restore responses from the server and keeps preview isolated from editing state | ✓ VERIFIED | [useProjectHistory.ts](/D:/Projects/gantt-lib-mcp/packages/web/src/hooks/useProjectHistory.ts#L65), [useProjectHistory.ts](/D:/Projects/gantt-lib-mcp/packages/web/src/hooks/useProjectHistory.ts#L106), [useProjectHistory.ts](/D:/Projects/gantt-lib-mcp/packages/web/src/hooks/useProjectHistory.ts#L124), [useProjectHistory.ts](/D:/Projects/gantt-lib-mcp/packages/web/src/hooks/useProjectHistory.ts#L154), [useHistoryViewerStore.ts](/D:/Projects/gantt-lib-mcp/packages/web/src/stores/useHistoryViewerStore.ts#L8), [useProjectStore.ts](/D:/Projects/gantt-lib-mcp/packages/web/src/stores/useProjectStore.ts#L20), [useTasks.ts](/D:/Projects/gantt-lib-mcp/packages/web/src/hooks/useTasks.ts#L45) |
| 4 | The workspace behaves like a version browser, with explicit preview/restore actions and read-only preview mode | ✓ VERIFIED | [HistoryPanel.tsx](/D:/Projects/gantt-lib-mcp/packages/web/src/components/HistoryPanel.tsx#L137), [HistoryPanel.tsx](/D:/Projects/gantt-lib-mcp/packages/web/src/components/HistoryPanel.tsx#L246), [HistoryPanel.tsx](/D:/Projects/gantt-lib-mcp/packages/web/src/components/HistoryPanel.tsx#L260), [ProjectWorkspace.tsx](/D:/Projects/gantt-lib-mcp/packages/web/src/components/workspace/ProjectWorkspace.tsx#L160), [ProjectWorkspace.tsx](/D:/Projects/gantt-lib-mcp/packages/web/src/components/workspace/ProjectWorkspace.tsx#L296), [ProjectWorkspace.tsx](/D:/Projects/gantt-lib-mcp/packages/web/src/components/workspace/ProjectWorkspace.tsx#L364), [Toolbar.tsx](/D:/Projects/gantt-lib-mcp/packages/web/src/components/layout/Toolbar.tsx#L160) |
| 5 | The public history path is cleaned up for version semantics and guarded against `as any` and legacy undo/redo leakage | ✓ VERIFIED | [apiTypes.ts](/D:/Projects/gantt-lib-mcp/packages/web/src/lib/apiTypes.ts#L20), [history.service.test.ts](/D:/Projects/gantt-lib-mcp/packages/mcp/src/services/history.service.test.ts#L478), [history.service.test.ts](/D:/Projects/gantt-lib-mcp/packages/mcp/src/services/history.service.test.ts#L485) |
| 6 | The affected backend packages build cleanly enough for the refactor to be considered complete | ✗ FAILED | `npx tsc -p packages/mcp/tsconfig.json --pretty false` fails on [history.service.ts](/D:/Projects/gantt-lib-mcp/packages/mcp/src/services/history.service.ts#L177), [history.service.ts](/D:/Projects/gantt-lib-mcp/packages/mcp/src/services/history.service.ts#L204), [history.service.ts](/D:/Projects/gantt-lib-mcp/packages/mcp/src/services/history.service.ts#L230), [history.service.ts](/D:/Projects/gantt-lib-mcp/packages/mcp/src/services/history.service.ts#L235), [history.service.ts](/D:/Projects/gantt-lib-mcp/packages/mcp/src/services/history.service.ts#L238); `npm run build -w packages/server` fails because it builds `packages/mcp` first |

**Score:** 5/6 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `packages/mcp/src/services/project-command-apply.ts` | Pure typed command application for memory-only preview replay | ✓ VERIFIED | Export exists and is used by history preview; no persistence path inside the helper. |
| `packages/mcp/src/services/history.service.ts` | Shared version-list, snapshot-preview, and restore domain service | ✗ FAILED | Exists, substantive, and wired, but it currently fails TypeScript compilation at the loader and dependency-typing boundaries. |
| `packages/mcp/src/types.ts` | Shared history snapshot/restore contracts | ✓ VERIFIED | `HistoryGroupSnapshotResponse` and `RestoreHistoryGroupResponse` exist and match the intended product model. |
| `packages/server/src/routes/history-routes.ts` | Authenticated version list, snapshot, and restore routes | ✓ VERIFIED | New routes are present and public undo/redo endpoints are absent. |
| `packages/web/src/lib/apiTypes.ts` | Web-facing version history contracts | ✓ VERIFIED | Version row, snapshot, and restore response types exist with version-oriented fields only. |
| `packages/web/src/stores/useHistoryViewerStore.ts` | Dedicated history viewer state machine | ✓ VERIFIED | Isolated preview state exists outside the editing store. |
| `packages/web/src/stores/useProjectStore.ts` | Current editing state without embedded history preview | ✓ VERIFIED | Store remains focused on `confirmed`, `pending`, `dragPreview`, and schedule options. |
| `packages/web/src/hooks/useProjectHistory.ts` | History list/preview/restore orchestration | ✓ VERIFIED | Fetches list, snapshot, and restore endpoints and updates the correct stores. |
| `packages/web/src/components/HistoryPanel.tsx` | Version-browser UI with preview and restore actions | ✓ VERIFIED | Version-oriented row actions and current/preview labels are present. |
| `packages/web/src/components/workspace/ProjectWorkspace.tsx` | Preview-first rendering and edit lockout in history mode | ✓ VERIFIED | Preview snapshot takes priority and mutation surfaces are disabled while previewing. |
| `.planning/phases/45-history-refactor/45-HUMAN-UAT.md` | Manual verification flows for preview/restore UX | ✓ VERIFIED | Artifact exists and covers open, preview, return, restore, and edit-blocking flows. |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `packages/mcp/src/services/history.service.ts` | `packages/mcp/src/services/project-command-apply.ts` | memory-only inverse-command application for historical preview | WIRED | `getHistorySnapshot()` reduces `inverseCommands` through `applyProjectCommandToSnapshot(...)`. |
| `packages/mcp/src/services/history.service.ts` | `packages/mcp/src/services/command.service.ts` | persisted restore through authoritative command commits | WIRED | `restoreToGroup()` replays each inverse command through `this.commandService.commitCommand(...)`. |
| `packages/mcp/src/services/history.service.ts` | `packages/mcp/src/services/projectScheduleOptions.ts` | default schedule-option resolver for preview replay | PARTIAL | Behavior is intended, but the fallback assignment at [history.service.ts](/D:/Projects/gantt-lib-mcp/packages/mcp/src/services/history.service.ts#L230) has a signature mismatch that breaks compilation. |
| `packages/server/src/routes/history-routes.ts` | `packages/mcp/src/services/history.service.ts` | route handlers for list, snapshot, and restore | WIRED | Each public route delegates to `historyService` methods under `authMiddleware`. |
| `packages/web/src/hooks/useProjectHistory.ts` | `packages/web/src/stores/useHistoryViewerStore.ts` | preview enter/exit orchestration | WIRED | Non-current snapshots call `enterPreview(...)`; current selection and return action call `exitPreview()`. |
| `packages/web/src/hooks/useTasks.ts` | `packages/web/src/stores/useProjectStore.ts` | visible snapshot derivation for current editing state | WIRED | `deriveVisibleSnapshot(...)` produces `visibleTasks`, which [App.tsx](/D:/Projects/gantt-lib-mcp/packages/web/src/App.tsx#L1310) passes into `ProjectWorkspace`. |
| `packages/web/src/components/workspace/ProjectWorkspace.tsx` | `packages/web/src/stores/useHistoryViewerStore.ts` | preview-first overlay and editing lockout | WIRED | `historyViewer.mode === 'preview'` controls rendered tasks, read-only behavior, and banner state. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| --- | --- | --- | --- | --- |
| `packages/mcp/src/services/history.service.ts` | `inverseCommands` | Visible groups + `projectEvent.findMany(...)` tail replay | Yes | ✓ FLOWING |
| `packages/web/src/hooks/useProjectHistory.ts` | `items` | `GET /api/history` -> `HistoryListResponse` | Yes | ✓ FLOWING |
| `packages/web/src/hooks/useProjectHistory.ts` | preview snapshot | `GET /api/history/:groupId/snapshot` -> `enterPreview(...)` | Yes | ✓ FLOWING |
| `packages/web/src/components/workspace/ProjectWorkspace.tsx` | `effectiveTasks` | `historyViewer.snapshot.tasks` or [App.tsx](/D:/Projects/gantt-lib-mcp/packages/web/src/App.tsx#L1227) `visibleTasks` from [useTasks.ts](/D:/Projects/gantt-lib-mcp/packages/web/src/hooks/useTasks.ts#L45) | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| History service preview/restore semantics | `npx tsx --test packages/mcp/src/services/history.service.test.ts` | 8 tests passed, including preview parity, restore parity, and no-`as any` cleanup checks | ✓ PASS |
| History route contract | `npx tsx --test packages/server/src/routes/history-routes.test.ts` | 4 tests passed, including route registration, auth guards, and version-only endpoints | ✓ PASS |
| Web package compile/build | `npm run build -w packages/web` | Passed; Vite built production assets successfully | ✓ PASS |
| MCP package type-check | `npx tsc -p packages/mcp/tsconfig.json --pretty false` | Failed with TS2322 errors in `history.service.ts` at lines 177, 204, 230, 235, 238 | ✗ FAIL |
| Server package build chain | `npm run build -w packages/server` | Failed because `packages/mcp` does not compile cleanly; transient Prisma lock may also appear on Windows | ✗ FAIL |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| None declared | `45-01` through `45-05` | All phase plans declare `requirements: []` | ✓ SATISFIED | No requirement IDs were claimed in plan frontmatter. |
| PRD-only | [ROADMAP.md](/D:/Projects/gantt-lib-mcp/.planning/ROADMAP.md#L377) | Phase 45 is tracked against [history-versioning-clean-architecture-prd.md](/D:/Projects/gantt-lib-mcp/.planning/reference/history-versioning-clean-architecture-prd.md) rather than `REQUIREMENTS.md` IDs | ✓ SATISFIED | Roadmap marks Phase 45 requirements as PRD-only. |
| Orphaned requirement IDs | `REQUIREMENTS.md` | Additional requirement IDs mapped to Phase 45 | ✓ SATISFIED | No `REQUIREMENTS.md` entries map to Phase 45; `HIS-*` remains mapped to Phase 44 only. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| [history.service.ts](/D:/Projects/gantt-lib-mcp/packages/mcp/src/services/history.service.ts#L177) | 177 | Type mismatch in `Task[]` snapshot loader | 🛑 Blocker | Prevents MCP type-check and blocks phase closure. |
| [history.service.ts](/D:/Projects/gantt-lib-mcp/packages/mcp/src/services/history.service.ts#L204) | 204 | Type mismatch in dependency snapshot loader (`lag` may be undefined) | 🛑 Blocker | Prevents MCP type-check and blocks phase closure. |
| [history.service.ts](/D:/Projects/gantt-lib-mcp/packages/mcp/src/services/history.service.ts#L230) | 230 | Default schedule-option resolver signature mismatch | 🛑 Blocker | Breaks `HistoryService` compilation. |
| [history.service.ts](/D:/Projects/gantt-lib-mcp/packages/mcp/src/services/history.service.ts#L235) | 235 | `getPrisma()` result does not satisfy `HistoryPrismaClient` | 🛑 Blocker | Breaks `HistoryService` compilation and downstream server build. |

### Human Verification Required

Manual UI verification is still relevant for preview UX and edit lockout, but it is secondary until the build blocker above is fixed. The existing checklist remains in [45-HUMAN-UAT.md](/D:/Projects/gantt-lib-mcp/.planning/phases/45-history-refactor/45-HUMAN-UAT.md).

### Gaps Summary

The refactor is mostly real: the backend rollback-tail semantics exist, the HTTP contract is version-oriented, the frontend uses server-driven preview/restore with an isolated history viewer store, and the UI presents read-only version browsing instead of public undo/redo controls.

The phase still fails goal-backward verification because the core backend artifact that anchors the refactor, [history.service.ts](/D:/Projects/gantt-lib-mcp/packages/mcp/src/services/history.service.ts), does not type-check in the current codebase. That means the version-oriented history path is not in a clean, shippable backend state, and `packages/server` inherits the failure through its dependency on `packages/mcp`. The earlier Prisma `EPERM` is platform noise, but the direct TypeScript compile shows a real phase-local defect that must be fixed before the goal can be considered achieved.

---

_Verified: 2026-04-18T13:30:29+03:00_  
_Verifier: Codex (gsd-verifier)_
