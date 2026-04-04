---
phase: 34-feature-gates
plan: 01
subsystem: api
tags: [fastify, middleware, billing, constraints, feature-gate, archive, typescript]

# Dependency graph
requires:
  - phase: 30-constraint-engine
    provides: ConstraintService limit checks and boolean feature_disabled semantics for non-tracked limits
  - phase: 32-backend-enforcement
    provides: Reusable HTTP constraint guards with structured denial payloads and route contract test patterns
provides:
  - requireFeatureGate middleware helper for boolean/access-level feature gates
  - Archive route server-side enforcement with ARCHIVE_FEATURE_LOCKED denial
  - Route contract tests proving archive guard composition and delete exclusion
affects: [34-02, 34-03, 34-04, frontend, billing]

# Tech tracking
tech-stack:
  added: []
  patterns: [feature-gate middleware for non-tracked boolean limits, route contract test for preHandler composition]

key-files:
  created: []
  modified:
    - packages/server/src/middleware/constraint-middleware.ts
    - packages/server/src/middleware/constraint-middleware.test.ts
    - packages/server/src/routes/auth-routes.ts
    - packages/server/src/routes/auth-routes.test.ts

key-decisions:
  - "requireFeatureGate omits tracked usage fields (used/limit) from denial payload since non-tracked limits have no counters."
  - "Archive route preHandler composes authMiddleware then requireArchiveAccess, matching the established pattern from Phase 32."

patterns-established:
  - "Boolean feature gates use requireFeatureGate(limitKey, options) which sends feature_disabled reasonCode without tracked usage fields."
  - "Feature gate route guards follow the same preHandler composition pattern as tracked limit guards."

requirements-completed: [GATE-01]

# Metrics
duration: 4min
completed: 2026-04-04
---

# Phase 34 Plan 01: Archive Feature Gate Summary

**Server-side archive tariff enforcement via requireFeatureGate middleware denying free-plan users with structured ARCHIVE_FEATURE_LOCKED payload**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-04T11:01:11Z
- **Completed:** 2026-04-04T11:05:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Added `requireFeatureGate(limitKey, options)` middleware helper for boolean/access-level feature gates
- Protected `POST /api/projects/:id/archive` with `requireArchiveAccess` so free-plan users receive a structured 403 denial
- Route contract tests prove the archive guard composes `authMiddleware` then `requireArchiveAccess` before `archiveProject`
- Delete route confirmed unguarded by archive or project limit middleware

## Task Commits

Each task was committed atomically:

1. **Task 1: Add reusable server feature-gate middleware for boolean limits** - `9e53118` (feat)
2. **Task 2: Guard the archive route with the new archive feature gate** - `5552fa6` (feat)

## Files Created/Modified
- `packages/server/src/middleware/constraint-middleware.ts` - Added `requireFeatureGate` factory function and exported it alongside existing guards
- `packages/server/src/middleware/constraint-middleware.test.ts` - Added archive denial and pass-through test cases for feature-gate semantics
- `packages/server/src/routes/auth-routes.ts` - Wired `requireArchiveAccess` preHandler on archive route, imported `requireFeatureGate`
- `packages/server/src/routes/auth-routes.test.ts` - Added archive route contract tests for guard composition and delete exclusion

## Decisions Made
- `requireFeatureGate` omits `used` and `limit` fields from the denial payload since boolean/non-tracked limits have no counters -- this keeps the payload contract clean and avoids leaking `null` counters that tracked-limit consumers might misinterpret.
- Archive route preHandler follows the exact same `[authMiddleware, constraintGuard]` pattern established in Phase 32 for project create/restore.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing TypeScript build errors in `project.service.ts` and `task.service.ts` (implicit `any` types) -- out of scope, not related to this plan's changes.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Archive feature gate is server-enforced and tested, closing the GATE-01 backend gap.
- Phase 34 Plans 02-04 can reuse `requireFeatureGate` for resource pool and export feature gates.
- Frontend shell UX intercepts can now be added to show upgrade modal before the 403 reaches the UI.

---
*Phase: 34-feature-gates*
*Completed: 2026-04-04*

## Self-Check: PASSED

- Found `packages/server/src/middleware/constraint-middleware.ts`
- Found `packages/server/src/middleware/constraint-middleware.test.ts`
- Found `packages/server/src/routes/auth-routes.ts`
- Found `packages/server/src/routes/auth-routes.test.ts`
- Found `.planning/phases/34-feature-gates/34-01-SUMMARY.md`
- Found task commits `9e53118` and `5552fa6`
