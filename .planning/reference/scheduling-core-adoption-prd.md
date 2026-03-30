# PRD: Scheduling Core Adoption for getgantt.ru (`gantt-lib-mcp`)

## Context

`gantt-lib-mcp` already has backend scheduling in [packages/mcp/src/scheduler.ts](/D:/Projects/gantt-lib-mcp/packages/mcp/src/scheduler.ts), but its behavior is not aligned with the current client-side logic embedded in `gantt-lib`. In practice this creates a product bug:

- the UI can preserve or recompute lag in some edit flows
- the agent and MCP tools update task dates at the record level
- server-side cascading is incomplete relative to the library behavior
- linked tasks can drift because the backend is not executing the same schedule rules as the chart library

This repo must become the authoritative execution layer for schedule mutations used by AI, MCP tools, and persisted UI commits.

## Product Goal

When a user or agent moves a linked task in getgantt.ru, the server should apply the same scheduling rules every time and persist the resulting cascade. The goal is not to redesign `gantt-lib` behavior. The goal is to duplicate its current scheduling semantics on the server as a reusable headless engine.

Success means:

- linked task movement behaves deterministically on the server
- AI-agent actions no longer mutate a single task in isolation when dependencies require a cascade
- the persisted result matches the library's current logic closely enough that UI and backend stop fighting each other
- `gantt-lib` remains the source of behavioral truth during the migration period

## Non-Goals

- no semantic rewrite of dependency behavior
- no forced migration to a pure `start + duration` data model
- no attempt to make `gantt-lib-mcp` invent new scheduling rules before `gantt-lib` is stabilized
- no big-bang replacement of all task CRUD APIs at once

## User Problems

1. The agent can move a task date without moving dependent tasks the same way the chart would.
2. A dependency may stay visually valid in the library but persist incorrectly after backend save.
3. Users see lag and date behavior differ between drag/drop, inline edits, and AI commands.
4. Server-side scheduling currently depends on a simplified model and does not fully reflect `gantt-lib` business-day and dependency behavior.

## Functional Requirements

### 1. Server-side scheduling engine

Create a headless scheduling module inside this repo that mirrors the current scheduling logic from `gantt-lib` without bringing in React or DOM concerns.

The module must support:

- dependency types `FS`, `SS`, `FF`, `SF`
- positive and negative lag
- `business` and `calendar` day modes
- range building from `start + duration` and `end + duration`
- task move operations that preserve task duration
- cascade across dependency successors
- parent/child movement handling where required by current `gantt-lib` behavior
- cycle detection and missing dependency validation

### 2. Command-level schedule mutations

Add schedule-oriented server operations instead of relying only on raw field updates.

Required command surface:

- `move_task`
- `resize_task`
- `recalculate_schedule`

Expected behavior:

- moving a linked task uses cascade semantics by default
- resizing a linked task updates downstream tasks according to current library rules
- raw `update_task(startDate/endDate)` should internally route through the scheduling engine when links are present

### 3. Persisted authoritative result

After a scheduling command, the server must:

- load a full task snapshot for the project
- execute the scheduling command in the headless engine
- persist all changed task dates transactionally
- recompute parent summary ranges after affected child changes
- return changed task ids and patch-like result metadata

### 4. Agent integration

Update the agent-facing contract so that schedule moves are expressed as intent, not as arbitrary low-level date rewrites.

Required changes:

- agent prompt should prefer movement-based scheduling actions over direct date mutation
- tool descriptions should clarify that dependency-linked tasks trigger cascade
- mutation verification should compare all affected tasks, not just the edited task

### 5. UI commit integration

During migration, the server result must be treated as authoritative for persisted changes.

This repo must support a flow where:

- UI sends a scheduling intent or a date edit
- server maps it to schedule execution
- server returns the final affected tasks
- web client applies the returned state

## Technical Scope

### New internal module

Add a reusable scheduling module under `packages/mcp/src/` or a small internal workspace. It should expose pure functions and types only.

Suggested capabilities:

- schedule snapshot types
- date math helpers
- lag calculation helpers
- dependency traversal helpers
- schedule command execution
- patch/conflict result types

### Existing code to replace or wrap

- [packages/mcp/src/scheduler.ts](/D:/Projects/gantt-lib-mcp/packages/mcp/src/scheduler.ts)
- [packages/mcp/src/services/task.service.ts](/D:/Projects/gantt-lib-mcp/packages/mcp/src/services/task.service.ts)
- MCP tool handlers in [packages/mcp/src/index.ts](/D:/Projects/gantt-lib-mcp/packages/mcp/src/index.ts)
- agent guidance in [packages/mcp/agent/prompts/system.md](/D:/Projects/gantt-lib-mcp/packages/mcp/agent/prompts/system.md) and [packages/server/src/agent.ts](/D:/Projects/gantt-lib-mcp/packages/server/src/agent.ts)

### Compatibility constraints

- keep public task DTOs compatible with current `startDate/endDate`
- `duration` may be introduced as an internal computed value and optional input, but not as the only persisted public contract
- do not require `gantt-lib` to change first; this repo should be able to mirror current behavior from a copied or synced headless implementation

## Rollout Plan

### Phase 1. Mirror current `gantt-lib` behavior

- port the relevant pure scheduling logic from `gantt-lib`
- add exhaustive server tests against known dependency and business-day scenarios
- keep current MCP tool surface, but route linked date changes through the new engine

### Phase 2. Expose schedule commands explicitly

- add dedicated `move_task` and `resize_task` tools or API endpoints
- shift agent prompts to use command semantics first
- retain `update_task` for compatibility

### Phase 3. Server-authoritative UI persistence

- ensure frontend save flows apply the server-returned final state
- reduce any remaining local-only scheduling commits

## Acceptance Criteria

- Moving a predecessor task on the server moves all required downstream tasks by current library rules.
- Business-day calculations on the server match current library behavior for the same task graph.
- Direct AI-driven date mutations on linked tasks no longer silently produce lag drift.
- For the same input snapshot and command, server and library produce equivalent resulting task ranges on covered scenarios.
- Parent tasks remain aggregated from child ranges after server-side cascade.

## Test Requirements

Required automated cases:

- FS, SS, FF, SF with zero lag
- FS, SS, FF, SF with positive lag
- negative lag, including bounded FS overlap behavior
- cascade chain of at least 4 tasks
- multiple predecessors on one successor
- business-day and calendar-day variants of the same dependency graph
- parent move with children
- parent summary recomputation after child cascade
- cycle detection
- missing dependency reference
- agent-level mutation verification for multi-task changes

## Risks

- Copying logic from `gantt-lib` can drift if the library changes again without a sync process.
- Some `gantt-lib` behavior is currently entangled with UI flows; the server port must isolate only domain logic.
- If UI continues committing locally calculated results without reconciling with server output, divergence will persist.

## Open Implementation Rules

- Preserve current `gantt-lib` scheduling semantics unless there is a documented bugfix.
- Treat `gantt-lib` as the temporary behavioral reference until both sides share a single headless implementation.
- Prefer headless pure functions over service-embedded ad hoc scheduling logic.
