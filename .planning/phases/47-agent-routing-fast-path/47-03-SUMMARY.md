---
phase: 47-agent-routing-fast-path
plan: 03
subsystem: route-aware messaging and telemetry
tags: [typescript, telemetry, messaging, regressions, routing]
requires:
  - phase: 47-agent-routing-fast-path
    plan: 01
    provides: strict route envelope and pre-execution gating
  - phase: 47-agent-routing-fast-path
    plan: 02
    provides: working specialized split-task handoff
provides:
  - route-aware success and failure messaging for staged mutations
  - explicit telemetry for specialized execution and agent escalation
  - regression guards against decomposition leaking back into generic mutation execution
affects: [verification, mutation-routing, split-task]
tech-stack:
  added: []
  patterns: [route-aware user messaging, specialized executor telemetry, source-level regression guards]
key-files:
  created:
    - .planning/phases/47-agent-routing-fast-path/47-03-SUMMARY.md
  modified:
    - packages/server/src/mutation/messages.ts
    - packages/server/src/mutation/orchestrator.ts
    - packages/server/src/mutation/intent-classifier.test.ts
    - packages/server/src/mutation/orchestrator.test.ts
    - packages/server/src/mutation/execution.test.ts
key-decisions:
  - "Route-aware user messaging is emitted from the shared message builders so deterministic, specialized, and escalated paths describe the actual route instead of generic mutation-loop wording."
  - "The orchestrator logs specialized executor start/completion and explicit agent escalation selection with route/risk metadata for later debugging."
  - "Regression guards read source seams directly where needed so decompose_task cannot silently re-enter low-level command unions or bypass split-task plan helpers."
patterns-established:
  - "Operational specialized messaging: decomposition success names the target task and resulting child-count instead of generic update acknowledgements."
  - "Telemetry-first staged routing: route_selected, specialized_executor_started, specialized_executor_completed, and agent_escalation_selected reconstruct the full Phase 47 boundary."
requirements-completed: [ARFP-05, ARFP-06]
duration: 18min
completed: 2026-04-22
---

# Phase 47 Plan 03: Route-Aware Messaging and Telemetry Summary

**Phase 47 now ends with route-aware operational messaging, explicit specialized/excalation telemetry, and regression guards that prevent decomposition from sliding back into generic mutation execution**

## Performance

- **Duration:** 18 min
- **Started:** 2026-04-22T14:08:00+03:00
- **Completed:** 2026-04-22T14:26:00+03:00
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Extended shared mutation message builders so specialized and escalated failures refer to the real route/step instead of generic no-tool-call phrasing.
- Added telemetry for `specialized_executor_started`, `specialized_executor_completed`, and `agent_escalation_selected`, alongside the existing `route_selected` event.
- Added final regression coverage for low-confidence structural clarify handling, explicit S3 `agent_path` routing, and split-task/source-level boundary guards.
- Re-ran the route-aware mutation suites and a full `packages/server` build to confirm the Phase 47 boundary is observable and build-clean.

## Task Commits

Each task was committed atomically:

1. **Task 1: Make mutation messages and telemetry route-aware** - `d307efa` (test), `e444da0` (feat)
2. **Task 2: Lock the specialized isolation and escalation boundary with regression guards** - `e30a8bd` (test)

## Files Created/Modified

- `packages/server/src/mutation/messages.ts` - route-aware success/failure messaging
- `packages/server/src/mutation/orchestrator.ts` - specialized executor and agent escalation telemetry
- `packages/server/src/mutation/intent-classifier.test.ts` - explicit S3/agent-path routing regression
- `packages/server/src/mutation/orchestrator.test.ts` - route-aware telemetry and clarify/escalation regression coverage
- `packages/server/src/mutation/execution.test.ts` - split-task/source guard against low-level decompose-task leakage

## Decisions Made

- Specialized decomposition success is communicated as an operational route result, not as a generic “updated tasks” acknowledgement.
- Agent escalation remains explicit and visible in telemetry rather than being inferred from downstream compatibility execution mode.
- Source-level guards are acceptable here because the main architectural risk is silent contract erosion at the split-task seam, not only runtime behavior.

## Deviations from Plan

The plan needed a small extra regression pass after the route-aware messaging commit so clarify-path and split-task source guards were locked alongside the new telemetry events.

## Issues Encountered

None.

## User Setup Required

None.

## Verification

- `npx tsx --test packages/server/src/mutation/intent-classifier.test.ts packages/server/src/mutation/orchestrator.test.ts packages/server/src/mutation/execution.test.ts`
- `npm run build -w packages/server`

## Next Phase Readiness

- Phase 47 is ready for phase-level verification and completion.
- The routing boundary is now test-locked across classifier, orchestrator, specialized executor, messaging, and low-level execution seams.

## Self-Check: PASSED
