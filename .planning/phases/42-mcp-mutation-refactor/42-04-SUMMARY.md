---
phase: 42-mcp-mutation-refactor
plan: 04
subsystem: api
tags: [mcp, mutation, telemetry, prompts, testing]
requires:
  - phase: 42-01
    provides: staged mutation shell and execution-mode routing
  - phase: 42-02
    provides: typed resolution context and controlled anchor failures
  - phase: 42-03
    provides: typed mutation plans and authoritative deterministic execution
provides:
  - Shared staged mutation success/failure message mapping
  - Final outcome telemetry with execution mode, failure reason, changed tasks, and verification verdict
  - Russian regression coverage for staged success and controlled-failure prompts
  - full_agent prompt guidance bound to ResolvedMutationContext and MutationPlan
affects: [agent, mutation-orchestrator, mcp-prompt, regression-tests]
tech-stack:
  added: []
  patterns: [shared staged message builders, lifecycle telemetry payload locking, prompt-contract regression tests]
key-files:
  created: [packages/server/src/mutation/messages.ts]
  modified: [packages/server/src/mutation/orchestrator.ts, packages/server/src/agent.test.ts, packages/server/src/mutation/orchestrator.test.ts, packages/mcp/agent/prompts/system.md]
key-decisions:
  - "Staged mutation UX now comes from shared server-side message builders so ordinary failures never fall back to the legacy no-tool-call message."
  - "The remaining full_agent path must consume ResolvedMutationContext and optional MutationPlan instead of inventing IDs or dates from scratch."
patterns-established:
  - "Mutation outcome logs always include status, executionMode, failureReason, changedTaskIds, and verificationVerdict."
  - "Prompt-contract regressions are locked through source assertions in server tests."
requirements-completed: [MMR-04, MMR-05]
duration: 4 min
completed: 2026-04-13
---

# Phase 42 Plan 04: Controlled Failure UX, Lifecycle Telemetry, and Russian Regression Coverage Summary

**Shared staged mutation messages, end-to-end final-outcome telemetry, and full_agent prompt constraints now lock common Russian edit requests onto verified success or typed controlled failure paths.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-13T23:47:26+03:00
- **Completed:** 2026-04-13T23:51:49+03:00
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Added `buildMutationFailureMessage()` and `buildMutationSuccessMessage()` so staged mutation outcomes use typed Russian user-facing responses.
- Expanded staged orchestrator coverage for `container_not_resolved`, `group_scope_not_resolved`, `expansion_anchor_not_resolved`, and `verification_failed`, with locked `final_outcome` payloads.
- Constrained the MCP `full_agent` prompt to server-provided `ResolvedMutationContext` and `MutationPlan` instead of invented IDs or dates.

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace generic simple-edit failures with typed controlled user-facing outcomes and lifecycle telemetry** - `778afa6` (test), `f77a20d` (feat)
2. **Task 2: Lock the Russian regression suite and align the `full_agent` prompt to structured resolution context** - `2e4a205` (test), `f5ce21b` (feat)

## Files Created/Modified
- `packages/server/src/mutation/messages.ts` - Shared Russian success/failure messaging for staged mutation outcomes.
- `packages/server/src/mutation/orchestrator.ts` - Uniform final-outcome payload logging plus message-builder integration for staged success and failure branches.
- `packages/server/src/mutation/orchestrator.test.ts` - Regression coverage for deterministic success, group/expand failures, verification failure, and `full_agent` fallback.
- `packages/server/src/agent.test.ts` - Locked Russian prompt classification set and prompt-contract assertions for the remaining `full_agent` path.
- `packages/mcp/agent/prompts/system.md` - Added staged-context instructions for `ResolvedMutationContext` and `MutationPlan`.

## Decisions Made

- Shared message builders own staged mutation UX so the generic no-valid-tool-call string stays isolated to the legacy fallback branch.
- `final_outcome` is the authoritative telemetry envelope for staged runs and always carries execution mode, changed task IDs, and verification verdict.
- The `full_agent` prompt stays narrow: it may consume server-resolved context, but it must not invent IDs, parent placement, or dates when the server already resolved them.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The first prompt draft mentioned raw `parentId`, which broke an existing prompt-guard test that forbids low-level hierarchy language. The prompt was revised to say `parent placement` instead, preserving the staged-context constraint without weakening the higher-level prompt contract.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 42 now has typed staged failure UX, locked lifecycle telemetry, and regression coverage for the current Russian prompt set.
- The remaining mutation work can build on `messages.ts`, `final_outcome` payload guarantees, and the constrained `full_agent` prompt contract without reopening the generic fallback path.

## Self-Check: PASSED

---
*Phase: 42-mcp-mutation-refactor*
*Completed: 2026-04-13*
