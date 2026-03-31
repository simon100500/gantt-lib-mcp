# PRD: Unified Scheduling Core and Command-Driven Project Mutations

## Status

Proposed

## Owner

GetGantt core platform

## Problem

Today the system still has multiple mutation paths and multiple scheduling behaviors:

- frontend preview behavior can differ from persisted server behavior
- some flows still think in terms of raw `startDate/endDate` field rewrites
- server, MCP, import, and UI do not yet all run through one identical command execution path
- auditability is weak: we can see final task state, but not always the exact command, cascade, and reasons

This creates product risk:

- linked tasks may behave differently depending on who changed them
- preview and commit can diverge
- agent actions are less explainable than they should be
- concurrency and replay are harder than necessary
- undo/redo remains fragile

## Product Goal

Move GetGantt to a single scheduling authority model:

> Every meaningful project change is expressed as a typed command.  
> The same scheduling core executes that command in preview and commit.  
> The server is the only authority that confirms truth.  
> The result is deterministic, explainable, versioned, and replayable.

## Core Principle

The system must stop thinking:

- "update fields on one row"

and instead think:

- "apply a command to the project graph"

The scheduling core is responsible for:

- dependency preservation
- lag preservation
- cascade recalculation
- calendar/business-day logic
- hierarchy rollups
- conflict detection
- producing an explainable result

## Architectural Position

This design is intentionally **not full event sourcing**.

The target model is:

- canonical current state is stored as normalized project snapshot in the database
- every accepted command also writes a compact event log entry
- event log is used for audit, replay, diagnostics, and future undo/redo foundations
- full historical reconstruction from log alone is not required

This is a **snapshot + log** architecture, not a pure append-only event store.

## Primary Success Criterion

The same input snapshot plus the same command must produce the same result in:

- frontend preview
- frontend commit
- MCP agent flow
- REST/API flow
- import flow
- system automation flow

## Target UX Rule

When a linked task changes:

- dependency types remain intact
- lag remains intact unless explicitly changed by command
- auto-scheduled downstream tasks are recalculated through the whole chain
- manual/locked tasks do not silently move; they produce conflicts or blocking behavior
- preview and persisted result match

## In Scope

- one shared scheduling core imported from `gantt-lib/core/scheduling`
- command-driven mutation model across all channels
- project versioning
- event log
- patch/result explanation
- optimistic concurrency with `baseVersion`
- preview/commit parity
- migration of existing mutation flows to command execution

## Out of Scope

- full multiplayer OT/CRDT collaboration
- permissions redesign
- billing/plan enforcement changes unrelated to scheduling
- visual history UI beyond basic event persistence
- full undo/redo UI in this phase
- semantic redesign of dependency logic beyond current intended scheduling model

---

## Desired Architecture

## Shared Core

The only scheduling engine must be the exported core from `gantt-lib`.

Consumers:

- frontend preview
- server commit
- MCP agent tools
- import pipeline
- system/internal automation

No separate local scheduler implementation should remain as an authoritative path.

## Server Truth Rule

Truth is not derived by comparing snapshots heuristically.

Truth is:

- a server response
- for a specific accepted command
- applied to a specific `baseVersion`
- returning a new persisted `version`

The frontend may predict.
The server confirms.

The frontend must never decide truth by saying:

- "the local preview looks close enough"
- "the snapshots are almost the same"

Snapshot comparison is allowed only for:

- debugging
- telemetry
- mismatch diagnostics

It must not be used as the business rule for accepting state.

## Correct Execution Chain

### Preview flow

Frontend:

1. reads `confirmedSnapshot` and `confirmedVersion` from store
2. builds a typed domain command
3. calls `core.execute(command, confirmedSnapshot, options)`
4. renders a temporary `previewSnapshot`
5. stores preview metadata only as local prediction

Preview is not truth. It is local prediction from the same core.

### Commit flow

Frontend:

1. on drop/submit, creates `clientRequestId`
2. sends `command + baseVersion + clientRequestId`
3. may continue displaying optimistic predicted state
4. must keep `confirmed`, `pending`, and `preview` as separate concepts

Server:

1. loads snapshot from DB
2. verifies `baseVersion`
3. calls `core.execute(command, snapshot, options)`
4. if command is accepted, persists canonical updated snapshot
5. persists event log record
6. increments project version
7. returns `accepted + baseVersion + newVersion + canonical result + canonical snapshot`

