# Phase 38: Paywall Trial Transition - Context

**Gathered:** 2026-04-05
**Status:** Ready for planning
**Source:** PRD Express Path (.planning/paywall-trial-transition-prd.md)

<domain>
## Phase Boundary

Introduce triggered 14-day Start trial with auto-rollback to free. This phase delivers:

1. **Billing lifecycle state model** — explicit `billingState` enum separating plan entitlement from lifecycle state
2. **Trial activation** — self-serve triggered trial after value events + admin-managed trial start
3. **Trial entitlement** — constraint system treats trial users as Start plan
4. **Safe rollback** — auto-rollback to free at trial end, data preserved, over-limit projects read-only
5. **Admin trial controls** — first-class trial management in admin panel with audit trail
6. **Trial UX** — invitation modal, in-app reminders (7/3/1 day), expiry screen, post-trial upsell
7. **Analytics** — trial lifecycle event tracking

**In scope:** Full trial lifecycle from data model through admin tooling to end-user UX
**Out of scope:** Auto-renewing card subscriptions, pricing redesign, free plan removal, enterprise workflow, Team trial
</domain>

<decisions>
## Implementation Decisions

### Data Model
- Add `billingState` enum: `free`, `trial_active`, `trial_expired`, `paid_active`, `paid_expired`
- Add trial fields to Subscription model: `trialPlan`, `trialStartedAt`, `trialEndsAt`, `trialEndedAt`, `trialSource` (self_serve/admin/promo), `trialConvertedAt`, `rolledBackAt`
- Add `billingState` field to Subscription model
- Add `BillingEvent` audit model for state transitions (actor, timestamp, previousState, newState, reason)

### Trial Mechanics
- Trial duration: 14 days, Start plan only
- Triggered trial model (not universal) — only after user demonstrates intent/receives value
- One self-serve trial per user/workspace, only from `free` state
- Admin can override all eligibility rules manually
- Trial unlocks: 3 active projects, 25 AI queries/day, archive, resource pool, PDF export, guest links
- Trial excludes: Team features, enterprise features, custom support

### Trial Trigger (v1)
- Show trial offer after first graph is created AND user either:
  - Attempts a premium feature (export, archive, resource pool, second project creation), OR
  - Completes at least 3 AI interactions in the same project

### Rollback Behavior
- Auto-rollback to `free` at trial end
- Preserve all user data
- Keep most recently active project editable under free
- Mark excess active projects as over-free-limit but preserved (read-only)
- Premium actions become locked again
- Historical trial usage remains visible internally

### Admin Requirements
- Admin API operations: `startTrial`, `extendTrial`, `endTrialNow`, `rollbackTrialToFree`, `convertTrialToPaid`
- Each operation records: actor, timestamp, previous state, new state, optional reason
- Admin UI: trial status card, one-click actions, billing-state badge, timeline, filter chips
- Replace manual date-first workflow with common action buttons
- Show rollback impact preview before operator confirms
- Move manual override tools under advanced section

### Trial UX (Russian-language product)
- Trial offer framed around value, not pressure
- Example: "Попробуйте 14 дней тарифа Старт" / CTA: "Включить 14 дней бесплатно"
- Reminders at 7, 3, 1 days before expiry (non-blocking)
- Reminder content: days remaining, features used during trial, what happens on rollback
- Expiry screen: "Пробный доступ закончился" + data safe message + upgrade CTA
- Post-trial upsell references experienced value (export used, multiple projects created)

### Feature Gate Behavior
- During trial: premium feature gates disappear for Start features
- After rollback: premium actions reopen feature-gate modal with post-trial tailored copy
- Post-trial copy references experienced value

### Analytics
- Track events: trial_offer_impression, trial_offer_accept, trial_offer_decline, trial_started, trial_reminder_seen, trial_expired, trial_rolled_back, trial_upgrade_clicked, trial_converted_to_paid, post_trial_feature_gate_seen
- Track properties: trigger type, project count, AI usage at start, triggering feature, days since signup, first graph created

