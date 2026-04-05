---
phase: 38-paywall-trial-transition
plan: 06
subsystem: api, ui
tags: [trial, trigger, billing, react-hook, fastify, prisma]

# Dependency graph
requires:
  - phase: 38-01
    provides: "TrialService.startTrial, checkTrialEligibility"
  - phase: 38-05
    provides: "TrialOfferModal component"
provides:
  - "TrialTriggerService for trigger eligibility detection"
  - "POST /api/billing/trial/start self-serve trial activation"
  - "GET /api/billing/trial/eligibility combined eligibility check"
  - "useTrialTrigger frontend hook"
affects: [trial-flow, constraint-denial, billing-api]

# Tech tracking
tech-stack:
  added: []
  patterns: [trigger-service-pattern, session-storage-decline-tracking]

key-files:
  created:
    - packages/server/src/services/trial-trigger-service.ts
    - packages/server/src/services/trial-trigger-service.test.ts
    - packages/web/src/hooks/useTrialTrigger.ts
  modified:
    - packages/server/src/routes/billing-routes.ts

key-decisions:
  - "Trigger B (premium_feature_attempt) is deliberately simple: client detects constraint denial 403s, server validates project with tasks exists"
  - "Trial decline tracked in sessionStorage (not localStorage) to re-offer in new sessions"
  - "useTrialTrigger integrates with authStore.constraintDenial for automatic trigger on feature denial"

patterns-established:
  - "Trigger service pattern: read-only eligibility checks with DI for testability"
  - "Self-serve trial API: POST /start delegates to TrialService, GET /eligibility composes TrialService + TriggerService"

requirements-completed: [FR-1, FR-2, FR-4]

# Metrics
duration: 6min
completed: 2026-04-05
---

# Phase 38 Plan 06: Self-serve Trial Trigger Summary

**Self-serve trial activation API with trigger eligibility detection and frontend constraint denial integration**

## Performance

- **Duration:** 6 min
- **Started:** 2026-04-05T13:57:45Z
- **Completed:** 2026-04-05T14:04:24Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- TrialTriggerService detects value events (project+tasks, AI usage >= 3) for trial trigger eligibility
- Self-serve trial API endpoints (POST /start, GET /eligibility) wired into existing billing routes
- useTrialTrigger hook integrates trial offer into existing constraint denial flow
- 4 passing tests for trigger eligibility detection

## Task Commits

Each task was committed atomically:

1. **Task 1: Trial trigger service + self-serve trial API endpoint** - `d41ed8a` (feat, TDD)
2. **Task 2: Frontend useTrialTrigger hook** - `2712e78` (feat)

## Files Created/Modified
- `packages/server/src/services/trial-trigger-service.ts` - Trigger eligibility detection (project+tasks, AI usage check)
- `packages/server/src/services/trial-trigger-service.test.ts` - 4 tests: AI interactions trigger, premium feature trigger, no project, no AI counters
- `packages/server/src/routes/billing-routes.ts` - Added GET /trial/eligibility and POST /trial/start routes
- `packages/web/src/hooks/useTrialTrigger.ts` - React hook integrating trial offer with constraint denial flow

## Decisions Made
- Trigger B (premium_feature_attempt) is deliberately simple: client detects constraint denial 403s and can pass triggerType, server validates that a meaningful project exists (tasks present). This avoids server-side denial tracking.
- Trial decline tracked in sessionStorage (not localStorage) so the offer can reappear in new browser sessions.
- useTrialTrigger reads from authStore.constraintDenial which is set by existing 403 handlers, avoiding duplicate state.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Self-serve trial activation flow is complete end-to-end
- Frontend can now show trial offer modal on constraint denial and activate trial via API
- Ready for integration testing of full trial lifecycle

## Self-Check: PASSED

All created files verified present. All task commits verified in git log.

---
*Phase: 38-paywall-trial-transition*
*Completed: 2026-04-05*
