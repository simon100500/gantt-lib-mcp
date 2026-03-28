---
phase: 28-billing
verified: 2026-03-28T12:00:00Z
status: passed
score: 8/8 must-haves verified
re_verification: false
---

# Phase 28: Billing Verification Report

**Phase Goal:** Users can purchase subscription plans via YooKassa, with plan enforcement limiting features based on active subscription
**Verified:** 2026-03-28T12:00:00Z
**Status:** passed
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Database has payments and subscriptions tables for tracking billing state | VERIFIED | Prisma schema has `Subscription` (id, userId, plan, periodStart, periodEnd, aiUsed, createdAt) and `Payment` (id, userId, plan, period, amount, yookassaPaymentId, status, createdAt) models with proper relations |
| 2 | Backend creates YooKassa embedded widget payments and handles webhooks with idempotency | VERIFIED | `billing-routes.ts` POST /api/billing/create creates YooKassa payment with `confirmation: { type: 'embedded' }`, returns confirmationToken. Webhook endpoint checks `isPaymentProcessed()` for idempotency before applying plan |
| 3 | POST /api/chat enforces AI generation limits (403 when limit reached) | VERIFIED | `subscriptionMiddleware` in index.ts preHandler chain returns 403 with code `AI_LIMIT_REACHED` when `aiUsed >= aiLimit`. Also returns 403 with `SUBSCRIPTION_EXPIRED` when plan expired |
| 4 | User sees billing page with current plan, usage limits, and payment history | VERIFIED | `BillingPage.tsx` renders current plan card with name, period end, AI usage bar (used/limit with color coding), plan limits summary, and payment history table with date/plan/amount/status columns |
| 5 | User can start YooKassa embedded payment from billing page | VERIFIED | `handleUpgrade()` calls `createPayment()`, loads YooKassa widget script, creates `YooMoneyCheckoutWidget` with `embedded_kit: true`, renders into `payment-form-container`, starts polling every 2s for up to 120s |
| 6 | Pricing page CTAs redirect to billing page with correct plan pre-selected | VERIFIED | `pricing.astro` line 34: `ctaHref` for start = `ai.getgantt.ru/?auth=otp&plan=start&billing=true`. Line 55: team = `ai.getgantt.ru/?auth=otp&plan=team&billing=true`. App.tsx reads `?plan` and `?billing` URL params, passes `initialPlan` to BillingPage |
| 7 | Enterprise plan shows "contact us" instead of payment flow | VERIFIED | `pricing.astro` line 76-77: enterprise ctaLabel = "Напишите нам", ctaHref = mailto link. `BillingPage.tsx` line 304-310: enterprise card renders `<a href="mailto:support@getgantt.ru">Напишите нам</a>` instead of payment button |
| 8 | Subscription expiry triggers read-only mode | VERIFIED | `subscription-middleware.ts` line 30-39: if `!status.isActive && status.plan !== 'free'`, returns 403 with code `SUBSCRIPTION_EXPIRED` and message "Подписка истекла. Продлите тариф для продолжения." |

