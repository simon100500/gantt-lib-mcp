# Phase 47: agent-routing-fast-path - Context

**Gathered:** 2026-04-22
**Status:** Ready for planning
**Source:** PRD Express Path (`D:\Projects\gantt-lib-mcp\.planning\agent-routing-fast-path-prd.md`)

<domain>
## Phase Boundary

Build a strict conversational mutation routing layer so free-form edit requests are routed early into one of three execution classes:

- deterministic fast path for simple low-risk mutations that already map to authoritative typed commands
- specialized fast executor path for bounded structural operations such as task decomposition
- agent path only for genuinely broad, ambiguous, or optimization-heavy requests

This phase must improve speed, predictability, and failure quality for conversational edits without collapsing back into a generic tool-calling mutation loop.

</domain>

<decisions>
## Implementation Decisions

### Routing architecture
- Introduce a new top-level route contract: `user request -> intent router -> entity resolver -> route selector -> executor`.
- The server must decide the execution route early rather than letting unsupported shapes drift into the ordinary generic mutation loop.
- Internal execution stays narrow, typed, and route-driven even when user language is open-ended.
- The router output must be a strict structured envelope, not prose.
- Required route values are `fast_path`, `specialized_fast_path`, `agent_path`, or `clarify`.
- Required envelope fields are `route`, `intent_family`, `intent_type`, `confidence`, `risk_level`, `params`, and `ambiguities`.
- The router must be cheap, fast, schema-constrained, and must not generate DB payloads, call tools, commit mutations, or guess task IDs.

### Risk policy
- Introduce risk bands `S0`, `S1`, `S2`, and `S3`.
- `S0-S1` should usually route to deterministic fast path.
- `S2` should usually route to specialized fast executors.
- `S3` should usually route to agent path.
- Low-confidence structural requests must not silently degrade into the generic ordinary mutation loop.

### Entity resolution
- Intent routing and entity resolution are separate concerns.
- The resolver must explicitly resolve task references, parent or container references, group references, current selection references, and current visible scope references.
- Resolver output must be explicit and confidence-scored.
- Specialized executor handoff requires high-confidence resolution before execution.
- If resolver confidence is low, the system must ask for clarification or escalate to agent path instead of silently falling through to the ordinary mutation loop.

### Specialized executor contract
- Formalize task decomposition as the first specialized fast executor route.
- Add route-level intent `decompose_task`.
- `decompose_task` is a routing and orchestration primitive, not a new low-level authoritative mutation command.
- Keep `packages/server/src/split-task.ts` isolated from the general mutation pipeline.
- Chat must be able to hand off into the isolated split executor.
- Specialized fast executor flow remains `classify -> resolve -> call dedicated executor -> commit authoritative commands`.
- Specialized fast executors may use one narrow planning call, but must not become multi-turn tool-calling agent loops.
- Actual writes must still compile into authoritative typed commands such as `create_task`, `create_tasks_batch`, and `create_dependency`.

### Agent escalation rules
- Escalate to agent path only when route confidence is too low, targets cannot be resolved confidently, the request spans multiple graph areas, the user asks for tradeoffs or options, the request needs resource-aware or critical-path-aware reasoning, or no specialized executor exists.
- Natural language phrasing alone is not a reason to use agent path.
- Agent path is an escalation route, not the default mutation mechanism.

### Response behavior
- Fast and specialized routes must return operational responses that state what was recognized, what changed, how many tasks changed, and whether warnings exist.
- Failed routing must report the actual failed route or resolution step rather than surfacing the generic "no valid mutation tool call" failure when the true issue was routing or resolution.

### Scope and sequencing
- Phase 1 in implementation scope: introduce route envelope and route classes, and log route decisions before execution.
- Phase 2: add specialized fast executor handoff for `decompose_task` and forbid silent fallthrough for this class.
- Phase 3: expand specialized executor catalog to by-floor decomposition, by-section decomposition, and local branch expansion from a strict structured plan.
- Phase 4: tighten the agent boundary, make route decisions visible in logs and tests, and reduce ordinary loop usage where dedicated executors already exist.

