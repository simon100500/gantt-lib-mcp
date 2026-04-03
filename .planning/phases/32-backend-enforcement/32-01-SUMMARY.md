---
phase: 32-backend-enforcement
plan: 01
subsystem: api
tags: [fastify, middleware, billing, constraints, enforcement, typescript]
requires:
  - phase: 30-constraint-engine
    provides: ConstraintService limit checks and normalized remaining metadata
  - phase: 31-usage-tracking
    provides: authoritative usage snapshots for AI queries and active project counts
provides:
  - reusable HTTP constraint guards with structured denial payloads
  - project create and restore route enforcement for the projects limit
  - chat and command mutation preHandlers that deny expired subscriptions before writes
affects: [32-02-mcp-enforcement, 33-frontend-constraints-ux, billing, api]
tech-stack:
  added: []
  patterns: [shared Fastify preHandler guards, structured 403 payload contracts, source-level route contract tests]
key-files:
  created:
    - packages/server/src/middleware/constraint-middleware.ts
    - packages/server/src/middleware/constraint-middleware.test.ts
    - packages/server/src/routes/auth-routes.test.ts
    - packages/server/src/routes/command-routes.test.ts
  modified:
    - packages/server/src/middleware/subscription-middleware.ts
    - packages/server/src/routes/auth-routes.ts
    - packages/server/src/routes/command-routes.ts
    - packages/server/src/index.ts
key-decisions:
  - "Centralized HTTP denials in constraint-middleware so every guarded mutation returns the same limit metadata contract."
  - "Used explicit route contract tests for guarded preHandler composition because the server package does not expose an injected Fastify integration harness."
patterns-established:
  - "HTTP mutation routes should compose authMiddleware with reusable constraint guards in the preHandler chain."
  - "Structured tariff denials expose code, limitKey, reasonCode, remaining, plan, planLabel, and upgradeHint, with used/limit only for tracked usage."
requirements-completed: [ENF-01, ENF-03]
duration: 11 min
completed: 2026-04-03
---

# Phase 32 Plan 01: HTTP enforcement helpers and guarded mutation routes Summary

**Reusable Fastify constraint guards now block over-limit project/chat mutations and expired-plan writes with normalized limit metadata across HTTP routes**

## Performance

- **Duration:** 11 min
- **Started:** 2026-04-03T07:48:20Z
- **Completed:** 2026-04-03T07:59:18Z
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments
- Added a reusable `constraint-middleware.ts` helper layer for active-subscription and tracked-limit checks.
- Protected `POST /api/projects` and `POST /api/projects/:id/restore` with the `projects` limit while leaving archive/delete flows available.
- Rewired `/api/chat` and `/api/commands/commit` to deny expired subscriptions or exhausted AI usage before mutation logic runs.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add reusable HTTP enforcement helpers and a structured denial payload** - `873a04f` (feat)
2. **Task 2: Guard project creation and restore without blocking archive or delete flows** - `25232dc` (feat)
3. **Task 3: Enforce read-only and AI-query limits on chat and command commit routes** - `081bea4` (feat)

## Files Created/Modified
- `packages/server/src/middleware/constraint-middleware.ts` - Shared guard factory and normalized 403 payload builder.
- `packages/server/src/middleware/subscription-middleware.ts` - Thin chat-specific composition over the shared guard helpers.
- `packages/server/src/routes/auth-routes.ts` - Project create and restore preHandlers now enforce the `projects` limit.
- `packages/server/src/routes/command-routes.ts` - Command commit route now enforces expired-subscription read-only semantics.
- `packages/server/src/index.ts` - Chat route now composes explicit subscription and `ai_queries` guards before usage increment.
- `packages/server/src/middleware/constraint-middleware.test.ts` - Compiled Node tests for denial payload shape and chat guard ordering.
- `packages/server/src/routes/auth-routes.test.ts` - Route contract test for project create/restore guard coverage and archive/delete exclusions.
- `packages/server/src/routes/command-routes.test.ts` - Route contract test for chat and command guard composition.

## Decisions Made
- Centralized HTTP denial payload assembly in `constraint-middleware.ts` instead of letting each route or middleware build bespoke JSON.
- Kept `/api/chat` on an explicit route-level preHandler chain rather than a single opaque middleware so the guard order and post-check usage increment remain obvious.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Compiled Node tests could not read source-adjacent `.ts` files by relative path from `dist`; the route contract tests were updated to resolve source files from `process.cwd()` so the verification flow works after `tsc`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- HTTP mutation enforcement is in place and exposes a stable denial payload contract for frontend UX work in Phase 33.
- Phase 32 plan 02 can reuse the same structured payload semantics for MCP mutation guards and read-only pass-through decisions.

## Self-Check: PASSED

- Found `.planning/phases/32-backend-enforcement/32-01-SUMMARY.md`
- Found task commits `873a04f`, `25232dc`, and `081bea4`
