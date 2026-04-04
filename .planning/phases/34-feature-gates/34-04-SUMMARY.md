---
phase: 34-feature-gates
plan: 04
subsystem: ui
tags: [react, zustand, billing, feature-gates, export]

# Dependency graph
requires:
  - phase: 33-frontend-constraints-ux
    provides: "Constraint denial normalization and LimitReachedModal"
  - phase: 34-02
    provides: "getExportAccessLevel selector, expanded ConstraintLimitKey, EXPORT_FEATURE_LOCKED code"
provides:
  - "Export gate callback in App.tsx routing PDF/Excel/API locked tiers through shared modal"
  - "ExportAccessCard component in ProjectMenu billing footer showing plan-aware tier badges"
  - "getExportAccessLevel billing selector (forward-created from 34-02 dependency)"
affects: [34-verification, export-feature-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Export access level comparison via ordered array index (none < pdf < pdf_excel < pdf_excel_api)"

key-files:
  created: []
  modified:
    - packages/web/src/App.tsx
    - packages/web/src/components/layout/ProjectMenu.tsx
    - packages/web/src/lib/constraintUi.ts
    - packages/web/src/stores/useBillingStore.ts

key-decisions:
  - "Export tier comparison uses ordered array index rather than enum numeric values for clarity"
  - "Locked tier badges are clickable buttons that trigger upsell modal instead of dead/hidden elements"
  - "getExportAccessLevel and expanded ConstraintLimitKey forward-created to unblock 34-04 execution"

patterns-established:
  - "Feature-gate callback pattern: component calls onRequestLevel(level), App compares against billing state, opens modal only for locked tiers"

requirements-completed: [GATE-03]

# Metrics
duration: 4min
completed: 2026-04-04
---

# Phase 34 Plan 04: Export Gate Surface Summary

**Plan-aware export access card in the project shell with PDF/Excel/API tier badges routing locked levels through the shared upsell modal**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-04T11:28:02Z
- **Completed:** 2026-04-04T11:32:16Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- App.tsx owns a single `handleRequestExportLevel` callback that distinguishes PDF, Excel, and API tier locks using ordered level comparison
- ExportAccessCard renders three tier badges (PDF/Excel/API) in the shell billing footer, styled by availability
- Locked tiers open the structured upsell modal with `EXPORT_FEATURE_LOCKED` code; unlocked tiers are non-blocking green badges
- `getExportAccessLevel` selector and expanded `ConstraintLimitKey` forward-created to unblock execution without 34-02

## Task Commits

Each task was committed atomically:

1. **Task 1: Add export gate requests in App with requested level semantics** - `07177e3` (feat)
2. **Task 2: Render plan-aware export access tiers in the shell billing card** - `061db79` (feat)

## Files Created/Modified
- `packages/web/src/App.tsx` - Export gate callback with tier-aware modal routing, EXPORT_FEATURE_LOCKED support
- `packages/web/src/components/layout/ProjectMenu.tsx` - ExportAccessCard component with PDF/Excel/API badges, onRequestExportLevel prop
- `packages/web/src/lib/constraintUi.ts` - Expanded ConstraintLimitKey to include archive/resource_pool/export
- `packages/web/src/stores/useBillingStore.ts` - Added ExportAccessLevel type and getExportAccessLevel selector

## Decisions Made
- Export tier comparison uses ordered array index (`['none','pdf','pdf_excel','pdf_excel_api']`) for clear ordering rather than numeric enum values
- Locked export tiers render as clickable buttons that open upsell modal rather than hidden/dead UI elements
- Forward-created 34-02 dependencies (`getExportAccessLevel`, expanded `ConstraintLimitKey`) to unblock 34-04 since 34-02 was not yet executed

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Forward-created 34-02 dependencies (getExportAccessLevel, expanded ConstraintLimitKey)**
- **Found during:** Task 1 (export gate callback implementation)
- **Issue:** Plans 34-02 and 34-03 were listed as dependencies but not yet executed; `getExportAccessLevel` and expanded `ConstraintLimitKey` did not exist
- **Fix:** Created `getExportAccessLevel` selector in `useBillingStore.ts`, expanded `ConstraintLimitKey` to include `'archive' | 'resource_pool' | 'export'`, updated `isConstraintLimitKey` and `LIMIT_LABELS` in `constraintUi.ts`, added `EXPORT_FEATURE_LOCKED` to `isConstraintCode` in App.tsx
- **Files modified:** `useBillingStore.ts`, `constraintUi.ts`, `App.tsx`
- **Verification:** TypeScript compilation passes without errors
- **Committed in:** `07177e3` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking dependency)
**Impact on plan:** Minimal - forward-created the exact interfaces 34-02 would have produced, no scope creep.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Export access card renders in the shell billing area with plan-aware tier differentiation
- The `onRequestExportLevel` callback is wired from ProjectMenu through App to the shared limit modal
- When 34-02 and 34-03 execute, they will find the forward-created helpers already in place and can extend/augment them

---
*Phase: 34-feature-gates*
*Completed: 2026-04-04*

## Self-Check: PASSED

All created files exist. All commit hashes verified in git log.
