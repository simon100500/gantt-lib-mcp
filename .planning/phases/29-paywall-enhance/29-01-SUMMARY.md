---
phase: 29-paywall-enhance
plan: 01
subsystem: payments, ui
tags: [billing, pricing, react, typescript, yookassa]

# Dependency graph
requires:
  - phase: 28-billing
    provides: billing.ts constants, plan-config.ts, PurchasePage, AccountBillingPage, YooKassa integration
provides:
  - v5 pricing: start yearly=11900, team yearly=47900, enterprise yearly=129000
  - v5 feature sets per plan tier
  - v5 free tier: 1 project, 20 AI requests total
  - Yearly savings display on pricing cards
  - Social proof blockquote on purchase page
  - Personalized upgrade button per current plan
  - Upsell alerts at 80%/100% AI usage
  - Free plan composition display
affects: [29-paywall-enhance-02, subscription-middleware, billing-service]

# Tech tracking
tech-stack:
  added: []
  patterns: [per-plan button personalization, usage-based conditional alerts]

key-files:
  created: []
  modified:
    - packages/web/src/lib/billing.ts
    - packages/server/src/services/plan-config.ts
    - packages/web/src/components/PurchasePage.tsx
    - packages/web/src/components/AccountBillingPage.tsx

key-decisions:
  - "v5 yearly prices: start=11900, team=47900, enterprise=129000 (reduced from 12000/59880/154800)"
  - "Free tier changed to: 1 project, 20 AI requests total, guest links (from 2 projects, 3 AI gens, 5 refinements, 1 resource)"
  - "Server aiGenerations repurposed: free=20 total, start=25/day, team=50/day, enterprise=100/day"
  - "Removed -33% badge in favor of per-card absolute savings display"

patterns-established:
  - "Usage-based alert pattern: amber at >=80%, red at >=100%"
  - "Plan-conditional button text with enterprise hidden"

requirements-completed: []

# Metrics
duration: 2min
completed: 2026-03-29
---

# Phase 29 Plan 01: v5 Pricing Sync and CRO Enhancements Summary

**Synced all prices, limits, and features to v5 tariff grid with CRO improvements: yearly savings display, social proof blockquote, personalized upgrade button, and usage-based upsell alerts.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-28T21:20:49Z
- **Completed:** 2026-03-28T21:22:23Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Frontend billing.ts prices updated to v5 yearly prices (11900/47900/129000)
- PLAN_FEATURES completely rewritten with v5 feature sets per plan
- Server plan-config.ts defaults synchronized with v5 limits and prices
- PurchasePage: title, free button text, yearly savings, social proof, -33% badge removed
- AccountBillingPage: AI label fix, 80%/100% upsell alerts, personalized button, free plan details

## Task Commits

Each task was committed atomically:

1. **Task 1: Update billing constants, server config, and PurchasePage** - `8c70aa7` (feat)
2. **Task 2: Update AccountBillingPage with upsell alerts and personalized button** - `5fe9792` (feat)

## Files Created/Modified
- `packages/web/src/lib/billing.ts` - Updated PLAN_PRICES yearly values, rewrote PLAN_FEATURES with v5 sets
- `packages/server/src/services/plan-config.ts` - Updated all plan defaults (projects, AI limits, yearly prices) to match v5
- `packages/web/src/components/PurchasePage.tsx` - Updated FREE_FEATURES, title, button text, removed -33% badge, added yearly savings, added social proof
- `packages/web/src/components/AccountBillingPage.tsx` - Changed AI label, added 80%/100% alerts, personalized button, free plan details block

## Decisions Made
- None - followed plan as specified. All changes matched v5 tariff grid from CONTEXT.md decisions A1-A7, B1-B7.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Worktree HEAD was behind the billing branch (commits 90af094, bef7c8d with plan files were not checked out). Fast-forwarded with `git merge billing --ff-only` before execution.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All v5 pricing and limits are synchronized between frontend and server
- PurchasePage and AccountBillingPage CRO improvements applied
- Ready for 29-02 (feature gate modal, LimitReachedModal integration)

## Self-Check: PASSED

All modified files exist. Both commits verified in git history. No stubs detected.

---
*Phase: 29-paywall-enhance*
*Completed: 2026-03-29*
