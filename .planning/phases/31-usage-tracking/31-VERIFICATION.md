---
phase: 31-usage-tracking
status: passed
verified_at: 2026-04-03T07:30:00Z
requirements:
  - TRK-01
  - TRK-02
  - TRK-03
---

# Phase 31 Verification

## Goal

Система считает AI запросы и проекты, frontend может получить текущий usage через API.

## Must-Have Verification

| # | Requirement | Result | Evidence |
|---|-------------|--------|----------|
| 1 | Free AI usage reads from lifetime bucket, paid AI usage reads from day bucket | VERIFIED | `packages/server/src/services/constraint-service.test.ts` asserts `lifetime` and `day:2026-04-02`; compiled test suite passed |
| 2 | Active project usage is derived from current active projects per user | VERIFIED | `ConstraintService.getUsage('projects')` uses `prisma.project.count({ where: { userId, status: 'active' } })`; dedicated test passed |
| 3 | Billing compatibility fields derive from canonical usage snapshots | VERIFIED | `packages/server/src/billing-service.test.ts` proves `aiUsed`/`aiLimit` come from `ConstraintService` usage, not `Subscription.aiUsed` |
| 4 | Authenticated `/api/usage` route returns normalized usage contract | VERIFIED | `packages/server/src/routes/billing-routes.ts` defines `fastify.get('/api/usage', { preHandler: [authMiddleware] }, ...)` returning `plan`, `planMeta`, `limits`, `usage`, `remaining` |
| 5 | Frontend has typed authenticated access path for normalized usage | VERIFIED | `packages/web/src/stores/useBillingStore.ts` adds `UsageStatus`, `usage` store state, and `fetchUsage()` using `/api/usage` |

## Automated Checks

| Check | Command | Result |
|-------|---------|--------|
| Server TypeScript | `cmd /c npx tsc -p packages/server/tsconfig.json` | PASS |
| Web TypeScript | `cmd /c npx tsc -p packages/web/tsconfig.json` | PASS |
| Constraint + billing regression tests | `cmd /c node --test packages/server/dist/services/constraint-service.test.js packages/server/dist/billing-service.test.js` | PASS (12/12) |

## Traceability

| Requirement | Status | Notes |
|-------------|--------|-------|
| TRK-01 | Complete | Free lifetime and paid daily AI semantics locked by tests and canonical service reads |
| TRK-02 | Complete | Active project counting sourced from live `project.count` query |
| TRK-03 | Complete | Normalized `/api/usage` route and typed store access added |

## Residual Risk

- No HTTP integration test was added for `/api/usage` in this run; validation is based on route implementation plus successful server/web compilation.

## Verdict

Phase 31 passes. The codebase now has authoritative tracking semantics for AI/project usage and a normalized authenticated usage API for frontend consumers.

