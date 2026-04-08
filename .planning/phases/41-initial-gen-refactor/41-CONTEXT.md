# Phase 41: initial-gen-refactor - Context

**Gathered:** 2026-04-08
**Status:** Ready for planning
**Source:** PRD Express Path (D:\Projects\gantt-lib-mcp\INITIAL-GENERATION-REFACTOR-PLAN.md)

<domain>
## Phase Boundary

Refactor empty-project broad-request generation so the first schedule build is AI-first and quality-gated instead of template-first.

This phase delivers:
- removal of the current deterministic `initial_schedule_template` fast path for broad initial-generation requests in empty projects
- a distinct `initial_generation` orchestration path, separate from normal mutation flow
- a two-stage pipeline: strong-model planning -> server-side deterministic compilation/execution
- server-side domain-context injection and brief generation for construction/repair initial generation
- server-side model routing between strong initial planning and cheaper ordinary mutation flows
- product-quality gating between planning and execution, with at most one plan-repair cycle
- deterministic compile/commit through `commandService`, including partial-schedule salvage rules and controlled-error behavior
- typed contracts, logging, and tests for routing, plan quality, compilation, and observability

Out of scope for this phase:
- curated templates as the primary architecture
- adding new user-facing MCP tools
- fallback from failed initial generation into the normal MCP mutation-agent flow
- multi-domain initial generation beyond construction/repair for `v1`
- asking the user clarifying questions during broad empty-project generation

</domain>

<decisions>
## Implementation Decisions

### Routing and Product Behavior
- Broad generation in an empty project must no longer use `initial_schedule_template` or any equivalent generic deterministic content shortcut.
- Initial generation must be a first-class internal mode named `initial_generation`.
- Entry into `initial_generation` is based on request class plus empty-project state, not regex-only content templates.
- Ordinary follow-up edits stay on the existing mutation flow and do not use the two-stage initial-generation pipeline.
- Broad or vague initial-generation requests must not trigger clarifying questions; the server should infer a strong baseline from domain knowledge.

### Two-Stage Orchestration
- Stage 1 is an AI planning step that returns a machine-readable `ProjectPlan`, not task mutations.
- Stage 2 is deterministic server compilation/execution with no second LLM call in the happy path.
- The happy path budget is one planning call; a single additional LLM repair call is allowed only if the plan-quality gate rejects the first plan.
- Compile-time failures are handled at compiler level, not by bouncing into agentic mutation repair.

### Planning Output Contract
- `ProjectPlan` must include `projectType`, `nodes`, and `assumptions`.
- Each node must include `nodeKey`, `title`, `parentNodeKey`, `kind`, `durationDays`, and `dependsOn`.
- `nodeKey` values are required and unique within the plan.
- `title` is required and must not be placeholder naming such as generic numbered stages/tasks.
- `durationDays` is required, integer, and `>= 1`.
- Top-level `task` nodes are forbidden in `v1`; all working tasks live under phase containers.
- `phase` nodes are containers only and must retain at least one child after cleanup.
- Dependencies support `FS`, `SS`, `FF`, `SF`, plus `lagDays`, with defaults `FS` and `0`.
- `assumptions` defaults to an empty array when omitted.

### Quality Gate and Repair
- The plan-quality gate runs between planning and execution without another evaluator LLM in the default design.
- The quality verdict must assess hierarchy depth, subject-matter specificity, sequence realism, non-placeholder naming, and scale/coverage.
- A weak plan may be repaired once by sending the full plan plus explicit criticism back to the planning model.
- If the repaired plan is still weak, the system accepts the best available plan rather than looping indefinitely.

### Deterministic Compilation and Execution
- Approved `ProjectPlan` instances are validated against schema before compilation.
- The compiler maps `nodeKey` values to real task IDs, computes dates/dependencies, and commits via one authoritative batch command through `commandService`.
- Schedule start is anchored to current server date.
- Default mode is working-day scheduling with the existing RF production calendar.
- `durationDays` is interpreted as working days.
- Parent phases are not independently scheduled; their ranges come only from rollup over children.
- The compiler must support all dependency types `FS/SS/FF/SF` even if the planning model mostly emits `FS`.
- If full compilation fails technically, the compiler should attempt a maximal valid partial schedule before rejecting the run.
- Partial schedules are allowed only when at least 60% of plan nodes survive, at least 3 top-level phases remain, every retained phase has a child task, and no broken references/empty containers remain.
- If salvage leaves a schedule too weak, the system returns a controlled error instead of silently committing a poor result.
- The system must never silently fall back to normal MCP mutation-agent execution for initial generation.

### Domain Brief and Knowledge Injection
- Planning input must include a short structural `GenerationBrief`, not a hardcoded task template.
- The brief must capture inferred object type, scope/scale signals, expectation of a full starter schedule, and a ban on filler naming.
- Planning must also receive a compact server-side domain reference for the recognized object type.
- If object type is not recognized, `v1` defaults to the generic construction reference interpreted as a private residential house baseline.
- The domain reference is guidance/context, not a curated task template or fixed task list.

