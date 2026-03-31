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

> Every meaningful project change is expressed as a command.  
> The same scheduling core executes that command in preview and commit.  
> The server is the persistence truth.  
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

## Correct Execution Chain

### Preview flow

Frontend:

1. reads current `snapshot` and `version` from store
2. builds a domain command
3. calls `core.execute(command, snapshot, options)`
4. renders preview from returned result
5. stores preview metadata for later reconciliation

### Commit flow

Frontend:

1. sends `command + baseVersion`
2. may include local preview metadata only for diagnostics, never as truth

Server:

1. loads snapshot from DB
2. verifies `baseVersion`
3. calls `core.execute(command, snapshot, options)`
4. persists updated snapshot
5. persists event log record
6. increments project version
7. returns authoritative result

Frontend:

1. compares server result with local preview
2. applies server truth
3. clears preview state
4. shows conflicts or mismatch diagnostics if needed

---

## Command Model

The public mutation surface must be command-based.

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

```ts
type ProjectEvent = {
  id: string;
  projectId: string;
  version: number;
  actorType: 'user' | 'agent' | 'system' | 'import';
  actorId?: string;
  command: {
    type: string;
    payload: unknown;
  };
  result: {
    changedTaskIds: string[];
    changedDependencyIds: string[];
    conflicts: Array<{
      code: string;
      message: string;
    }>;
  };
  patches: Array<{
    entityType: 'task' | 'dependency';
    entityId: string;
    before: unknown;
    after: unknown;
    reason: string;
  }>;
  createdAt: string;
};
```

## Result model

The core result must evolve toward a structure like:

```ts
type ScheduleExecutionResult = {
  snapshot: {
    tasks: Task[];
    dependencies: Dependency[];
  };
  changedTaskIds: string[];
  changedDependencyIds: string[];
  conflicts: Array<{
    code: string;
    message: string;
    taskId?: string;
    dependencyId?: string;
  }>;
  patches: Array<{
    entityType: 'task' | 'dependency';
    entityId: string;
    before: unknown;
    after: unknown;
    reason:
      | 'direct_command'
      | 'dependency_cascade'
      | 'calendar_snap'
      | 'parent_rollup'
      | 'constraint_adjustment';
  }>;
};
```

## Concurrency contract

Commit request:

```ts
type CommitProjectCommandRequest = {
  projectId: string;
  baseVersion: number;
  command: {
    type: string;
    payload: unknown;
  };
};
```

Server response:

```ts
type CommitProjectCommandResponse = {
  applied: boolean;
  projectVersion: number;
  result: ScheduleExecutionResult;
  mismatch?: {
    expectedVersion: number;
    actualVersion: number;
  };
};
```

---

## Channel-Specific Requirements

## Frontend

Must:

- build commands from user interactions
- use the same core for preview
- stop treating local gantt mutations as final truth
- apply server truth after commit
- surface preview vs commit mismatches for diagnostics

Must not:

- persist raw guessed cascades as authoritative state
- bypass core for linked task edits

## Server API

Must:

- expose command-based mutation endpoint(s)
- load snapshot from DB
- execute with shared core
- persist final truth
- persist event log
- bump version atomically

Must not:

- patch linked task dates directly without core execution
- use alternative scheduling implementations

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

Success:
- all persisted scheduling changes go through command execution

## Phase 4. Frontend preview parity

- build commands from drag, resize, form edits, dependency edits
- use shared core for local preview
- reconcile with server result after commit

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

## Technical

1. `gantt-lib-mcp` no longer has an independent authoritative scheduler implementation.
2. `gantt-lib/core/scheduling` is the single execution engine.
3. Test suite verifies parity across channels.
4. Event logs include command, result summary, and patches.
5. Replay of a historical event against its base snapshot reproduces the stored result.

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

---

## Non-Negotiable Invariants

1. One command engine.
2. One authoritative persisted result.
3. One concurrency model.
4. No hidden lag rewrites.
5. No separate scheduling rules by channel.
6. Every committed change is explainable.

---

## Value to GetGantt

This gives you:

- explainable agent actions
- real event history
- replay/debug capability
- a solid undo/redo foundation
- safer collaboration through optimistic concurrency
- predictable UX: one graph, one logic, one result