### Rollout (per PRD Section 14)
- Phase 1 (this implementation): trial state model + admin trial controls + manual/admin-started trial + rollback behavior
- Phase 2 (future): self-serve trial offer triggers + reminder UX + post-trial expiry screens
- Phase 3 (future): analytics review + refine triggers/copy

**NOTE:** The PRD describes a phased rollout. This phase should implement ALL phases from the PRD (1-3) since the PRD represents the full feature scope for Phase 38.

### Claude's Discretion
- Exact Prisma migration strategy and field placement
- Specific cron/scheduler implementation for trial expiry checking
- Exact component architecture for trial modals
- Analytics event implementation approach
- Exact admin UI component breakdown
- Trial trigger detection implementation details
- How trial state integrates with existing billing-service.ts
- Frontend store architecture for trial state
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Billing & Constraints Core
- `packages/mcp/prisma/schema.prisma` — Prisma data model (Subscription, UsageCounter, User models)
- `packages/server/src/services/plan-config.ts` — Plan catalog and limit definitions (source of truth for plan tiers)
- `packages/server/src/services/constraint-service.ts` — ConstraintService: checkLimit(), getRemaining(), getUsage()
- `packages/server/src/services/billing-service.ts` — Billing logic, plan management, subscription handling
- `packages/server/src/middleware/constraint-middleware.ts` — HTTP enforcement middleware for tariff limits

### Admin
- `packages/server/src/routes/admin-routes.ts` — Current admin API routes
- `packages/web/src/components/AdminPage.tsx` — Current admin UI component

### Frontend Constraints
- `packages/web/src/lib/constraintUi.ts` — Frontend constraint contract (modal API, denial handling)
- `packages/web/src/lib/billing.ts` — Frontend billing utilities
- `packages/web/src/components/LimitReachedModal.tsx` — Upsell/limit modal component
- `packages/web/src/stores/useAuthStore.ts` — Auth store with billing state

### MCP Enforcement
- `packages/mcp/src/services/enforcement.service.ts` — MCP tool enforcement for expired plans

### Reference
- `.planning/paywall-trial-transition-prd.md` — Full PRD with all requirements, UX specs, and rollout plan
</canonical_refs>

<specifics>
## Specific Ideas

### Trial Offer Copy (from PRD)
- "Попробуйте 14 дней тарифа Старт"
- "Сделайте ещё объекты, экспортируйте график и работайте без ручных пересчётов"
- CTA: "Включить 14 дней бесплатно"
- Secondary CTA: "Пока не нужно"

### Expiry Screen Copy (from PRD)
- "Пробный доступ закончился"
- "Ваши графики сохранены"
- "Один проект остаётся доступен на бесплатном тарифе"
- "Чтобы продолжить работу со всеми объектами и экспортом, перейдите на Старт"

### Admin Actions (from PRD)
- Start 14-day trial, Extend 3 days, Extend 7 days, End trial now, Rollback to free, Convert to Start monthly

### Admin Timeline Display
- free since, trial started, trial ends, rolled back at, paid since

### Trial Scope (Start plan during trial)
- 3 active projects (vs 1 on free)
- 25 AI queries/day (vs 20 lifetime on free)
- archive access
- resource pool access
- PDF export
- guest links
</specifics>

<deferred>
## Deferred Ideas

- Auto-renewing card subscriptions (PRD non-goal)
- Full pricing redesign (PRD non-goal)
- Team plan trial (excluded from trial scope)
- Grace window before premium feature gates become hard stops (Open Question #3)
- Second trial via admin (Open Question #4) — admin CAN override per PRD 8.1
- Trial availability on billing page proactively (Open Question #5) — contextual only for v1
</deferred>

---

*Phase: 38-paywall-trial-transition*
*Context gathered: 2026-04-05 via PRD Express Path*
