---
phase: 31-usage-tracking
plan: 01
subsystem: billing
tags: [usage-tracking, constraints, billing, server]
requires:
  - phase: 30
    provides: Canonical constraint service and plan catalog semantics
provides:
  - Canonical server-side AI usage semantics for free lifetime and paid daily buckets
  - Active-project counting sourced from live project state
  - Billing compatibility fields derived from canonical usage snapshots
affects: [31-02, server]
tech-stack:
  added: []
  patterns: [constraint-service source of truth, compatibility-only billing fields, regression-first coverage]
key-files:
  created: []
  modified:
    - packages/server/src/services/constraint-service.test.ts
    - packages/server/src/billing-service.test.ts
    - packages/server/src/services/billing-service.ts
key-decisions:
  - "Kept `Subscription.aiUsed` as a legacy compatibility field and stopped treating it as the authoritative read source."
  - "Centralized canonical usage/remaining snapshot assembly in `BillingService.getUsageStatus()` so future routes can reuse the same semantics."
patterns-established:
  - "Free AI usage reads from the `lifetime` bucket; paid AI usage reads from `day:YYYY-MM-DD` buckets."
  - "Project limits are enforced from `prisma.project.count({ status: 'active' })`, not cached counters."
requirements-completed: [TRK-01, TRK-02]
duration: 45min
completed: 2026-04-03
---

# Phase 31 Plan 01 Summary

**Authoritative server tracking semantics for AI queries and active project counts**

## Performance

- **Duration:** 45 min
- **Completed:** 2026-04-03
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Added regression coverage for free lifetime AI usage, paid daily AI usage, active-project counting, and billing compatibility field derivation.
- Refactored `BillingService` so subscription payload compatibility fields now derive from canonical `ConstraintService` snapshots instead of `Subscription.aiUsed`.
- Introduced a reusable `getUsageStatus()` helper that assembles canonical `limits`, `usage`, and `remaining` snapshots for later API consumers.

## Task Commits

1. **Task 1: Extend tracking regression coverage around canonical AI and project usage** - `f800233`
2. **Task 2: Make billing compatibility explicitly derive from canonical tracking semantics** - `4fddbc0`

## Files Created/Modified

- `packages/server/src/services/constraint-service.test.ts` - Added active-project count assertions and bucket-specific AI usage coverage.
- `packages/server/src/billing-service.test.ts` - Added regression proving `aiUsed` and `aiLimit` come from canonical usage snapshots.
- `packages/server/src/services/billing-service.ts` - Added dependency injection and shared canonical usage snapshot assembly.

## Decisions Made

- Reused the canonical constraint engine for billing compatibility fields instead of expanding legacy subscription counters.
- Built the shared usage assembler in the service layer so the dedicated usage route in plan 31-02 can reuse it directly.

## Deviations from Plan

None.

## Issues Encountered

- Sandbox restrictions blocked direct `git add`, `git commit`, and local `dist/` writes, so builds/tests and commits were executed with escalation.

## User Setup Required

None.

## Next Phase Readiness

- The server now has a normalized usage assembly primitive ready for `/api/usage`.
- Frontend consumers can move to dedicated usage reads without re-deriving per-limit semantics in route handlers.

