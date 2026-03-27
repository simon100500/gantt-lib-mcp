---
phase: 28-billing
plan: 01
subsystem: billing-backend
tags: [billing, yookassa, payments, subscriptions, plan-config]
dependency_graph:
  requires: []
  provides: [BILL-DB, BILL-BACKEND, BILL-YOOKASSA]
  affects: [28-02, 28-03]
tech-stack:
  added: []
  patterns: ["raw fetch to YooKassa REST API v3", "env-driven plan config with defaults", "service class pattern for billing logic", "embedded widget confirmation flow"]
key-files:
  created:
    - packages/server/src/services/plan-config.ts
    - packages/server/src/services/billing-service.ts
    - packages/server/src/routes/billing-routes.ts
  modified:
    - packages/mcp/src/db.ts
    - packages/server/src/index.ts
decisions:
  - "Raw fetch to YooKassa API v3 instead of npm SDK (immature TS ecosystem)"
  - "Separate subscriptions table (not user columns) for clean separation of concerns"
  - "BillingService class with all DB operations, imported by routes"
metrics:
  duration: "3m 36s"
  completed_date: "2026-03-27"
---

# Phase 28 Plan 01: Billing Backend Summary

SQLite schema + plan config + YooKassa billing backend with 5 REST endpoints

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Database schema + plan config service | 3ac0991 | db.ts, plan-config.ts, billing-service.ts |
| 2 | Billing REST routes with YooKassa integration | 390e073 | billing-routes.ts, index.ts |

## Key Changes

### Database Schema (packages/mcp/src/db.ts)
- `subscriptions` table: id, user_id UNIQUE, plan, period_start, period_end, ai_used, created_at
- `payments` table: id, user_id, plan, period, amount, yookassa_payment_id UNIQUE, status, created_at

### Plan Config (packages/server/src/services/plan-config.ts)
- 4 plans (free, start, team, enterprise) with env-driven limits and pricing
- Default quotas match CONTEXT.md D-09 tariff table exactly
- All values overridable via env vars (PLAN_START_PRICE_MONTHLY, etc.)

### Billing Service (packages/server/src/services/billing-service.ts)
- BillingService class with 8 methods: getOrCreateSubscription, getSubscriptionStatus, applyPlan, incrementAiUsage, createPaymentRecord, markPaymentSucceeded, getPaymentHistory, isPaymentProcessed
- One-time payment model: monthly=31 days, yearly=365 days
- AI counter reset on plan purchase

### Billing Routes (packages/server/src/routes/billing-routes.ts)
- POST /api/billing/create - embedded payment with confirmation_token (D-03, D-04)
- GET /api/billing/status - poll payment from YooKassa
- POST /api/billing/webhook - idempotent, applies plan on success
- GET /api/billing/subscription - plan, limits, usage
- GET /api/billing/payments - payment history

## Decisions Made

- **YooKassa raw fetch** over npm SDK: TypeScript SDK for YooKassa is immature, direct HTTP with Basic Auth is simpler and more reliable
- **Separate subscriptions table** vs user columns: cleaner separation, easier to query/extend
- **Receipt with VAT code 1** (no VAT) and payment_subject: service, matching homeopapa pattern

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED
