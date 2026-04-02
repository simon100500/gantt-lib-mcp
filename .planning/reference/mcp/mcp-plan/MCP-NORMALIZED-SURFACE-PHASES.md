# MCP Normalized Surface Phase Breakdown

## Status

In progress

## Progress Snapshot

- Phase 01: implemented
- Phase 02: implemented
- Phase 03: implemented on the normalized MCP surface
- Phase 04: implemented for prompt and retry orchestration
- Phase 05: implemented for mutation-attempt and changed-set verification hardening
- Phase 06: in progress

Current cleanup target:

- keep only normalized public scheduling paths plus non-scheduling conversation tools
- lock the cleanup with runtime regression coverage for `move_tasks`, `link_tasks`, `shift_tasks`, and legacy scheduling-tool rejection

## Purpose

This document decomposes the normalized MCP surface plan into executable phases.

Each phase is designed to be shippable, but the overall program must still preserve the hard rule:

> do not leave the system in a dual-path state where legacy low-level public tools and normalized semantic tools are both supported scheduling paths

That means some phases should be implemented on a branch and merged together in a short window, or delivered behind one coordinated cutover.

## Phase 01: Public Contract and Result Model

## Goal

Define the normalized public MCP contract and remove legacy scheduling tools from the public tool catalog.

## Scope

- add public MCP types for normalized tools
- add one normalized mutation result contract
- add one normalized rejection contract
- replace public `tools/list` metadata in MCP
- stop presenting legacy scheduling tools as available public choices

## Primary files

- `packages/mcp/src/types.ts`
- `packages/mcp/src/index.ts`

## Required outputs

- normalized tool names and input schemas
- normalized JSON result shape for all mutations
- normalized machine-readable rejection shape

## Must remove in this phase

- legacy scheduling tool names from MCP public metadata
- text-only rejection as the primary contract

## Dependencies

- none

## Exit criteria

- `tools/list` shows only normalized scheduling tools
- every mutation handler returns typed JSON as the primary payload
- rejection shape is consistent across mutation tools

## Risks

- handlers may still internally depend on low-level command shapes
- some legacy command semantics may leak into the new response shape unless explicitly normalized

## Phase 02: Contextual Read Surface

## Goal

Replace full-graph-first reasoning with targeted context reads.

## Scope

- implement `get_project_summary`
- implement `get_task_context`
- implement `get_schedule_slice`
- define their response contracts
- stop depending on `get_tasks` as the default read protocol in scheduling guidance

## Primary files

- `packages/mcp/src/types.ts`
- `packages/mcp/src/index.ts`
- any supporting service modules needed for contextual reads
- `packages/mcp/agent/prompts/system.md`

## Required outputs

- compact project summary for routing decisions
- task-centric neighborhood/context read
- slice read by IDs, branch, or date window

## Must remove in this phase

- prompt wording that says `get_tasks` is mandatory before every edit

## Dependencies

- Phase 01

## Exit criteria

- targeted reads are available and documented
- prompt can route common edits without full project scanning
- full graph loading is no longer the default planning model

## Risks

- under-specified context shape may force the agent back into broad reads
- slice semantics can become ambiguous if scope metadata is weak

## Phase 03: Intent Mutation Surface

## Goal

Replace low-level scheduling mutations with semantic intent tools.

## Scope

- implement `shift_tasks`
- implement `link_tasks`
- implement `unlink_tasks`
- implement `move_tasks`
- implement `update_tasks`
- implement `create_tasks`
- implement `delete_tasks`
- implement `recalculate_project`
- implement `validate_schedule`

## Primary files

- `packages/mcp/src/types.ts`
- `packages/mcp/src/index.ts`
- `packages/mcp/src/services/command.service.ts`
- supporting scheduling/domain adapters if needed

## Required outputs

- semantic scheduling mutations
- semantic dependency mutations
- semantic hierarchy mutations
- typed validation output

## Must remove in this phase

- public low-level schedule mutation semantics
- public dependency-array rewrite contract
- public raw hierarchy patch contract

## Dependencies

- Phase 01
- Phase 02 recommended before prompt cutover, but not strictly required for backend handler work

## Exit criteria

- "shift by N days" works without agent absolute-date arithmetic
- simple link/unlink works without rewriting full dependency arrays
- hierarchy movement works without raw `parentId` framing in the public contract
- legacy low-level scheduling mutations are not supported MCP paths

## Risks

- `update_tasks` can regress into a disguised raw patch tool if its scope is not tightly constrained
- hierarchy semantics can stay leaky if move/reorder intent is underspecified

## Phase 04: Agent Prompt and Retry Cutover

## Goal

Make the agent operate only against the normalized surface.

## Scope

- rewrite MCP system prompt
- rewrite server retry instructions
- rewrite mutation guidance around targeted reads plus semantic tools
- remove legacy tool references from tests and prompt assertions

