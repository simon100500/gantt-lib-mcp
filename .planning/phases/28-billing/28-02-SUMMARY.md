---
phase: 28-billing
plan: 02
subsystem: payments, ui
tags: [fastify, middleware, zustand, yookassa, billing, tailwind]

# Dependency graph
requires:
  - phase: 28-01
    provides: "billing-service, plan-config, billing-routes, subscriptions/payments DB tables"
provides:
  - "subscription-middleware enforcing AI generation limits on /api/chat"
  - "useBillingStore Zustand store for subscription/payments/payment-flow state"
  - "BillingPage full-page component with plan cards, AI usage bar, payment history"
  - "YooKassa embedded widget integration with polling"
  - "App.tsx integration via ?billing / ?plan URL params"
affects: [28-03]

# Tech tracking
tech-stack:
  added: []
  patterns: ["subscription enforcement middleware as Fastify preHandler", "billing Zustand store with fetchWithAuthRetry pattern", "YooKassa embedded widget with polling flow"]

key-files:
  created:
    - packages/server/src/middleware/subscription-middleware.ts
    - packages/web/src/stores/useBillingStore.ts
    - packages/web/src/components/BillingPage.tsx
  modified:
    - packages/server/src/index.ts
    - packages/web/src/App.tsx

key-decisions:
  - "Increment AI usage inside handler after middleware check, not in middleware — ensures counter tracks consumed generations"
  - "URL params (?billing, ?plan) for billing page navigation — no router needed"
  - "Enterprise plan shows mailto link instead of payment widget (D-02)"

patterns-established:
  - "Subscription middleware pattern: check active status, check AI limits, return typed error codes"
  - "Billing store: fetchWithAuthRetry for all authenticated billing API calls"
  - "Payment flow: createPayment -> loadWidget -> render -> pollPaymentStatus -> refresh state"

requirements-completed: [BILL-ENFORCE, BILL-UI]

# Metrics
duration: 4min
completed: 2026-03-27
---

# Phase 28 Plan 2: Subscription Enforcement + Billing UI Summary

**Subscription middleware blocking AI requests at limits + full billing page with YooKassa embedded widget**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-27T14:55:11Z
- **Completed:** 2026-03-27T14:59:09Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Subscription enforcement middleware returns 403 with typed codes (SUBSCRIPTION_EXPIRED, AI_LIMIT_REACHED)
- AI usage counter increments on each /api/chat request (1 message = 1 generation)
- Zustand billing store with subscription status, payment history, payment flow management
- Full billing page UI with plan cards, monthly/yearly toggle, AI usage progress bar
- YooKassa embedded widget integration with 2-second polling for payment confirmation
- Enterprise plan card shows "Напишите нам" mailto link (D-02)

## Task Commits

Each task was committed atomically:

1. **Task 1: Subscription enforcement middleware** - `422421e` (feat)
2. **Task 2: Billing frontend store and page** - `72bfe61` (feat)

## Files Created/Modified
- `packages/server/src/middleware/subscription-middleware.ts` - Middleware enforcing AI limits and subscription status on /api/chat
- `packages/server/src/index.ts` - Added subscriptionMiddleware to /api/chat preHandler chain, added incrementAiUsage call
- `packages/web/src/stores/useBillingStore.ts` - Zustand store for subscription, payments, payment flow with fetchWithAuthRetry
- `packages/web/src/components/BillingPage.tsx` - Full billing page with plan cards, AI usage bar, payment history, YooKassa widget
- `packages/web/src/App.tsx` - Conditional BillingPage rendering via ?billing/?plan URL params

## Decisions Made
- AI usage incremented inside handler after middleware passes — ensures counter tracks consumed generations even if agent fails
- URL params approach for billing page navigation — avoids adding a router to the single-page app
- Enterprise plan card shows mailto instead of payment widget per D-02

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## Known Stubs
None.

## Next Phase Readiness
- Billing enforcement and UI complete, ready for Plan 03 (likely webhook integration or remaining polish)
- BillingPage accessible via `?plan=start` or `?plan=team` from pricing.astro redirects

---
*Phase: 28-billing*
*Completed: 2026-03-27*
