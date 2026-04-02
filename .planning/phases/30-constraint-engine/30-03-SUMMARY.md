---
phase: 30-constraint-engine
plan: 03
subsystem: billing
tags: [billing, middleware, web, compatibility]
requires:
  - phase: 30-constraint-engine
    provides: ConstraintService and shared constraint catalog
provides:
  - Billing compatibility adapter over the shared catalog
  - `/api/billing/subscription` normalized limits/usage payload
  - Frontend billing consumers that render unlimited and tracked states without `-1`
affects: [server, web]
tech-stack:
  added: []
  patterns: [compatibility adapter, normalized billing payload, explicit unlimited rendering]
key-files:
  created: []
  modified:
    - packages/server/src/services/plan-config.ts
    - packages/server/src/services/billing-service.ts
    - packages/server/src/routes/billing-routes.ts
    - packages/server/src/middleware/subscription-middleware.ts
    - packages/web/src/stores/useBillingStore.ts
    - packages/web/src/components/layout/ProjectMenu.tsx
    - packages/web/src/components/AccountBillingPage.tsx
key-decisions:
  - "Kept `aiUsed` and `aiLimit` in the payload for compatibility, but sourced them from normalized `ai_queries` usage."
  - "Added `legacyLimits` alongside normalized `limits/usage/remaining` to reduce migration risk for current consumers."
patterns-established:
  - "Current billing and enforcement surfaces now read through the shared catalog and ConstraintService."
  - "Web UI renders unlimited via explicit state instead of numeric sentinels."
requirements-completed: [ENG-01, ENG-02]
duration: 30min
completed: 2026-04-03
---

# Phase 30 Plan 03 Summary

**Migrated billing routes, middleware, and current web consumers onto the normalized constraint engine vocabulary while keeping the app-compatible surface.**

## Accomplishments

- Reworked `plan-config.ts` into a compatibility adapter over `@gantt/mcp/constraints`.
- Updated `BillingService` and `/api/billing/subscription` to expose canonical `limits`, `usage`, and `remaining` keyed by `projects`, `ai_queries`, `archive`, `resource_pool`, and `export`.
- Switched subscription middleware to `ConstraintService.checkLimit('ai_queries')`.
- Updated web billing state, project menu, and account billing page to handle `tracked`, `unlimited`, and `not_applicable` without `=== -1`.

## Verification

- `cmd /c npx tsc -p packages/server/tsconfig.json`
- `cmd /c npx tsc -p packages/web/tsconfig.json`
- `cmd /c node --test packages/server/dist/services/constraint-service.test.js packages/server/dist/billing-service.test.js`

## Self-Check: PASSED

- FOUND: canonical usage keys in billing subscription payload
- FOUND: `ConstraintService` in billing middleware flow
- FOUND: no `=== -1` checks in current billing UI consumers touched by this plan
