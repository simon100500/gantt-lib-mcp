---
phase: 33-frontend-constraints-ux
verified: 2026-04-04T01:08:00+03:00
status: passed
score: 8/8 must-haves verified
---

# Phase 33: Frontend Constraints UX Verification Report

**Phase Goal:** Пользователь видит свои лимиты в интерфейсе и получает понятную обратную связь при их достижении.
**Verified:** 2026-04-04T01:08:00+03:00
**Status:** passed
**Re-verification:** Yes - updated after follow-up commit `23ab25b`

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Frontend has one shared contract for structured tariff denials and normalized usage snapshots. | ✓ VERIFIED | `packages/web/src/lib/constraintUi.ts` defines `ConstraintDenialPayload`, `ConstraintModalContent`, usage snapshot helpers, and upgrade-offer derivation for `projects` and `ai_queries`. |
| 2 | `LimitReachedModal` renders contextual limit information instead of only the old scenario matrix. | ✓ VERIFIED | `packages/web/src/components/LimitReachedModal.tsx` consumes `denial`, `usage`, `limitKey`, `planLabel`, `upgradeHint`, and renders formatted upgrade pricing plus fallback legacy scenarios. |
| 3 | Project creation paths now preserve structured denial metadata instead of a bare boolean. | ✓ VERIFIED | `packages/web/src/stores/useAuthStore.ts` stores `projectLimitDenial: Partial<ConstraintDenialPayload> | null` and writes the real 403 payload returned by `/api/projects`. |
| 4 | App-level modal state is wired to structured denial payloads for project, AI, and expired-subscription denials. | ✓ VERIFIED | `packages/web/src/App.tsx` contains `PROJECT_LIMIT_REACHED`, `AI_LIMIT_REACHED`, and `SUBSCRIPTION_EXPIRED`, normalizes denials through `normalizeConstraintDenialPayload()`, and passes structured props into `LimitReachedModal`. |
| 5 | The shell refreshes usage data proactively so limit indicators and modal context stay current. | ✓ VERIFIED | `WorkspaceApp` triggers `fetchUsage()` on authenticated shell entry and before opening the limit modal after denials. |
| 6 | Project creation still exposes a proactive upgrade path without blocking the `+` entrypoint. | ✓ VERIFIED | The sidebar billing card shows project usage, while `App.tsx` keeps `handleCreateProject()` clickable and opens the structured modal from `proactiveProjectDenial` instead of disabling the `+` actions. |
| 7 | AI chat shows usage context and blocks submission proactively with a dedicated disabled reason. | ✓ VERIFIED | `ProjectWorkspace.tsx` passes `chatUsage`, `chatDisabled`, and `chatDisabledReason` into `ChatSidebar.tsx`, which renders AI usage and a disabled-reason banner distinct from the loading state. |
| 8 | The phase compiles successfully with the new constraint UX wiring. | ✓ VERIFIED | `cmd /c npx tsc -p packages/web/tsconfig.json` passed after both plans completed. |

