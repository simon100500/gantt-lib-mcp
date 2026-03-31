# Phase 36: Unified Scheduling Core — Context

**Gathered:** 2026-03-31
**Status:** Ready for planning
**Source:** PRD Express Path (`.planning/reference/unified-scheduling-core-prd.md`)

<domain>
## Phase Boundary

Phase 36 delivers a **single scheduling authority model** for all mutation channels. Every meaningful project change is expressed as a typed command. The same `gantt-lib/core/scheduling` executes that command identically in frontend preview, server commit, MCP agent tools, and import pipelines. The server is the persistence truth. The result is deterministic, explainable, versioned, and replayable.

Builds directly on Phase 35 (Scheduling Core Adoption), which already replaced the local scheduler and wired MCP/server to `gantt-lib` scheduling semantics. Phase 36 adds:
- command-driven mutation model (replacing raw field-level patches)
- project versioning (monotonic version counter)
- event log (`ProjectEvent` records per commit)
- optimistic concurrency (`baseVersion` on commit)
- preview/commit parity enforcement
- full channel migration (MCP, import, batch)

</domain>

<decisions>
## Implementation Decisions

### Command Model (LOCKED — from PRD)
- All mutation surface must be command-based; raw field-level updates become internal compatibility shims only
- Required commands: `move_task`, `resize_task`, `set_task_start`, `set_task_end`, `change_duration`, `create_task`, `delete_task`, `create_dependency`, `remove_dependency`, `change_dependency_lag`, `recalculate_schedule`, `reparent_task`, `reorder_task`
- Commands describe **intent**, not low-level persistence mutations
- Changing task dates must **not** silently mutate dependency lag
- Every committed command must produce: changed entities, conflicts, reasons, final snapshot or patch set

### Scheduling Behavior (LOCKED — from PRD)
- Dependency type remains unchanged unless explicitly modified
- Lag remains unchanged unless modified by a lag command
- Full cascade: if a predecessor moves, the entire affected chain recalculates
- Strongest constraint wins for multiple predecessors
- Business-day and calendar-day logic must behave identically in preview and commit
- Parent summary ranges must recalculate identically in preview and commit
- Manual/locked tasks must not silently auto-move — either block or produce explicit conflict

