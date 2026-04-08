---
phase: 41-initial-gen-refactor
plan: 01
subsystem: api
tags: [typescript, routing, model-selection, initial-generation, qwen-sdk]
requires:
  - phase: 40-yandex-auth
    provides: existing server agent orchestration and logging flow
provides:
  - typed initial-generation contracts and helper modules
  - explicit empty-project route selection for initial_generation vs mutation
  - explicit strong-vs-cheap model routing decisions for server agent runs
affects: [phase-41-02, phase-41-03, phase-41-04, server-agent]
tech-stack:
  added: []
  patterns: [interface-first orchestration shell, typed route selection, typed model routing decisions]
key-files:
  created:
    - packages/server/src/initial-generation/types.ts
    - packages/server/src/initial-generation/route-selection.ts
    - packages/server/src/initial-generation/model-routing.ts
    - packages/server/src/initial-generation/orchestrator.ts
  modified:
    - packages/server/src/agent.ts
    - packages/server/src/agent.test.ts
key-decisions:
  - "Empty-project broad prompts now route through selectAgentRoute() before any fast path or SDK run."
  - "Server-side model choice is resolved once per run through resolveModelRoutingDecision() and logged as a typed decision."
patterns-established:
  - "Initial-generation boundary: broad empty-project requests delegate to runInitialGeneration() instead of mutating through template shortcuts."
  - "Model routing boundary: mutation runs can use OPENAI_CHEAP_MODEL while initial generation stays on the strong model."
requirements-completed: [IGR-01]
duration: 18 min
completed: 2026-04-08
---

# Phase 41 Plan 01: Contracts and Routing Shell Summary

**Initial-generation routing shell with typed contracts, typed model selection, and removal of the deterministic template bootstrap path**

## Performance

- **Duration:** 18 min
- **Started:** 2026-04-08T11:02:08Z
- **Completed:** 2026-04-08T11:20:08Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Added `initial-generation` contract modules for route selection, model routing, and a stable orchestrator entrypoint.
- Removed the broad-request `initial_schedule_template` shortcut from `packages/server/src/agent.ts`.
- Routed empty broad prompts into `initial_generation` and logged explicit `route_selection` and `model_routing_decision` payloads before SDK execution.

## Task Commits

Each task was committed atomically:

1. **Task 1: Define initial-generation routing and orchestration contracts** - `9e606d5` (feat)
2. **Task 2: Remove the template fast path and route empty broad requests into the new initial-generation shell** - `1c0e48a` (feat)

## Files Created/Modified

- `packages/server/src/initial-generation/types.ts` - Locked Phase 41 contracts for generation mode, plan nodes, dependencies, quality verdicts, model routing, and compiled schedule results.
- `packages/server/src/initial-generation/route-selection.ts` - Empty-project route classifier that promotes broad bootstrap requests to `initial_generation`.
- `packages/server/src/initial-generation/model-routing.ts` - Strong-vs-cheap model resolver with explicit fallback reasons.
- `packages/server/src/initial-generation/orchestrator.ts` - Stable `runInitialGeneration()` shell for later planning/compile implementation.
- `packages/server/src/agent.ts` - Main server agent now delegates broad empty-project requests to the new route/orchestrator shell and resolves model choice before SDK runs.
- `packages/server/src/agent.test.ts` - Regression coverage for route selection, model routing, vague bootstrap prompts, and agent integration surface.

## Decisions Made

- Route selection is computed from user message plus empty-project state at the top of `runAgentWithHistory()` so later plans can extend orchestration without reopening agent semantics.
- Mutation-model selection now happens outside the SDK call and produces typed reasons, which keeps model policy observable and testable.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- A first pass at Task 1 tests captured the vague `Построй график` behavior too early in `isMutationIntent`; the test was moved into the Task 2 scope and then satisfied by the agent refactor.

## User Setup Required

None - no external service configuration required.

## Known Stubs

- `packages/server/src/initial-generation/orchestrator.ts:28` and `packages/server/src/initial-generation/orchestrator.ts:35` - `runInitialGeneration()` is intentionally a stable shell that logs and rejects until Phase 41 later plans add planning/compile execution.

## Next Phase Readiness

- Phase 41 now has stable call sites and typed boundaries for brief generation, plan validation, and deterministic compilation.
- Later plans can implement `runInitialGeneration()` internals without changing `agent.ts` route or model-selection semantics.

## Self-Check

PASSED

- Found `.planning/phases/41-initial-gen-refactor/41-01-SUMMARY.md`
- Found task commit `9e606d5`
- Found task commit `1c0e48a`

---
*Phase: 41-initial-gen-refactor*
*Completed: 2026-04-08*