## Primary files

- `packages/mcp/agent/prompts/system.md`
- `packages/server/src/agent.ts`
- `packages/server/src/agent.test.ts`

## Required outputs

- prompt references only normalized scheduling tools
- retry protocol references only normalized scheduling tools
- no agent guidance around raw `parentId`, direct date patching, or full dependency-array editing as the default path

## Must remove in this phase

- legacy tool names in prompt content
- legacy tool names in retry instructions
- "always call `get_tasks` first" protocol wording

## Dependencies

- Phase 01
- Phase 02
- Phase 03

## Exit criteria

- prompt and retry path use normalized tools only
- tests lock that legacy tool names do not reappear
- common user requests are describable in semantic MCP language

## Risks

- stale retry copy can silently preserve old agent behavior
- tests may only check strings and miss actual runtime tool selection issues

## Phase 05: Mutation Verification Hardening

## Goal

Make mutation verification depend on actual mutation tool execution and committed results.

## Scope

- track actual mutation tool invocation/attempts in the server run layer
- distinguish read-only, attempted-mutation, rejected-mutation, and accepted-mutation runs
- tie final success logic to tool result plus committed evidence
- tighten no-op and rejection handling

## Primary files

- `packages/server/src/agent.ts`
- possibly MCP tool call logging or execution metadata paths
- server tests covering mutation verification

## Required outputs

- typed mutation-attempt metadata
- verification path keyed to actual tool execution
- explicit handling for rejected mutations and empty changed sets

## Must remove in this phase

- narrative success based only on text intent
- verification behavior that treats a mutation request as success without actual mutation execution

## Dependencies

- Phase 01
- Phase 03
- Phase 04 recommended because prompts and retry path must already be aligned

## Exit criteria

- no mutation tool call means no successful mutation run
- rejected mutation cannot be narrated as success
- accepted mutation with inconsistent changed set is surfaced honestly

## Risks

- before/after task diff alone is insufficient for precise verification semantics
- timeout and partial execution paths can still create ambiguity if not logged explicitly

## Phase 06: Regression Lock and Cleanup

## Goal

Lock the cutover and remove remaining legacy references.

## Scope

- add MCP surface regression tests
- add prompt regression tests
- add verification regressions
- clean remaining legacy scheduling references from docs or helper strings tied to runtime behavior

### Phase 06 progress

- runtime MCP handler cleanup in `packages/mcp/src/index.ts` is complete
- runtime regression coverage added for `tools/list` and `callTool` handler paths
- legacy scheduling tool names are locked to `unsupported_operation` on the runtime-visible path
- normalized accepted/rejected result shape is locked for `move_tasks`, `link_tasks`, and `shift_tasks`

## Primary files

- `packages/mcp/src/*.test.ts`
- `packages/server/src/agent.test.ts`
- runtime documentation strings in MCP/server files

## Required outputs

- stable regression suite for normalized MCP surface
- no runtime-visible legacy scheduling guidance

## Must remove in this phase

- leftover runtime strings that advertise old tools
- stale scheduling helper text inconsistent with the new contract

## Dependencies

- Phase 01 through Phase 05

## Exit criteria

- tests lock the normalized surface
- no runtime-facing legacy scheduling references remain
- no dual-path behavior remains in the public MCP experience

## Recommended Execution Order

1. Phase 01: Public Contract and Result Model
2. Phase 02: Contextual Read Surface
3. Phase 03: Intent Mutation Surface
4. Phase 04: Agent Prompt and Retry Cutover
5. Phase 05: Mutation Verification Hardening
6. Phase 06: Regression Lock and Cleanup

## Recommended Merge Strategy

Because the user explicitly wants no backward compatibility, the safest merge strategy is:

1. implement Phase 01 and Phase 03 in a coordinated branch
2. implement Phase 02 before or alongside Phase 04
3. merge Phase 04 and Phase 05 together or in immediate sequence
4. finish with Phase 06 cleanup before declaring the surface stable

Avoid merging only the new tool handlers without simultaneously removing the legacy public surface and prompt guidance.

## Fastest Valuable Slice

If the work must start with the smallest meaningful cutover, do this:

1. Phase 01 limited to normalized result contract plus new public tool list
2. Phase 03 limited to `shift_tasks`, `link_tasks`, `unlink_tasks`
3. Phase 04 limited to prompt/retry cutover for those tools
4. Phase 05 limited to typed mutation-attempt verification

That slice already removes the worst problems:

- agent-side date arithmetic for simple schedule moves
- dependency-array reasoning for simple link edits
- narrative success after failed mutation attempts

## Completion Rule

This phase breakdown is complete only when the system has one public scheduling contract.

If the implementation still leaves both normalized semantic mutations and legacy low-level scheduling mutations available as supported MCP choices, the program is not complete.
