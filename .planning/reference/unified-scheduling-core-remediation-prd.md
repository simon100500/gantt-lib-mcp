# PRD: Unified Scheduling Core Remediation

## Status

Proposed

## Purpose

This document is not a replacement for [unified-scheduling-core-prd.md](D:/Projects/gantt-lib-mcp/.planning/reference/unified-scheduling-core-prd.md).

It is the implementation PRD for fixing the current hybrid phase-36 state and getting to the first actually-correct production slice of the architecture.

The goal is to stop trying to evolve the current mixed model in place and instead perform a controlled rewrite of the mutation pipeline around one authoritative command path.

## Current Diagnosis

The codebase currently has a hybrid model:

- `gantt-lib/core/scheduling` is imported in server-side scheduling paths
- `CommandService` exists
- typed commands exist
- project versioning and event logging exist

But the system is still not operating as one coherent protocol.

Current defects:

- `PATCH /api/tasks/:id` routes many edits through `CommandService` but only persists `startDate/endDate`
- frontend still uses legacy `PATCH /api/tasks`, `POST /api/tasks`, and `PUT /api/tasks`
- frontend command state (`confirmed/pending/preview`) is only partially wired
- `GET /api/tasks` does not return the version needed by the command protocol
- batch/import paths still bypass the command model
- server success logs can report accepted command flow even when the semantic edit was not fully persisted

Conclusion:

> The problem is not the shared core itself.  
> The problem is that the application still has multiple mutation contracts and no single enforced authority path.

## Product Goal

Reach a first fully-correct slice where:

- one task can be created, edited, moved, resized, and deleted through one command protocol
- the same scheduling core is used for preview and commit
- the server is the only source of confirmed truth
- the frontend stops persisting raw task patches as the main model

This first slice does not need to solve every mutation type at once.
It does need to establish the final architectural law.

## Architectural Decision

Do not rewrite from scratch.

Do not continue patching the current hybrid flow.

Instead:

- keep the shared `gantt-lib/core/scheduling`
- keep `CommandService` as the central execution boundary
- rewrite the mutation protocol around it
- deprecate legacy task CRUD and batch-save routes as authoritative paths

This is a controlled rewrite at the mutation seam, not a full system rewrite.

## Non-Negotiable Rules

1. The frontend does not persist task field patches as truth.
2. The frontend sends typed commands with `baseVersion` and `clientRequestId`.
3. The server loads the canonical snapshot, executes one command, persists the canonical result, bumps version, writes an event, then responds.
4. The frontend accepts the server response as truth without heuristic snapshot comparison.
5. Any route that mutates linked scheduling state outside the command path is legacy and must be removed or isolated.
6. A command that updates a task must persist the whole semantic effect of that command, not only dates.
7. Batch mutation is not allowed as a shortcut around the domain model.

## First Working Slice

The first slice that counts as success:

1. load project snapshot and version
2. preview `move_task` and `resize_task` locally with shared core
3. commit `move_task` and `resize_task` through `/api/commands/commit`
4. create task through command commit
5. rename/edit task through command commit
6. delete task through command commit
7. frontend updates confirmed state from server snapshot and `newVersion`

If this slice works, the architecture is real.
If it does not, the rest is noise.

## Scope

### In Scope

- replace legacy task mutation truth-paths for normal UI operations
- unify frontend state around `confirmed`, `pending`, and `dragPreview`
- make `GET` load versioned project state
- make `CommandService` persist full task semantics for supported commands
- add dedicated typed commands for non-scheduling edits where needed
- make command commit the only accepted route for normal authenticated UI edits

### Out of Scope

- full import migration in the first pass
- MCP cleanup in the first pass unless it blocks correctness
- replay UI
- undo/redo UI
- full event-log browsing
- advanced collaboration and automatic rebase queues

## Keep / Rewrite / Remove

### Keep

- `gantt-lib/core/scheduling`
- `ProjectCommand` concept
- `CommitProjectCommandRequest/Response`
- `ProjectEvent`
- optimistic concurrency with `baseVersion`
- `CommandService` as the central place to execute and persist commands

### Rewrite

- frontend project state integration
- server route contract for initial project load
- command persistence logic for task field edits
- command persistence logic for task creation/update/delete semantics
- frontend hooks that currently decide between command flow and patch flow

### Remove or De-authoritize

- `PATCH /api/tasks/:id` as a normal UI truth-path
- `POST /api/tasks` as a normal UI truth-path
- `PUT /api/tasks` as a normal UI truth-path
- any fallback from command commit back to raw patch persistence for authenticated edits

These routes may remain temporarily as compatibility adapters, but they must internally translate to commands or be explicitly marked legacy-only.

## Target Runtime Model

### Read

Frontend loads:

```ts
type LoadProjectResponse = {
  version: number;
  snapshot: {
    tasks: Task[];
    dependencies: Dependency[];
  };
};
```

Store writes:

- `confirmed.version`
- `confirmed.snapshot`

### Preview

Frontend:

1. takes `confirmed.snapshot`
2. builds a typed command
3. executes the shared core locally
4. stores `dragPreview`
5. renders preview snapshot

### Commit

Frontend sends:

```ts
type CommitProjectCommandRequest = {
  clientRequestId: string;
  baseVersion: number;
  command: ProjectCommand;
};
```

Server:

1. validates `baseVersion`
2. loads project snapshot
3. executes command through shared core
4. persists full canonical result
5. writes event
6. bumps version
7. returns canonical snapshot and `newVersion`

Frontend:

1. matches `clientRequestId`
2. replaces `confirmed` with server response
3. removes pending command
4. clears or rebuilds preview

