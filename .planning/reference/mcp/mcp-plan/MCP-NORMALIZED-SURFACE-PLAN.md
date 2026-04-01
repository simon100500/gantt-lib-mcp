# MCP Normalized Surface Implementation Plan

## Status

Draft

## Purpose

This plan turns the strict MCP normalization PRD into an execution plan.

This is an implementation plan, not a product PRD. It defines:

- what gets removed from the public MCP surface
- what replaces it
- what order to ship in
- what files and contracts are expected to change
- what counts as done

The plan follows the hard requirement already established in the PRD:

> there is no backward-compatible public MCP path for low-level schedule mutations

## Hard Boundary

The implementation must enforce one public MCP mutation surface only.

That means:

- no parallel support for both legacy low-level tools and normalized intent tools
- no public wrappers that preserve old request shapes like direct date patching or dependency-array rewriting
- no prompt guidance that teaches the agent to use raw `parentId`, `dependencies`, `startDate`, or `endDate` mutation flows as the normal scheduling path
- no mutation verification logic that treats request text as a substitute for committed mutation evidence

Internal reuse of existing command or domain services is allowed.

Public preservation of the old MCP contract is not allowed.

## Current Cutover Targets

The current public MCP surface still exposes legacy-first scheduling behavior in these areas:

- `packages/mcp/src/index.ts`
  - public tools still center around `create_task`, `update_task`, `delete_task`, `set_dependency`, `remove_dependency`, `move_task`, `resize_task`, `recalculate_schedule`, `get_tasks`, `get_task`
- `packages/mcp/src/types.ts`
  - public command union still reflects low-level mutation shapes such as `set_task_start`, `set_task_end`, `update_task_fields`, `create_dependency`, `remove_dependency`, `reparent_task`
- `packages/mcp/agent/prompts/system.md`
  - prompt still teaches the agent to start from `get_tasks`, use `update_task`, pass raw `dependencies`, and reason directly in `parentId`
- `packages/server/src/agent.ts`
  - retry and mutation protocol still instruct the model to use the legacy tool set
  - mutation verification is keyed by text intent plus before/after project diff, not by typed mutation tool execution contract

These are the primary cutover points.

## Target Public Surface

The normalized public MCP surface for this phase is:

- `get_project_summary`
- `get_task_context`
- `get_schedule_slice`
- `create_tasks`
- `update_tasks`
- `move_tasks`
- `delete_tasks`
- `link_tasks`
- `unlink_tasks`
- `shift_tasks`
- `recalculate_project`
- `validate_schedule`

### Explicitly removed from the public surface

- `update_task` as a general scheduling mutation entry point
- `move_task`
- `resize_task`
- `set_dependency`
- `remove_dependency`
- `create_dependency`
- `remove_dependency` command semantics in public MCP contracts
- direct `startDate` / `endDate` patching as a normal public MCP edit path
- raw dependency array rewrites as a normal public MCP edit path
- raw hierarchy patching through `parentId` as a public-first mental model
- `get_tasks` as the mandatory default read before every non-trivial edit

## Delivery Strategy

The cutover should happen in four waves.

Do not ship a partial surface where the new tools exist but the old public tools are still presented as equivalent choices.

### Wave 1: Contract foundation

Goal:

- define the new public tool catalog
- define one normalized typed result contract
- define one normalized failure contract
- isolate legacy internals from the new public interface

Implementation scope:

- replace MCP tool declarations in `packages/mcp/src/index.ts`
- introduce new normalized input/output types in `packages/mcp/src/types.ts`
- add shared result builders so every mutation returns the same top-level shape
- keep `CommandService` as the commit boundary
- map normalized tools to existing command types only as a temporary internal adapter

Required contract shape for all mutation tools:

- `status`: `accepted` | `rejected`
- `reason`: machine-readable rejection code when rejected
- `baseVersion`
- `newVersion` when accepted
- `changedTaskIds`
- `changedTasks`
- `changedDependencyIds` when relevant
- `conflicts`
- `snapshot` only when explicitly required by the tool contract

Rejection reasons must be normalized at the MCP boundary:

- `version_conflict`
- `validation_error`
- `conflict`
- `not_found`
- `invalid_request`
- `unsupported_operation`

Exit criteria:

- `tools/list` exposes only the normalized surface for scheduling
- no legacy mutation tool names remain in public tool metadata
- all mutation tools return typed JSON as the primary contract
- no text-only `Command rejected: ...` response is used as the primary mutation contract

