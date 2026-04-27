---
phase: 48-resource-screen
plan: 05
subsystem: ui
tags: [react, resource-planner, regression, deprecation, vitest]
requires:
  - phase: 48-resource-screen
    plan: 04
    provides: controlled resource planner move persistence
provides:
  - Final Phase 48 focused regression coverage
  - Deprecated fallback marker for ResourceTimelineGrid
  - Verification that ResourcePlannerWorkspace no longer imports the local grid
affects: [resource-screen, workspace-ui, tests]
tech-stack:
  added: []
  patterns:
    - Legacy local timeline grid remains test fixture/fallback only
    - M004 flow asserts gantt-lib resource planner output rather than local grid geometry
key-files:
  modified:
    - packages/web/src/components/workspace/ResourceTimelineGrid.tsx
    - packages/web/src/components/workspace/__tests__/M004.resource-planning-flow.test.tsx
key-decisions:
  - "Keep ResourceTimelineGrid in place as a deprecated fallback/test fixture instead of deleting it."
  - "The integrated M004 flow now verifies the gantt-lib resource planner mock and conflict action metadata."
patterns-established:
  - "Primary resource screen renderer regressions are caught by both ResourcePlannerWorkspace tests and M004 integrated flow coverage."
requirements-completed: [PRD-RESOURCE-SCREEN, PRD-RESOURCE-TESTS, PRD-RESOURCE-A11Y, PRD-RESOURCE-MOVE]
duration: 4min
completed: 2026-04-25
---

# Phase 48 Plan 05: Hardening Tests and ResourceTimelineGrid Deprecation Summary

**Final regression hardening for the resource screen and explicit fallback-only treatment for the old local grid**

## Performance

- **Duration:** 4 min
- **Completed:** 2026-04-25
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments

- Updated the M004 resource-planning flow test to assert gantt-lib resource planner rows/items and conflict correction action wiring.
- Added a `@deprecated` JSDoc marker to `ResourceTimelineGrid` stating it is fallback/test fixture only.
- Verified `ResourcePlannerWorkspace.tsx` has no `ResourceTimelineGrid` import/reference.
- Ran the final focused Phase 48 test pack and web build.

## Task Commits

1. **Task 1/2 hardening and fallback marker** - `1e2b327` (test)

## Files Created/Modified

- `packages/web/src/components/workspace/ResourceTimelineGrid.tsx` - Deprecated fallback/test fixture marker.
- `packages/web/src/components/workspace/__tests__/M004.resource-planning-flow.test.tsx` - Integrated flow now checks gantt-lib resource planner output.

## Verification

- `npx vitest run --config vitest.config.ts packages/web/src/components/workspace/__tests__/resourcePlannerAdapter.test.ts packages/web/src/components/workspace/__tests__/resourcePlannerFilters.test.ts packages/web/src/components/workspace/__tests__/resourcePlannerMoves.test.ts packages/web/src/components/workspace/__tests__/ResourcePlannerWorkspace.test.tsx packages/web/src/components/workspace/__tests__/M004.resource-planning-flow.test.tsx` - passed, 37 tests.
- `npx vitest run --config vitest.config.ts packages/web/src/components/workspace/__tests__/ResourceTimelineGrid.test.tsx` - passed, 7 tests.
- `rg -n "ResourceTimelineGrid" packages/web/src/components/workspace/ResourcePlannerWorkspace.tsx; if ($LASTEXITCODE -eq 0) { exit 1 } else { exit 0 }` - passed, no references.
- `npm run build -w packages/web` - passed. Vite emitted existing module directive/chunk size warnings.

## Decisions Made

- Deprecated, but did not remove, the legacy grid because existing fixture tests still exercise its diagnostics.
- Treated the integrated M004 stale selector failure as a useful regression signal and moved it to the gantt-lib renderer contract.

## Deviations from Plan

- `gsd-sdk` is not available on PATH in this shell, so planning files were updated manually.

## Known Stubs

None.

## Threat Flags

None.

## User Setup Required

None.

## Phase Completion Readiness

All five Phase 48 plans have summaries, focused tests pass, the web build passes, and phase-level verification is ready.

## Self-Check: PASSED

- Found summary file: `.planning/phases/48-resource-screen/48-05-SUMMARY.md`
- Verified no `ResourceTimelineGrid` reference in `ResourcePlannerWorkspace.tsx`
- Focused test pack and build passed.

---
*Phase: 48-resource-screen*
*Completed: 2026-04-25*
