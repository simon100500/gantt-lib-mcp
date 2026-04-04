# PRD: Transition to Triggered 14-Day Trial with Auto-Rollback to Free

Date: 2026-04-04
Status: Draft
Owner: Product / Growth

## 1. Summary

GetGantt should move from a pure `freemium + hard limits + direct upgrade` model to a hybrid model:

- `Free` remains the default entry point.
- Users are offered a `14-day Start trial` after they experience clear product value.
- At trial end, users automatically roll back to `free` instead of remaining in an expired paid state.
- Rollback must preserve data and access trust while re-applying free-plan limits.

This change is intended to improve free-to-paid conversion quality, reduce perceived punishment at trial end, and make billing operations easier for the team to manage from the admin panel.

## 2. Problem

Current monetization behavior has four weaknesses:

1. Upgrade prompts are mostly reactive to hard-stop events such as AI or project limits.
2. There is no explicit trial state in the product model, so users go directly from free to payment.
3. Paid plan expiry currently creates an `inactive paid plan` state rather than a clean downgrade path.
4. Admin tooling is manual and low-context: operators can edit `plan`, `periodEnd`, and usage, but cannot clearly manage trial lifecycle scenarios.

This creates friction in three places:

- Users are asked to pay before they have fully experienced premium value.
- Expiry feels like service denial instead of a controlled downgrade.
- Internal operations have no fast path for granting, extending, expiring, or diagnosing trials.

## 3. Goals

### Product goals

- Increase conversion from engaged free users into paid `Start`.
- Let users experience premium value before asking for payment.
- Make trial expiry understandable and non-destructive.

### Operational goals

- Give support/admin a first-class trial management interface.
- Reduce manual data edits and subscription-state confusion.
- Make trial status visible and auditable.

### Learning goals

- Learn whether trial improves:
  - activation-to-paid conversion
  - upgrade intent after feature exposure
  - retention after first payment

## 4. Non-Goals

- No immediate move to auto-renewing card subscriptions.
- No full pricing redesign.
- No removal of the free plan.
- No enterprise sales workflow redesign.
- No broad packaging change beyond trial access to `Start`.

## 5. Current State

Today the system behaves as follows:

- Default plan is `free`.
- Free users have strict limits on projects and AI queries.
- Upgrade flow sends users to purchase and immediate payment.
- Only `start` and `team` are purchasable through checkout.
- Expired paid users are treated as inactive rather than gracefully downgraded.

Operationally, admin can currently:

- switch plan manually
- set period end
- expire access immediately
- extend by days
- override current AI usage bucket

Operationally, admin cannot currently:

- see whether a user is in trial
- start or extend a trial explicitly
- schedule or force rollback to free
- see when a trial was started, by whom, or why
- filter users by trial status
- perform common actions in one click

## 6. Proposed Strategy

### 6.1 Core model

Adopt `Free -> Triggered 14-day Start trial -> Paid Start/Team -> Auto-rollback to Free`.

The trial should not replace free. It should be a timed premium experience unlocked after the user demonstrates intent or receives value.

### 6.2 Why triggered trial instead of universal trial

Triggered trial is preferred because:

- the product is still early and should not maximize unqualified premium usage
- the current payment stack is one-time purchase, not subscription-first with automatic billing
- the best time to offer trial is after the user understands the benefit of premium features
- this preserves free-plan discovery while increasing the relevance of the trial offer

### 6.3 Trial offer timing

Trial should appear only after at least one value event. Initial recommended triggers:

1. User created their first meaningful graph successfully.
2. User completed several AI edits or refinements.
3. User attempts a premium feature:
   - export
   - archive
   - resource pool
   - second project creation
4. User returns to the product on a second active day after first graph creation.

Recommended rule for v1:

- Show trial offer after first graph is created and the user either:
  - attempts a premium feature, or
  - completes at least 3 AI interactions in the same project

### 6.4 Trial scope

The trial unlocks the `Start` plan only.

Included during trial:

- 3 active projects
- 25 AI queries per day
- archive
- resource pool
- PDF export
- guest links

Excluded from trial:

- `Team`
- enterprise features
- custom support promises

### 6.5 Trial end behavior

At trial expiry:

- user is automatically downgraded to `free`
- data is preserved
- free limits are re-applied
- user sees a clear expiry screen and in-app reminders before expiry

The system must not leave the user in a vague `paid but inactive` state for trial users.

### 6.6 Free rollback rules

Rollback must be safe and predictable:

- 1 active project remains editable under free
- extra active projects remain preserved but become read-only until archived or upgraded
- premium-only actions become locked again
- historical trial usage remains visible internally for analytics and support

Recommended heuristic for active-project downgrade:

- keep the most recently active project editable
- mark the rest as over-free-limit but preserved

## 7. User Experience Requirements

## 7.1 Trial invitation

The offer should be framed around value, not pressure.

Principles:

- user has already seen value
- user understands what trial unlocks
- decline path is clear
- copy speaks in construction/planning language, not SaaS jargon

Example framing:

- "Попробуйте 14 дней тарифа Старт"
- "Сделайте ещё объекты, экспортируйте график и работайте без ручных пересчётов"
- CTA: "Включить 14 дней бесплатно"
- Secondary CTA: "Пока не нужно"

## 7.2 Trial reminders

Show non-blocking reminders:

- day 7 remaining
- day 3 remaining
- day 1 remaining

Reminder content should include:

- days remaining
- features actually used during trial
- clear explanation of what happens on rollback

## 7.3 Trial expiry screen

At expiry:

- explain that trial ended
- explain that data is safe
- explain what remains on free
- explain what becomes limited
- give direct upgrade CTA

Required messaging:

- "Пробный доступ закончился"
- "Ваши графики сохранены"
- "Один проект остаётся доступен на бесплатном тарифе"
- "Чтобы продолжить работу со всеми объектами и экспортом, перейдите на Старт"

## 7.4 Feature-gate behavior during and after trial

- During trial, premium feature gates should disappear for `Start` features.
- After rollback, premium actions should reopen the feature-gate modal with copy tailored to post-trial users.
- Post-trial copy should reference experienced value:
  - export used
  - more than one project created
  - archive used

## 8. Admin Requirements

Current admin management is not sufficient for a trial model. Trial must become a first-class operational object.

### 8.1 Admin use cases

Admin must be able to:

1. Start a trial for a user manually.
2. Extend a trial by preset durations.
3. End a trial immediately.
4. Force rollback to free immediately.
5. Convert a trial user to paid manually when needed.
6. See who started or changed the trial and when.
7. Filter users by billing state:
   - free
   - in trial
   - paid active
   - paid expired
   - rolled back from trial
8. See trial usage summary:
   - trial started at
   - trial ends at
   - days remaining
   - features used during trial
   - number of active projects over free allowance

### 8.2 Admin UI requirements

The billing tab in admin should add:

- a dedicated `Trial` status card
- one-click actions:
  - `Start 14-day trial`
  - `Extend 3 days`
  - `Extend 7 days`
  - `End trial now`
  - `Rollback to free`
  - `Convert to Start monthly`
- a billing-state badge separate from plan label
- explicit timeline:
  - free since
  - trial started
  - trial ends
  - rolled back at
  - paid since
- visible warnings when rollback will leave more than 1 active project

### 8.3 Admin API requirements

Admin API should support explicit trial actions rather than overloaded plan mutations.

Recommended admin operations:

- `startTrial(userId, trialPlan = start, durationDays = 14)`
- `extendTrial(userId, days)`
- `endTrialNow(userId)`
- `rollbackTrialToFree(userId)`
- `convertTrialToPaid(userId, paidPlan, period)`

Each operation should record:

- actor
- timestamp
- previous state
- new state
- optional reason

### 8.4 Admin usability improvements

The current panel is functional but cumbersome because it relies on low-level edits. The new admin flow should reduce operator thinking and prevent invalid state combinations.

Required improvements:

- replace manual date-first workflow with common action buttons
- show trial and paid states separately from plan
- show what rollback will do before the operator confirms
- show recent billing events in a compact timeline
- add search/filter chips for billing lifecycle states
- keep manual override tools, but move them under an advanced section

## 9. Data Model Requirements

The billing model must distinguish plan entitlement from lifecycle state.

