# R2: CommandService Correctness

## Goal

Make `CommandService` semantically correct for the first supported command set.

Accepted commands must persist the whole intended result, not only fragments like `startDate/endDate`.

## Problem Being Solved

Right now the code can:

- accept a command
- bump version
- write an event
- log success

while still failing to persist the full semantic edit.

This invalidates the architecture.

## Target Result

For the first-pass commands:

- `move_task`
- `resize_task`
- `create_task`
- `delete_task`
- `update_task_fields`
- `reparent_task`
- `reorder_task`
- dependency create/remove/lag-change commands

the server must:

- execute through shared core where appropriate
- persist the full before/after semantic effect
- compute patches from persisted state
- only return accepted when the canonical DB state matches the command result

## Scope

- add explicit `update_task_fields`
- stop routing raw mixed-body task edits through inferred schedule commands
- persist full task semantics for accepted commands
- ensure version bump and event log happen only after correct persistence
- remove accepted-but-no-real-change behavior

## Out of Scope

- frontend preview
- UI cutover from legacy routes
- import migration

## Files Likely Involved

- [command.service.ts](D:/Projects/gantt-lib-mcp/packages/mcp/src/services/command.service.ts)
- [types.ts](D:/Projects/gantt-lib-mcp/packages/mcp/src/types.ts)
- [index.ts](D:/Projects/gantt-lib-mcp/packages/server/src/index.ts)
- [command-routes.ts](D:/Projects/gantt-lib-mcp/packages/server/src/routes/command-routes.ts)

## Implementation Notes

- `name/progress/color/parentId` must not piggyback on `move_task`.
- Raw `PATCH /api/tasks/:id` request bodies should not be partially translated to commands.
- If a legacy route remains temporarily, it must translate to one explicit command or reject the request.
- Avoid “fallback to legacy persistence” on command failure.

## Acceptance Criteria

1. Renaming a task persists and survives reload.
2. Editing non-date task fields persists and survives reload.
3. Moving a task persists the direct move and any authoritative cascade.
4. Creating a task persists correctly and survives reload.
5. Deleting a task persists correctly and survives reload.
6. No accepted command silently drops fields from the intended change.
7. Version bump and event creation occur only for real, correctly persisted accepted commands.

## Exit Condition

The server can truthfully say:

> If I returned `accepted: true`, the canonical database state reflects the full semantic result of that command.
