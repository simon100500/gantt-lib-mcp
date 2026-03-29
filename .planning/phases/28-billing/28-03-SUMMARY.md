---
phase: 28-billing
plan: 03
subsystem: ui, payments
tags: [react, zustand, astro, yookassa, billing]

# Dependency graph
requires:
  - phase: 28-02
    provides: "BillingPage component, useBillingStore, billing API routes, YooKassa integration"
provides:
  - "Pricing page CTAs redirect to app billing with plan pre-selection"
  - "In-app billing navigation via user dropdown menu"
  - "showBillingPage state in useUIStore for programmatic billing access"
affects: [pricing, navigation, billing-flow]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "URL params (billing, plan) + Zustand store for billing page routing"
    - "Enterprise tier uses mailto instead of payment widget (D-02)"

key-files:
  created: []
  modified:
    - "packages/site/src/pages/pricing.astro"
    - "packages/web/src/App.tsx"
    - "packages/web/src/components/layout/ProjectMenu.tsx"
    - "packages/web/src/stores/useUIStore.ts"

key-decisions:
  - "Used Zustand store (showBillingPage) for billing nav instead of module-level callback pattern - simpler and consistent with existing state management"
  - "Enterprise CTA uses mailto:ai@getgantt.ru with subject line (D-02)"

patterns-established:
  - "Billing page triggered via dual source: URL params on mount OR Zustand store for in-app navigation"

requirements-completed: [BILL-CTA, BILL-NAV]

# Metrics
duration: 2min
completed: 2026-03-27
status: pending-verification
---

# Phase 28 Plan 03: Connect pricing CTAs and billing nav Summary

**Pricing page CTAs redirect to billing with plan parameter; in-app billing nav via user dropdown menu**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-27T15:00:41Z
- **Completed:** 2026-03-27T15:02:19Z
- **Tasks:** 1 of 2 (checkpoint reached at task 2)
- **Files modified:** 4

## Accomplishments
- Pricing page CTAs for Start/Team plans now include `plan=start&billing=true` and `plan=team&billing=true` URL params
- Enterprise CTA changed to mailto link with "Напишите нам" label (D-02)
- Added "Подписка" entry in ProjectMenu user dropdown that opens billing page via Zustand store
- Refactored App.tsx billing visibility to derive from both URL params (on mount) and store state (in-app nav)

## Task Commits

1. **Task 1: Update pricing.astro CTAs and add in-app billing nav** - `f9cb985` (feat)

**Plan metadata:** pending (checkpoint reached)

## Files Created/Modified
- `packages/site/src/pages/pricing.astro` - Updated CTA hrefs for start/team/enterprise plans
- `packages/web/src/App.tsx` - Refactored showBilling to use store + URL params
- `packages/web/src/components/layout/ProjectMenu.tsx` - Added billing dropdown menu item
- `packages/web/src/stores/useUIStore.ts` - Added showBillingPage state and setShowBillingPage action

## Decisions Made
- Used Zustand store (showBillingPage) for billing nav instead of module-level callback pattern - simpler and consistent with existing state management (all other modal/page visibility is in useUIStore)
- Enterprise CTA uses mailto:ai@getgantt.ru with subject line per D-02

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Billing flow is now end-to-end: pricing page -> app -> billing page -> YooKassa widget
- Pending human verification of full flow before marking complete
- After verification, no further billing work needed for this phase

---
*Phase: 28-billing*
*Status: pending-verification*
