---
phase: 41-initial-gen-refactor
plan: 04
subsystem: api
tags: [initial-generation, orchestration, observability, testing]
requires:
  - phase: 41-02
    provides: domain brief, reference injection, and ProjectPlan quality gate
  - phase: 41-03
    provides: deterministic compiler, partial salvage, and commandService execution
provides:
  - production initial-generation orchestration from planning through compile/commit
  - reconstructable lifecycle logs and controlled assistant responses
  - regression coverage plus manual verification prompts for broad construction requests
affects: [agent-routing, server-debug-logs, initial-generation-tests, phase-41-docs]
tech-stack:
  added: []
  patterns: [two-stage initial-generation orchestration, controlled compile failure handling, lifecycle event logging]
key-files:
  created:
    - .planning/phases/41-initial-gen-refactor/docs.md
  modified:
    - packages/server/src/agent.ts
    - packages/server/src/initial-generation/orchestrator.ts
    - packages/server/src/initial-generation/orchestrator.test.ts
key-decisions:
  - "The agent now passes a dedicated planner SDK query and project baseVersion into the initial-generation orchestrator instead of reusing mutation execution."
  - "Controlled initial-generation failures are surfaced as assistant messages with final lifecycle logs, not as a silent fallback into ordinary mutation flow."
patterns-established:
  - "Initial generation ends inside the orchestrator: save assistant reply, broadcast tasks on success, and emit a final acceptance or rejection event."
  - "Regression tests for this flow assert prompt injection, schema rejection, repair logging, and compile verdict payloads from the same entrypoint."
requirements-completed: [IGR-04]
duration: 5min
completed: 2026-04-08
---

# Phase 41 Plan 04: Initial Generation Wiring Summary

**Initial-generation requests now run through a logged planning-to-compile orchestrator with controlled failure handling, production agent wiring, and a locked verification matrix.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-08T11:38:55Z
- **Completed:** 2026-04-08T11:44:10Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Replaced the placeholder initial-generation shell with a real orchestrator that resolves domain context, model routing, plan execution, user messaging, and success broadcasts.
- Wired `agent.ts` to provide planner-run dependencies and project versioning while preserving ordinary mutation routing semantics.
- Expanded orchestration regression coverage and added a phase-local manual prompt matrix including `Построй график`.

## Task Commits

1. **Task 1: Wire the completed planning-to-compile pipeline and lifecycle logs into the server agent** - `063fe4a` (test), `cf9c034` (feat)
2. **Task 2: Lock in the regression surface and manual validation checklist for Phase 41** - `0a1c6c1` (test)

## Files Created/Modified
- `packages/server/src/agent.ts` - passes planner query, base version, and broadcasts into the initial-generation orchestration path
- `packages/server/src/initial-generation/orchestrator.ts` - coordinates brief/reference inference, model routing, planning, compile execution, controlled replies, and lifecycle logging
- `packages/server/src/initial-generation/orchestrator.test.ts` - covers prompt injection, schema rejection, repair, complete/partial/rejected compile outcomes, and log payloads
- `.planning/phases/41-initial-gen-refactor/docs.md` - manual verification matrix and scope guardrails for the Phase 41 flow

## Decisions Made

- Used the orchestrator as the final delivery boundary for initial generation so success paths save the assistant message and broadcast tasks without re-entering mutation flow code.
- Kept planner execution as a dedicated SDK query run chosen before orchestration starts, matching the locked model-routing requirement.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The new orchestration test harness initially leaked an optional dependency type into `tsc`; narrowing it to `ExecuteInitialProjectPlanResult` resolved the build without changing runtime behavior.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 41 is ready for verification: route/model/planner/compiler observability is present, automated regressions pass, and the manual prompt matrix is in the phase directory.
- No known blockers remain for this phase.

## Self-Check: PASSED

- Found `.planning/phases/41-initial-gen-refactor/41-04-SUMMARY.md`
- Found commit `063fe4a`
- Found commit `cf9c034`
- Found commit `0a1c6c1`

---
*Phase: 41-initial-gen-refactor*
*Completed: 2026-04-08*
