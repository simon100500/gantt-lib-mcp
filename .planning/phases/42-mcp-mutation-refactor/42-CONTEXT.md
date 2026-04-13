# Phase 42: MCP Mutation Refactor - Context

**Gathered:** 2026-04-13
**Status:** Ready for planning
**Source:** PRD Express Path (D:\Projects\gantt-lib-mcp\.planning\reference\mcp-mutation-refactor-prd.md)

<domain>
## Phase Boundary

Refactor ordinary MCP conversational edits from one opaque freeform mutation run into an explicit staged lifecycle: `intent -> resolution -> mutation_plan -> execution -> verification`.

This phase delivers:
- a first-class staged mutation lifecycle for ordinary edits in existing non-empty projects
- a typed `MutationIntent` classification layer that maps short natural-language requests into mutation families and execution modes
- a resolution layer that finds task/container/group/anchor context without requiring the model to invent IDs, parents, dates, or dependencies from scratch
- a typed `MutationPlan` contract that separates semantic interpretation from final authoritative command execution
- deterministic or tightly constrained server-side execution for common mutation families such as add, rename, move, shift, move-to-date, link/unlink, metadata update, fan-out by groups, delete, and WBS expansion
- typed controlled failure reasons instead of the generic "no valid mutation tool call" outcome for common-path failures
- end-to-end lifecycle logging and regression coverage for short Russian mutation prompts

Out of scope for this phase:
- redesigning the already-shipped `initial_generation` lifecycle
- replacing `commandService` as the authoritative mutation execution path
- bringing back legacy raw scheduling or persistence mutation paths as first-class architecture
- regex-first understanding as the primary product mechanism
- removing full agent mutation mode for genuinely broad or complex restructures
- solving broad domain generation for new industries

</domain>

<decisions>
## Implementation Decisions

### Core Product Architecture
- Ordinary conversational edits must no longer depend on one freeform cheap-model attempt that both interprets and executes the mutation.
- The target architecture is an explicit staged lifecycle: `intent -> resolution -> mutation_plan -> execution -> verification`.
- Server algorithms remain the execution authority; the model remains the interpretation and limited semantic-choice layer.
- Final success must still be grounded in authoritative changed-set verification.
- The common path must avoid broad project scans when a targeted resolution path is sufficient.

### Intent Classification
- Introduce a typed internal `MutationIntent` contract with at least: `intentType`, `confidence`, `rawRequest`, `normalizedRequest`, `entitiesMentioned`, `requiresResolution`, `requiresSchedulingPlacement`, and `executionMode`.
- The system must classify short requests into explicit families rather than a generic "mutation" bucket.
- Initial v1 intent families are locked by the PRD: `add_single_task`, `add_repeated_fragment`, `shift_relative`, `move_to_date`, `move_in_hierarchy`, `link_tasks`, `unlink_tasks`, `delete_task`, `rename_task`, `update_metadata`, `expand_wbs`, `restructure_branch`, `validate_only`, `unsupported_or_ambiguous`.
- Requests like `добавь сдачу технадзору` must be treated as an add intent that requires both anchor resolution and scheduling placement, not a blind `create_tasks` attempt.

### Resolution Layer
- Introduce a first-class resolution stage before plan formation for short natural-language edits.
- The preferred architecture for this phase is server-side resolution first, not more burden on the model.
- Resolution output must include a typed `ResolvedMutationContext` with at least: `projectId`, `projectVersion`, `resolutionQuery`, `containers`, `tasks`, `predecessors`, `successors`, `selectedContainerId`, `selectedPredecessorTaskId`, `selectedSuccessorTaskId`, `placementPolicy`, and `confidence`.
- Resolution must support task-name matching, container matching, branch summary, insertion-point discovery, group-scope discovery, and expansion-anchor discovery.
- If resolution cannot identify an anchor confidently, the run must fail with a typed controlled reason instead of falling into a silent no-op.

### Mutation Plan Formation
- Introduce a typed internal `MutationPlan` contract with at least: `planType`, `operations`, `why`, `expectedChangedTaskIds`, `canExecuteDeterministically`, and `needsAgentExecution`.
- `MutationPlan` is the semantic handoff between interpretation/resolution and execution.
- The model may help choose semantic placement, fan-out strategy, or structured branch expansion when ambiguity remains, but it must not be the required source of final `startDate`, `endDate`, `parentId`, or dependency payloads when the server can derive them.
- Common-path add/rename/move/link/shift/date/metadata/fan-out flows must be expressible as typed plans that the server can execute or compile deterministically.