### Wave 2: Read model replacement

Goal:

- stop forcing full-project reads as the default reasoning path
- introduce targeted reads that match agent decision boundaries

Implementation scope:

- add `get_project_summary`
- add `get_task_context`
- add `get_schedule_slice`
- reduce or remove prompt dependence on `get_tasks`
- keep `get_task` only if it cleanly maps to `get_task_context`; otherwise remove it from public scheduling guidance

Read contract requirements:

- `get_project_summary`
  - project revision/version
  - day mode
  - effective date range
  - root task count
  - total task count
  - high-level health flags
- `get_task_context`
  - task
  - parents
  - children
  - siblings or neighbors
  - predecessors
  - successors
  - version
- `get_schedule_slice`
  - query by task IDs, branch root, or date window
  - compact canonical task set
  - explicit scope metadata so the agent knows what it is looking at

Exit criteria:

- prompts and retry instructions no longer say "always call `get_tasks` first"
- normal edits can be routed through targeted context reads
- full-graph reads are optional fallback behavior, not the default protocol

### Wave 3: Intent mutation cutover

Goal:

- expose semantic mutation tools that speak in user intent instead of storage shape
- remove legacy mutation semantics from the agent contract

Implementation scope:

- add `shift_tasks`
- add `link_tasks`
- add `unlink_tasks`
- add `move_tasks`
- add `update_tasks`
- add `create_tasks`
- add `delete_tasks`
- add `recalculate_project`
- add `validate_schedule`

Mutation semantics:

- `shift_tasks`
  - input is task IDs plus delta
  - supports `calendar` vs `working` day semantics
  - server computes resulting dates
- `link_tasks`
  - input is predecessor/successor intent
  - optional lag and dependency type
  - no dependency-array rewrite input
- `unlink_tasks`
  - input is logical link identity, not full dependency replacement
- `move_tasks`
  - supports structural movement under parent, to root, and sibling positioning
  - hierarchy is expressed as structural intent, not public raw `parentId` patching
- `update_tasks`
  - only for metadata and non-scheduling field updates
  - must not become a disguised raw scheduling patch tool
- `create_tasks`
  - supports multi-create and optional client refs
  - caller should not need ad hoc ID choreography for normal creation flows
- `delete_tasks`
  - batch-capable authoritative delete boundary
- `recalculate_project`
  - authoritative full-project recomputation entry point
- `validate_schedule`
  - typed schedule-health report

Exit criteria:

- common requests like "shift by 2 working days" do not require absolute date computation by the agent
- common linking/unlinking operations do not require dependency-array mutation logic
- hierarchy changes are no longer taught or framed as raw `parentId` edits
- there is no public legacy fallback path for normal scheduling edits

### Wave 4: Agent and verification cutover

Goal:

- make the agent operate against the normalized surface only
- make mutation verification depend on actual typed mutation execution

Implementation scope:

- rewrite `packages/mcp/agent/prompts/system.md`
- rewrite mutation retry protocol in `packages/server/src/agent.ts`
- track actual mutation tool usage in the server run layer
- verify success from tool execution result plus committed effect, not from text intent heuristics alone

Required changes in agent behavior:

- stop teaching `update_task` / `set_dependency` / `remove_dependency` / `move_task` / `resize_task` as normal tools
- stop instructing the model to reason primarily in `parentId` and raw `dependencies`
- teach the model to start from the smallest targeted context read
- require final user answer to reflect the authoritative changed set returned by the server

Required verification changes:

- mutation-sensitive mode is triggered by actual mutation tool invocation or attempted invocation
- if no mutation tool was called, the run cannot be counted as a successful mutation run
- if the tool returns `rejected`, the assistant must not claim success
- if accepted result has an empty or inconsistent changed set for the requested operation, the assistant must surface that truthfully
- verification should persist structured mutation attempt metadata, not infer everything from project diffing

Exit criteria:

- retry instructions mention only normalized tools
- mutation verification is tied to typed tool execution records
- false-positive success after no-op or rejected mutation is blocked

## Concrete File Plan

### `packages/mcp/src/types.ts`

Introduce new public MCP tool input/output types and normalized result contracts.

Expected work:

- add normalized tool payload types for the target surface
- add normalized mutation result and rejection result types
- keep internal command types only if they are no longer presented as the public MCP contract
- separate `public MCP contract` types from `internal command service` types