### Model Routing
- Initial-generation planning uses the strong/main configured model.
- Ordinary mutation/edit flows use `OPENAI_CHEAP_MODEL` / `cheap_model` when available, otherwise degrade to the main model.
- Model routing decisions must be made before starting a given SDK run; no in-session model switching.
- Routing decisions must be logged as typed `ModelRoutingDecision` records.

### Internal Types and Boundaries
- Add typed internal structures for `GenerationBrief`, `ProjectPlan`, `PlanQualityVerdict`, `RepairReason`, `ModelRoutingDecision`, and `CompiledInitialSchedule`.
- `initial_generation` must execute directly against `commandService`, not via new MCP tools and not through the ordinary normalized mutation-tool surface.
- Existing mutation flow remains intact for non-initial-generation requests.

### Logging and Observability
- Each run must log route selection, object-type inference, model tier, planning output, quality verdict, repair reasons, compile verdict, batch size/task count, dropped nodes or links, and final acceptance/rejection.
- Logs must be sufficient to reconstruct the full lifecycle of a single generation attempt end to end.

### Testing and Validation
- Cover route selection for empty broad requests vs ordinary edits.
- Cover strong-model vs cheap-model routing.
- Cover planning prompt/domain-reference injection and `ProjectPlan` schema rejection cases.
- Cover plan-quality accept/repair behavior.
- Cover deterministic compiler behavior for hierarchy, dependencies, rollups, partial salvage, and controlled failure.
- Cover logging payloads for route/model/plan/quality/compile/final result.
- Include manual scenario validation for broad and specific construction prompts, including the vague `Построй график`.

### the agent's Discretion
- Exact file/module boundaries for new planning, brief, routing, compiler, and logging helpers.
- Concrete schema library and validator placement, as long as server-side validation remains strict and typed.
- Exact scoring thresholds inside the quality gate, except for the explicitly locked partial-salvage thresholds.
- Whether the work is split into orchestration, contracts, compiler, prompt/routing, and observability plans or another structure with equivalent coverage.
- Precise log shape fields beyond the locked semantic events and typed decision/result objects.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Current Initial-Generation Orchestration
- `packages/server/src/agent.ts` — current agent orchestration, `query()` call, `tryInitialScheduleTemplateFastPath`, direct shift fast path, and server debug logging flow to replace/extend.
- `packages/server/src/agent.test.ts` — current intent heuristics and template-fast-path tests that define the starting behavior and required regressions.
- `packages/mcp/agent/agent.ts` — existing SDK run setup and env/model resolution pattern for agent-side model selection assumptions.

### Authoritative Command Execution and Scheduling
- `packages/mcp/src/services/command.service.ts` — authoritative command commit semantics and current `create_tasks_batch` handling that the compiler must target.
- `packages/server/src/routes/command-routes.ts` — server command-commit route and current single-truth persistence boundary.
- `.planning/reference/unified-scheduling-core-prd.md` — canonical command-first/single-authority scheduling architecture already adopted in the repo.
- `.planning/reference/scheduling-core-adoption-prd.md` — prior server-authoritative scheduling adoption decisions and invariants for cascade/rollup parity.

### Domain Knowledge and Initial-Generation Inputs
- `.planning/reference/construction-work-intent-map-v3.json` — current construction domain reference material to reuse or adapt for planning-time knowledge injection.
- `INITIAL-GENERATION-REFACTOR-PLAN.md` — authoritative phase scope, constraints, contracts, and test scenarios for this refactor.

### Existing Planning and Requirements Context
- `.planning/ROADMAP.md` — current phase registration and dependency on Phase 40.
- `.planning/STATE.md` — project decisions/history that may affect implementation choices and logging conventions.
- `.planning/REQUIREMENTS.md` — current milestone requirements; Phase 41 is PRD-driven and not yet mapped to REQ IDs.

</canonical_refs>

<specifics>
## Specific Ideas

- Remove the `initial_schedule_template` broad-request shortcut from `packages/server/src/agent.ts`.
- Rework empty-project generation into explicit planning/quality/compile stages.
- Use the existing construction reference map as the seed for `GenerationBrief` knowledge injection, but stop inheriting its older assumption that ambiguous cases should ask clarifying questions.
- Keep compile output grounded in the existing `create_tasks_batch`/`commandService.commitCommand()` infrastructure instead of inventing a new persistence path.
- Make partial-salvage rules explicit and user-visible only as a partial-success message, not as internal compiler jargon.

</specifics>

<deferred>
## Deferred Ideas

- Curated templates as a future separate phase
- Broad multi-domain initial generation outside construction/repair
- Any extra LLM compile-repair stage after deterministic compilation
- New user-facing MCP tools for initial generation

</deferred>

---

*Phase: 41-initial-gen-refactor*
*Context gathered: 2026-04-08 via PRD Express Path*
