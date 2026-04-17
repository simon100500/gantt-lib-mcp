---
phase: 44-undo-redo
plan: 03
subsystem: api
tags: [history, undo-redo, agent, react, fastify, command-service]
requires:
  - phase: 44-01
    provides: "MutationGroup persistence, grouped command commits, and authoritative undoability finalization"
  - phase: 44-02
    provides: "HistoryService replay semantics and grouped history API contracts"
provides:
  - "Run-scoped agent history metadata with one shared groupId/requestContextId per staged turn"
  - "Explicit non-undoable staged mutation metadata instead of inferred default undoability"
  - "Manual web command hooks that send grouped user_ui history through the existing commit endpoint"
affects: [44-04, history-panel, undo-redo, agent-grouping, manual-edit-history]
tech-stack:
  added: []
  patterns: ["run-scoped mutation history envelopes", "grouped user_ui commits through /api/commands/commit", "backward-compatible staged history defaults"]
key-files:
  created: []
  modified:
    - packages/server/src/agent.ts
    - packages/server/src/agent.test.ts
    - packages/server/src/mutation/types.ts
    - packages/server/src/mutation/orchestrator.ts
    - packages/server/src/mutation/execution.ts
    - packages/mcp/src/types.ts
    - packages/mcp/src/services/command.service.ts
    - packages/web/src/types.ts
    - packages/web/src/hooks/useCommandCommit.ts
    - packages/web/src/hooks/useProjectCommands.ts
    - packages/server/src/routes/command-routes.ts
key-decisions:
  - "Agent staged mutations now carry one explicit history envelope for the entire turn; only the last authoritative command finalizes the group."
  - "Manual UI edits reuse the existing /api/commands/commit route and attach user_ui history metadata instead of introducing a separate history write API."
  - "Staged history fields were made backward-compatible at the orchestrator/execution boundary so existing callers keep building while the new metadata rolls out."
patterns-established:
  - "Agent and web mutation entrypoints must describe one user-visible operation explicitly before calling commandService.commitCommand."
  - "Routes that proxy authoritative command commits must forward history metadata untouched."
requirements-completed: [HIS-04]
duration: 35min
completed: 2026-04-18
---

# Phase 44 Plan 03: Grouped agent turns and manual UI history propagation

**Agent turns and manual UI edits now create explicit grouped history units through the same authoritative commit path, with stable request context and explicit undoability metadata**

## Performance

- **Duration:** 35 min
- **Started:** 2026-04-17T20:47:00Z
- **Completed:** 2026-04-17T21:22:12Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- Added run-scoped `groupId`, `requestContextId`, `historyTitle`, and `historyUndoable` propagation for staged agent mutations.
- Ensured deterministic and hybrid staged agent commits reuse one `agent_run` history group and finalize it only on the last command.
- Extended manual web command hooks to send grouped `user_ui` history metadata through `/api/commands/commit` with concrete user-visible titles.

## Task Commits

Each task was committed atomically:

1. **Task 1: Make one agent turn map to one mutation group with stable titles** - `ebd8973` (test), `9a12cf2` (feat)
2. **Task 2: Propagate manual web mutation groups through the command commit hooks** - `919f0c2` (feat)

## Files Created/Modified
- `packages/server/src/agent.ts` - Generates run-scoped agent history context before staged execution.
- `packages/server/src/agent.test.ts` - Locks grouped agent history reuse, finalization, title prefix, and explicit non-undoable semantics.
- `packages/server/src/mutation/types.ts` - Extends staged mutation contracts with history metadata.
- `packages/server/src/mutation/orchestrator.ts` - Carries staged history context through orchestration with backward-compatible defaults.
- `packages/server/src/mutation/execution.ts` - Sends shared `agent_run` history metadata on every authoritative command commit.
- `packages/mcp/src/types.ts` - Allows explicit requested undoability in commit history context.
- `packages/mcp/src/services/command.service.ts` - Honors explicit non-undoable grouped history when finalizing mutation groups.
- `packages/web/src/types.ts` - Defines the frontend history group context for manual UI edits.
- `packages/web/src/hooks/useCommandCommit.ts` - Accepts optional history metadata and posts it to the authoritative command endpoint.
- `packages/web/src/hooks/useProjectCommands.ts` - Builds stable grouped titles and shared IDs for single- and multi-command UI edits.
- `packages/server/src/routes/command-routes.ts` - Preserves incoming history metadata when delegating to `commandService.commitCommand(...)`.

## Decisions Made

- Used `runId` as the agent `requestContextId` and a separate UUID `groupId` so one conversational turn and one persisted history group remain linked but distinct.
- Kept manual history grouping in the existing command hook and route instead of adding a parallel history API surface.
- Defaulted staged history context when omitted so older callers and existing tests remain valid while the new contract is adopted incrementally.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Preserved web history metadata in the server command route**
- **Found during:** Task 2 (Propagate manual web mutation groups through the command commit hooks)
- **Issue:** The frontend could send grouped history metadata, but `packages/server/src/routes/command-routes.ts` dropped `body.history`, which would make manual grouping inert.
- **Fix:** Passed `history` through the route request object and added it to the route debug logs.
- **Files modified:** `packages/server/src/routes/command-routes.ts`
- **Verification:** `npm run build -w packages/web && npm run build -w packages/server`
- **Committed in:** `919f0c2`

**2. [Rule 3 - Blocking] Made staged history inputs backward-compatible**
- **Found during:** Task 1 (Make one agent turn map to one mutation group with stable titles)
- **Issue:** Requiring history metadata on every staged execution call broke existing tests and other server callers that still used the pre-history signature.
- **Fix:** Added orchestrator/execution defaults that synthesize history context when callers omit it, while still allowing agent.ts to provide explicit run-scoped metadata.
- **Files modified:** `packages/server/src/mutation/orchestrator.ts`, `packages/server/src/mutation/execution.ts`
- **Verification:** `npx tsx --test packages/server/src/agent.test.ts packages/server/src/mutation/orchestrator.test.ts && npm run build -w packages/server`
- **Committed in:** `9a12cf2`

---

**Total deviations:** 2 auto-fixed (1 missing critical, 1 blocking)
**Impact on plan:** Both fixes were required for the grouped history contract to work end-to-end without regressing existing staged execution callers.

## Issues Encountered

- The staged mutation tests passed before the server build because several legacy callers still compiled against the old signatures; backward-compatible defaults resolved that mismatch.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 44-04 can now consume explicit grouped history records from both agent and manual UI mutation channels.
- The history panel and undo/redo UX can rely on one shared authoritative commit path with stable group metadata.

## Self-Check

PASSED

---
*Phase: 44-undo-redo*
*Completed: 2026-04-18*
