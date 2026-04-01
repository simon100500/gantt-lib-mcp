# Phase 36 Remediation Summary

## Outcome

The remediation track for unified scheduling core is complete in practical terms.

Authenticated project editing now follows one canonical path:

> load versioned project state -> build typed command -> commit through `CommandService` -> adopt authoritative server snapshot

Normal authenticated editing no longer depends on legacy task CRUD or batch-save routes as the main persistence model.

## What Was Completed

### R1: Versioned Project Load

- `GET /api/project` returns `version` plus full `snapshot`
- frontend hydrates `confirmed.version` and `confirmed.snapshot`
- command commits use the real server version as `baseVersion`

### R2: CommandService Correctness

- semantic edits persist through `CommandService`
- accepted commands now correspond to real persisted results
- `move_task`, `resize_task`, `create_task`, `delete_task`, `update_task_fields`, `reorder_task`, and dependency commands are part of the authoritative path

### R3: UI Command Cutover

- authenticated UI writes through `POST /api/commands/commit`
- normal edit flows no longer use legacy `/api/tasks` mutation routes as truth-path
- `useBatchTaskUpdate` and related hooks now operate around typed command intent instead of hybrid persistence

### R4: Preview And Pending Replay

- authenticated visible state derives from protocol state:
  - `confirmed`
  - `pending`
  - `dragPreview`
- pending replay uses shared scheduling core in browser
- authoritative server responses replace confirmed truth
- live pointer-time drag preview remains inside `gantt-lib`, which is acceptable because persistence and post-drop truth are command-driven

### R5: Legacy And Import Isolation

- removed legacy audit/revision tables from canonical architecture:
  - `TaskRevision`
  - `TaskMutation`
- added migration to drop legacy tables and enums
- canonical audit trail is now `ProjectEvent`

## Database Cleanup

Added migration:

- [20260401120000_drop_legacy_task_audit_tables/migration.sql](D:/Projects/gantt-lib-mcp/packages/mcp/prisma/migrations/20260401120000_drop_legacy_task_audit_tables/migration.sql)

Schema cleanup:

- removed `TaskRevision` model
- removed `TaskMutation` model
- removed `MutationSource` enum
- removed `MutationType` enum

## Verification

Verified locally:

- `npm.cmd run build -w packages/web`
- `npm.cmd run build -w packages/mcp`
- `npm.cmd run build -w packages/server`

Note:

- `prisma generate` was attempted after schema cleanup, but Windows file locking blocked replacing `query_engine-windows.dll.node` with `EPERM`. The TypeScript builds passed and schema/migration changes are committed, but local Prisma client regeneration may still need to be rerun when the file lock is gone.

## Manual Confidence Check

To confirm the architecture manually in authenticated mode:

1. Open browser DevTools Network tab.
2. Perform rename, drag, resize, delete, or reorder.
3. Confirm the request is `POST /api/commands/commit`.
4. Confirm request body carries a typed delta command such as `move_task`, `resize_task`, `update_task_fields`, `delete_task`, or `reorder_task`.
5. Confirm the normal flow does not rely on `PUT /api/tasks` or `PATCH /api/tasks/:id`.

## Final State

The remediation success condition from this track is satisfied:

> The UI loads versioned project state, builds a typed command, commits it through `CommandService`, and adopts the server response as truth.