### Execution Modes
- The system must route into explicit execution modes: `deterministic`, `hybrid`, and `full_agent`.
- `deterministic` is the default for narrow, confidently resolved intents that map to one or two typed commands.
- `hybrid` is allowed when resolution is partial but ambiguity can be reduced to ranked candidates or a structured fragment plan.
- `full_agent` remains only for genuinely broad, multi-step, or underspecified restructures; it must consume structured resolution context rather than starting from scratch.
- Cheap-model routing is acceptable only after reliability is structurally guaranteed by staged contracts and server-side execution.

### Deterministic Execution Contract
- Common ordinary mutations must stop depending on freeform normalized-tool payload synthesis in the happy path.
- The preferred execution target remains server-authoritative command commit through `commandService`.
- Higher-level semantic commands are acceptable as internal contracts or internal MCP tools, but they do not need to become user-visible public APIs.
- The execution layer must support deterministic handling for common classes including append/add, shift, move-to-date, move-in-hierarchy, rename, link/unlink, delete, metadata update, group fan-out, and structured branch expansion.
- Placement and date completion must follow server-side policy rather than model hallucination.

### Scheduling Placement Policy
- If a predecessor anchor is resolved, new tasks should be scheduled after that predecessor by project calendar rules.
- If a successor anchor is resolved, the system should place the new task before or linked into the successor according to policy.
- If only a container is resolved, the default placement is the tail of that container branch.
- If the user does not specify duration, the system should apply compact server-side defaults based on intent/domain hints rather than forcing the model to invent final dates.
- If exact dates cannot be resolved cleanly, dependency-based placement plus recalculation is preferred over guessing.

### Failure Semantics and UX
- Typed controlled failures are required for common-path failures.
- Locked failure families from the PRD include: `anchor_not_found`, `multiple_low_confidence_targets`, `container_not_resolved`, `placement_not_resolved`, `unsupported_mutation_shape`, `deterministic_execution_failed`, `verification_failed`, plus scope-specific variants like `group_scope_not_resolved` and `expansion_anchor_not_resolved`.
- The current generic "model did not perform a valid mutation tool call" message must stop being the normal user-facing outcome for simple edit requests.

### Logging and Observability
- Each run must log the full lifecycle: `intent_classified`, `resolution_started`, `resolution_result`, `mutation_plan_built`, `execution_mode_selected`, `deterministic_execution_started`, `execution_committed`, `verification_result`, and `final_outcome`.
- Logs must include candidate matches, resolution reasoning, selected container/placement policy, defaulting decisions, and why a run escalated from deterministic to hybrid or full-agent path.
- Observability must make the real failure mode visible even when no mutation is committed.

### Testing and Coverage
- Add regression coverage for the locked Russian prompts from the PRD across intent classification, resolution, plan formation, deterministic execution, and end-to-end orchestration.
- Coverage must explicitly lock the current failure class: when resolution fails, the result is a typed failure, not a silent no-op and not the generic no-valid-tool-call UX.
- Phase requirements MMR-01 through MMR-05 from `.planning/REQUIREMENTS.md` are mandatory and should be distributed across the final plan set.

### the agent's Discretion
- Exact file/module boundaries for classifier, resolver, plan-builder, execution router, and telemetry helpers.
- Whether resolver capabilities are exposed as internal MCP tools, pure server helpers, or a mixed internal interface, as long as the staged contract remains explicit and observable.
- The exact split of work across plans, as long as routing/contracts, resolution, execution, and failure/telemetry/test coverage are all addressed.
- The exact representation of semantic execution commands, provided the happy path no longer relies on freeform final payload synthesis.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Current Mutation Orchestration and Prompt Contract
- `packages/server/src/agent.ts` — current conversational mutation orchestration, simple-mutation routing, retry/verification flow, and the existing generic failure messages that this phase replaces.
- `packages/server/src/agent.test.ts` — current agent regression surface for routing, mutation behavior, and server-side verification expectations.
- `packages/mcp/agent/prompts/system.md` — current MCP agent system prompt that asks the model to perform minimal reads and normalized mutation tool calls.
- `packages/mcp/agent/agent.ts` — MCP agent runtime setup and prompt loading used by the current mutation flow.