Frontend:

1. matches by `clientRequestId`
2. verifies that the response corresponds to the pending command
3. accepts the server snapshot as truth
4. updates `confirmedSnapshot` and `confirmedVersion`
5. removes the matching pending command
6. clears or rebuilds local preview
7. may log preview-vs-server mismatch for diagnostics

## Frontend State Model

The frontend must keep three separate layers of project state:

### 1. Confirmed

Last persisted server-confirmed truth:

```ts
type ConfirmedProjectState = {
  version: number;
  snapshot: ProjectSnapshot;
};
```

### 2. Preview

Temporary local prediction during drag/resize/edit before submit:

```ts
type DragPreviewState = {
  command: ProjectCommand;
  snapshot: ProjectSnapshot;
};
```

### 3. Pending optimistic

Commands already sent to the server but not yet confirmed:

```ts
type PendingCommand = {
  requestId: string;
  baseVersion: number;
  command: ProjectCommand;
};
```

### Recommended project store shape

```ts
type ProjectState = {
  confirmed: ConfirmedProjectState;
  pending: PendingCommand[];
  dragPreview?: DragPreviewState;
};
```

### Visible snapshot rule

The rendered project should be derived like this:

```ts
function getVisibleSnapshot(state: ProjectState): ProjectSnapshot {
  if (state.dragPreview) return state.dragPreview.snapshot;

  let snapshot = state.confirmed.snapshot;

  for (const pending of state.pending) {
    snapshot = executeCommand(snapshot, pending.command).snapshot;
  }

  return snapshot;
}
```

This keeps the model clean:

- `confirmed` is truth
- `preview` is temporary prediction
- `pending` is optimistic overlay

---

## Command Model

The public mutation surface must be command-based.
Commands must be strongly typed.

Examples:

- `move_task`
- `resize_task`
- `set_task_start`
- `set_task_end`
- `change_duration`
- `create_task`
- `delete_task`
- `create_dependency`
- `remove_dependency`
- `change_dependency_lag`
- `recalculate_schedule`
- `reparent_task`
- `reorder_task`

Raw field-level updates like "patch startDate and endDate directly" must become internal compatibility shims only.

`command.payload: unknown` is not acceptable as the runtime contract for the internal architecture.
Persisted JSON may be stored generically, but the application layer must use a discriminated union.

Example:

```ts
type ProjectCommand =
  | { type: 'move_task'; taskId: string; deltaWorkingDays?: number; startDate?: string; mode: 'cascade' | 'strict' }
  | { type: 'resize_task'; taskId: string; anchor: 'start' | 'end'; date: string; mode: 'cascade' | 'strict' }
  | { type: 'set_task_start'; taskId: string; startDate: string; mode: 'cascade' | 'strict' }
  | { type: 'change_duration'; taskId: string; duration: number; mode: 'cascade' | 'strict' }
  | { type: 'create_dependency'; taskId: string; dependency: TaskDependency }
  | { type: 'change_dependency_lag'; taskId: string; dependencyTaskId: string; lag: number }
  | { type: 'recalculate_schedule'; taskId?: string };
```

## Command Rules

### Rule 1

Commands describe intent, not low-level persistence mutations.

### Rule 2

Changing task dates must not silently mutate dependency lag.

### Rule 3

If a change would affect linked tasks, the command must go through core execution.

### Rule 4

Every committed command must produce:

- changed entities
- conflicts
- reasons
- final snapshot or patch set

### Rule 5

The UI must not use `changedTasks -> persist` as its target architecture.
The UI must produce intent commands.
Any `changedTasks` compatibility layer is transitional only.

---

## Scheduling Behavior Requirements

## 1. Dependency preservation

For linked tasks:

- dependency type remains unchanged
- lag remains unchanged unless explicitly modified by a lag command

## 2. Full cascade

If a predecessor moves, the entire affected chain must recalculate.

## 3. Strongest constraint wins

For multiple predecessors, the successor must obey the strictest resulting constraint.

## 4. Calendar parity

Business-day and calendar-day logic must behave identically in preview and commit.

## 5. Hierarchy parity

Parent summary ranges must recalculate identically in preview and commit.

## 6. Manual/locked task handling

Manual or locked tasks must not silently auto-move.

Expected behavior:

- either block
- or produce explicit conflict
- but never mutate invisibly

## 7. Explainability

