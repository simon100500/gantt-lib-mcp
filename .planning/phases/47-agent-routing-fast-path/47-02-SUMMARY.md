---
phase: 47-agent-routing-fast-path
plan: 02
subsystem: specialized split-task routing
tags: [typescript, routing, split-task, specialized-executor, tests]
requires:
  - phase: 47-agent-routing-fast-path
    plan: 01
    provides: strict route envelope, specialized executor metadata, and route-first gating
provides:
  - explicit split-task executor resolution for decompose_task
  - direct specialized handoff from staged mutation orchestration into split-task.ts
  - regression coverage proving decompose_task never becomes a low-level mutation command
affects: [47-03, split-task, mutation-routing]
tech-stack:
  added: []
  patterns: [specialized executor seam, isolated split-task handoff, authoritative command boundary]
key-files:
  created:
    - .planning/phases/47-agent-routing-fast-path/47-02-SUMMARY.md
    - packages/server/src/split-task.test.ts
  modified:
    - packages/server/src/mutation/types.ts
    - packages/server/src/mutation/resolver.ts
    - packages/server/src/mutation/orchestrator.ts
    - packages/server/src/mutation/orchestrator.test.ts
    - packages/server/src/mutation/execution.test.ts
    - packages/server/src/split-task.ts
key-decisions:
  - "decompose_task remains a route-level primitive; authoritative low-level commands still come only from split-task plan compilation."
  - "The orchestrator owns route selection and handoff, but split-task keeps its isolated planning and command-commit loop."
  - "Specialized executor dependencies are injected through a narrow contract so orchestrator tests can stub the handoff without Prisma or SDK coupling."
patterns-established:
  - "Resolver-first specialized metadata: decompose_task resolution now carries target task, target name, mode, optional range, and confidence."
  - "Executor isolation: runDirectSplitTask returns operational results and authoritative changed ids without leaking low-level decompose_task commands into mutation execution."
requirements-completed: [ARFP-03, ARFP-04]
duration: 22min
completed: 2026-04-22
---

# Phase 47 Plan 02: Specialized Split-Task Handoff Summary

**Confident decomposition requests now leave the ordinary mutation loop and execute through the isolated split-task executor without introducing a low-level `decompose_task` command**

## Performance

- **Duration:** 22 min
- **Started:** 2026-04-22T13:38:37+03:00
- **Completed:** 2026-04-22T14:05:00+03:00
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Added explicit split-task handoff metadata to `ResolvedMutationContext.specializedExecutor`, including `targetTaskId`, `targetTaskName`, `mode`, `rangeFrom`, `rangeTo`, and confidence.
- Updated `runStagedMutation()` to call `runDirectSplitTask()` when a high-confidence `decompose_task` request resolves through `specialized_fast_path`.
- Kept split-task isolated while broadening its internal seam for orchestration/testing: injected planner/version/debug dependencies and returned structured execution results to the caller.
- Added regression coverage across orchestrator, split-task, and execution layers proving decomposition stays specialized and never leaks into the low-level mutation command union.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add explicit specialized executor resolution for decompose_task** - `26061cc` (feat)
2. **Task 2: Hand decompose_task into the isolated split-task executor** - `5b8648e` (feat)

## Files Created/Modified

- `packages/server/src/mutation/types.ts` - specialized split-task resolution contract
- `packages/server/src/mutation/resolver.ts` - decompose-task target resolution with explicit executor metadata
- `packages/server/src/mutation/orchestrator.ts` - specialized split-task handoff path and direct-runner injection seam
- `packages/server/src/mutation/orchestrator.test.ts` - direct split-task handoff regressions
- `packages/server/src/mutation/execution.test.ts` - source guard that decomposition stays out of low-level execution operations
- `packages/server/src/split-task.ts` - structured handoff input/output contract for isolated split execution
- `packages/server/src/split-task.test.ts` - isolated split-task executor regression coverage

## Decisions Made

- The specialized split-task route returns a handled staged result instead of a compatibility fallback, so decomposition success/failure stays visible to chat orchestration.
- `runDirectSplitTask()` accepts injected helpers for planner queries, project version lookup, debug logging, and history lookup to keep the executor testable without changing its production flow.
- The orchestrator passes the original user prompt as split-task `details`, while the resolved handoff object carries the normalized target/mode/range metadata.

## Deviations from Plan

Minor type-contract cleanup was required around the split-task service boundary so the orchestrator, tests, and server build could share one specialized executor interface.

## Issues Encountered

None.

## User Setup Required

None.

## Verification

- `npx tsx --test packages/server/src/mutation/orchestrator.test.ts`
- `npx tsx --test packages/server/src/mutation/orchestrator.test.ts packages/server/src/split-task.test.ts packages/server/src/mutation/execution.test.ts`
- `npm run build -w packages/server`

## Next Phase Readiness

- Plan 03 can now add route-aware telemetry and messaging around an already-working specialized split-task path.
- The specialized boundary is test-locked: decomposition resolves into split-task metadata, routes through the isolated executor, and stays out of low-level command kinds.

## Self-Check: PASSED
