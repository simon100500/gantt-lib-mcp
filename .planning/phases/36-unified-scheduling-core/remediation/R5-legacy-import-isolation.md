# R5: Legacy And Import Isolation

## Goal

After the normal edit path is correct, isolate or migrate remaining bypasses:

- import
- bulk update
- compatibility CRUD routes
- any remaining MCP shortcuts

## Problem Being Solved

Even after the main UI path is fixed, hidden bypasses can keep reintroducing inconsistent state.

The architecture is only trustworthy when normal and exceptional paths are clearly separated.

## Target Result

- import flows use command batches or explicit import-specific command handling
- legacy CRUD routes are compatibility-only or removed
- `PUT /api/tasks` is not a hidden normal-edit truth path
- any remaining bypass is explicitly named, scoped, and documented

## Scope

- classify remaining mutation paths
- migrate the ones that must preserve scheduling semantics
- quarantine compatibility paths that cannot be removed immediately
- align MCP and import behavior with the new command protocol where needed

## Out of Scope

- full event-sourced replay
- undo/redo UI
- collaborative auto-rebase workflows

## Files Likely Involved

- [index.ts](D:/Projects/gantt-lib-mcp/packages/server/src/index.ts)
- MCP service and route files under `packages/mcp/src`
- import/batch callers in `packages/web/src/hooks`

## Implementation Notes

- Do not let `PUT /api/tasks` survive as an invisible escape hatch.
- If import must remain separate temporarily, label it as such and document exact semantics.
- MCP should converge to the same command model, but the first priority is eliminating active correctness gaps in the user-facing app.

## Acceptance Criteria

1. Normal authenticated UI editing no longer depends on legacy batch/task CRUD routes.
2. Import behavior is either command-based or explicitly isolated as legacy.
3. Remaining compatibility routes are documented and not presented as the canonical architecture.
4. No active product flow can bypass command commit without an explicit, reviewed reason.

## Exit Condition

The system can truthfully say:

> Any remaining non-command mutation path is explicit, scoped, and no longer confused with the canonical model.
