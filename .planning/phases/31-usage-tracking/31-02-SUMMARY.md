---
phase: 31-usage-tracking
plan: 02
subsystem: billing
tags: [usage-tracking, api, frontend, billing]
requires:
  - phase: 31
    plan: 01
    provides: Canonical usage snapshot assembly in BillingService
provides:
  - Authenticated normalized usage API at GET /api/usage
  - Shared server usage payload reuse across billing routes
  - Frontend billing store access to normalized usage snapshots
affects: [web, server]
tech-stack:
  added: []
  patterns: [normalized usage contract, authenticated usage fetch, store-level typed access]
key-files:
  created: []
  modified:
    - packages/server/src/routes/billing-routes.ts
    - packages/web/src/stores/useBillingStore.ts
key-decisions:
  - "Kept `/api/billing/subscription` intact for existing billing-page consumers while adding `/api/usage` as the normalized contract."
  - "Mirrored normalized usage data into store state during `fetchSubscription()` so existing consumers stay in sync without forcing an immediate migration."
patterns-established:
  - "Dedicated usage reads go through `/api/usage` with `plan`, `planMeta`, `limits`, `usage`, and `remaining`."
  - "Frontend code can fetch normalized usage directly through `fetchUsage()` instead of relying on billing-subscription compatibility fields."
requirements-completed: [TRK-03]
duration: 30min
completed: 2026-04-03
---

# Phase 31 Plan 02 Summary

**Dedicated normalized usage API plus typed frontend store access**

## Performance

- **Duration:** 30 min
- **Completed:** 2026-04-03
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added authenticated `GET /api/usage` that returns the normalized usage contract built by `BillingService.getUsageStatus()`.
- Refactored `/api/billing/subscription` to reuse the same canonical `remaining` snapshot assembly instead of re-deriving it in the route.
- Extended `useBillingStore` with a typed `usage` slice and `fetchUsage()` action while keeping `fetchSubscription()` behavior compatible with current billing UI.

## Task Commits

1. **Task 1: Add a dedicated usage snapshot contract on the server** - `8912dd5`
2. **Task 2: Wire frontend store access to the dedicated usage API** - `6ecabf7`

## Files Created/Modified

- `packages/server/src/routes/billing-routes.ts` - Added `/api/usage` and reused shared usage snapshot assembly in subscription responses.
- `packages/web/src/stores/useBillingStore.ts` - Added normalized usage types, state, and authenticated `/api/usage` fetch action.

## Decisions Made

- Avoided Phase 32-style generic enforcement middleware and kept this phase focused on read-path exposure only.
- Preserved the billing subscription endpoint as a compatibility surface while introducing a cleaner normalized route for future consumers.

## Deviations from Plan

None.

## Issues Encountered

- Validation required escalated TypeScript builds because sandboxed compilation could not write refreshed `dist/` output.

## User Setup Required

None.

## Next Phase Readiness

- Frontend and server now share a normalized usage contract for future enforcement and feature-gating work.
- Existing billing-page consumers remain operational while newer flows can migrate to `/api/usage`.

