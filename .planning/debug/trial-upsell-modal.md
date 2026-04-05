---
status: awaiting_human_verify
trigger: "trial-upsell-modal: LimitReachedModal shows trial CTA for users already on trial"
created: 2026-04-05T00:00:00Z
updated: 2026-04-05T00:06:00Z
---

## Current Focus

hypothesis: CONFIRMED and FIXED - canStartTrial condition now checks billingState
test: Applied fix, TypeScript compiles cleanly
expecting: Button shows "Расширить тариф" for trial users instead of "Включить 14 дней бесплатно"
next_action: Wait for human verification

## Symptoms

expected: When a trial user hits project limit, the modal should show an upgrade button to go to a paid plan (e.g., "Перейти на Команду"), NOT offer another trial period.
actual: The modal shows "Включить 14 дней бесплатно" (Enable 14 days free) as the CTA button, even though the user is already on a trial.
errors: No errors, just wrong UX flow.
reproduction: Be on a trial plan (Старт with trial active), use up all 3 project slots, try to create another project. The LimitReachedModal appears with incorrect CTA.
started: Started after Phase 38 trial implementation was added.

## Eliminated

## Evidence

- timestamp: 2026-04-05T00:01
  checked: LimitReachedModal.tsx line 78
  found: "const canStartTrial = !subscription?.trialStartedAt && onActivateTrial;" - only checks trialStartedAt, not billingState
  implication: When subscription is null (race condition) or trialStartedAt is somehow null during trial_active, the trial CTA shows incorrectly

- timestamp: 2026-04-05T00:02
  checked: useBillingStore.ts - SubscriptionStatus type and isTrialActive selector
  found: billingState field exists ('free' | 'trial_active' | 'trial_expired' | 'paid_active' | 'paid_expired'), isTrialActive() selector exists at line 173
  implication: The isTrialActive() selector is available but NOT used in LimitReachedModal

- timestamp: 2026-04-05T00:03
  checked: App.tsx openLimitModal and LimitReachedModal invocation
  found: onActivateTrial is always passed when auth.isAuthenticated=true (line 1049). subscription may be null during first render
  implication: canStartTrial = !null?.trialStartedAt && truthy = true when subscription not loaded yet

- timestamp: 2026-04-05T00:04
  checked: Root cause - canStartTrial does not account for billingState at all
  found: The condition should check that user is NOT already on trial (billingState !== 'trial_active' and !== 'trial_expired') AND subscription is loaded before offering trial
  implication: Fix needs to add billingState check to canStartTrial condition

## Resolution

root_cause: canStartTrial condition (LimitReachedModal.tsx line 78) only checked subscription.trialStartedAt but not billingState. When subscription was null (race condition during first render) or when trialStartedAt was unexpectedly null, the modal incorrectly offered trial CTA "Включить 14 дней бесплатно" to users already on trial. The condition needed to also verify the user is NOT in trial_active or trial_expired billingState.
fix: Added billingState checks to canStartTrial: user must have subscription loaded, billingState must not be trial_active or trial_expired, and trialStartedAt must be null. Changed from single condition to explicit trialIneligible boolean for clarity.
verification: TypeScript compiles cleanly (no errors in modified file). Logic verified: trialIneligible is true when subscription is null OR billingState is trial_active/trial_expired OR trialStartedAt is set. This means canStartTrial will be false for trial users, showing "Расширить тариф" instead of trial CTA.
files_changed: [packages/web/src/components/LimitReachedModal.tsx]