Every changed task in the result should be attributable to:

- direct command effect
- dependency cascade
- parent rollup
- calendar snap
- constraint resolution

---

## Data Model

## Project version

Each project must have a monotonic version.

Used for:

- optimistic concurrency
- replay
- mismatch detection
- debug

## Event model

Event log exists to support:

- audit trail
- replay/debug
- explainability
- future undo/redo foundations

It does not replace canonical current project state in the database.

```ts
type ProjectEvent = {
  id: string;
  projectId: string;
  baseVersion: number;
  version: number;
  applied: boolean;
  actorType: 'user' | 'agent' | 'system' | 'import';
  actorId?: string;
  coreVersion: string;
  command: ProjectCommand;
  result: {
    changedTaskIds: string[];
    changedDependencyIds: string[];
    conflicts: Conflict[];
  };
  patches: Patch[];
  executionTimeMs: number;
  createdAt: string;
};
```

Where:

```ts
type Conflict = {
  code: string;
  message: string;
  taskId?: string;
  dependencyId?: string;
};

type Patch = {
  entityType: 'task' | 'dependency';
  entityId: string;
  before: JsonValue;
  after: JsonValue;
  reason:
    | 'direct_command'
    | 'dependency_cascade'
    | 'calendar_snap'
    | 'parent_rollup'
    | 'constraint_adjustment';
};
```

## Result model

The core result must evolve toward a structure like:

```ts
type ScheduleExecutionResult = {
  snapshot: ProjectSnapshot;
  changedTaskIds: string[];
  changedDependencyIds: string[];
  conflicts: Conflict[];
  patches: Patch[];
};
```

The server should return both:

- canonical `snapshot`
- canonical `patches`

At least in the first implementation.

Why:

- `snapshot` makes it trivial for the frontend to accept truth
- `patches` make the mutation explainable and loggable

Patch-only responses may be considered later as an optimization, not as the first target.

## Concurrency contract

Commit request:

```ts
type CommitProjectCommandRequest = {
  projectId: string;
  clientRequestId: string;
  baseVersion: number;
  command: ProjectCommand;
};
```

Server response:

```ts
type CommitProjectCommandResponse =
  | {
      clientRequestId: string;
      accepted: true;
      baseVersion: number;
      newVersion: number;
      result: ScheduleExecutionResult;
      snapshot: ProjectSnapshot;
    }
  | {
      clientRequestId: string;
      accepted: false;
      reason: 'version_conflict' | 'validation_error' | 'conflict';
      currentVersion: number;
      snapshot?: ProjectSnapshot;
      conflicts?: Conflict[];
    };
```

## Commit Semantics

The first implementation should forbid partial apply.

That means:

- either the command is accepted and the full canonical result is committed
- or the command is rejected and nothing is persisted

Partial apply is explicitly out of scope for the first version because it complicates:

- mental model
- event semantics
- replay
- optimistic UI
- undo/redo

---

## Channel-Specific Requirements

## Frontend

Must:

- build commands from user interactions
- use the same core for preview
- stop treating local gantt mutations as final truth
- keep `confirmed`, `pending`, and `preview` state separated
- render visible state as `confirmed + replay(pending)` unless drag preview is active
- apply server truth after commit acknowledgement
- surface preview vs commit mismatches for diagnostics only

Must not:

- persist raw guessed cascades as authoritative state
- bypass core for linked task edits
- treat snapshot comparison as the rule for accepting truth

## Server API

Must:

- expose command-based mutation endpoint(s)
- load snapshot from DB
- execute with shared core
- persist final truth
- persist event log
- bump version atomically
- only respond success after DB state, event log, and version bump are committed in one transaction

Must not:

- patch linked task dates directly without core execution
- use alternative scheduling implementations
- acknowledge success before canonical persistence finishes

## MCP / Agent

Must:

- prefer intent-level commands
- stop thinking in raw dates when dependencies matter
- receive authoritative result and full changed set
- be able to explain cascade in user-visible terms

Must not:

- claim only one task changed if cascade changed many
- use raw `update_task` for dependency-sensitive edits unless intentionally standalone

## Import

Must:

- translate imported changes into commands or command batches
- run through the same core execution path
- produce versioned event records
- preserve parity with other mutation channels

Must not:

- write task rows directly as a bypass around scheduling

Command batches, if introduced, must remain domain-shaped and limited.
They must not become a loophole for "send arbitrary changed rows".

