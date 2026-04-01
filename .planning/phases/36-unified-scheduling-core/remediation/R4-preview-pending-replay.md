# R4: Preview And Pending Replay

## Goal

Finish the frontend truth model:

- `confirmed`
- `pending`
- `dragPreview`

and make visible project state derive from those layers using the shared core.

## Problem Being Solved

The store exists, but the protocol is incomplete:

- pending replay is not implemented
- preview parity is not fully wired
- the shared core is not yet the actual browser execution engine for visible state derivation

## Target Result

The frontend behaves like this:

1. load server-confirmed snapshot and version into `confirmed`
2. on drag or resize, build command and compute `dragPreview` via shared core
3. on commit, append pending command
4. render `confirmed + replay(pending)` when not dragging
5. replace `confirmed` with authoritative server response on ack

## Scope

- implement shared-core preview execution in browser
- implement replay of `pending` commands over `confirmed`
- ensure server ack replaces confirmed truth
- log preview/server mismatch only as diagnostics

## Out of Scope

- import migration
- advanced automatic rebase queues
- history UI

## Files Likely Involved

- [useProjectStore.ts](D:/Projects/gantt-lib-mcp/packages/web/src/stores/useProjectStore.ts)
- [useCommandCommit.ts](D:/Projects/gantt-lib-mcp/packages/web/src/hooks/useCommandCommit.ts)
- [types.ts](D:/Projects/gantt-lib-mcp/packages/web/src/types.ts)
- gantt rendering integration points in `packages/web/src/components`

## Implementation Notes

- Truth comes from protocol, not from snapshot comparison.
- Preview mismatch with server can be logged, but must not become merge logic.
- Keep the browser import path aligned with `gantt-lib/core/scheduling`.
- If dependency replay needs normalized snapshot shape, normalize once at the store boundary.

## Acceptance Criteria

1. Drag preview is computed via the shared scheduling core.
2. Pending commands are replayed locally over `confirmed`.
3. Server responses replace `confirmed` truth by `newVersion`.
4. Clearing one pending command does not discard later pending commands.
5. The visible chart state is derived from protocol state, not from ad hoc mutable task arrays.

## Exit Condition

The frontend can truthfully say:

> I predict locally, but I render confirmed truth plus explicit pending intent, and the server still decides reality.
