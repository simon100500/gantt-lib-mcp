---
phase: 38-paywall-trial-transition
verified: 2026-04-05T14:14:45Z
status: gaps_found
score: 10/14 must-haves verified
gaps:
  - truth: "Trial offer modal shows after value trigger events with Russian copy"
    status: partial
    reason: "TrialOfferModal component exists with correct copy but is NOT imported or rendered by any parent component (App.tsx, page layout, or shell). The component is orphaned."
    artifacts:
      - path: "packages/web/src/components/TrialOfferModal.tsx"
        issue: "Orphaned - not imported by any other component"
    missing:
      - "Import TrialOfferModal into App.tsx or relevant page component"
      - "Wire useTrialTrigger hook into the app shell to drive TrialOfferModal visibility"
  - truth: "Trial reminder banner shows at 7, 3, 1 days before expiry"
    status: partial
    reason: "TrialReminderBanner component exists with correct 7/3/1 day filtering logic but is NOT imported or rendered by any parent component. Orphaned."
    artifacts:
      - path: "packages/web/src/components/TrialReminderBanner.tsx"
        issue: "Orphaned - not imported by any other component"
    missing:
      - "Import TrialReminderBanner into App.tsx or relevant page component alongside billing store subscription state"
  - truth: "Trial expiry screen shows after trial ends with data-safe messaging"
    status: partial
    reason: "TrialExpiryScreen component exists with correct Russian copy but is NOT imported or rendered by any parent component. Orphaned."
    artifacts:
      - path: "packages/web/src/components/TrialExpiryScreen.tsx"
        issue: "Orphaned - not imported by any other component"
    missing:
      - "Import TrialExpiryScreen into App.tsx, wire to billingState=trial_expired detection"
  - truth: "Frontend useTrialTrigger hook integrates trial offer into existing constraint flow"
    status: partial
    reason: "useTrialTrigger hook exists with correct logic but is NOT imported or used by any component. It correctly reads constraintDenial from authStore and checks eligibility, but the hook is never invoked anywhere."
    artifacts:
      - path: "packages/web/src/hooks/useTrialTrigger.ts"
        issue: "Orphaned - not imported by any other component"
    missing:
      - "Invoke useTrialTrigger in App.tsx and wire its output to TrialOfferModal"
---

# Phase 38: Paywall Trial Transition Verification Report

