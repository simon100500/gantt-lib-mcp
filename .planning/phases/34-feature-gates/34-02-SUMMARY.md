---
phase: 34-feature-gates
plan: 02
subsystem: ui
tags: [react, billing, zustand, constraints, feature-gates, export]
requires:
  - phase: 33-frontend-constraints-ux
    provides: shared constraint helpers and structured limit modal contract
provides:
  - Typed billing selectors for archive/resource_pool/export access
  - Expanded ConstraintLimitKey with feature-gate denial codes
  - Plan-aware export access level descriptions (pdf/pdf_excel/pdf_excel_api)
  - Feature-gate modal content with Russian labels and upgrade guidance
affects: [feature-gates, billing, shell, export]
tech-stack:
  added: [vitest]
  patterns: [feature-gate denial normalization, access-level tier descriptions]
key-files:
  created:
    - packages/web/src/stores/__tests__/billingSelectors.test.ts
    - packages/web/src/lib/__tests__/constraintUi.test.ts
  modified:
    - packages/web/src/stores/useBillingStore.ts
    - packages/web/src/lib/constraintUi.ts
    - packages/web/src/components/LimitReachedModal.tsx
key-decisions:
  - "Feature gates (archive/resource_pool/export) bypass usage snapshot in modal since they are boolean/access-level, not tracked counters."
  - "Export access levels use a tier map keyed by plan ID so the next upgrade target is always concrete: free->start(pdf), start->team(pdf_excel), team->enterprise(pdf_excel_api)."
  - "FEATURE_GATE_CODES constant exported from constraintUi.ts so both constraint helpers and LimitReachedModal reference the same canonical denial codes."
patterns-established:
  - "Feature-gate denial flow: backend sends ARCHIVE/RESOURCE_POOL/EXPORT_FEATURE_LOCKED code with the feature-gate limitKey, normalizeConstraintDenialPayload recognizes it, buildConstraintModalContent renders without usage counters."
  - "Billing selectors pattern: boolean features return false for null/missing status, access-level features return 'none' as default."
requirements-completed: [GATE-01, GATE-02, GATE-03]
duration: 7min
completed: 2026-04-04
---

# Phase 34 Plan 02: Feature Gate Frontend Contract Summary

**Typed billing selectors for archive/resource_pool/export access, expanded constraint UI normalization with feature-gate denial codes, and plan-aware modal copy for all three Phase 34 limit keys.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-04-04T11:01:09Z
- **Completed:** 2026-04-04T11:08:00Z
- **Tasks:** 2
- **Files modified:** 3 (plus 2 test files created)

## Accomplishments

- Added `getArchiveAccess`, `getResourcePoolAccess`, and `getExportAccessLevel` typed selectors in the billing store.
- Expanded `ConstraintLimitKey` to include `archive`, `resource_pool`, and `export` with Russian labels.
- Added `FEATURE_GATE_CODES` constant and feature-gate-aware modal content rendering.
- Export access level descriptions differentiate `pdf`, `pdf_excel`, `pdf_excel_api` with plan-aware upgrade targets.
- 23 tests passing (13 billing selectors + 10 constraint UI).

## Task Commits

Each task was committed atomically (TDD):

1. **Task 1 RED: Failing tests for archive/resource_pool/export selectors** - `2821140` (test)
2. **Task 1 GREEN: Typed billing selectors** - `bed5f65` (feat)
3. **Task 2 RED: Failing tests for feature-gate denial normalization** - `ff5510c` (test)
4. **Task 2 GREEN: Constraint UI normalization and modal copy** - `140e90e` (feat)

## Files Created/Modified

- `packages/web/src/stores/useBillingStore.ts` - Added `getArchiveAccess`, `getResourcePoolAccess`, `getExportAccessLevel` selectors with `ExportAccessLevel` type.
- `packages/web/src/lib/constraintUi.ts` - Expanded `ConstraintLimitKey`, added `FEATURE_GATE_CODES`, `LIMIT_LABELS` for feature gates, plan-aware export tier descriptions, and feature-gate-specific modal content rendering.
- `packages/web/src/components/LimitReachedModal.tsx` - Imports `FEATURE_GATE_CODES` for structured feature-gate detection in button label resolution.
- `packages/web/src/stores/__tests__/billingSelectors.test.ts` - 13 tests covering all three selectors with null/missing/false/true/level cases.
- `packages/web/src/lib/__tests__/constraintUi.test.ts` - 10 tests covering feature-gate normalization, modal content rendering, and legacy compatibility.

## Decisions Made

- Feature gates skip usage snapshot rendering in the modal since archive/resource_pool/export don't have tracked usage counters.
- Export upgrade tiers are computed from the current plan ID so the modal always shows the next concrete access level.
- `getConstraintUsageSnapshot` returns null for non-tracked limit keys instead of falling through to the AI queries branch.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The frontend constraint contract now covers all five `LimitKey` values: `projects`, `ai_queries`, `archive`, `resource_pool`, `export`.
- Later shell plans can gate archive/resource_pool/export actions using the billing selectors and open the feature-gate modal with plan-aware upgrade guidance.
- `FEATURE_GATE_CODES` is ready for backend integration when enforcement routes emit these denial codes.

---
*Phase: 34-feature-gates*
*Completed: 2026-04-04*

## Self-Check: PASSED

- All 6 files verified present on disk
- All 4 commits verified in git log (2821140, bed5f65, ff5510c, 140e90e)
- 23 tests passing (13 billing selectors + 10 constraint UI)
- TypeScript compilation clean (`tsc -p packages/web/tsconfig.json`)
- Acceptance criteria grep patterns all match
