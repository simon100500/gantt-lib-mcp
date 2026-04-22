---
phase: 47-agent-routing-fast-path
plan: 01
subsystem: api
tags: [typescript, routing, orchestration, mutation, tests]
requires:
  - phase: 46-mcp-replace
    provides: direct in-process mutation execution and current staged mutation shell
provides:
  - strict mutation route envelope with risk bands and decompose_task intent
  - route-first mutation orchestration with clarify and specialized gating
  - compatibility projection from route classes into deterministic, hybrid, and full_agent modes
affects: [47-02, 47-03, mutation-routing, split-task]
tech-stack:
  added: []
  patterns: [route-first mutation envelope, explicit clarify gating, specialized executor readiness checks]
key-files:
  created: [.planning/phases/47-agent-routing-fast-path/47-01-SUMMARY.md]
  modified:
    - packages/server/src/mutation/types.ts
    - packages/server/src/mutation/intent-classifier.ts
    - packages/server/src/mutation/execution-routing.ts
    - packages/server/src/mutation/resolver.ts
    - packages/server/src/mutation/orchestrator.ts
    - packages/server/src/mutation/intent-classifier.test.ts
    - packages/server/src/mutation/orchestrator.test.ts
    - packages/server/src/mutation/plan-builder.test.ts
    - packages/server/src/mutation/resolver.test.ts
    - packages/server/src/split-task.ts
key-decisions:
  - "Mutation classification now emits a strict routeEnvelope and compatibility flags derive from it instead of acting as primary model output."
  - "Clarify and agent_path requests stop with typed pre-execution failures in the staged shell rather than silently drifting into legacy fallback."
  - "specialized_fast_path stays isolated: decompose_task resolves specialized readiness and is gated in the orchestrator until Plan 02 wires the split-task handoff."
patterns-established:
  - "Route-first orchestration: log route_selected before resolution and branch by route envelope, not by freeform intent fallback."
  - "Specialized executor seam: resolver publishes executor readiness so orchestrator can block unsafe structural routes before command planning."
requirements-completed: [ARFP-01, ARFP-02]
duration: 12min
completed: 2026-04-22
---

# Phase 47 Plan 01: agent-routing-fast-path Summary

**Strict mutation route envelopes with risk bands, decompose-task classification, and route-first orchestration gates ahead of specialized execution work**

## Performance

- **Duration:** 12 min
- **Started:** 2026-04-22T10:24:30Z
- **Completed:** 2026-04-22T10:58:00+03:00
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments

- Added `MutationRoute`, `MutationRiskLevel`, and `MutationRouteEnvelope` to the shared mutation contracts and extended intent parsing with `decompose_task`.
- Reworked the cheap classifier to request schema-constrained routing JSON and emit explicit `fast_path`, `specialized_fast_path`, `agent_path`, and `clarify` envelopes.
- Refactored staged mutation orchestration to log `route_selected`, gate clarify and structural specialized routes before execution, and preserve downstream execution-mode compatibility.
- Normalized legacy builders and the split-task bridge to the new route-envelope contract so Phase 47 tests and the server build compile cleanly.

## Task Commits

Each task was committed atomically:

1. **Task 1: Define the strict route envelope and cheap router output** - `6e55af6` (feat)
2. **Task 2: Consume the route envelope in orchestration and resolver gating** - `1df9e5c` (feat)
3. **Compatibility cleanup for route-envelope fixtures and split-task bridge** - `c74d268` (fix)

## Files Created/Modified

- `packages/server/src/mutation/types.ts` - shared route envelope, risk bands, and resolver readiness metadata
- `packages/server/src/mutation/intent-classifier.ts` - schema-constrained route parser with derived compatibility fields
- `packages/server/src/mutation/execution-routing.ts` - compatibility projection from route classes to execution modes
- `packages/server/src/mutation/resolver.ts` - specialized executor readiness and ambiguity-aware decompose-task resolution
- `packages/server/src/mutation/orchestrator.ts` - route_selected logging and pre-execution clarify/specialized gating
- `packages/server/src/mutation/intent-classifier.test.ts` - route-envelope classification regressions
- `packages/server/src/mutation/orchestrator.test.ts` - route-first orchestration and structural gating regressions
- `packages/server/src/mutation/plan-builder.test.ts` - Phase 47 intent fixture defaults for typed route-envelope compilation
- `packages/server/src/mutation/resolver.test.ts` - Phase 47 resolver fixture defaults for typed route-envelope compilation
- `packages/server/src/split-task.ts` - route-envelope compatibility for the isolated split-task bridge

## Decisions Made

- Route classes are now the primary mutation-routing contract; `executionMode`, `requiresResolution`, and `requiresSchedulingPlacement` remain compatibility projections.
- `clarify` and `agent_path` are treated as explicit staged outcomes, not as permission to fall back into the legacy mutation loop.
- `decompose_task` stops at a typed specialized gate in Plan 01 so Plan 02 can wire the isolated `split-task` executor without changing this routing boundary.

## Deviations from Plan

Minor compatibility cleanup was required outside the original file list so older fixtures and the split-task bridge could compile against the new route-envelope shape.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Verification

- `npx tsx --test packages/server/src/mutation/orchestrator.test.ts`
- `npx tsx --test packages/server/src/mutation/plan-builder.test.ts packages/server/src/mutation/resolver.test.ts packages/server/src/mutation/intent-classifier.test.ts packages/server/src/mutation/orchestrator.test.ts`
- `npm run build -w packages/server`

## Next Phase Readiness

- Plan 02 can attach the isolated `split-task` executor to the existing `specialized_fast_path` seam without redesigning classifier or orchestration contracts.
- Route selection, clarify handling, structural gating, and compile hygiene are locked by regression tests and a clean `packages/server` build.

## Self-Check: PASSED
