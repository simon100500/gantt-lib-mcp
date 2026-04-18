# Phase 45: history-refactor - Context

**Gathered:** 2026-04-18
**Status:** Ready for planning
**Source:** PRD Express Path (.planning/reference/history-versioning-clean-architecture-prd.md)

<domain>
## Phase Boundary

Refactor the Phase 44 history product architecture from public undo/redo mechanics into a version-oriented model built on the same append-only event foundation.

This phase must:
- keep `Project.version`, `MutationGroup`, `ProjectEvent.groupId`, `ordinal`, `inverseCommand`, `requestContextId`, and the authoritative `CommandService.commitCommand` pipeline
- present history as a linear list of document versions instead of undo/redo mechanics
- let the user preview any visible historical version without mutating the project or writing DB side effects
- let the user restore a chosen visible version through authoritative backend rollback of the active tail only
- make preview and restore share one rollback-target resolution model and one command-application semantics layer
- move historical preview into an isolated frontend viewer mode instead of mixing it into confirmed/pending/drag state
- replace public undo/redo-oriented HTTP and UI contracts with product-oriented history list, snapshot preview, and restore contracts

This phase must not:
- rewrite the Phase 44 storage foundation or add new history tables
- introduce branching history, diff mode, checkpoints, arbitrary version-number restore, or materialized per-version snapshots
- require the client to replay inverse commands or understand redo/divergence mechanics
- keep public UX centered on per-row undo/redo actions

</domain>

<decisions>
## Implementation Decisions

### Product model
- Treat visible history as a linear version timeline where each visible row is one user-visible `MutationGroup`.
- User-facing history actions are `show this version`, `restore this version`, and `return to current version`.
- Previewing a historical version is a read-only mode and never mutates `Project.version`, `ProjectEvent`, or `MutationGroup`.

### Shared backend semantics
- `HistoryService` must expose three separate product-oriented operations: `listHistoryGroups`, `getHistorySnapshot`, and `restoreToGroup`.
- `getHistorySnapshot` and `restoreToGroup` must share one rollback-tail resolution path:
  - identify the active visible history line
  - resolve the target group inside that line
  - collect the active tail after the target
  - validate that every tail event is restorable through persisted `inverseCommand`
  - apply inverse commands in descending ordinal order
- Preview and restore must share one typed command-application semantics layer; preview is memory-only, restore persists through the existing authoritative commit path.

### Pure command application
- Add a server-side pure command application capability so the backend can apply a typed `ProjectCommand` to a `ProjectSnapshot` without persistence or version bump.
- Prefer a shared module rather than duplicate restore logic between `HistoryService` and frontend helpers.
- The frontend must stop using client-side inverse-command replay for history preview.

### Public API contract
- `GET /api/history` returns product-visible version rows, not public undo/redo mechanics.
- `GET /api/history/:groupId/snapshot` returns an authoritative snapshot for the selected version.
- `POST /api/history/:groupId/restore` restores the selected visible version as the current project state.
- Public history responses must hide internal mechanics such as `origin='undo'`, `origin='redo'`, `undoneByGroupId`, `redoOfGroupId`, and redo-availability semantics.

### Frontend state model
- Introduce a separate history viewer state machine:
  - `{ mode: 'inactive' }`
  - `{ mode: 'preview'; groupId: string; snapshot: ProjectSnapshot; isCurrent: boolean }`
- Keep `useProjectStore` responsible only for current editing state (`confirmed`, `pending`, `dragPreview`).
- Visible project snapshot selection must prefer history preview over drag preview over current confirmed/pending state, while keeping the states structurally separate.

### Editing policy
- While preview mode is active, task mutations, AI mutations, command hotkeys, and optimistic state accumulation are disabled.
- Selecting the current version exits preview mode instead of creating a special pseudo-preview state.
- Restore remains a distinct explicit action and is not treated as the same operation as preview.

