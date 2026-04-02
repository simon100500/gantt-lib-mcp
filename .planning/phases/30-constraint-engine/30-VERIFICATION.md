---
phase: 30-constraint-engine
verified: 2026-04-03T00:34:25+03:00
status: passed
score: 16/16 must-haves verified
---

# Phase 30: Constraint Engine Verification Report

**Phase Goal:** Система проверяет лимиты по тарифу через единый config и ConstraintService с Prisma persistence
**Verified:** 2026-04-03
**Status:** passed
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | All four tariffs are described in one canonical shared catalog | VERIFIED | `packages/mcp/src/constraints/catalog.ts` defines `free`, `start`, `team`, `enterprise` in one `PLAN_CATALOG` |
| 2 | Canonical limit keys are `projects`, `ai_queries`, `archive`, `resource_pool`, `export` | VERIFIED | `packages/mcp/src/constraints/catalog.ts` exports `LimitKey` and `LIMIT_CATALOG` with all five keys |
| 3 | Unlimited values are represented as `unlimited`, not `-1`, in the canonical catalog | VERIFIED | `packages/mcp/src/constraints/catalog.ts` defines `UNLIMITED` and enterprise `projects: 'unlimited'` |
| 4 | Shared plan metadata is importable by more than one package | VERIFIED | `packages/mcp/package.json` exports `./constraints`; `packages/web/src/lib/billing.ts` imports from `@gantt/mcp/constraints` |
| 5 | Web billing labels and prices no longer come from duplicated local literals | VERIFIED | `packages/web/src/lib/billing.ts` derives `PLAN_LABELS` and `PLAN_PRICES` from `PLAN_CATALOG` |
| 6 | Prisma schema contains persistent usage counters with period buckets | VERIFIED | `packages/mcp/prisma/schema.prisma` defines `UsageCounter` with `periodBucket` and unique `[userId, limitKey, periodBucket]` |
| 7 | ConstraintService exposes `checkLimit()`, `getUsage()`, `getRemaining()`, and `incrementUsage()` | VERIFIED | `packages/server/src/services/constraint-service.ts` exports all four public methods |
| 8 | `projects` checks count active projects instead of using counters | VERIFIED | `ConstraintService.getUsage()` uses `prisma.project.count({ where: { userId, status: 'active' } })` |
| 9 | Free AI usage uses `lifetime`, paid AI usage uses `day:YYYY-MM-DD` | VERIFIED | `ConstraintService.resolvePeriodBucket()` and tests cover `lifetime` and `day:2026-04-02` |
| 10 | Boolean gates and export access return normalized `not_applicable` usage | VERIFIED | `ConstraintService.getUsage()` returns `usageState: 'not_applicable'` for `archive`, `resource_pool`, `export` |
| 11 | Enterprise project remaining state is explicit `unlimited` | VERIFIED | `ConstraintService.getRemaining()` returns `remainingState: 'unlimited'` when limit is `unlimited` |
| 12 | Unknown limit keys fail as configuration errors | VERIFIED | `ConstraintServiceError` uses code `UNKNOWN_LIMIT_KEY`; test asserts this path |
| 13 | Billing service reads plan metadata from the shared catalog and normalized usage from ConstraintService | VERIFIED | `packages/server/src/services/billing-service.ts` builds `planMeta`, `limits`, and `usage` from `PLAN_CATALOG` + `ConstraintService` |
| 14 | Billing subscription route exposes canonical keys and normalized usage/remaining payloads | VERIFIED | `packages/server/src/routes/billing-routes.ts` returns `limits`, `usage`, and `remaining` keyed by the canonical limit keys |
| 15 | AI subscription middleware enforces via ConstraintService instead of raw `aiUsed/aiLimit` comparisons | VERIFIED | `packages/server/src/middleware/subscription-middleware.ts` calls `constraintService.checkLimit(userId, 'ai_queries')` |
| 16 | Current web billing consumers render unlimited/tracked states without `=== -1` | VERIFIED | `ProjectMenu.tsx` and `AccountBillingPage.tsx` render from `usage/remaining` normalized states |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Prisma client generation | `cmd /c npm exec prisma generate` in `packages/mcp` | Client generated successfully | PASS |
| Server TypeScript compilation | `cmd /c npx tsc -p packages/server/tsconfig.json` | No errors | PASS |
| Web TypeScript compilation | `cmd /c npx tsc -p packages/web/tsconfig.json` | No errors | PASS |
| Constraint + billing tests | `cmd /c node --test packages/server/dist/services/constraint-service.test.js packages/server/dist/billing-service.test.js` | 10/10 tests passed | PASS |

### Requirements Coverage

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|----------|
| ENG-01 | Unified source of truth for tariff plan config | SATISFIED | Shared `PLAN_CATALOG` and `@gantt/mcp/constraints` export |
| ENG-02 | ConstraintService exposes check/read APIs | SATISFIED | `checkLimit`, `getUsage`, `getRemaining`, `incrementUsage` implemented |
| ENG-03 | Supports count, daily, lifetime, boolean limit types | SATISFIED | Tests and normalized service behavior cover all required shapes |
| ENG-04 | Usage counters persisted in PostgreSQL with Prisma atomic increments | SATISFIED | `UsageCounter` schema + Prisma `upsert(... usage: { increment: amount })` |

### Human Verification Required

1. **Billing subscription payload in running app**
   - Test: log in and request `GET /api/billing/subscription`
   - Expected: response contains `limits`, `usage`, and `remaining` objects with keys `projects`, `ai_queries`, `archive`, `resource_pool`, `export`

2. **Projects badge rendering**
   - Test: open the project menu on `free` and `enterprise` users
   - Expected: free shows tracked `used/limit`, enterprise shows `∞`

3. **AI limit middleware response**
   - Test: exhaust AI quota and send one more AI request
   - Expected: HTTP 403 with `code: AI_LIMIT_REACHED`, `aiUsed`, `aiLimit`, and `reasonCode`

### Gaps Summary

No gaps found. Phase 30 establishes the canonical shared constraint catalog, executable limit service, persistent usage counters, normalized billing payload, and current web consumer rendering without legacy `-1` assumptions.

---

_Verified: 2026-04-03T00:34:25+03:00_
_Verifier: Codex_
