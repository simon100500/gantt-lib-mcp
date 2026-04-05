---
phase: 38-paywall-trial-transition
plan: 05
subsystem: ui
tags: [react, zustand, trial, billing, russian-copy, feature-gate]

# Dependency graph
requires:
  - phase: 38-02
    provides: "Trial-aware billing state in backend subscription API"
  - phase: 38-03
    provides: "Admin trial management routes for trial lifecycle"
provides:
  - "TrialOfferModal component with Russian copy for 14-day Start trial invitation"
  - "TrialReminderBanner showing countdown at 7, 3, 1 days before expiry"
  - "TrialExpiryScreen with data-safe messaging and upgrade CTA"
  - "Trial state helpers (isTrialActive, isTrialExpired, getTrialDaysRemaining) in billing store"
  - "Post-trial feature gate copy in constraintUi"
  - "billingState and trial fields in SubscriptionStatus interface"
affects: [38-06]

# Tech tracking
tech-stack:
  added: []
  patterns: [trial-state-selectors, post-trial-feature-gate-detection]

key-files:
  created:
    - packages/web/src/components/TrialOfferModal.tsx
    - packages/web/src/components/TrialReminderBanner.tsx
    - packages/web/src/components/TrialExpiryScreen.tsx
  modified:
    - packages/web/src/stores/useBillingStore.ts
    - packages/web/src/lib/constraintUi.ts

key-decisions:
  - "Trial state selectors colocated with billing store for single import"
  - "Post-trial gate detection via reasonCode or upgradeHint content matching"
  - "Reminder banner filters via Set([7,3,1]) for explicit day control"

patterns-established:
  - "Trial modal pattern: open/onAction props, null return when closed"
  - "Day-filtered reminder: explicit Set of trigger days, null return otherwise"

requirements-completed: [FR-4, FR-7]

# Metrics
duration: 2min
completed: 2026-04-05
---

# Phase 38 Plan 05: Frontend Trial UX Summary

**Trial UX components with Russian copy: offer modal, reminder banner (7/3/1 day), expiry screen, billing store trial helpers, and post-trial feature gate detection**

## Performance

- **Duration:** 2 min (pre-committed)
- **Started:** 2026-04-05T01:35:00Z
- **Completed:** 2026-04-05T11:52:00Z
- **Tasks:** 1
- **Files modified:** 5

## Accomplishments
- Billing store SubscriptionStatus extended with billingState, trialStartedAt, trialEndsAt, trialSource fields and three helper selectors
- TrialOfferModal created with "Попробуйте 14 дней тарифа Старт" title and "Включить 14 дней бесплатно" CTA
- TrialReminderBanner renders only at 7, 3, 1 days remaining with "До конца пробного периода {N} дн." copy
- TrialExpiryScreen shows "Пробный доступ закончился" with data-safe messaging
- constraintUi detects post-trial feature gates via reasonCode or upgradeHint and shows tailored copy

## Task Commits

Each task was committed atomically:

1. **Task 1: Add billingState and trial fields to frontend billing store + create trial UX components** - `c1be513` (feat)

## Files Created/Modified
- `packages/web/src/stores/useBillingStore.ts` - Added billingState, trial fields, isTrialActive/isTrialExpired/getTrialDaysRemaining helpers
- `packages/web/src/components/TrialOfferModal.tsx` - Trial invitation modal with Russian copy
- `packages/web/src/components/TrialReminderBanner.tsx` - Day-filtered reminder banner (7/3/1 days)
- `packages/web/src/components/TrialExpiryScreen.tsx` - Expiry screen with data-safe messaging
- `packages/web/src/lib/constraintUi.ts` - Post-trial feature gate detection in buildConstraintModalContent

## Decisions Made
- Trial state selectors (isTrialActive, isTrialExpired, getTrialDaysRemaining) placed alongside billing store exports for single-import convenience
- Post-trial gate detection uses two signals: explicit `reasonCode === 'post_trial_feature_gate'` or upgradeHint containing 'trial' substring
- Reminder days controlled via explicit Set rather than range for precise control

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All trial UX components ready for integration in Plan 38-06 (self-serve trial trigger + activation API + frontend hook)
- TrialOfferModal expects parent component to handle trial start API call via onAccept callback
- TrialReminderBanner needs wiring to billing store subscription.trialEndsAt via getTrialDaysRemaining
- TrialExpiryScreen needs trigger condition based on billingState === 'trial_expired'

## Self-Check: PASSED

- All 5 created/modified files exist on disk
- Commit c1be513 found in git history
- TypeScript compilation passes (only pre-existing vitest import warnings in test files)

---
*Phase: 38-paywall-trial-transition*
*Completed: 2026-04-05*