**Score:** 8/8 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `packages/web/src/lib/constraintUi.ts` | Shared frontend normalization for denial payloads and usage snapshots | ✓ VERIFIED | Exists, references billing constants, and handles `projects` / `ai_queries`. |
| `packages/web/src/components/LimitReachedModal.tsx` | Structured modal using real denial metadata and upgrade pricing | ✓ VERIFIED | Renders `limitKey`, `planLabel`, `upgradeHint`, and `/purchase` CTA with formatted pricing. |
| `packages/web/src/stores/useBillingStore.ts` | Typed downstream access to usage and remaining entries | ✓ VERIFIED | Exposes helpers such as `getProjectsUsage()`, `getProjectsRemaining()`, `getAiQueriesUsage()`, and `getAiQueriesRemaining()`. |
| `packages/web/src/stores/useAuthStore.ts` | Structured project-limit denial storage | ✓ VERIFIED | `projectLimitDenial` replaces the previous boolean-only state. |
| `packages/web/src/App.tsx` | Unified modal state plus proactive denial interception and usage refresh | ✓ VERIFIED | Opens modal from normalized denial payloads and refreshes usage on shell entry and denial. |
| `packages/web/src/components/layout/ProjectMenu.tsx` | Sidebar billing card keeps the project-limit indicator visible while create actions remain clickable | ✓ VERIFIED | Footer card still shows projects usage from subscription state; header `+` action now routes through `onCreateProject()` without a disabled hard-stop. |
| `packages/web/src/components/ProjectSwitcher.tsx` | Create-project entrypoint remains available inside project navigation | ✓ VERIFIED | `onCreateNew` is still wired to the create action, and no disabled project-limit gate blocks the button before the modal can open. |
| `packages/web/src/components/workspace/ProjectWorkspace.tsx` | Chat usage / disabled-state wiring into sidebar | ✓ VERIFIED | Passes `chatUsage`, `chatDisabled`, and `chatDisabledReason` into `ChatSidebar`. |
| `packages/web/src/components/ChatSidebar.tsx` | AI usage indicator plus disabled-reason copy | ✓ VERIFIED | Renders `usage?.usage.ai_queries`, `usage?.remaining.ai_queries`, and dedicated disabled-reason UI. |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `packages/web/src/components/LimitReachedModal.tsx` | `packages/web/src/lib/constraintUi.ts` | Modal props and copy derive from shared limit helpers | ✓ VERIFIED | `gsd-tools verify key-links` passed for Plan 33-01. |
| `packages/web/src/lib/constraintUi.ts` | `packages/web/src/lib/billing.ts` | Upgrade CTA pricing and plan labels use existing billing constants | ✓ VERIFIED | `gsd-tools verify key-links` passed for Plan 33-01. |
| `packages/web/src/lib/constraintUi.ts` | `packages/web/src/stores/useBillingStore.ts` | Usage helpers accept normalized `/api/usage` store shape | ✓ VERIFIED | `gsd-tools verify key-links` passed for Plan 33-01. |
| `packages/web/src/App.tsx` | `packages/web/src/components/LimitReachedModal.tsx` | Structured denial payload and usage context flow into modal state | ✓ VERIFIED | `gsd-tools verify key-links` passed for Plan 33-02. |
| `packages/web/src/components/layout/ProjectMenu.tsx` | `packages/web/src/stores/useBillingStore.ts` | Project usage data drives the sidebar billing indicator | ✓ VERIFIED | The billing footer still renders `subscription.usage.projects` and `subscription.remaining.projects` from the billing store. |
| `packages/web/src/components/ChatSidebar.tsx` | `packages/web/src/stores/useBillingStore.ts` | AI usage and remaining data drive the chat indicator and disabled state | ✓ VERIFIED | Tooling reported a false negative because the code uses optional chaining (`usage?.usage.ai_queries` / `usage?.remaining.ai_queries`) rather than the exact raw pattern. Direct grep confirmed the wiring is present. |

### Behavioral Spot-Checks

| Behavior | Command / Check | Result | Status |
| --- | --- | --- | --- |
| Web package compiles with the new modal and proactive guards | `cmd /c npx tsc -p packages/web/tsconfig.json` | Passed | ✓ PASS |
| Denial codes remain explicit in the app shell | `rg "PROJECT_LIMIT_REACHED|AI_LIMIT_REACHED|SUBSCRIPTION_EXPIRED" packages/web/src/App.tsx` | All three codes found | ✓ PASS |
| Project usage indicator remains visible in the shell without blocking `+` | `rg "usage\\.projects|remaining\\.projects|onCreateProject" packages/web/src/components/layout/ProjectMenu.tsx packages/web/src/App.tsx` | Sidebar usage references and modal entrypoint wiring found | ✓ PASS |
| AI usage indicator and disabled-reason path exist in chat UI | `rg "usage\\.ai_queries|remaining\\.ai_queries|disabledReason" packages/web/src/components/ChatSidebar.tsx packages/web/src/components/workspace/ProjectWorkspace.tsx` | AI usage and disabled-reason references found | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| FUX-01 | 33-02 | Usage indicators show remaining/used near project and AI actions | ✓ SATISFIED | The sidebar billing card exposes project usage, and `ChatSidebar` shows AI usage context near the send action. |
| FUX-02 | 33-01 | Limit modal shows contextual limit, current plan, and upgrade price | ✓ SATISFIED | `LimitReachedModal` renders `limitKey`, `planLabel`, `upgradeHint`, usage details, and formatted upgrade pricing from billing constants. |
| FUX-03 | 33-02 | Proactive guards explain why project/AI actions are blocked | ✓ SATISFIED | AI chat uses `chatDisabledReason` and disabled submit state; project creation stays clickable by design and immediately opens the structured upsell modal when over limit so users can still reach the upgrade path. |

All Phase 33 requirement IDs from plan frontmatter (`FUX-01`, `FUX-02`, `FUX-03`) are present in `.planning/REQUIREMENTS.md` and are accounted for by the completed plans plus code evidence above. The final accepted project-create behavior uses a clickable modal entrypoint instead of a disabled `+` control.

### Human Verification Required

None. Code inspection, key-link checks, grep spot-checks, summaries, and a clean TypeScript build were sufficient to verify the phase goal.

### Gaps Summary

No blocking gaps found. The only verification anomaly was a pattern-matching false negative for the chat usage key-link; direct code inspection confirmed the data path is present.

## Product Notes

- Follow-up commit `23ab25b` intentionally removed the project-limit disabled state from the `+` create entrypoints after product feedback.
- The project limit indicator now lives in the existing sidebar billing card; over-limit project creation still reaches the structured upgrade modal through the normal create click path.

---

_Verified: 2026-04-04T01:08:00+03:00_
_Verifier: Codex inline verification_
