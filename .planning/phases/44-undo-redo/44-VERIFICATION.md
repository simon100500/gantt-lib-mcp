---
phase: 44-undo-redo
verified: 2026-04-17T21:37:46.6114198Z
status: human_needed
score: 5/5 must-haves verified
human_verification:
  - test: "History panel rendering and replay controls"
    expected: "Toolbar button opens the panel, grouped rows show actor/title/status/timestamp, and undo/redo buttons are enabled only when the API marks items undoable/redoable."
    why_human: "Visual layout, Russian labels, and per-row affordance clarity cannot be fully verified from static code."
  - test: "Workspace undo/redo hotkeys"
    expected: "Ctrl+Z undoes the latest undoable group, Ctrl+Shift+Z redoes the latest redoable group, and shortcuts are ignored inside input/textarea/contenteditable fields."
    why_human: "Keyboard behavior depends on runtime focus state and browser event handling."
---

# Phase 44: undo-redo Verification Report

**Phase Goal:** Линейная grouped history поверх существующего authoritative command pipeline: пользователь видит понятные MutationGroup-записи и может безопасно undo/redo как ручные действия, так и целый ход агента
**Verified:** 2026-04-17T21:37:46.6114198Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Каждый user-visible mutation commit или agent turn записывается как `MutationGroup` с корректными `baseVersion/newVersion`, порядком событий и persisted `inverseCommand` | ✓ VERIFIED | Shared contracts and schema exist in [types.ts](/D:/Projects/gantt-lib-mcp/packages/mcp/src/types.ts#L615) and [schema.prisma](/D:/Projects/gantt-lib-mcp/packages/mcp/prisma/schema.prisma#L156); authoritative commit path creates groups, allocates ordinals, persists inverse commands, and finalizes groups in [command.service.ts](/D:/Projects/gantt-lib-mcp/packages/mcp/src/services/command.service.ts#L824). |
| 2 | Undo/redo работают append-only через существующий `CommandService.commitCommand`, а redo блокируется typed отказом при diverged history | ✓ VERIFIED | Replay service appends `origin: 'undo'/'redo'` groups, calls `commitCommand(...)`, and returns `history_diverged` / `redo_not_available` / `target_not_undone` from [history.service.ts](/D:/Projects/gantt-lib-mcp/packages/mcp/src/services/history.service.ts#L188). |
| 3 | `GET /api/history` возвращает paginated grouped history, а undo/redo endpoints возвращают authoritative `snapshot + version` | ✓ VERIFIED | Authenticated list and replay routes are registered in [history-routes.ts](/D:/Projects/gantt-lib-mcp/packages/server/src/routes/history-routes.ts#L28) and [index.ts](/D:/Projects/gantt-lib-mcp/packages/server/src/index.ts#L35). |
| 4 | Один agent turn использует один shared `groupId/requestContextId` и получает human-readable history title для UI | ✓ VERIFIED | Agent entrypoint generates one `runId`-backed request context and one UUID group per turn in [agent.ts](/D:/Projects/gantt-lib-mcp/packages/server/src/agent.ts#L989); orchestrator/execution preserve that envelope and finalize only the last command in [execution.ts](/D:/Projects/gantt-lib-mcp/packages/server/src/mutation/execution.ts#L229). |
| 5 | Web UI показывает history panel и поддерживает `Ctrl+Z` / `Ctrl+Shift+Z`, после replay обновляясь от authoritative server snapshot | ✓ VERIFIED | Manual command hooks send grouped `user_ui` history in [useCommandCommit.ts](/D:/Projects/gantt-lib-mcp/packages/web/src/hooks/useCommandCommit.ts#L71) and [useProjectCommands.ts](/D:/Projects/gantt-lib-mcp/packages/web/src/hooks/useProjectCommands.ts#L49); history hook refreshes via `setConfirmed(...)` and `clearTransientState()` in [useProjectHistory.ts](/D:/Projects/gantt-lib-mcp/packages/web/src/hooks/useProjectHistory.ts#L107); panel and hotkeys are wired in [HistoryPanel.tsx](/D:/Projects/gantt-lib-mcp/packages/web/src/components/HistoryPanel.tsx#L37) and [ProjectWorkspace.tsx](/D:/Projects/gantt-lib-mcp/packages/web/src/components/workspace/ProjectWorkspace.tsx#L276). |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `packages/mcp/prisma/schema.prisma` | `MutationGroup` model and `ProjectEvent` history fields | ✓ VERIFIED | Enums and model exist with `groupId`, `ordinal`, `inverseCommand`, `metadata`, `requestContextId` indexes in [schema.prisma](/D:/Projects/gantt-lib-mcp/packages/mcp/prisma/schema.prisma#L80). |
| `packages/mcp/src/types.ts` | Shared history contracts | ✓ VERIFIED | `MutationGroupOrigin`, `HistoryGroupContext`, `MutationGroupRecord`, history-aware `CommitProjectCommandRequest`, and extended `ProjectEventRecord` exist in [types.ts](/D:/Projects/gantt-lib-mcp/packages/mcp/src/types.ts#L615). |
| `packages/mcp/src/services/command.service.ts` | History-aware authoritative commit path | ✓ VERIFIED | Group creation/finalization, ordinals, delete metadata, and inverse persistence are implemented in [command.service.ts](/D:/Projects/gantt-lib-mcp/packages/mcp/src/services/command.service.ts#L521). |
| `packages/mcp/src/services/history.service.ts` | Append-only undo/redo orchestration and paginated grouped history | ✓ VERIFIED | List, undo latest, undo specific, redo specific, and divergence checks exist in [history.service.ts](/D:/Projects/gantt-lib-mcp/packages/mcp/src/services/history.service.ts#L338). |
| `packages/server/src/routes/history-routes.ts` | Authenticated history HTTP surface | ✓ VERIFIED | `/api/history`, `/api/history/undo`, `/:groupId/undo`, and `/:groupId/redo` are wired in [history-routes.ts](/D:/Projects/gantt-lib-mcp/packages/server/src/routes/history-routes.ts#L29). |
| `packages/server/src/agent.ts` | Agent turn grouping/title generation | ✓ VERIFIED | One run-scoped `groupId`, one `requestContextId`, and AI titles are generated in [agent.ts](/D:/Projects/gantt-lib-mcp/packages/server/src/agent.ts#L405). |
| `packages/web/src/hooks/useCommandCommit.ts` | Manual web commit metadata propagation | ✓ VERIFIED | Existing `/api/commands/commit` POST body includes `history` in [useCommandCommit.ts](/D:/Projects/gantt-lib-mcp/packages/web/src/hooks/useCommandCommit.ts#L94). |
| `packages/web/src/hooks/useProjectHistory.ts` | History API client with authoritative refresh | ✓ VERIFIED | History list/replay calls and store reconciliation exist in [useProjectHistory.ts](/D:/Projects/gantt-lib-mcp/packages/web/src/hooks/useProjectHistory.ts#L37). |
| `packages/web/src/components/HistoryPanel.tsx` | Visible grouped history list and replay controls | ✓ VERIFIED | Actor/title/status/timestamp plus undo/redo controls are rendered in [HistoryPanel.tsx](/D:/Projects/gantt-lib-mcp/packages/web/src/components/HistoryPanel.tsx#L37). |
| `packages/web/src/components/workspace/ProjectWorkspace.tsx` | Panel mount and keyboard shortcuts | ✓ VERIFIED | Panel mounting and `keydown` handling are wired in [ProjectWorkspace.tsx](/D:/Projects/gantt-lib-mcp/packages/web/src/components/workspace/ProjectWorkspace.tsx#L276). |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `command.service.ts` | `schema.prisma` | MutationGroup creation/finalization and ProjectEvent persistence | ✓ WIRED | `ensureMutationGroup`, `allocateGroupOrdinal`, event persistence, and finalization are present in [command.service.ts](/D:/Projects/gantt-lib-mcp/packages/mcp/src/services/command.service.ts#L521). |
| `history.service.ts` | `command.service.ts` | Append-only replay through authoritative commit path | ✓ WIRED | `replayGroup()` calls `this.commandService.commitCommand(...)` per event in [history.service.ts](/D:/Projects/gantt-lib-mcp/packages/mcp/src/services/history.service.ts#L289). |
| `history-routes.ts` | `history.service.ts` | List and replay route handlers | ✓ WIRED | All route handlers delegate to `historyService` in [history-routes.ts](/D:/Projects/gantt-lib-mcp/packages/server/src/routes/history-routes.ts#L35). |
| `agent.ts` | `mutation/orchestrator.ts` | Shared group envelope for one staged turn | ✓ WIRED | `runAgentWithHistory()` passes `groupId`, `requestContextId`, `historyTitle`, `historyUndoable` to `runStagedMutation(...)` in [agent.ts](/D:/Projects/gantt-lib-mcp/packages/server/src/agent.ts#L1000). |
| `mutation/execution.ts` | `CommandService.commitCommand` | `agent_run` history metadata on every command | ✓ WIRED | Execution passes one shared `HistoryGroupContext` with `finalizeGroup` on the last command in [execution.ts](/D:/Projects/gantt-lib-mcp/packages/server/src/mutation/execution.ts#L237). |
| `useCommandCommit.ts` | `/api/commands/commit` | Manual history metadata passthrough | ✓ WIRED | Web commit hook posts `{ clientRequestId, baseVersion, command, history }` in [useCommandCommit.ts](/D:/Projects/gantt-lib-mcp/packages/web/src/hooks/useCommandCommit.ts#L94). |
| `useProjectHistory.ts` | `/api/history` | List and replay HTTP calls | ✓ WIRED | Fetch and POST replay paths exist in [useProjectHistory.ts](/D:/Projects/gantt-lib-mcp/packages/web/src/hooks/useProjectHistory.ts#L63). |
| `ProjectWorkspace.tsx` | `useProjectHistory.ts` | Panel state and hotkey actions | ✓ WIRED | Workspace consumes `undoLatest`, `undoGroup`, `redoGroup`, and `historyItems` in [ProjectWorkspace.tsx](/D:/Projects/gantt-lib-mcp/packages/web/src/components/workspace/ProjectWorkspace.tsx#L193). |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| --- | --- | --- | --- | --- |
| `packages/web/src/components/HistoryPanel.tsx` | `items` | `useProjectHistory()` -> `GET /api/history` -> `HistoryService.listHistoryGroups()` -> Prisma `mutationGroup/projectEvent` queries | Yes | ✓ FLOWING |
| `packages/web/src/components/workspace/ProjectWorkspace.tsx` | `historyItems`, `latestRedoableItem` | `useProjectHistory()` state populated from `/api/history` | Yes | ✓ FLOWING |
| `packages/mcp/src/services/history.service.ts` | replay command sequence | Stored `ProjectEvent.inverseCommand` / original `command` rows loaded by `getGroupEvents()` | Yes | ✓ FLOWING |
| `packages/mcp/src/services/command.service.ts` | `inverseCommand`, `metadata`, `groupId`, `ordinal` | Computed from pre-mutation task/dependency snapshot and persisted in the same authoritative transaction | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| MCP command-service regressions | `npx tsx --test packages/mcp/src/services/command.service.test.ts` | 27 tests passed | ✓ PASS |
| Agent/orchestrator/execution regressions | `npx tsx --test packages/server/src/mutation/orchestrator.test.ts packages/server/src/mutation/execution.test.ts packages/server/src/agent.test.ts` | 38 tests passed | ✓ PASS |
| Initial-generation regression guard after history wiring | `npx tsx --test packages/server/src/initial-generation/interpreter.test.ts packages/server/src/initial-generation/classification.test.ts packages/server/src/initial-generation/clarification-gate.test.ts packages/server/src/initial-generation/domain/assembly.test.ts packages/server/src/initial-generation/orchestrator.test.ts` | 30 tests passed | ✓ PASS |
| MCP build | `npm run build -w packages/mcp` | `tsc` passed | ✓ PASS |
| Server build | `npm run build -w packages/server` | `prebuild` + `tsc` passed | ✓ PASS |
| Web build | `npm run build -w packages/web` | `tsc` and Vite build passed; non-blocking bundle-size warning only | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| HIS-01 | `44-01-PLAN.md` | Every authoritative project mutation belongs to a grouped history record with stable versions and persisted inverse commands | ✓ SATISFIED | Plans declare HIS-01 in [44-01-PLAN.md](/D:/Projects/gantt-lib-mcp/.planning/phases/44-undo-redo/44-01-PLAN.md#L14); implemented by schema/contracts and authoritative commit persistence in [types.ts](/D:/Projects/gantt-lib-mcp/packages/mcp/src/types.ts#L615), [schema.prisma](/D:/Projects/gantt-lib-mcp/packages/mcp/prisma/schema.prisma#L156), and [command.service.ts](/D:/Projects/gantt-lib-mcp/packages/mcp/src/services/command.service.ts#L824). |
| HIS-02 | `44-02-PLAN.md` | Undo/redo replay through the authoritative pipeline and append new groups | ✓ SATISFIED | Plans declare HIS-02 in [44-02-PLAN.md](/D:/Projects/gantt-lib-mcp/.planning/phases/44-undo-redo/44-02-PLAN.md#L16); append-only replay is implemented in [history.service.ts](/D:/Projects/gantt-lib-mcp/packages/mcp/src/services/history.service.ts#L256). |
| HIS-03 | `44-02-PLAN.md` | Grouped history API returns paginated mutation groups and authoritative replay payloads | ✓ SATISFIED | Plans declare HIS-03 in [44-02-PLAN.md](/D:/Projects/gantt-lib-mcp/.planning/phases/44-undo-redo/44-02-PLAN.md#L16); HTTP contract is implemented in [history-routes.ts](/D:/Projects/gantt-lib-mcp/packages/server/src/routes/history-routes.ts#L29). |
| HIS-04 | `44-03-PLAN.md` | One agent-visible turn maps to one shared mutation group with a human-readable title | ✓ SATISFIED | Plans declare HIS-04 in [44-03-PLAN.md](/D:/Projects/gantt-lib-mcp/.planning/phases/44-undo-redo/44-03-PLAN.md#L17); run-scoped grouping is implemented in [agent.ts](/D:/Projects/gantt-lib-mcp/packages/server/src/agent.ts#L989) and [execution.ts](/D:/Projects/gantt-lib-mcp/packages/server/src/mutation/execution.ts#L237). |
| HIS-05 | `44-04-PLAN.md` | Web UI exposes grouped history and fixed replay shortcuts with authoritative snapshot reconciliation | ✓ SATISFIED | Plans declare HIS-05 in [44-04-PLAN.md](/D:/Projects/gantt-lib-mcp/.planning/phases/44-undo-redo/44-04-PLAN.md#L17); web hook/panel/hotkeys are implemented in [useProjectHistory.ts](/D:/Projects/gantt-lib-mcp/packages/web/src/hooks/useProjectHistory.ts#L37), [Toolbar.tsx](/D:/Projects/gantt-lib-mcp/packages/web/src/components/layout/Toolbar.tsx#L254), and [ProjectWorkspace.tsx](/D:/Projects/gantt-lib-mcp/packages/web/src/components/workspace/ProjectWorkspace.tsx#L287). |

Phase 44 orphaned requirements: none. All Phase 44 requirement IDs listed in [REQUIREMENTS.md](/D:/Projects/gantt-lib-mcp/.planning/REQUIREMENTS.md#L65) are claimed by phase plans.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| `packages/web/src/hooks/useCommandCommit.ts` | 81 | `console.log` / `console.error` debug logging in production hook | ℹ️ Info | No functional breakage for Phase 44, but noisy console output remains in user mutation flow. |

### Human Verification Required

### 1. History Panel Rendering And Replay Controls

**Test:** Open a project in the web app, click `История`, and inspect several manual and AI-generated rows.
**Expected:** The panel opens inside the workspace, rows show timestamp, actor label, title, status, and only valid undo/redo buttons are enabled.
**Why human:** This checks layout, readable copy, and affordance clarity.

### 2. Workspace Undo/Redo Hotkeys

**Test:** With focus outside editable fields, press `Ctrl+Z`, then `Ctrl+Shift+Z`; repeat while focus is inside an input or textarea.
**Expected:** Outside editable fields the latest undoable or redoable group replays and the chart refreshes; inside editable fields the shortcuts are ignored by the history layer.
**Why human:** Browser focus handling and real keyboard UX require runtime interaction.

### Gaps Summary

No automated implementation gaps were found against Phase 44 must-haves or requirement IDs `HIS-01` through `HIS-05`. The remaining work is human validation of the visible history UX and keyboard behavior.

---

_Verified: 2026-04-17T21:37:46.6114198Z_
_Verifier: Claude (gsd-verifier)_