### Current MCP Mutation Surface and Execution Authority
- `packages/mcp/src/index.ts` — current public MCP tool surface, normalized mutation wrappers, and tool dispatch branches including `create_tasks`.
- `packages/mcp/src/public-tools.ts` — canonical registration of the public MCP tools that define the current read/write surface.
- `packages/mcp/src/types.ts` — shared MCP/result/command typing surface that new internal mutation contracts will need to align with or extend.
- `packages/mcp/src/services/command.service.ts` — authoritative command commit path that must remain the execution authority.
- `packages/mcp/src/services/task.service.ts` — existing lower-level task mutation helpers and legacy mutation affordances that should not become the primary happy-path architecture again.

### Existing Command-First and Initial-Generation Architecture
- `.planning/reference/unified-scheduling-core-prd.md` — canonical command-first mutation architecture adopted in Phase 36.
- `.planning/reference/scheduling-core-adoption-prd.md` — authoritative scheduling adoption decisions, changed-set expectations, and server-as-authority history.
- `.planning/phases/36-unified-scheduling-core/36-CONTEXT.md` — phase context for command-driven mutation and single scheduling authority.
- `.planning/phases/36-unified-scheduling-core/36-06-PLAN.md` — prior plan showing how MCP/API mutations were routed through `commandService`.
- `.planning/phases/41-initial-gen-refactor/41-CONTEXT.md` — latest AI-first staged-lifecycle precedent that this phase should mirror architecturally.
- `.planning/phases/41-initial-gen-refactor/41-01-PLAN.md` — prior plan pattern for route selection, typed contracts, and model-routing boundaries.
- `packages/server/src/initial-generation/orchestrator.ts` — existing staged server-side orchestration reference.
- `packages/server/src/initial-generation/route-selection.ts` — current route classification boundary that informs how mutation routing should stay explicit.
- `packages/server/src/initial-generation/model-routing.ts` — current model-routing helper pattern.
- `packages/server/src/initial-generation/types.ts` — example of typed internal contracts for staged AI execution.

### Logging, Requirements, and Phase Scope
- `packages/server/src/debug-log.ts` — current server debug-log infrastructure that should carry the new mutation lifecycle events.
- `.planning/ROADMAP.md` — authoritative phase goal, dependency, planned work tracks, and success criteria for Phase 42.
- `.planning/REQUIREMENTS.md` — mandatory MMR-01 through MMR-05 requirements coverage for this phase.
- `.planning/STATE.md` — project decisions/history including command-first scheduling and existing mutation verification behavior.
- `.planning/reference/mcp-mutation-refactor-prd.md` — authoritative phase scope, acceptance criteria, test matrix, and design constraints.

</canonical_refs>

<specifics>
## Specific Ideas

- Rework `packages/server/src/agent.ts` so ordinary edits use staged mutation orchestration rather than one cheap-model mutation attempt plus post-factum retry.
- Build the new mutation flow as an explicit server subsystem parallel to the existing `initial-generation` modules instead of burying more heuristics inside the prompt or one large `agent.ts` function.
- Keep `commandService` as the authoritative mutation commit boundary; add higher-level semantic planning/execution contracts above it rather than new raw write surfaces below it.
- Treat resolution as the main missing contract in the current product: task search, container selection, insertion-point discovery, group-scope discovery, and expansion-anchor discovery should be first-class responsibilities.
- Prefer plan splits that roughly align to the roadmap tracks already implied in the PRD and roadmap: intent/routing, resolution, plan/execution, failure semantics/telemetry/tests.

</specifics>

<deferred>
## Deferred Ideas

- Full replacement of all agentic mutation flows with deterministic NLP
- Broad new domain-generation work beyond ordinary conversational edits in existing projects
- Large user-facing MCP API expansion beyond what this phase needs internally
- Re-architecting `initial_generation` beyond reusing its staged-lifecycle lessons

</deferred>

---

*Phase: 42-mcp-mutation-refactor*
*Context gathered: 2026-04-13 via PRD Express Path*
