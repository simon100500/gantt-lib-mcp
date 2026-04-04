---
phase: 38-paywall-trial-transition
plan: 01
subsystem: database, billing
tags: [prisma, billing-state, trial, audit-trial, subscription]

# Dependency graph
requires:
  - phase: 30-constraint-engine
    provides: Constraint engine and plan catalog
provides:
  - BillingState enum with 5 lifecycle states
  - TrialSource enum for trial origin tracking
  - Trial fields on Subscription model (7 fields)
  - BillingEvent audit model for state transitions
  - TrialService with 6 lifecycle operations
affects: [38-02, 38-03, 38-04, 38-05, 38-06]

# Tech tracking
tech-stack:
  added: []
  patterns: [billing-state-enum, trial-lifecycle-service, billing-event-audit-trail, mock-prisma-stub-pattern]

key-files:
  created:
    - packages/server/src/services/trial-service.ts
    - packages/server/src/services/trial-service.test.ts
  modified:
    - packages/mcp/prisma/schema.prisma

key-decisions:
  - "BillingState type defined locally in TrialService instead of importing from Prisma client to avoid build dependency on MCP package compilation"
  - "BillingEvent linked to User (not Subscription) to allow audit trail independent of subscription lifecycle"
  - "Free plan project limit hardcoded as constant (FREE_PROJECT_LIMIT=1) in TrialService for rollback calculation"

patterns-established:
  - "BillingEvent audit trail: every state transition records actorType, actorId, previousState, newState, reason, metadata"
  - "TrialService dependency injection: accepts prisma and now() for testability via constructor deps"
  - "Mock prisma stub pattern: Map-based subscription storage with billingEvents array for test assertions"

requirements-completed: [FR-1, FR-2, FR-3, FR-5, FR-6, FR-8]

# Metrics
duration: 6min
completed: 2026-04-05
---

# Phase 38 Plan 01: Trial Data Model and Lifecycle Service Summary

**BillingState enum (5 states), trial fields on Subscription, BillingEvent audit model, and TrialService with 6 lifecycle operations (start, end, rollback, extend, convert, eligibility)**

## Performance

- **Duration:** 6 min
- **Started:** 2026-04-04T22:09:12Z
- **Completed:** 2026-04-04T22:15:12Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Prisma schema extended with BillingState enum (free, trial_active, trial_expired, paid_active, paid_expired) and TrialSource enum (self_serve, admin, promo)
- Subscription model gained 7 trial-specific fields (billingState, trialPlan, trialStartedAt, trialEndsAt, trialEndedAt, trialSource, trialConvertedAt, rolledBackAt)
- BillingEvent audit model records all billing state transitions with actor tracking and metadata
- TrialService implements full trial lifecycle: start, end, rollback, extend, convert, and eligibility check
- All 11 test cases pass using mock prisma stub pattern

## Task Commits

Each task was committed atomically:

1. **Task 1: Add billing state enum, trial fields, and BillingEvent audit model to Prisma schema** - `004813e` (feat)
2. **Task 2: Implement TrialService with all trial lifecycle operations and tests** - `6e2ffb7` (feat)

## Files Created/Modified
- `packages/mcp/prisma/schema.prisma` - Added BillingState enum, TrialSource enum, trial fields on Subscription, BillingEvent model, billingEvents relation on User
- `packages/server/src/services/trial-service.ts` - TrialService class with 6 lifecycle operations and local BillingState type
- `packages/server/src/services/trial-service.test.ts` - 11 test cases covering all lifecycle operations and edge cases

## Decisions Made
- **BillingState type locally defined**: Importing from `@gantt/mcp/prisma` failed because MCP package `.d.ts` files are not compiled during server typechecking. Defined locally as union type with comment to keep in sync with schema.
- **BillingEvent linked to User**: BillingEvent uses userId foreign key to User model rather than Subscription, allowing audit trail to persist independently of subscription lifecycle.
- **FREE_PROJECT_LIMIT constant**: Hardcoded project limit (1) in TrialService for rollback over-limit calculation rather than importing from constraint catalog to keep TrialService self-contained.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Removed invalid billingEvents relation from Subscription model**
- **Found during:** Task 1 (Prisma schema update)
- **Issue:** Plan specified `billingEvents BillingEvent[]` on Subscription model, but BillingEvent has no subscriptionId foreign key and no opposite relation field, causing Prisma validation error
- **Fix:** Removed `billingEvents` from Subscription; BillingEvent is linked via User model (userId FK) as specified in the BillingEvent model definition
- **Files modified:** packages/mcp/prisma/schema.prisma
- **Verification:** `npx prisma generate` succeeds
- **Committed in:** 004813e (Task 1 commit)

**2. [Rule 3 - Blocking] BillingState import resolution**
- **Found during:** Task 2 (TrialService implementation)
- **Issue:** `import type { BillingState } from '@prisma/client'` and `'@gantt/mcp/prisma'` both failed because TypeScript cannot resolve Prisma-generated types at server compile time without MCP package build
- **Fix:** Defined BillingState as local union type `'free' | 'trial_active' | 'trial_expired' | 'paid_active' | 'paid_expired'` in trial-service.ts with sync comment
- **Files modified:** packages/server/src/services/trial-service.ts, packages/server/src/services/trial-service.test.ts
- **Verification:** TypeScript compilation and all 11 tests pass
- **Committed in:** 6e2ffb7 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both fixes were necessary to unblock compilation and testing. No scope creep.

## Issues Encountered
None beyond the auto-fixed blocking issues documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Trial data model and lifecycle service ready for integration
- Plan 38-02 can build on TrialService for trial expiry detection and cron scheduling
- Plan 38-03 can use BillingState enum for constraint-aware trial enforcement
- Prisma migration will be needed before deploying to apply schema changes

## Self-Check: PASSED

- FOUND: packages/mcp/prisma/schema.prisma
- FOUND: packages/server/src/services/trial-service.ts
- FOUND: packages/server/src/services/trial-service.test.ts
- FOUND: .planning/phases/38-paywall-trial-transition/38-01-SUMMARY.md
- FOUND: 004813e (Task 1 commit)
- FOUND: 6e2ffb7 (Task 2 commit)

---
*Phase: 38-paywall-trial-transition*
*Completed: 2026-04-05*