### Data Model (LOCKED — from PRD)
- Each project has a monotonic version number
- `ProjectEvent` schema:
  ```ts
  type ProjectEvent = {
    id: string;
    projectId: string;
    version: number;
    actorType: 'user' | 'agent' | 'system' | 'import';
    actorId?: string;
    command: { type: string; payload: unknown };
    result: {
      changedTaskIds: string[];
      changedDependencyIds: string[];
      conflicts: Array<{ code: string; message: string }>;
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
- `ScheduleExecutionResult` must include: snapshot, changedTaskIds, changedDependencyIds, conflicts, patches with typed reason (`direct_command` | `dependency_cascade` | `calendar_snap` | `parent_rollup` | `constraint_adjustment`)

### Concurrency Model (LOCKED — from PRD)
- Commit request carries `baseVersion: number`
- Server verifies `baseVersion` matches current project version before executing
- Server increments version atomically after successful execution
- Response includes `applied: boolean`, `projectVersion: number`, `result: ScheduleExecutionResult`, optional `mismatch`

### Server Channel (LOCKED — from PRD)
- Expose command-based mutation endpoint(s)
- Load snapshot from DB, execute with shared core, persist final truth
- Persist event log per committed command
- Bump version atomically
- Must NOT patch linked task dates directly without core execution
- Must NOT use alternative scheduling implementations

### MCP / Agent Channel (LOCKED — from PRD)
- Prefer intent-level commands over raw date patches
- Stop thinking in raw dates when dependencies matter
- Must NOT claim only one task changed if cascade changed many
- Must NOT use raw `update_task` for dependency-sensitive edits unless intentionally standalone

### Frontend Channel (LOCKED — from PRD)
- Build commands from user interactions (drag, resize, form, dependency edits)
- Use same core for local preview
- Apply server truth after commit, clear preview state
- Surface preview vs commit mismatches for diagnostics
- Must NOT persist raw guessed cascades as authoritative state

### Import Channel (LOCKED — from PRD)
- Translate imported changes into commands or command batches
- Run through same core execution path
- Produce versioned event records
- Must NOT write task rows directly as bypass around scheduling

### Out of Scope (LOCKED — from PRD)
- Full multiplayer OT/CRDT collaboration
- Permissions redesign
- Billing/plan enforcement changes unrelated to scheduling
- Visual history UI beyond basic event persistence
- Full undo/redo UI
- Semantic redesign of dependency logic beyond current intended scheduling model

### Claude's Discretion
- Migration order within the phase (recommend following the 6-phase plan from PRD: stabilize core export → replace server scheduler → command endpoint → frontend parity → import parity → explainability)
- Whether to split into multiple PLAN.md files per migration phase or consolidate
- Specific endpoint names/paths for command mutation API
- Prisma schema migration strategy for `ProjectEvent` and project version field
- Exact TypeScript interface locations within the monorepo

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Predecessor PRD (Phase 35 foundation)
- `.planning/reference/scheduling-core-adoption-prd.md` — Phase 35 PRD; defines the scheduling core already in place, server/MCP alignment achieved before Phase 36

### This Phase PRD (full requirements)
- `.planning/reference/unified-scheduling-core-prd.md` — Complete PRD for Phase 36; all acceptance criteria, data models, command model, and channel requirements

### Project Architecture
- `.planning/STATE.md` — Current project state and architecture snapshot
- `.planning/ROADMAP.md` — Phase 35 completed plans for context on what's already built

### Key Source Files (verify current state before planning)
- `packages/mcp/src/scheduler.ts` — Current scheduler implementation (Phase 35 adopted gantt-lib core here)
- `packages/server/src/` — Server API handlers for task mutations
- `packages/web/src/` — Frontend store and mutation paths

</canonical_refs>

<specifics>
## Specific Ideas

### Acceptance Criteria (from PRD — must all be TRUE on completion)

**Functional:**
1. Same snapshot + command yields same result in frontend preview and server commit
2. `move_task` through UI and MCP yields the same cascade
3. Linked date changes do not silently mutate lag
4. Multiple predecessor constraints use the strongest valid constraint
5. Business-day behavior matches in preview and commit
6. Parent summary ranges match in preview and commit
7. Import path uses the same core as direct UI/API/MCP edits
8. Server stores versioned `ProjectEvent` records for committed mutations
9. Commit uses optimistic concurrency based on `baseVersion`
10. System returns explicit conflicts instead of masking invalid states

**Technical:**
1. `gantt-lib-mcp` no longer has an independent authoritative scheduler implementation
2. `gantt-lib/core/scheduling` is the single execution engine
3. Test suite verifies parity across channels
4. Event logs include command, result summary, and patches
5. Replay of a historical event against its base snapshot reproduces the stored result

### Required Tests (from PRD)
**Core tests:** FS/SS/FF/SF, positive lag, negative lag, multiple predecessors, chain cascade, business-day mode, calendar-day mode, parent rollup, locked/manual conflict, deterministic result ordering, patch reason generation

**Parity tests:** same command on frontend snapshot vs server snapshot, drag preview vs commit result, MCP `move_task` vs UI move, import command batch vs direct API command

**Concurrency tests:** commit with stale `baseVersion`, commit with current `baseVersion`, replay exact event on historical snapshot

### Non-Negotiable Invariants
1. One command engine
2. One authoritative persisted result
3. One concurrency model
4. No hidden lag rewrites
5. No separate scheduling rules by channel
6. Every committed change is explainable

</specifics>

<deferred>
## Deferred Ideas

- Full multiplayer OT/CRDT collaboration
- Permissions redesign
- Billing/plan enforcement changes unrelated to scheduling
- Visual history UI beyond basic event persistence
- Full undo/redo UI (foundation only in this phase)
- Semantic redesign of dependency logic beyond current intended scheduling model

</deferred>

---

*Phase: 36-unified-scheduling-core*
*Context gathered: 2026-03-31 via PRD Express Path*
