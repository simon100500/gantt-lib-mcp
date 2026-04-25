---
phase: 48-resource-screen
plan: 01
subsystem: ui
tags: [react, gantt-lib, resource-planner, vitest, accessibility]

requires:
  - phase: 47-agent-routing-fast-path
    provides: stable workspace baseline before resource screen work
provides:
  - typed ResourcePlannerResult to gantt-lib resource planner adapter
  - ResourcePlannerWorkspace primary renderer using GanttChart resource-planner mode
  - typed metadata helper for conflict correction callbacks
  - focused adapter and workspace regression tests
affects: [resource-screen, resource-planner, workspace-ui]

tech-stack:
  added: []
  patterns:
    - typed adapter from backend planner payload to gantt-lib resource rows
    - metadata guard before using planner item metadata for callbacks

key-files:
  created:
    - packages/web/src/components/workspace/resourcePlannerAdapter.ts
    - packages/web/src/components/workspace/__tests__/resourcePlannerAdapter.test.ts
  modified:
    - packages/web/src/components/workspace/ResourcePlannerWorkspace.tsx
    - packages/web/src/components/workspace/__tests__/ResourcePlannerWorkspace.test.tsx

key-decisions:
  - "Use GanttChart mode=\"resource-planner\" as the ResourcePlannerWorkspace primary renderer."
  - "Keep conflict correction callback data sourced only from typed planner metadata."
  - "Leave resource move persistence as a controlled no-op in this plan; Phase 48 Plan 04 owns saving moves."

patterns-established:
  - "Planner item metadata must be accessed through getPlannerItemMetadata instead of ad hoc metadata parsing."
  - "Resource planner renderer tests mock gantt-lib at the package boundary and assert mode/geometry/resource props."

requirements-completed:
  - PRD-RESOURCE-SCREEN
  - PRD-RESOURCE-MAPPER
  - PRD-RESOURCE-A11Y

duration: 5min
completed: 2026-04-25
---

# Phase 48 Plan 01: Adapter and gantt-lib Renderer Swap Summary

**Resource planner screen now maps backend planner payloads into typed gantt-lib resource rows and renders them through `GanttChart mode="resource-planner"` with Russian conflict correction actions.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-25T07:38:00Z
- **Completed:** 2026-04-25T07:43:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Added `resourcePlannerAdapter.ts` with `ResourcePlannerTimelineItem`, metadata shape, mapper, and metadata guard.
- Replaced `ResourceTimelineGrid` as the workspace primary renderer with `GanttChart mode="resource-planner"`.
- Preserved empty resource rows through the `resources` prop and conflict correction through `PlannerCorrectionTarget`.
- Updated tests to assert resource planner geometry, empty rows, Russian `Исправить конфликт` action, and typed target wiring.

## Task Commits

1. **Task 1: Create planner adapter and metadata helper** - `265967f` (feat)
2. **Task 2 RED: Workspace renderer expectations** - `d1ed20a` (test)
3. **Task 2 GREEN: gantt-lib resource planner renderer** - `3e11edb` (feat)

## Files Created/Modified

- `packages/web/src/components/workspace/resourcePlannerAdapter.ts` - Typed mapper and metadata guard for planner payloads.
- `packages/web/src/components/workspace/__tests__/resourcePlannerAdapter.test.ts` - Adapter mapping, empty row, conflict metadata, and unknown metadata tests.
- `packages/web/src/components/workspace/ResourcePlannerWorkspace.tsx` - Primary renderer swap to `GanttChart mode="resource-planner"` with compact conflict item rendering.
- `packages/web/src/components/workspace/__tests__/ResourcePlannerWorkspace.test.tsx` - Workspace regression coverage for gantt-lib props, rows, conflict action, and target shape.

## Decisions Made

- Used `GanttChart` facade rather than direct `ResourceTimelineChart`, matching the preferred plan path.
- Routed conflict correction through `getPlannerItemMetadata` so unknown metadata cannot feed callbacks.
- Passed `onResourceItemMove` as a controlled no-op until Phase 48 Plan 04 implements date/resource persistence.

## Deviations from Plan

### Process Deviations

**1. GSD SDK unavailable**
- **Found during:** startup
- **Issue:** `gsd-sdk` was not on PATH, so SDK state/commit helpers could not run.
- **Fix:** Used normal git commands for atomic commits and manual summary/state updates.
- **Impact:** No implementation scope change.

## Known Stubs

- `packages/web/src/components/workspace/ResourcePlannerWorkspace.tsx` - `handleResourceItemMove` intentionally does not persist moves yet. This is deferred to Phase 48 Plan 04, while this plan only swaps the primary renderer and preserves controlled mode wiring.

## Threat Flags

None. The change does not add a network endpoint, new auth path, file access pattern, or schema boundary. Existing authenticated planner payloads are adapted for UI rendering only.

## Verification

- `npx vitest run --config vitest.config.ts packages/web/src/components/workspace/__tests__/resourcePlannerAdapter.test.ts` - PASS, 4 tests.
- `npx vitest run --config vitest.config.ts packages/web/src/components/workspace/__tests__/ResourcePlannerWorkspace.test.tsx` - PASS, 10 tests.
- `npm run build -w packages/web` - PASS. Vite emitted existing non-blocking warnings for module-level `"use client"` directives and chunk size.

## Issues Encountered

- The root `node_modules/gantt-lib` is `0.70.0`, while `packages/web` correctly resolves its workspace dependency to `gantt-lib@0.75.1`; no package changes were needed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 48 Plan 02 can build filters, selection, details, and accessible fallback actions on the typed adapter and library-backed renderer.

## Self-Check: PASSED

- Summary file created.
- Commits found: `265967f`, `d1ed20a`, `3e11edb`.
- Key files exist: adapter, adapter tests, workspace, workspace tests.

---
*Phase: 48-resource-screen*
*Completed: 2026-04-25*