### `packages/mcp/src/index.ts`

Replace the public tool catalog and handler logic.

Expected work:

- remove legacy tool registration from `tools/list`
- register normalized tools only
- convert every tool handler to return normalized JSON result payloads
- normalize all error and rejection responses
- route semantic tools into command/domain services
- stop using plain text rejection payloads as the primary result

### `packages/mcp/src/services/command.service.ts`

Preserve as authoritative commit boundary, but adapt internals as needed.

Expected work:

- keep commit/version logic
- add internal adapters from new semantic MCP tool inputs to command execution
- tighten command/result normalization where current shapes leak low-level semantics
- expose enough authoritative changed-set data for the new MCP contract

### `packages/server/src/agent.ts`

Replace legacy-first orchestration protocol.

Expected work:

- rewrite prompt assembly instructions
- rewrite retry instructions to mention normalized tools only
- stop defaulting to `get_tasks`
- add typed tracking for which mutation tools were called
- base mutation success on actual typed tool results plus committed evidence

### `packages/mcp/agent/prompts/system.md`

Rewrite the planning model around the normalized surface.

Expected work:

- replace legacy tool references
- replace raw hierarchy guidance with structural intent language
- replace direct dependency editing guidance with `link_tasks` / `unlink_tasks`
- replace manual date-edit guidance with `shift_tasks` or other semantic scheduling tools
- teach when to use `get_project_summary`, `get_task_context`, `get_schedule_slice`

### Tests

At minimum, add or update tests around:

- MCP `tools/list` surface
- normalized mutation result shape
- rejection shape normalization
- `shift_tasks` relative date behavior
- `link_tasks` / `unlink_tasks` semantics
- `move_tasks` structural semantics
- targeted read tools
- server mutation verification when no mutation tool was called
- server mutation verification on rejected mutation
- prompt content regression so legacy tool names do not reappear

Likely files:

- `packages/mcp/src/*.test.ts`
- `packages/server/src/agent.test.ts`
- new MCP surface-specific tests if needed

## Legacy Removal Checklist

The following items must be removed from the public scheduling path before this plan is considered complete:

- legacy scheduling mutation tools exposed in MCP `tools/list`
- legacy scheduling tool references in MCP prompt docs
- legacy scheduling tool references in server retry instructions
- "always call `get_tasks` first" protocol wording
- text-only primary rejection payloads
- public guidance that teaches raw `parentId` mutation
- public guidance that teaches full dependency-array mutation for single-link edits
- public guidance that teaches agent-side absolute date arithmetic for simple schedule changes

## Sequencing Constraints

1. Define the new result contract before cutting tools over.
2. Replace read tools before rewriting the prompt around them.
3. Remove legacy public tools at the same time the normalized replacements land.
4. Rewrite agent prompts and retry logic in the same delivery window as tool cutover.
5. Add regression tests before final cleanup of legacy strings and metadata.

## Non-Goals For This Plan

- full preview/commit operation batches in this pass
- client-ref orchestration beyond what is needed for `create_tasks`
- resource planning workflows
- schedule generation from natural language briefs
- frontend migration details beyond what is required to keep the MCP and server contract coherent

## Definition of Done

This implementation plan is complete when all of the following are true:

1. The public MCP tool list exposes the normalized scheduling surface only.
2. A simple request like "shift task X by 2 working days" is fulfilled through semantic MCP input, not agent-computed absolute dates.
3. A simple link/unlink request is fulfilled without dependency-array rewrites.
4. A hierarchy move is fulfilled without presenting raw `parentId` patching as the public contract.
5. The agent prompt and retry path mention only the normalized surface for normal schedule edits.
6. Mutation success is tied to actual typed mutation tool execution and committed results.
7. Rejections are machine-readable and normalized across mutation tools.
8. There is no supported parallel legacy public path for the same scheduling operations.

## Recommended First Execution Slice

If implementation is split into sub-phases, start with this slice:

1. new normalized result contract in `packages/mcp/src/types.ts`
2. new `tools/list` surface in `packages/mcp/src/index.ts`
3. `shift_tasks`, `link_tasks`, `unlink_tasks`
4. typed rejection normalization
5. server retry and verification cutover
6. prompt rewrite

That sequence removes the worst ambiguity first:

- the agent stops seeing two APIs
- mutation success stops depending on narrative text
- common scheduling edits move to intent-first semantics immediately
