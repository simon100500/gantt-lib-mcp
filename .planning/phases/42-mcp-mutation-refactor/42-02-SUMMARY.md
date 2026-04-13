---
phase: 42-mcp-mutation-refactor
plan: 02
subsystem: api
tags: [typescript, prisma, mcp, mutation, resolver, orchestration]
requires:
  - phase: 42-01
    provides: staged mutation shell, intent classification, execution mode routing
provides:
  - server-side task, container, branch, and group resolution helpers
  - typed mutation resolution context construction for short natural-language edits
  - staged orchestrator resolution gate with typed unresolved-anchor failures
affects: [phase-42-03, phase-42-04, mutation-execution, debug-telemetry]
tech-stack:
  added: []
  patterns: [read-only resolution helpers in TaskService, typed staged mutation failure gating]
key-files:
  created:
    - packages/server/src/mutation/resolver.ts
    - packages/server/src/mutation/resolver.test.ts
  modified:
    - packages/mcp/src/services/task.service.ts
    - packages/server/src/mutation/orchestrator.ts
    - packages/server/src/mutation/orchestrator.test.ts
    - packages/server/src/mutation/types.ts
    - packages/server/src/agent.test.ts
key-decisions:
  - "Resolver helpers stay read-only inside TaskService so Stage 2 can gather evidence without mutating project state."
  - "Ordinary staged mutations now stop with typed controlled failures after resolution; only full_agent and unsupported intents may still fall back to the legacy path."
patterns-established:
  - "Resolution-first mutation gating: classification must produce server-side evidence before later planning or execution stages run."
  - "Low-confidence or ambiguous anchors map to typed failure reasons instead of silent legacy mutation fallback."
requirements-completed: [MMR-02, MMR-04]
duration: 8min
completed: 2026-04-13
---

# Phase 42 Plan 02: Server-side Resolution Summary

**Read-only task/container/group resolution with typed staged mutation failures for unresolved ordinary edits**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-13T20:23:13Z
- **Completed:** 2026-04-13T20:30:58Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Added reusable TaskService helpers for task-name search, container discovery, branch summaries, and repeated group scope detection.
- Introduced `resolveMutationContext()` to build typed resolution evidence for anchors, containers, predecessors/successors, and placement policy.
- Wired resolution into the staged orchestrator so unresolved ordinary intents return typed failures before any blind legacy mutation attempt.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add read-only search helpers for task, container, branch, and group resolution** - `908b0a5` (test), `0771ca6` (feat)
2. **Task 2: Wire the resolver into the staged orchestrator and return typed controlled failures on unresolved anchors** - `2c56a0c` (test), `7674142` (feat)

## Files Created/Modified

- `packages/mcp/src/services/task.service.ts` - read-only search helpers and compact match/group outputs for staged resolution.
- `packages/server/src/mutation/resolver.ts` - typed server-side resolution stage for short natural-language mutation intents.
- `packages/server/src/mutation/resolver.test.ts` - resolver regression coverage for success cases and unresolved anchor/container/group scenarios.
- `packages/server/src/mutation/orchestrator.ts` - Stage 2 wiring, resolution lifecycle logs, confidence gate, and typed controlled failure mapping.
- `packages/server/src/mutation/orchestrator.test.ts` - regression coverage for typed unresolved failures and legacy fallback boundaries.
- `packages/server/src/mutation/types.ts` - updated placement policies and top-level failure reason on orchestration results.
- `packages/server/src/agent.test.ts` - locked Russian prompt coverage for resolver-backed staging routes.

## Decisions Made

- Kept resolution logic read-only and colocated with TaskService read paths so later mutation planning can consume consistent evidence without side effects.
- Stopped ordinary staged mutations at typed controlled failures for now instead of allowing blind legacy fallback; later phases can replace these controlled stops with plan/execution stages.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Server build initially failed because the resolver imported an unexported subpath type from `@gantt/mcp`; this was corrected by switching to a local structural contract in the resolver module.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 42 Plan 03 can consume `resolutionContext` as a first-class input for typed mutation-plan formation and deterministic execution.
- Resolution telemetry and controlled failure reasons are in place for the later UX/logging phase.

## Self-Check: PASSED
