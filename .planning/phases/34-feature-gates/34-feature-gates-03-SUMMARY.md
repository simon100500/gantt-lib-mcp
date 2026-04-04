---
phase: 34-feature-gates
plan: 03
subsystem: ui
tags: [react, zustand, feature-gates, archive, resource-pool, constraint-ui]

requires:
  - phase: 33-frontend-constraints-ux
    provides: "ConstraintDenialPayload, normalizeConstraintDenialPayload, buildProactiveConstraintDenial, LimitReachedModal"
  - phase: 34-feature-gates
    provides: "Constraint catalog with archive/resource_pool boolean limits, billing limits payload"

provides:
  - "Generic constraintDenial bridge in useAuthStore for project-create and archive 403 payloads"
  - "Proactive archive denial via buildProactiveConstraintDenial for free users"
  - "Resource-pool upsell entrypoint in ProjectSwitcher with modal routing"
  - "ARCHIVE_FEATURE_LOCKED and RESOURCE_POOL_FEATURE_LOCKED codes in isConstraintCode"

affects: [34-feature-gates, frontend-constraints, billing-ui]

tech-stack:
  added: []
  patterns: ["Boolean feature gate proactive denial pattern in buildProactiveConstraintDenial", "constraintDenial as shared denial bridge for all 403 constraint responses"]

key-files:
  created: []
  modified:
    - "packages/web/src/stores/useAuthStore.ts"
    - "packages/web/src/App.tsx"
    - "packages/web/src/components/ProjectSwitcher.tsx"
    - "packages/web/src/components/layout/ProjectMenu.tsx"

key-decisions:
  - "Renamed projectLimitDenial to constraintDenial to serve as generic denial bridge for all feature gates"
  - "buildProactiveConstraintDenial extended to handle boolean feature gates (archive, resource_pool) alongside existing tracked limits"
  - "Resource-pool surface renders conditionally only when onOpenResourcePool prop is provided"

patterns-established:
  - "Boolean feature gate denial: check limits.archive/resource_pool from billing status, build proactive denial with feature_disabled reasonCode"
  - "constraintDenial effect: single useEffect reads shared denial state and routes to openLimitModal regardless of denial source"

requirements-completed: [GATE-01, GATE-02]

duration: 8min
completed: 2026-04-04
---

# Phase 34: Feature Gates Plan 03 Summary

**Archive and resource-pool feature gates wired into project shell via shared constraintDenial bridge and proactive modal routing**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-04T11:15:10Z
- **Completed:** 2026-04-04T11:22:45Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Renamed `projectLimitDenial` to `constraintDenial` so both project-create and archive 403 payloads share one denial state path in useAuthStore
- Extended `buildProactiveConstraintDenial` to handle boolean feature gates (archive, resource_pool) with `feature_disabled` reasonCode
- Archive actions for free users short-circuit to `openLimitModal` with `ARCHIVE_FEATURE_LOCKED` before hitting the mutation endpoint
- Resource-pool upsell entrypoint rendered in ProjectSwitcher with conditional callback to App

## Task Commits

Each task was committed atomically:

1. **Task 1: Generalize shell denial state and archive modal interception** - `196f1b1` (feat)
2. **Task 2: Add project-switcher resource-pool upsell entrypoint and preserve archive UX** - `f10a77f` (feat)

## Files Created/Modified

- `packages/web/src/stores/useAuthStore.ts` - Renamed `projectLimitDenial` to `constraintDenial`; archiveProject now parses 403 structured denial
- `packages/web/src/App.tsx` - Added `ARCHIVE_FEATURE_LOCKED` to `isConstraintCode`, extended `buildProactiveConstraintDenial` for boolean gates, `handleArchiveProject` short-circuits for free users, `handleOpenResourcePool` callback
- `packages/web/src/components/ProjectSwitcher.tsx` - Added `onOpenResourcePool` prop, renders "Пул ресурсов" button with Layers icon
- `packages/web/src/components/layout/ProjectMenu.tsx` - Wires `onOpenResourcePool` through both sidebar and overlay ProjectSwitcher instances

## Decisions Made

- Renamed `projectLimitDenial` to `constraintDenial` to unify all constraint denial flows under a single bridge, enabling any 403 denial (project create, archive, future gates) to reach the modal
- Extended `buildProactiveConstraintDenial` rather than creating a separate helper, keeping one entry point for both tracked and boolean feature gates
- Resource-pool surface only renders when `onOpenResourcePool` is provided, so the entrypoint is invisible until wired

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Next Phase Readiness

- GATE-01 and GATE-02 satisfied at the shell layer: free users see upsell modal for archive and resource pool, paid users retain archive functionality
- The `constraintDenial` bridge is ready for future feature gates (export) without additional store changes
- Resource-pool button currently opens the upsell modal for free users and is a no-op for paid tiers (full feature not yet built)

---
*Phase: 34-feature-gates*
*Completed: 2026-04-04*

## Self-Check: PASSED

All files exist, all commits verified.