Minimum new concepts:

- `billingState`
  - `free`
  - `trial_active`
  - `trial_expired`
  - `paid_active`
  - `paid_expired`
- `trialPlan`
- `trialStartedAt`
- `trialEndsAt`
- `trialEndedAt`
- `trialSource`
  - `self_serve`
  - `admin`
  - `promo`
- `trialConvertedAt`
- `rolledBackAt`

Recommended addition:

- `billingEvents` audit log for state transitions

This state should not be inferred only from `plan + periodEnd`, because trial and paid expiry need different product behavior.

## 10. Functional Requirements

### FR-1 Trial eligibility

The system must determine whether the user is eligible for a self-serve trial.

Rules for v1:

- one self-serve trial per workspace/user
- trial available only from `free`
- not available if user already had a completed trial
- admin can still override manually

### FR-2 Trial activation

Eligible users must be able to activate a 14-day `Start` trial without payment.

### FR-3 Trial entitlement

During trial, the system must enforce `Start` limits and unlock `Start` features.

### FR-4 Reminder delivery

The system must surface in-app reminder states at 7, 3, and 1 day before trial end.

### FR-5 Trial expiry

When trial ends, the system must automatically move the user to `free` state.

### FR-6 Safe rollback

Rollback must preserve all user data and mark over-limit entities in a non-destructive way.

### FR-7 Post-trial upsell

After rollback, premium prompts must reference the value already experienced during trial.

### FR-8 Admin control

Admin must be able to inspect, modify, and audit trial lifecycle without raw database edits.

## 11. Analytics Requirements

Track the following events:

- `trial_offer_impression`
- `trial_offer_accept`
- `trial_offer_decline`
- `trial_started`
- `trial_reminder_seen`
- `trial_expired`
- `trial_rolled_back`
- `trial_upgrade_clicked`
- `trial_converted_to_paid`
- `post_trial_feature_gate_seen`

Track the following properties:

- trigger type
- current project count
- AI usage at start
- feature that caused the offer
- days since signup
- first graph created or not
- user segment if available

## 12. Success Metrics

Primary:

- trial start rate from eligible users
- trial-to-paid conversion rate
- paid conversion within 14 days after rollback

Secondary:

- feature usage during trial
- post-trial reactivation to payment
- support/admin time spent managing exceptions
- drop-off after trial expiry

Guardrails:

- free-plan abuse rate
- cost per activated trial
- support complaints about lost access
- users with preserved but over-limit active projects

## 13. Risks

### Risk 1: Trial cannibalizes payment intent

Mitigation:

- trigger only after value
- allow only one self-serve trial
- keep trial at `Start` only

### Risk 2: Users feel punished at rollback

Mitigation:

- preserve all data
- communicate clearly
- keep one active project editable
- use read-only preservation for excess projects

### Risk 3: Billing state becomes too complex

Mitigation:

- separate lifecycle state from plan
- add explicit admin actions
- add billing event history

### Risk 4: Team cannot operate the flow reliably

Mitigation:

- add trial-first admin tooling
- provide state timeline
- add audit trail

## 14. Rollout Plan

### Phase 1

- add trial state model
- add admin trial controls
- allow manual/admin-started trial only
- implement rollback behavior

### Phase 2

- add self-serve trial offer triggers
- add reminder UX
- add post-trial expiry screens

### Phase 3

- add analytics review
- refine trigger conditions and copy
- test alternate trial timing and post-trial offers

## 15. Open Questions

1. Should a user be allowed to purchase `Start` before trial, or should the UI always offer trial first when eligible?
2. Should rollback preserve the most recently active project or the earliest created project?
3. Should post-trial users get a grace window before premium feature gates become hard stops again?
4. Should admins be allowed to grant a second trial explicitly?
5. Should we show trial availability on the billing page proactively, or only contextually after value events?

## 16. Recommendation

Proceed with `triggered 14-day Start trial + auto-rollback to free`, not `trial-only` and not `universal trial`.

Priority order:

1. Introduce explicit billing lifecycle states.
2. Implement safe rollback behavior.
3. Upgrade admin to support trial operations directly.
4. Launch self-serve trial triggers only after admin and rollback logic are reliable.