### Non-negotiable rules
- Specialized fast executors remain isolated from the general mutation pipeline.
- Chat may hand off into a specialized executor, but does not replace it.
- `decompose_task` is a routing primitive, not a low-level mutation command.
- All committed writes still go through authoritative typed command execution.
- Low-confidence structural requests must not silently degrade into the generic ordinary mutation loop.
- Agent path is an escalation route, not the default mutation mechanism.

### the agent's Discretion
- Exact TypeScript type names and module boundaries for the new route envelope, risk enums, and executor registry.
- Whether current `deterministic | hybrid | full_agent` execution modes are replaced, extended, or adapted behind a compatibility layer.
- Whether the intent router is implemented by evolving `intent-classifier.ts`, introducing a new router module, or layering both during migration.
- Exact threshold values for route and resolver confidence, provided the policy remains consistent with the PRD.
- Logging shape and telemetry implementation details as long as route decisions become inspectable and testable.
- Whether specialized executor catalog expansion ships fully in this phase or is scaffolded with decomposition first and the rest behind stable abstractions.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap and project planning
- `.planning/ROADMAP.md` — Phase 47 placement, dependency on Phase 46, and surrounding roadmap state.
- `.planning/REQUIREMENTS.md` — project-level requirements that Phase 47 must not violate even though this phase has no mapped REQ IDs yet.
- `.planning/STATE.md` — current project decisions and recent architectural direction.
- `.planning/agent-routing-fast-path-prd.md` — source PRD that defines the routing model, route envelope, escalation rules, and decomposition handoff requirements.

### Current conversational mutation pipeline
- `packages/server/src/mutation/orchestrator.ts` — current top-level staged mutation flow, fallback behavior, and execution boundaries.
- `packages/server/src/mutation/types.ts` — current intent, resolution, plan, and execution mode contracts.
- `packages/server/src/mutation/execution-routing.ts` — current execution mode selector (`deterministic`, `hybrid`, `full_agent`) that Phase 47 will likely evolve.
- `packages/server/src/mutation/intent-classifier.ts` — current cheap semantic classification step and allowed intent set.
- `packages/server/src/mutation/resolver.ts` — current entity resolution path that must remain explicit and confidence-aware.
- `packages/server/src/mutation/plan-builder.ts` — current server-owned deterministic and hybrid plan compilation path.
- `packages/server/src/mutation/execution.ts` — authoritative typed command execution path that must remain the write boundary.

### Specialized fast executor seam
- `packages/server/src/split-task.ts` — existing isolated decomposition executor that Phase 47 must route into instead of absorbing back into the generic mutation pipeline.
- `packages/server/src/index.ts` — server wiring that exposes the current split-task entry point and broader mutation entry seams.

### Existing semantic path and tests
- `packages/server/src/mutation/semantic-planner.ts` — semantic planning path that may need a clearer boundary against specialized executors and agent escalation.
- `packages/server/src/mutation/semantic-resolver.ts` — semantic resolution behavior relevant to route confidence and ambiguity handling.
- `packages/server/src/mutation/orchestrator.test.ts` — orchestration regression coverage that should expand with route selection and fallback rules.
- `packages/server/src/mutation/intent-classifier.test.ts` — classifier coverage that should evolve toward route envelope behavior.
- `packages/server/src/mutation/execution.test.ts` — typed execution guarantees that specialized routes must continue to honor.

</canonical_refs>

<specifics>
## Specific Ideas

- The motivating failure case is a valid structural request like `Разбей Бетонирование перекрытий 12-17 этажей поэтажно` being broadly understood but not having a sanctioned route, causing the generic "no valid mutation tool call" failure.
- Specialized decomposition resolver output should include executor name, target task identity, mode, and optional range fields such as floor bounds.
- Successful responses should become route-aware and operational, for example reporting that a task was split into a specific number of child tasks or that a task shift recalculated downstream dependents.
- Route decisions should become visible in logs and tests before execution happens.

</specifics>

<deferred>
## Deferred Ideas

- Future specialized executor catalog items beyond decomposition, specifically by-section decomposition and local branch expansion from a strict structured plan.
- Broader tightening of the agent boundary after the first route envelope and decomposition handoff are in place.

</deferred>

---

*Phase: 47-agent-routing-fast-path*
*Context gathered: 2026-04-22 via PRD Express Path*
