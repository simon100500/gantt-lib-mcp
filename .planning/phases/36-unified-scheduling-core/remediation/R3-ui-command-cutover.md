# R3: UI Command Cutover

## Goal

Remove legacy task mutation routes as the normal authenticated UI truth-path.

Normal project editing must go through typed command commit, not through mixed `PATCH/POST/PUT /api/tasks` flows.

## Problem Being Solved

The frontend currently branches between incompatible persistence models:

- command commit
- single-task patch
- batch put
- task CRUD endpoints

That preserves the old mental model and keeps the system hybrid.

## Target Result

For authenticated project mode:

- create uses command commit
- edit uses command commit
- move/resize uses command commit
- delete uses command commit
- dependency edits use command commit
- reorder/reparent use command commit or an explicit command adapter

Legacy task routes stop being the main UI write path.

## Scope

- refactor `useBatchTaskUpdate`
- refactor `useTaskMutation`
- remove fallback from command failure to raw patch persistence
- make authenticated editing use one command-building layer

## Out of Scope

- preview replay
- import and bulk migration
- MCP cleanup unless needed for correctness

## Files Likely Involved

- [useBatchTaskUpdate.ts](D:/Projects/gantt-lib-mcp/packages/web/src/hooks/useBatchTaskUpdate.ts)
- [useTaskMutation.ts](D:/Projects/gantt-lib-mcp/packages/web/src/hooks/useTaskMutation.ts)
- [useCommandCommit.ts](D:/Projects/gantt-lib-mcp/packages/web/src/hooks/useCommandCommit.ts)
- [types.ts](D:/Projects/gantt-lib-mcp/packages/web/src/types.ts)
- [App.tsx](D:/Projects/gantt-lib-mcp/packages/web/src/App.tsx)

## Implementation Notes

- Do not keep “try command, then silently fall back to PATCH”.
- Keep guest/local mode separate if needed, but authenticated project mode should have one path.
- Prefer a small command builder layer that maps UI intent to typed commands.
- Avoid letting one UI event emit both a command commit and a batch patch save.

## Acceptance Criteria

1. Authenticated task create does not use `POST /api/tasks` as the main path.
2. Authenticated task edit does not use `PATCH /api/tasks/:id` as the main path.
3. Authenticated batch/reorder flows do not use `PUT /api/tasks` as the main path.
4. Command commit failures surface as command failures, not hidden patch fallbacks.
5. The normal authenticated edit flow is explainable as “build command -> commit -> adopt server response”.

## Exit Condition

The UI can truthfully say:

> In authenticated project mode, I persist edits through one command protocol.