---

## Migration Plan

## Phase 1. Export and stabilize shared core

- finalize `gantt-lib/core/scheduling` public API
- export stable command/result types
- ensure non-React consumers can import it cleanly
- add packaging/tests for subpath export

Success:
- server and frontend can both import the same core package path

## Phase 2. Replace local server scheduler

- remove `gantt-lib-mcp` local authoritative scheduler path
- switch server execution to imported `gantt-lib/core/scheduling`
- keep compatibility adapters only where necessary

Success:
- server/MCP use shared core, not copied code

## Phase 3. Command-first server endpoint

- add or standardize command commit endpoint
- persist versioned project events
- return authoritative execution result
- support optimistic concurrency with `baseVersion`
- support `clientRequestId`
- standardize accepted/rejected response protocol

Success:
- all persisted scheduling changes go through command execution

## Phase 4. Frontend preview parity

- build commands from drag, resize, form edits, dependency edits
- use shared core for local preview
- reconcile with server result after commit
- introduce `confirmed/pending/preview` state layers
- compute visible state by replaying pending commands over confirmed baseline

Success:
- preview and commit match for same snapshot + command

## Phase 5. Import and batch parity

- route import/batch update flows through command execution
- remove scheduler-bypass persistence paths

Success:
- import no longer mutates the graph through a separate logic path

## Phase 6. Explainability and replay

- persist `patches` and conflict metadata
- add replay tooling for debug
- prepare undo/redo foundation

Success:
- every committed mutation is inspectable and replayable

---

## Acceptance Criteria

## Functional

1. The same snapshot + command yields the same result in frontend preview and server commit.
2. `move_task` through UI and MCP yields the same cascade.
3. Linked date changes do not silently mutate lag.
4. Multiple predecessor constraints use the strongest valid constraint.
5. Business-day behavior matches in preview and commit.
6. Parent summary ranges match in preview and commit.
7. Import path uses the same core as direct UI/API/MCP edits.
8. Server stores versioned `ProjectEvent` records for committed mutations.
9. Commit uses optimistic concurrency based on `baseVersion`.
10. The system returns explicit conflicts instead of masking invalid states.
11. Frontend accepts truth by protocol (`accepted + newVersion + canonical snapshot`), not by snapshot heuristics.
12. Frontend visible state is derived from `confirmed + replay(pending)` or active drag preview.

## Technical

1. `gantt-lib-mcp` no longer has an independent authoritative scheduler implementation.
2. `gantt-lib/core/scheduling` is the single execution engine.
3. Test suite verifies parity across channels.
4. Event logs include command, result summary, and patches.
5. Replay of a historical event against its base snapshot reproduces the stored result.
6. The system does not require full event-sourced reconstruction to serve current state.

---

## Required Tests

## Core tests

- FS/SS/FF/SF
- positive lag
- negative lag
- multiple predecessors
- chain cascade
- business-day mode
- calendar-day mode
- parent rollup
- locked/manual conflict behavior
- deterministic result ordering
- patch reason generation

## Parity tests

- same command on frontend snapshot vs server snapshot
- drag preview vs commit result
- MCP `move_task` vs UI move
- import command batch vs direct API command

## Concurrency tests

- commit with stale `baseVersion`
- commit with current `baseVersion`
- replay exact event on historical snapshot

---

## Risks

- frontend preview and server commit may still drift if they do not share exactly the same adapter layer around core
- event logging can become noisy if command granularity is poorly designed
- import migration may expose legacy assumptions in task persistence
- compatibility shims may linger too long and preserve bypass paths
- pending-command replay can become unstable if command definitions are not deterministic and version-safe
- command batches can accidentally reintroduce row-patch thinking if left underspecified

---

## Non-Negotiable Invariants

1. One command engine.
2. One authoritative persisted result.
3. One concurrency model.
4. No hidden lag rewrites.
5. No separate scheduling rules by channel.
6. Every committed change is explainable.
7. Server-confirmed version is the only truth boundary.
8. Frontend predicts; server confirms.
9. Current state is snapshot-based; history is log-assisted, not event-sourced-only.

---

## Value to GetGantt

This gives you:

- explainable agent actions
- real event history
- replay/debug capability
- a solid undo/redo foundation
- safer collaboration through optimistic concurrency
- predictable UX: one graph, one logic, one result
