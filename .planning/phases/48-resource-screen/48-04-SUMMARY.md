---
phase: 48-resource-screen
plan: 04
subsystem: ui
tags: [react, resource-planner, persistence, vitest]
requires:
  - phase: 48-resource-screen
    plan: 03
    provides: resource planner catalog management and details surface
provides:
  - Pure resource planner move classification helpers
  - Controlled date/resource persistence from gantt-lib resource planner moves
  - Details-panel fallback persistence actions using the same move path
affects: [resource-screen, workspace-ui, project-commands, resource-assignments]
tech-stack:
  added: []
  patterns:
    - Resource planner drag/drop is controlled and backend-authoritative
    - Combined date/resource changes persist date first and resource second
key-files:
  created:
    - packages/web/src/components/workspace/resourcePlannerMoves.ts
    - packages/web/src/components/workspace/__tests__/resourcePlannerMoves.test.ts
  modified:
    - packages/web/src/components/workspace/ResourcePlannerWorkspace.tsx
    - packages/web/src/components/workspace/ResourceAssignmentDetailsPanel.tsx
    - packages/web/src/components/workspace/__tests__/ResourcePlannerWorkspace.test.tsx
key-decisions:
  - "Date changes use useCommandCommit with history title `Перенос назначения` so schedule edits stay in the existing command/history flow."
  - "Resource reassignment sends a full `resourceIds[]` replacement while preserving the task's other resource assignments."
  - "When assignment metadata is missing, the workspace reloads `/api/project` before failing controlled."
patterns-established:
  - "Move failures clear pending state, preserve last successful planner data, and reload `/api/resources/planner?scope=...`."
  - "Details fallback forms synthesize the same `ResourceTimelineMove` shape as drag/drop."
requirements-completed: [PRD-RESOURCE-SCREEN, PRD-RESOURCE-MOVE, PRD-RESOURCE-A11Y]
duration: 12min
completed: 2026-04-25
---

# Phase 48 Plan 04: Controlled Move Persistence Summary

**Controlled date/resource move persistence for the gantt-lib resource planner with rollback-safe UI state**

## Performance

- **Duration:** 12 min
- **Completed:** 2026-04-25
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Added `resourcePlannerMoves.ts` for date-only, resource-only, combined, no-op, and rejected move classification.
- Added helper coverage for UTC date normalization, `move_task`, `resize_task`, resource replacement, locked items, and missing metadata.
- Wired `GanttChart` `onResourceItemMove` to authenticated persistence.
- Persisted date moves through `useCommandCommit` with grouped history title `Перенос назначения`.
- Persisted resource reassignment through `POST /api/tasks/:taskId/assignments` with full `resourceIds[]` replacement.
- Added combined move handling with the required partial failure message when date persistence succeeds but reassignment fails.
- Added pending/error state, readonly/locked blocking, planner reload after success/failure, and details-panel fallback actions.

## Task Commits

1. **Task 1 RED: move helper tests** - `5777464` (test)
2. **Task 1 GREEN: move helper** - `7322885` (feat)
3. **Task 2 RED: persistence tests** - `d4b75b0` (test)
4. **Task 2 GREEN: move persistence integration** - `fd31313` (feat)

## Files Created/Modified

- `packages/web/src/components/workspace/resourcePlannerMoves.ts` - Pure move classification, command construction, and resource replacement helpers.
- `packages/web/src/components/workspace/__tests__/resourcePlannerMoves.test.ts` - Focused helper coverage.
- `packages/web/src/components/workspace/ResourcePlannerWorkspace.tsx` - Controlled persistence flow, command commits, assignment replacement, pending/error/reload handling.
- `packages/web/src/components/workspace/ResourceAssignmentDetailsPanel.tsx` - Existing fallback forms now receive persistence callbacks.
- `packages/web/src/components/workspace/__tests__/ResourcePlannerWorkspace.test.tsx` - Integration coverage for drag/fallback persistence and readonly/locked blocking.

## Verification

- `npx vitest run --config vitest.config.ts packages/web/src/components/workspace/__tests__/resourcePlannerMoves.test.ts` - passed, 7 tests.
- `npx vitest run --config vitest.config.ts packages/web/src/components/workspace/__tests__/ResourcePlannerWorkspace.test.tsx` - passed, 20 tests.
- `npm run build -w packages/web` - passed. Vite emitted existing module directive/chunk size warnings.

## Decisions Made

- Used the existing project command flow for date changes instead of adding a resource-specific date endpoint.
- Kept planner data backend-authoritative after all mutations by reloading the planner with `keepData: true`.
- Reloaded `/api/project` only when current assignment metadata was insufficient to build a full reassignment payload.

## Deviations from Plan

- The first Wave 4 subagent hit a usage-limit error after partial commits. Execution resumed inline from the remaining uncommitted integration changes.
- `gsd-sdk` is not available on PATH in this shell, so planning files were updated manually.

## Known Stubs

None.

## Threat Flags

None. Mutations use authenticated existing endpoints, typed metadata, and controlled failure messages.

## User Setup Required

None.

## Next Phase Readiness

Phase 48 can proceed to hardening tests and `ResourceTimelineGrid` deprecation handling.

## Self-Check: PASSED

- Found summary file: `.planning/phases/48-resource-screen/48-04-SUMMARY.md`
- Found created helper/test files.
- Focused tests and web build passed.
- Found task commits: `5777464`, `7322885`, `d4b75b0`, `fd31313`

---
*Phase: 48-resource-screen*
*Completed: 2026-04-25*
