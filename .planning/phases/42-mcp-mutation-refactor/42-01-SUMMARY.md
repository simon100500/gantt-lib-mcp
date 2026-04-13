---
phase: 42-mcp-mutation-refactor
plan: 01
subsystem: api
tags: [typescript, mutation, orchestration, routing, testing]
requires:
  - phase: 36-unified-scheduling-core
    provides: authoritative commandService mutation boundary
  - phase: 41-initial-gen-refactor
    provides: staged server-side lifecycle pattern for AI execution
provides:
  - typed staged mutation contracts for intent, routing, and orchestration results
  - intent-family classification for ordinary conversational edits
  - explicit deterministic, hybrid, and full_agent mutation mode selection
  - agent.ts handoff into a staged mutation shell with typed legacy fallback
affects: [phase-42, mutation, agent-orchestration, telemetry]
tech-stack:
  added: []
  patterns: [staged-mutation-shell, typed-intent-routing, source-locked-regression-tests]
key-files:
  created:
    - packages/server/src/mutation/types.ts
    - packages/server/src/mutation/intent-classifier.ts
    - packages/server/src/mutation/execution-routing.ts
    - packages/server/src/mutation/orchestrator.ts
    - packages/server/src/mutation/intent-classifier.test.ts
    - packages/server/src/mutation/orchestrator.test.ts
  modified:
    - packages/server/src/agent.ts
    - packages/server/src/agent.test.ts
key-decisions:
  - "Ordinary mutation requests now enter a typed staged shell before any legacy SDK mutation attempt."
  - "Intent classification owns requiresResolution and requiresSchedulingPlacement so agent.ts does not recompute those flags ad hoc."
patterns-established:
  - "Mutation lifecycle modules mirror the Phase 41 initial-generation split: types, classifier, router, orchestrator."
  - "Legacy freeform mutation remains reachable only through an explicit deferred_to_legacy orchestration result."
requirements-completed: [MMR-01]
duration: 7min
completed: 2026-04-13
---

# Phase 42 Plan 01: Staged Mutation Shell Summary

**Typed staged mutation contracts, intent-family routing, and an `agent.ts` handoff that enters mutation classification before the legacy freeform path**

## Performance

- **Duration:** 7 min
- **Started:** 2026-04-13T20:13:47Z
- **Completed:** 2026-04-13T20:20:24Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Added a first-class `packages/server/src/mutation/` subsystem with locked intent families, failure reasons, and execution modes.
- Classified core Russian mutation prompts into explicit mutation families and routed them into `deterministic`, `hybrid`, or `full_agent`.
- Routed ordinary mutation requests from `agent.ts` into the staged shell before legacy SDK execution while preserving typed fallback to the current mutation path.

## Task Commits

Each task was committed atomically:

1. **Task 1: Define staged mutation contracts, intent taxonomy, and mode routing** - `f211f1c` (feat)
2. **Task 2: Hand ordinary edits from `agent.ts` into the staged mutation shell** - `e50886e` (feat)

## Files Created/Modified
- `packages/server/src/mutation/types.ts` - Locked staged mutation contracts for intent, routing, plans, results, and failure reasons.
- `packages/server/src/mutation/intent-classifier.ts` - Intent-family classifier for ordinary mutation prompts with explicit resolution and placement flags.
- `packages/server/src/mutation/execution-routing.ts` - Explicit mapping from mutation family to `deterministic`, `hybrid`, or `full_agent`.
- `packages/server/src/mutation/orchestrator.ts` - Stage 1 staged-mutation entrypoint with typed deferred fallback to the legacy flow.
- `packages/server/src/mutation/intent-classifier.test.ts` - Regression coverage for the locked Russian classifier prompt set and mode routing.
- `packages/server/src/mutation/orchestrator.test.ts` - Coverage for staged orchestration classification, routing, and deferred fallback semantics.
- `packages/server/src/agent.ts` - Staged mutation lifecycle logging and handoff before the legacy mutation attempt.
- `packages/server/src/agent.test.ts` - Regressions locking staged-shell call order and classifier outputs.

## Decisions Made
- Ordinary mutation requests now cross a typed orchestration boundary before any legacy mutation SDK run starts.
- `agent.ts` logs `mutation_lifecycle_started`, `intent_classified`, and `execution_mode_selected` before legacy mutation execution becomes possible.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Tightened orchestrator broadcast typing to the existing server WebSocket contract**
- **Found during:** Task 2 (Hand ordinary edits from `agent.ts` into the staged mutation shell)
- **Issue:** `npm run build -w packages/server` failed because the staged orchestrator accepted `unknown` WebSocket payloads while `agent.ts` passes the concrete `ServerMessage` broadcaster.
- **Fix:** Imported `ServerMessage` into the orchestrator and constrained `broadcastToSession` to the existing server message type.
- **Files modified:** packages/server/src/mutation/orchestrator.ts
- **Verification:** `npx tsx --test packages/server/src/agent.test.ts packages/server/src/mutation/intent-classifier.test.ts packages/server/src/mutation/orchestrator.test.ts && npm run build -w packages/server`
- **Committed in:** e50886e

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** The auto-fix was required to keep the staged shell compatible with the current server integration. No scope change.

## Issues Encountered
- The first Task 2 build exposed a type mismatch between the new orchestrator boundary and the existing WebSocket broadcaster. The boundary was tightened to the current server contract and reverified.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 42 now has a stable staged mutation entrypoint for adding resolution, mutation-plan formation, and deterministic execution in later plans.
- Legacy freeform mutation remains intact behind a typed `deferred_to_legacy` boundary, so future plans can replace stages incrementally without regressing current behavior.

## Self-Check: PASSED
- Found summary file: `.planning/phases/42-mcp-mutation-refactor/42-01-SUMMARY.md`
- Found task commit: `f211f1c`
- Found task commit: `e50886e`

---
*Phase: 42-mcp-mutation-refactor*
*Completed: 2026-04-13*
