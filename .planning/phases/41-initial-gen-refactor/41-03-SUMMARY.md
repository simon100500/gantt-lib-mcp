---
phase: 41-initial-gen-refactor
plan: 03
subsystem: api
tags: [initial-generation, scheduling, command-service, testing]
requires:
  - phase: 41-01
    provides: initial_generation routing shell and typed model-routing contracts
  - phase: 41-02
    provides: validated ProjectPlan inputs and planning-stage quality gate
provides:
  - deterministic ProjectPlan-to-create_tasks_batch compiler
  - partial-build executor with locked salvage thresholds
  - focused regression coverage for dependency scheduling and controlled rejection
affects: [phase-41-orchestration, observability, initial-generation]
tech-stack:
  added: []
  patterns: [deterministic nodeKey hashing, compiler-boundary validation, authoritative batch commit]
key-files:
  created:
    - packages/server/src/initial-generation/compiler.ts
    - packages/server/src/initial-generation/executor.ts
  modified:
    - packages/server/src/initial-generation/compiler.test.ts
key-decisions:
  - "Deterministic task IDs are derived from projectId and nodeKey so repeated compiles for the same plan/serverDate stay byte-stable."
  - "Partial execution removes only broken links, cycle edges, and empty containers, then enforces the 60% and 3-top-level-phase floor before commit."
patterns-established:
  - "Initial generation compiles directly to one create_tasks_batch command instead of going through mutation-agent helpers."
  - "Phase containers are emitted as batch tasks, but their dates come only from descendant rollup."
requirements-completed: [IGR-03]
duration: 25min
completed: 2026-04-08
---

# Phase 41 Plan 03: Deterministic execution compiler and guarded partial-build commit Summary

**Deterministic ProjectPlan compilation now produces one authoritative `create_tasks_batch` command with stable nodeKey mapping, working-day dependency scheduling, phase rollups, and guarded partial-build execution through `commandService`.**

## Performance

- **Duration:** 25 min
- **Started:** 2026-04-08T11:07:12Z
- **Completed:** 2026-04-08T11:32:12Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Added `compileInitialProjectPlan()` to validate plan shape, generate deterministic task IDs, compute working-day dates, support `FS/SS/FF/SF` with lag, and emit one `create_tasks_batch` payload.
- Added `executeInitialProjectPlan()` to try a full compile first, prune only technical breakage on failure, enforce the locked salvage floor, and commit exactly one batch via `commandService.commitCommand(..., 'agent', ...)`.
- Expanded `compiler.test.ts` to lock working-day duration handling, parent rollup ranges, dependency formulas, partial-build success, controlled weak-result rejection, and the absence of mutation-agent fallback symbols.

## Task Commits

Each task was committed atomically:

1. **Task 1: deterministic compiler TDD RED** - `2c41c7b` (`test`)
2. **Task 1: deterministic compiler implementation** - `c0b4b47` (`feat`)
3. **Task 2: executor salvage TDD RED** - `4d8c308` (`test`)
4. **Task 2: executor salvage implementation** - `ddfc09c` (`feat`)

## Files Created/Modified

- `packages/server/src/initial-generation/compiler.ts` - deterministic compiler, boundary validation, working-day date math, dependency handling, and rollup emission.
- `packages/server/src/initial-generation/executor.ts` - compile/commit helper with partial-build cleanup, threshold checks, and controlled rejection semantics.
- `packages/server/src/initial-generation/compiler.test.ts` - regression coverage for compiler invariants and executor salvage outcomes.

## Decisions Made

- Deterministic IDs use a stable hash of `projectId:nodeKey` so repeated compiles produce identical command payloads.
- The compiler performs its own validation and cycle detection instead of depending on later persistence failures.
- Partial outcomes are user-visible only as partial builds; executor errors avoid compiler-internal jargon.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- `npm run build -w packages/server` initially failed because the new executor test mock used a narrower `commitCommand` signature than the real command-service contract. The mock was typed against `CommitProjectCommandRequest`/`CommitProjectCommandResponse`, after which the package build passed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 41 now has the deterministic execution side required for orchestration wiring and lifecycle logging.
- The next plan can call compiler/executor directly and attach observability around route selection, planning verdicts, dropped nodes/links, and final acceptance.

## Self-Check: PASSED

- Verified summary and all owned implementation files exist on disk.
- Verified task commits `2c41c7b`, `c0b4b47`, `4d8c308`, and `ddfc09c` exist in git history.

---
*Phase: 41-initial-gen-refactor*
*Completed: 2026-04-08*