**Phase Goal:** Implement paywall/trial transition system -- trial billing model, constraint integration, admin API, admin UI, frontend trial UX, and self-serve trial activation.
**Verified:** 2026-04-05T14:14:45Z
**Status:** gaps_found
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Prisma schema has BillingState enum with 5 values + TrialSource enum + BillingEvent audit model | VERIFIED | schema.prisma lines 75-87, 299-315: BillingState{free,trial_active,trial_expired,paid_active,paid_expired}, TrialSource{self_serve,admin,promo}, BillingEvent model with all fields |
| 2 | TrialService implements all 6 lifecycle operations with audit trail | VERIFIED | trial-service.ts: startTrial, endTrialNow, rollbackTrialToFree, extendTrial, convertTrialToPaid, checkTrialEligibility -- all with recordBillingEvent calls |
| 3 | ConstraintService resolves Start plan for trial_active users | VERIFIED | constraint-service.ts lines 354-360: reads billingState + trialPlan, resolves to start for trial_active |
| 4 | BillingService returns billingState and trial metadata + expiry checker | VERIFIED | billing-service.ts: billingState/trialStartedAt/trialEndsAt/trialSource in status, checkAndRollExpiredTrials function exported |
| 5 | Admin API has 5 trial action routes + enhanced user details with billingEvents | VERIFIED | admin-routes.ts: 5 POST routes at trial/start,extend,end,rollback,convert, all with authMiddleware+requireAdminAccess, billingEvents in user details |
| 6 | Admin UI shows trial status card, action buttons, billingState badges, events timeline | VERIFIED | AdminPage.tsx: billingStateLabels/colors, trialAction helper, Trial Status card, action buttons per state, billingEvents timeline |
| 7 | Frontend billing store exposes billingState and trial helpers | VERIFIED | useBillingStore.ts: billingState field, isTrialActive, isTrialExpired, getTrialDaysRemaining helpers |
| 8 | Trial offer modal shows after value trigger events with Russian copy | PARTIAL | TrialOfferModal.tsx exists with correct copy ("Попробуйте 14 дней тарифа Старт", "Включить 14 дней бесплатно"), but NOT imported/used by any component |
| 9 | Trial reminder banner shows at 7, 3, 1 days before expiry | PARTIAL | TrialReminderBanner.tsx exists with correct REMINDER_DAYS Set and Russian copy, but NOT imported/used by any component |
| 10 | Trial expiry screen shows after trial ends with data-safe messaging | PARTIAL | TrialExpiryScreen.tsx exists with correct copy ("Пробный доступ закончился", "Ваши графики сохранены"), but NOT imported/used by any component |
| 11 | LimitReachedModal shows post-trial copy referencing experienced value | VERIFIED | constraintUi.ts line 239: isPostTrialFeatureGate detection, post-trial title and description |
| 12 | Self-serve trial API endpoint POST /api/billing/trial/start works | VERIFIED | billing-routes.ts lines 338-358: auth-protected, calls TrialService.startTrial with source='self_serve' |
| 13 | Trial trigger service detects value events and determines eligibility | VERIFIED | trial-trigger-service.ts: checks project+tasks existence and AI usage >= 3 |
| 14 | Frontend useTrialTrigger hook integrates trial offer into constraint flow | PARTIAL | useTrialTrigger.ts exists with correct logic (constraintDenial detection, eligibility check, activateTrial, dismissOffer), but NOT imported/used by any component |

