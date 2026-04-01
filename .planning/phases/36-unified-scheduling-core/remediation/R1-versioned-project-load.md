# R1: Versioned Project Load

## Goal

Give the frontend a real `confirmed` baseline:

- canonical snapshot
- canonical project version

Without this, the command protocol is fake because `baseVersion` is synthetic.

## Problem Being Solved

Current authenticated load uses `GET /api/tasks` and returns only `Task[]`.

This leaves the frontend with:

- `confirmed.version = 0`
- no canonical dependency snapshot
- no clean bootstrap for `pending` replay

## Target Result

The authenticated project load returns:

```ts
type LoadProjectResponse = {
  version: number;
  snapshot: {
    tasks: Task[];
    dependencies: Dependency[];
  };
};
```

The frontend writes that into:

- `confirmed.version`
- `confirmed.snapshot`

## Scope

- add a versioned project load contract on the server
- load dependencies together with tasks
- hydrate `useProjectStore`
- stop relying on `version = 0` in authenticated mode

## Out of Scope

- preview execution
- command persistence correctness
- import migration

## Files Likely Involved

- [index.ts](D:/Projects/gantt-lib-mcp/packages/server/src/index.ts)
- [command.service.ts](D:/Projects/gantt-lib-mcp/packages/mcp/src/services/command.service.ts)
- [useTasks.ts](D:/Projects/gantt-lib-mcp/packages/web/src/hooks/useTasks.ts)
- [useTaskStore.ts](D:/Projects/gantt-lib-mcp/packages/web/src/stores/useTaskStore.ts)
- [useProjectStore.ts](D:/Projects/gantt-lib-mcp/packages/web/src/stores/useProjectStore.ts)
- [types.ts](D:/Projects/gantt-lib-mcp/packages/web/src/types.ts)

## Implementation Notes

- Prefer a dedicated versioned project load response over trying to smuggle version into legacy `GET /api/tasks`.
- `confirmed` should be hydrated once from the server response, not inferred later.
- If task-only legacy consumers still need `GET /api/tasks`, keep it as compatibility, but do not use it for the new command-driven project mode.

## Acceptance Criteria

1. Authenticated project load returns version and full snapshot.
2. Frontend store initializes `confirmed.version` from server data, not `0`.
3. Frontend store initializes `confirmed.snapshot.tasks` and `confirmed.snapshot.dependencies`.
4. The first command sent after load uses the real server version as `baseVersion`.
5. Reloading the page preserves correct command behavior without synthetic version assumptions.

## Exit Condition

The frontend can truthfully say:

> I know exactly which server-confirmed project version I am editing.
