# Implementation Plan: Initial Generation Remediation

## Goal

Fix the broken production entry and quality floor for Phase 41 so that broad empty-project generation reliably runs through the intended two-stage pipeline:

1. agentic route decision
2. WBS planning
3. quality gate
4. deterministic compilation
5. authoritative commit

This plan is a remediation plan, not a greenfield design.
The planner/compiler/executor modules already exist and must be corrected, not replaced blindly.

## Success Criteria

- `Нарисуй график строительства жилого дома на 3 этажа + гараж` routes to `initial_generation`
- no regex-based broad-generation gateway remains
- broad starter schedules fail if they have zero dependencies or trivial WBS breadth
- logs prove a full two-stage run happened
- manual validation cannot approve a mutation-flow false positive

## Workstream 1: Replace Regex Routing With Agentic Route Decision

### Objective

Remove regex-driven route gating and replace it with a structured route-decision step.

### Scope

- `packages/server/src/initial-generation/route-selection.ts`
- `packages/server/src/agent.ts`
- route-selection tests
- debug logging for route evidence

### Tasks

1. Introduce a structured `RouteDecision` type with:
   - `route`
   - `confidence`
   - `reason`
   - `signals`

2. Replace `classifyRequest()` regex logic with a bounded route-decision runner:
   - input: `userMessage`, `taskCount`, `hasHierarchy`, short project-state summary
   - output: strict JSON route decision
   - no freeform prose output

3. Ensure route decision happens before:
   - mutation-agent run
   - planning-stage run
   - model selection for the chosen route

4. Add route logs:
   - `route_selection`
   - `route_decision_evidence`

5. Remove forbidden patterns:
   - verb-list regex routing
   - phrase-specific hotfixes
   - broad-generation keyword allowlists as the main decision path

### Acceptance Criteria

- `Нарисуй график строительства жилого дома на 3 этажа + гараж` -> `initial_generation`
- `Построй график` -> `initial_generation`
- targeted edit in non-empty project -> `mutation`
- route decision logs include confidence and signals

## Workstream 2: Raise Planner Quality Floor

### Objective

Make planning fail or repair when it produces a technically valid but product-weak WBS.

### Scope

- `packages/server/src/initial-generation/planner.ts`
- `packages/server/src/initial-generation/quality-gate.ts`
- planner tests
- orchestrator logging payloads

### Tasks

1. Extend `PlanQualityVerdict` evaluation to include:
   - top-level phase count
   - total task count
   - dependency count
   - cross-phase dependency presence
   - subject specificity
   - object-scale adequacy

2. Add explicit weak-plan reasons such as:
   - `too_few_phases`
   - `too_few_tasks`
   - `missing_dependency_graph`
   - `weak_cross_phase_sequence`
   - `weak_object_scale_fit`

3. Keep the single repair budget:
   - one repair pass only
   - reject or controlled-fail if still below floor

4. Log planning metrics in `planning_output`:
   - `phaseCount`
   - `taskNodeCount`
   - `dependencyCount`
   - `crossPhaseDependencyCount`

### Acceptance Criteria

- broad construction plan with zero dependencies fails quality gate
- broad construction plan with tiny WBS fails quality gate
- repaired plan can pass only if it reaches the new floor

## Workstream 3: Tighten Compiler and Executor Observability

### Objective

Make the server output measurable and auditable in terms of compiled WBS and dependency graph quality.

### Scope

- `packages/server/src/initial-generation/compiler.ts`
- `packages/server/src/initial-generation/executor.ts`
- compiler/executor tests
- orchestrator compile logs

### Tasks

1. Extend compiler result metadata to include:
   - compiled task count
   - compiled dependency count
   - top-level phase count after compilation

2. Ensure dependency count is explicitly logged in `compile_verdict`.

3. Confirm compiled dependencies survive into the `create_tasks_batch` payload exactly as expected by `commandService`.

4. Add targeted tests for:
   - dependency count in compiled output
   - cross-phase dependency preservation
   - no silent compile success with zero dependencies for broad plans that should have them

### Acceptance Criteria

- compile logs report dependency count
- executor tests prove dependency-bearing batch payloads are produced
- no false success where WBS exists but dependency graph is empty

## Workstream 4: Fix Manual Validation Surface

### Objective

Make human verification block on actual route correctness and actual pipeline execution.

### Scope

- `.planning/phases/41-initial-gen-refactor/docs.md`
- `.planning/phases/41-initial-gen-refactor/41-HUMAN-UAT.md`
- remediation docs in this folder

### Tasks

1. Update manual verification checklist to require:
   - route is `initial_generation`
   - `planning_output` exists
   - `compile_verdict` exists
   - dependency links exist in final schedule
   - WBS breadth exceeds trivial floor

2. Add a “false positive” warning:
   - task creation alone is not enough
   - assistant success text alone is not enough
   - if route was `mutation`, validation fails

3. Make the live prompt `Нарисуй график строительства жилого дома на 3 этажа + гараж` mandatory in UAT.

### Acceptance Criteria

- a run cannot be marked successful if it silently used mutation flow
- UAT explicitly checks dependency graph and route logs

## Workstream 5: Regression Suite

### Objective

Lock the remediation in tests so the same architectural mistake cannot reappear.

### Scope

- `packages/server/src/agent.test.ts`
- `packages/server/src/initial-generation/planner.test.ts`
- `packages/server/src/initial-generation/compiler.test.ts`
- `packages/server/src/initial-generation/orchestrator.test.ts`

### Tasks

1. Add route-decision tests for wording variants:
   - `Нарисуй график ...`
   - `Построй график ...`
   - `Составь график ...`

2. Add planner tests for weak-plan rejection:
   - zero dependencies
   - too few tasks
   - too few phases

3. Add orchestrator tests asserting:
   - route selection evidence is logged
   - planning metrics are logged
   - compile metrics are logged

4. Add end-to-end simulation tests proving:
   - broad empty-project request cannot end in mutation flow without explicit decision

### Acceptance Criteria

- regression suite fails if routing falls back to regex-like broad intent handling
- regression suite fails if broad schedule quality floor is reduced

## Delivery Order

1. Workstream 1: route decision
2. Workstream 2: planner quality floor
3. Workstream 3: compiler/executor observability
4. Workstream 5: regression suite
5. Workstream 4: docs/UAT refresh

Reason:
- route correctness is the main blocker
- quality floor only matters after the correct route is entered
- docs should be updated after behavior is locked

## Risks

- Structured route decision may add latency
- Model-driven routing can become flaky if output schema is weak
- Quality floor may become too strict and reject useful plans
- Dependency minimums may need object-type-specific tuning

## Risk Controls

- keep route-decision output schema tiny
- log confidence and signals for every decision
- default uncertain broad empty-project cases toward `initial_generation`, not `mutation`
- tune quality thresholds in tests using real prompt fixtures from logs

## Implementation Notes

- Do not add more regex branches
- Do not paper over the problem with `нарисуй|спланируй|набросай`
- Do not reintroduce mutation-agent fallback as a “temporary safety net”
- Preserve Phase 41 planner/compiler separation; the remediation is about gateway correctness and product floor, not collapsing stages back together