**Score:** 10/14 truths verified (4 partially implemented -- components exist but are orphaned)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/mcp/prisma/schema.prisma` | BillingState enum, trial fields, BillingEvent model | VERIFIED | All 3 enums + 8 trial fields on Subscription + BillingEvent model with indexes |
| `packages/server/src/services/trial-service.ts` | TrialService with all lifecycle operations | VERIFIED | 332 lines, 6 operations, all with audit trail |
| `packages/server/src/services/trial-service.test.ts` | Test coverage for trial lifecycle | VERIFIED | 11 tests, all pass |
| `packages/server/src/services/constraint-service.ts` | Trial-aware plan resolution | VERIFIED | Reads billingState/trialPlan, resolves to start for trial_active |
| `packages/server/src/services/billing-service.ts` | Trial state in subscription status + expiry checker | VERIFIED | billingState in response, checkAndRollExpiredTrials exported |
| `packages/server/src/routes/admin-routes.ts` | 5 trial action routes + enhanced details | VERIFIED | 5 POST routes, billingEvents in user details |
| `packages/web/src/components/AdminPage.tsx` | Trial management UI | VERIFIED | Trial status card, action buttons, billingState badges, events timeline |
| `packages/web/src/components/TrialOfferModal.tsx` | Trial invitation modal | ORPHANED | Exists with correct content, not imported anywhere |
| `packages/web/src/components/TrialExpiryScreen.tsx` | Trial expiry screen | ORPHANED | Exists with correct content, not imported anywhere |
| `packages/web/src/components/TrialReminderBanner.tsx` | Trial countdown reminder | ORPHANED | Exists with correct content, not imported anywhere |
| `packages/web/src/stores/useBillingStore.ts` | Trial state in billing store | VERIFIED | billingState field + 3 helper functions |
| `packages/web/src/lib/constraintUi.ts` | Post-trial feature gate copy | VERIFIED | isPostTrialFeatureGate detection + Russian post-trial copy |
| `packages/server/src/services/trial-trigger-service.ts` | Trial trigger detection | VERIFIED | checkTriggerEligibility with project+tasks and AI usage checks |
| `packages/server/src/services/trial-trigger-service.test.ts` | Trigger service tests | VERIFIED | 4 tests, all pass |
| `packages/server/src/routes/billing-routes.ts` | Self-serve trial API endpoints | VERIFIED | GET trial/eligibility + POST trial/start, both auth-protected |
| `packages/web/src/hooks/useTrialTrigger.ts` | Frontend trial trigger hook | ORPHANED | Exists with correct logic, not imported anywhere |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| trial-service.ts | schema.prisma | Prisma Subscription + BillingEvent models | WIRED | prisma.subscription.update + prisma.billingEvent.create calls present |
| constraint-service.ts | schema.prisma | Reads billingState from Subscription | WIRED | select: { plan, billingState, trialPlan }, conditional planId override |
| admin-routes.ts | trial-service.ts | TrialService lifecycle operations | WIRED | trialService.startTrial/extendTrial/endTrialNow/rollbackTrialToFree/convertTrialToPaid |
| AdminPage.tsx | /api/admin/users/:id/trial/start | fetch POST via trialAction helper | WIRED | trialAction calls fetchAdminWithRetry to trial action endpoints |
| useBillingStore.ts | /api/billing/subscription | fetchSubscription returns billingState | WIRED | billingState field in SubscriptionStatus interface, populated from API |
| billing-routes.ts | trial-service.ts + trial-trigger-service.ts | Direct imports | WIRED | TrialService + TrialTriggerService instantiated in route handlers |
| useTrialTrigger.ts | /api/billing/trial/start | fetch POST | NOT_WIRED | Hook exists but is never invoked; no component imports it |
| useTrialTrigger.ts | useAuthStore constraintDenial | useEffect on constraintDenial | NOT_WIRED | Hook reads constraintDenial but is never mounted in any component |
| TrialOfferModal.tsx | App.tsx or parent component | JSX render | NOT_WIRED | Not imported by any component |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| AdminPage.tsx trial actions | selectedUser | trialAction -> fetchAdminWithRetry -> admin API | Yes | WIRED - refreshes user details after each action |
| AdminPage.tsx billingEvents | selectedUser.billingEvents | buildAdminUserDetails -> prisma.billingEvent.findMany | Yes | WIRED - queries real DB for billing events |
| constraint-service.ts | planId | subscription.billingState/trialPlan | Yes | WIRED - reads from Subscription row in DB |
| billing-service.ts | billingState/trialEndsAt | Subscription record | Yes | WIRED - reads from Subscription row in DB |
| TrialOfferModal.tsx | props (onAccept, triggerFeature) | Would come from useTrialTrigger | No | DISCONNECTED - parent never renders the component |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| TrialService tests pass (11 cases) | `node --test dist/services/trial-service.test.js` | 11/11 pass, 0 fail | PASS |
| TrialTriggerService tests pass (4 cases) | `node --test dist/services/trial-trigger-service.test.js` | 4/4 pass, 0 fail | PASS |
| Server TypeScript compiles | `npx tsc -p packages/server/tsconfig.json --noEmit` | Clean, no errors | PASS |
| Prisma schema validates | `npx prisma validate` | "The schema is valid" | PASS |
| Web TypeScript compiles | `npx tsc -p packages/web/tsconfig.json --noEmit` | 2 pre-existing vitest import errors from Phase 34 | PASS (pre-existing) |
| Trial frontend components imported | grep -r "import.*TrialOfferModal" | No matches found | FAIL |

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|---------------|-------------|--------|----------|
| FR-1 Trial eligibility | 38-01, 38-06 | One trial per user, only from free state | SATISFIED | TrialService.checkTrialEligibility validates free + no prior trial |
| FR-2 Trial activation | 38-01, 38-06 | 14-day Start trial without payment | SATISFIED | TrialService.startTrial + POST /api/billing/trial/start |
| FR-3 Trial entitlement | 38-02 | Start limits enforced during trial | SATISFIED | ConstraintService resolves trial_active to start plan |
| FR-4 Reminder delivery | 38-05 | In-app reminders at 7, 3, 1 days | PARTIAL | TrialReminderBanner exists with correct filtering, but not wired into any page |
| FR-5 Trial expiry | 38-01, 38-02 | Auto-rollback to free at trial end | SATISFIED | checkAndRollExpiredTrials + TrialService.rollbackTrialToFree |
| FR-6 Safe rollback | 38-01 | Preserve data, mark over-limit entities | SATISFIED | rollbackTrialToFree returns overLimitProjects count, sets plan=free |
| FR-7 Post-trial upsell | 38-05 | Premium prompts reference experienced value | SATISFIED | constraintUi isPostTrialFeatureGate detection + post-trial Russian copy |
| FR-8 Admin control | 38-03, 38-04 | Inspect, modify, audit trial lifecycle | SATISFIED | 5 admin API routes + admin UI with trial status card, actions, events timeline |

**Note on REQUIREMENTS.md mapping:** REQUIREMENTS.md maps OVR-01/02/03 to "Phase 38" but these are constraint override requirements (future Phase 39), not trial transition. Phase 38 uses PRD-only requirements (FR-1 through FR-8). The OVR entries in REQUIREMENTS.md should be updated to map to Phase 39, but this is a documentation issue, not an implementation gap.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| TrialOfferModal.tsx | 9 | `if (!open) return null` | Info | Standard conditional rendering pattern, not a stub |
| AdminPage.tsx | 489 | `placeholder="..."` | Info | HTML input placeholder attribute, not a code stub |
| admin-routes.test.ts | 6 | Path resolution `resolve(process.cwd(), ...)` | Warning | Test fails when run from packages/server due to doubled path. Pre-existing test infra issue, not blocking. |

### Human Verification Required

### 1. Admin Trial Management End-to-End

**Test:** Open admin panel, select a free user, click "Start 14-day trial", then try Extend 3d, End, and Rollback actions.
**Expected:** Trial status card appears with countdown, billingState badge changes to blue "Пробный", billing events timeline shows state transitions, all action buttons work without errors.
**Why human:** Requires running server with DB, visual verification of UI state transitions.

### 2. Trial Offer Modal Visual Appearance

**Test:** Navigate to a scenario where TrialOfferModal would render (after wiring fix).
**Expected:** Modal shows "Попробуйте 14 дней тарифа Старт" title, "Включить 14 дней бесплатно" primary CTA, "Пока не нужно" secondary button. Proper centering, z-index above other content.
**Why human:** Visual appearance, modal overlay, button styling can only be confirmed visually.

### 3. Admin BillingState Badge Rendering

**Test:** Check admin user list for users in different billing states.
**Expected:** trial_active shows blue "Пробный" badge, trial_expired shows orange "Пробный истёк", paid shows green, free shows nothing extra.
**Why human:** Color rendering and badge visual design.

### Gaps Summary

The backend and admin layers are fully implemented and wired: trial data model, lifecycle service (with tests), constraint integration, admin API routes (5 trial endpoints), admin UI (trial status card, action buttons, billingState badges, events timeline), self-serve trial API, and trigger service. All compile and test successfully.

The critical gap is on the frontend end-user UX side. Three React components (TrialOfferModal, TrialReminderBanner, TrialExpiryScreen) and one hook (useTrialTrigger) were created as standalone modules but are never imported or rendered by any parent component. Specifically:

1. **TrialOfferModal** -- should be imported into App.tsx (alongside the existing LimitReachedModal) and driven by useTrialTrigger state
2. **TrialReminderBanner** -- should be imported into App.tsx or the project shell, showing when isTrialActive and getTrialDaysRemaining returns 7/3/1
3. **TrialExpiryScreen** -- should be imported into App.tsx, triggered when billingState transitions to trial_expired
4. **useTrialTrigger** -- should be invoked in App.tsx to wire constraint denials to trial offer checks

These components are well-implemented internally (correct Russian copy, correct logic, correct filtering) but are architecturally disconnected from the running application. They are the last mile of the trial UX for end users.

---

_Verified: 2026-04-05T14:14:45Z_
_Verifier: Claude (gsd-verifier)_