## Command Surface for First Pass

The minimum supported command set for the remediation pass:

- `move_task`
- `resize_task`
- `create_task`
- `delete_task`
- `update_task_fields`
- `reparent_task`
- `reorder_task`
- `create_dependency`
- `remove_dependency`
- `change_dependency_lag`

Important decision:

`rename/progress/color/parent/edit metadata` must not piggyback on `move_task`.

There must be an explicit non-scheduling command for semantic task edits, for example:

```ts
type UpdateTaskFieldsCommand = {
  type: 'update_task_fields';
  taskId: string;
  changes: {
    name?: string;
    color?: string | null;
    progress?: number;
    parentId?: string | null;
  };
};
```

If a UI edit changes both fields and schedule, either:

- commit as two clear commands, or
- define a composite command explicitly

But do not infer everything from a raw patch body.

## Server Requirements

### 1. Load endpoint must return versioned truth

Normal authenticated project load must return version and snapshot together.

The frontend cannot operate a command protocol while booting from `tasks[]` without version.

### 2. `CommandService` must persist full semantic result

For supported commands:

- update all changed task fields that belong to the command semantics
- update dependencies when changed
- update hierarchy fields when changed
- create/delete rows when command semantics require it
- compute patches from true before/after persisted state

Accepted command flow must never silently drop parts of the change.

### 3. Legacy task routes become adapters or are removed

Preferred outcome:

- normal UI stops using `/api/tasks` mutation routes
- only `/api/commands/commit` is used for authenticated user edits

If compatibility is temporarily necessary:

- `/api/tasks/:id` translates into an explicit command server-side
- it must not partially persist the request body

### 4. No fallback from command path to patch path

If command commit fails:

- surface the failure
- do not silently retry via raw patch/update

Fallback hides architectural defects and reintroduces non-deterministic behavior.

## Frontend Requirements

### 1. One source of confirmed truth

The frontend store must hold:

```ts
type ProjectState = {
  confirmed: {
    version: number;
    snapshot: ProjectSnapshot;
  };
  pending: Array<{
    requestId: string;
    baseVersion: number;
    command: ProjectCommand;
  }>;
  dragPreview?: {
    command: ProjectCommand;
    snapshot: ProjectSnapshot;
  };
};
```

### 2. Visible state must derive from protocol state

- if `dragPreview` exists, render it
- else render `confirmed + replay(pending)`

No separate ad hoc task state should become the mutation truth-path for authenticated project mode.

### 3. UI hooks must stop choosing between incompatible persistence models

`useBatchTaskUpdate` and related hooks currently branch between:

- command commit
- single PATCH
- batch PUT

This branching must be removed for normal project mode.

Instead, hooks should:

- detect user intent
- build command
- commit command
- apply authoritative response

### 4. Optimistic UI remains display-only

Optimistic state is allowed.

But:

- optimistic state is not truth
- the server response always wins

## Migration Strategy

### Phase A. Establish authoritative load contract

- add versioned project load response
- hydrate `useProjectStore.confirmed`
- stop relying on `version = 0` default in authenticated mode

Exit criteria:

- frontend has real `confirmed.version`
- first command can be committed without synthetic version guessing

### Phase B. Make command commit correct for supported commands

- add `update_task_fields`
- ensure `create_task`, `delete_task`, and schedule commands persist full semantics
- remove accepted-but-not-persisted behavior

Exit criteria:

- no accepted command silently drops task field changes

### Phase C. Cut UI over to command-only normal edits

- change task create/edit/delete/move/resize to use command commit only
- remove fallback to raw `PATCH`
- disable `PUT /api/tasks` for normal authenticated editing

Exit criteria:

- normal UI edits no longer depend on legacy mutation routes

### Phase D. Implement preview/confirmed/pending replay properly

- local preview via shared core
- pending replay via shared core
- authoritative ack updates confirmed state

Exit criteria:

- preview and commit use the same command language and core

### Phase E. Handle legacy and import paths separately

- migrate import/batch flows to commands or explicit command batches
- keep legacy adapters only where intentionally scoped

Exit criteria:

- no hidden bypass around the command model remains in active product flows

## Acceptance Criteria

1. Editing a task name persists correctly and survives reload.
2. Creating a task persists correctly and survives reload.
3. Moving a linked task persists the cascade correctly and survives reload.
4. Resizing a linked task persists the cascade correctly and survives reload.
5. Deleting a task persists correctly and survives reload.
6. The server never returns accepted for a command whose semantic changes were not persisted.
7. The frontend does not use raw patch/batch save routes for normal authenticated edits.
8. The frontend loads and stores the real project version before sending commands.
9. `baseVersion` conflicts are explicit and do not masquerade as generic save failures.
10. Preview and commit for `move_task` and `resize_task` use the same shared core import.

## Implementation Notes

### What not to do

- do not keep layering fixes on top of `PATCH /api/tasks/:id` schedule detection
- do not let one request body produce half command semantics and half legacy persistence
- do not keep batch PUT as a hidden fast path for normal editing
- do not compare snapshots to decide truth
- do not let frontend “succeed” before a canonical server response exists

### What to optimize for

- correctness first
- one obvious truth path
- explicit intent per mutation
- minimal ambiguity in route behavior

## Success Definition

This remediation is successful when a developer can explain the normal edit flow in one sentence:

> The UI builds a typed command, the server commits it through `CommandService` using `gantt-lib/core/scheduling`, persists the canonical result, bumps version, and the frontend adopts that response as truth.

If any normal edit path still needs a second sentence to explain a legacy exception, the remediation is not done.
