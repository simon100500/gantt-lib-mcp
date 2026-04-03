---
phase: 33-frontend-constraints-ux
plan: 01
subsystem: ui
tags: [react, billing, limits, modal]
requires:
  - phase: 31-usage-tracking
    provides: normalized usage payload with usage and remaining counters
  - phase: 32-backend-enforcement
    provides: structured denial payloads for project and AI limit enforcement
provides:
  - shared frontend constraint helpers for usage snapshots and denial payloads
  - structured limit modal rendering with plan and upgrade context
  - typed usage selectors for projects and ai_queries
affects: [frontend-constraints-ux, feature-gates, billing]
tech-stack:
  added: []
  patterns: [shared constraint-ui normalization, structured modal props]
key-files:
  created: [packages/web/src/lib/constraintUi.ts]
  modified: [packages/web/src/components/LimitReachedModal.tsx, packages/web/src/stores/useBillingStore.ts]
key-decisions:
  - "Kept legacy scenario props as a compatibility shim while making structured denial payloads the primary modal contract."
  - "Centralized projects and ai_queries usage helpers in the billing store so downstream UI guards can stay grep-obvious and type-safe."
patterns-established:
  - "Constraint UI normalization: backend denial payloads and usage snapshots are converted once in constraintUi.ts before any component renders copy."
  - "Structured upsell modal: limit dialogs render plan label, usage context, upgrade hint, and next-offer pricing from shared helpers."
requirements-completed: [FUX-02]
duration: 20min
completed: 2026-04-04
---

# Phase 33: Frontend Constraints UX Summary

**Shared constraint helpers now drive a structured limit modal with real plan, usage, and upgrade pricing context instead of scenario-only copy.**

## Performance

- **Duration:** 20 min
- **Started:** 2026-04-04T00:21:00+03:00
- **Completed:** 2026-04-04T00:41:40+03:00
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Added `constraintUi.ts` to normalize usage snapshots and structured denial payloads for `projects` and `ai_queries`.
- Exposed typed usage and remaining selectors in `useBillingStore` for downstream proactive guards.
- Upgraded `LimitReachedModal` to render `limitKey`, `planLabel`, `upgradeHint`, usage context, and a concrete upgrade price.

## Task Commits

Each task was committed atomically:

1. **Task 1: Define a reusable frontend constraint UX contract** - `1c06785` (feat)
2. **Task 2: Upgrade LimitReachedModal to render structured limit context** - `38e8614` (feat)

## Files Created/Modified

- `packages/web/src/lib/constraintUi.ts` - Shared normalization helpers for denial payloads, usage snapshots, and upgrade offers.
- `packages/web/src/stores/useBillingStore.ts` - Typed selectors for `projects` and `ai_queries` usage and remaining entries.
- `packages/web/src/components/LimitReachedModal.tsx` - Structured modal API with compatibility fallback for legacy scenarios.

## Decisions Made

- Preserved legacy `scenario` support so existing call sites do not break before Phase 33-02 rewires them to structured modal state.
- Used existing billing constants for upgrade pricing and labels to avoid duplicating tariff data in UI copy.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The original executor stalled after the first task commit, so the remaining modal change and summary were completed locally against the same plan scope.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 33-02 can now wire project and AI usage indicators plus proactive disabled states directly from the shared constraint contract.
- Legacy modal scenario support remains available until all call sites migrate to structured denial payloads.

---
*Phase: 33-frontend-constraints-ux*
*Completed: 2026-04-04*