**Score:** 8/8 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/mcp/prisma/schema.prisma` (Subscription + Payment models) | DB tables for billing state | VERIFIED | Subscription model with userId, plan, periodStart, periodEnd, aiUsed. Payment model with userId, plan, period, amount, yookassaPaymentId (unique), status |
| `packages/server/src/services/plan-config.ts` | Plan config with env-driven prices and quotas | VERIFIED | 109 lines. PLAN_CONFIG with 4 plans (free/start/team/enterprise), env-driven with correct defaults. Exports getPlanLimits, getPlanPricing, isPlanActive |
| `packages/server/src/services/billing-service.ts` | Billing business logic | VERIFIED | 197 lines. BillingService class with getOrCreateSubscription, getSubscriptionStatus, applyPlan, incrementAiUsage, createPaymentRecord, markPaymentSucceeded, getPaymentHistory, isPaymentProcessed. All use getPrisma (PostgreSQL) |
| `packages/server/src/routes/billing-routes.ts` | All billing REST endpoints | VERIFIED | 283 lines. 5 endpoints: POST /create, GET /status, POST /webhook, GET /subscription, GET /payments. YooKassa REST API v3 with embedded widget, Basic auth, Idempotence-Key headers |
| `packages/server/src/middleware/subscription-middleware.ts` | Subscription enforcement for AI chat | VERIFIED | 59 lines. Checks plan expiry (403 SUBSCRIPTION_EXPIRED) and AI limits (403 AI_LIMIT_REACHED). Exports incrementAiUsage function |
| `packages/web/src/stores/useBillingStore.ts` | Billing state management | VERIFIED | 180 lines. Zustand store with fetchSubscription, fetchPayments, createPayment, pollPaymentStatus (2s interval, 60 attempts). Uses fetchWithAuthRetry pattern |
| `packages/web/src/components/BillingPage.tsx` | Full billing page UI | VERIFIED | 407 lines. Current plan card, AI usage bar, monthly/yearly toggle, upgrade cards (start/team/enterprise), YooKassa widget integration, payment success/error states, payment history table |
| `packages/web/src/components/layout/ProjectMenu.tsx` | Billing navigation entry | VERIFIED | Line 295-297: "Подписка" menu item calls `setShowBillingPage(true)` via useUIStore |
| `packages/site/src/pages/pricing.astro` | Updated CTA hrefs | VERIFIED | Start CTA: `plan=start&billing=true`, Team CTA: `plan=team&billing=true`, Enterprise: "Напишите нам" with mailto |
| `packages/mcp/src/db.ts` | DELETED (plan 04) | VERIFIED | File does not exist |
| `packages/mcp/src/auth-store.ts` | DELETED (plan 04) | VERIFIED | File does not exist |
| `packages/server/src/db.ts` | Re-exports getPrisma | VERIFIED | `export { getPrisma } from '@gantt/mcp/prisma'` |
| `packages/server/src/admin.ts` | Uses Prisma instead of SQLite | VERIFIED | All queries use `prisma.$queryRawUnsafe()`. Zero SQLite references |
| `gantt.db` | DELETED (plan 04) | VERIFIED | File does not exist |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `billing-routes.ts` | `billing-service.ts` | import BillingService | WIRED | `new BillingService()` used for all operations |
| `billing-service.ts` | `@gantt/mcp/prisma` | getPrisma() for CRUD | WIRED | 7 calls to `getPrisma()` across all methods |
| `billing-routes.ts` | `auth-middleware.ts` | preHandler | WIRED | `preHandler: [authMiddleware]` on create, subscription, payments endpoints |
| `index.ts` | `billing-routes.ts` | registerBillingRoutes | WIRED | Line 23 import, line 30 registration |
| `index.ts` | `subscription-middleware.ts` | preHandler on /api/chat | WIRED | Line 20 import, line 45 `preHandler: [authMiddleware, subscriptionMiddleware]` |
| `index.ts` | `subscription-middleware.ts` | incrementAiUsage | WIRED | Line 52 `await incrementAiUsage(req.user!.userId)` |
| `useBillingStore.ts` | `/api/billing/subscription` | fetch subscription | WIRED | fetchSubscription() calls `/api/billing/subscription` |
| `useBillingStore.ts` | `/api/billing/create` | create payment | WIRED | createPayment() POSTs to `/api/billing/create` |
| `BillingPage.tsx` | `useBillingStore.ts` | uses store for all state | WIRED | Destructures subscription, payments, loading, paymentLoading, paymentSuccess, paymentError, all actions |
| `pricing.astro` | `ai.getgantt.ru` | CTA href with plan param | WIRED | Three CTAs with `plan=start`, `plan=team`, enterprise mailto |
| `ProjectMenu.tsx` | `useUIStore` | setShowBillingPage(true) | WIRED | Line 295 onClick triggers billing page |
| `App.tsx` | `BillingPage.tsx` | conditional render | WIRED | Line 628-629 renders BillingPage when showBilling && auth.isAuthenticated |
| `App.tsx` | URL params | showBillingFromUrl | WIRED | Lines 40-47 reads `?billing` and `?plan` from URL, line 48 combines with store state |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| BillingPage.tsx | subscription (plan, aiUsed, aiLimit) | fetchSubscription -> /api/billing/subscription -> BillingService.getSubscriptionStatus -> Prisma subscription.findUnique | FLOWING | DB query returns real subscription data, computed with plan limits |
| BillingPage.tsx | payments (history) | fetchPayments -> /api/billing/payments -> BillingService.getPaymentHistory -> Prisma payment.findMany | FLOWING | DB query returns real payment records |
| subscription-middleware.ts | status.aiUsed, status.aiLimit | BillingService.getSubscriptionStatus -> Prisma subscription.findUnique | FLOWING | Real DB data used for enforcement decision |
| billing-routes.ts | confirmationToken | YooKassa REST API POST /payments | FLOWING | Real YooKassa API call, token stored in DB |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Server TypeScript compiles | `npx tsc -p packages/server/tsconfig.json --noEmit` | No errors | PASS |
| Web TypeScript compiles | `npx tsc -p packages/web/tsconfig.json --noEmit` | No errors | PASS |
| No SQLite remnants | `grep -rn "sqlite\|libsql" packages/ --include="*.ts"` | Zero matches | PASS |
| No getDb remnants | `grep -rn "getDb\|@gantt/mcp/db" packages/` | Zero matches | PASS |
| gantt.db deleted | `test -f gantt.db` | Does not exist | PASS |
| db.ts deleted | `test -f packages/mcp/src/db.ts` | Does not exist | PASS |
| auth-store.ts deleted | `test -f packages/mcp/src/auth-store.ts` | Does not exist | PASS |
| @libsql/client removed from deps | `grep libsql packages/*/package.json` | Zero matches | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| BILL-DB | 28-01 | Database tables for payments and subscriptions | SATISFIED | Prisma schema has Subscription and Payment models with all required columns |
| BILL-BACKEND | 28-01 | Billing backend with REST API | SATISFIED | 5 endpoints: create, status, webhook, subscription, payments. All functional |
| BILL-YOOKASSA | 28-01 | YooKassa integration with embedded widget | SATISFIED | REST API v3 with Basic auth, Idempotence-Key, embedded confirmation type |
| BILL-ENFORCE | 28-02 | AI generation limit enforcement | SATISFIED | subscriptionMiddleware returns 403 on limit reached. incrementAiUsage called on each chat message |
| BILL-UI | 28-02 | Billing page with plan info, limits, history | SATISFIED | Full BillingPage component with current plan card, AI usage bar, payment history table, upgrade flow |
| BILL-CTA | 28-03 | Pricing page CTAs to billing | SATISFIED | Start/team CTAs have plan param. Enterprise has mailto |
| BILL-NAV | 28-03 | In-app billing navigation | SATISFIED | ProjectMenu has "Подписка" button. App.tsx reads URL params for external navigation |

### Anti-Patterns Found

No anti-patterns detected. Zero TODO/FIXME/PLACEHOLDER comments. No empty implementations. No hardcoded empty data. No console.log-only implementations.

### Human Verification Required

### 1. Full Payment Flow

**Test:** Open pricing page, click "Выбрать Старт" CTA, complete YooKassa payment
**Expected:** Redirect to ai.getgantt.ru with billing page showing, YooKassa embedded widget loads, payment succeeds, plan updates to "Старт"
**Why human:** Requires real YooKassa API credentials and live payment processing

### 2. Limit Enforcement Behavior

**Test:** As free user, send 3+ AI chat messages
**Expected:** First 3 messages process normally. 4th message shows "Лимит AI-генераций исчерпан (3/3)"
**Why human:** Requires authenticated session with real backend running

### 3. Billing Page Visual Layout

**Test:** Open billing page and verify layout, spacing, and visual elements
**Expected:** Current plan card, AI usage bar, monthly/yearly toggle, upgrade cards, payment history table render correctly
**Why human:** Visual verification cannot be done programmatically

### 4. Enterprise CTA in Billing Page

**Test:** Click enterprise card "Напишите нам" button
**Expected:** Email client opens with pre-filled subject line
**Why human:** Requires browser mailto handler

### Gaps Summary

No gaps found. All 8 success criteria from ROADMAP.md are verified. All 7 requirement IDs (BILL-DB, BILL-BACKEND, BILL-YOOKASSA, BILL-ENFORCE, BILL-UI, BILL-CTA, BILL-NAV) are satisfied. Plan 04 SQLite cleanup is fully complete. TypeScript compiles clean for both server and web packages. All key links are wired. Data flows from Prisma/PostgreSQL through all layers.

---

_Verified: 2026-03-28T12:00:00Z_
_Verifier: Claude (gsd-verifier)_