### the agent's Discretion
- Exact helper/module names inside the server, provided one shared rollback-tail path and one pure command-application semantics layer are preserved.
- Exact visual composition of the version banner and row action menu, provided preview/read-only state is obvious and the actions remain `show`, `restore`, and `return`.
- Exact test split across service, route, hook, and component contracts, provided the success criteria are enforced and the history path does not rely on `as any`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase PRDs
- `.planning/reference/history-versioning-clean-architecture-prd.md` - locked product goal for version preview and version restore
- `.planning/reference/history-undo-redo-prd.md` - Phase 44 foundation being preserved underneath the refactor

### Existing phase context
- `.planning/phases/44-undo-redo/44-CONTEXT.md` - locked Phase 44 decisions and foundations that remain valid
- `.planning/phases/44-undo-redo/44-VERIFICATION.md` - what actually shipped in Phase 44 and where the implementation lives

### Backend history foundation
- `packages/mcp/src/services/history.service.ts` - current append-only undo/redo orchestration and grouped history reads
- `packages/mcp/src/services/command.service.ts` - authoritative command execution and persistence boundary that restore must continue to use
- `packages/mcp/src/types.ts` - shared history, snapshot, and command contracts
- `packages/mcp/prisma/schema.prisma` - current `MutationGroup` / `ProjectEvent` persistence model that this phase reuses

### Server API surface
- `packages/server/src/routes/history-routes.ts` - current public undo/redo HTTP contract that must be replaced
- `packages/server/src/index.ts` - route registration and project load helper
- `packages/server/src/agent.ts` - agent history title and grouping semantics that the new visible timeline must continue to respect

### Frontend history and state
- `packages/web/src/hooks/useProjectHistory.ts` - current history hook tied to undo/redo endpoints
- `packages/web/src/components/HistoryPanel.tsx` - current history panel UI oriented around undo/redo row actions
- `packages/web/src/components/workspace/ProjectWorkspace.tsx` - current panel wiring, hotkeys, and read-only gating
- `packages/web/src/stores/useProjectStore.ts` - confirmed/pending/drag state that must remain separate from history preview
- `packages/web/src/lib/apiTypes.ts` - current web history API contracts

### Upstream foundations
- `.planning/reference/unified-scheduling-core-prd.md` - authoritative command pipeline and versioned project semantics
- `.planning/phases/36-unified-scheduling-core/36-CONTEXT.md` - source-of-truth decisions for typed commands and authoritative snapshots
- `.planning/reference/mcp-mutation-refactor-prd.md` - staged mutation flow and one-agent-turn grouping assumptions
- `.planning/phases/42-mcp-mutation-refactor/42-CONTEXT.md` - locked mutation-flow decisions that history restore must continue to honor

</canonical_refs>

<specifics>
## Specific Ideas

- `GET /api/history` rows should include `id`, `actorType`, `title`, `createdAt`, `baseVersion`, `newVersion`, `commandCount`, `isCurrent`, and `canRestore`.
- `GET /api/history/:groupId/snapshot` should return `{ groupId, isCurrent, currentVersion, snapshot }`.
- `POST /api/history/:groupId/restore` should return `{ groupId, targetGroupId, version, snapshot }`, where `groupId` is the technical rollback group and `targetGroupId` is the chosen visible version.
- The workspace should show a clear preview banner such as `Просмотр версии` plus a primary exit action `Вернуться к текущей версии`.
- History rows should preview on click and offer `Показать эту версию` / `Восстановить эту версию` from a row action menu.
- Hotkeys from Phase 44 should not remain active while preview mode is on.

</specifics>

<deferred>
## Deferred Ideas

- Branching history
- Diff or compare mode
- Arbitrary restore by raw version number
- Materialized stored snapshots
- Checkpoints or git-like timeline features

</deferred>

---

*Phase: 45-history-refactor*
*Context gathered: 2026-04-18 via PRD Express Path*
