---
phase: 32-backend-enforcement
plan: 02
subsystem: api
tags: [mcp, prisma, enforcement, billing, testing]
requires:
  - phase: 32-backend-enforcement
    provides: HTTP-side structured tariff denial vocabulary and expired-plan semantics
  - phase: 31-usage-tracking
    provides: Canonical subscription and plan usage state consumed by enforcement
provides:
  - Prisma-backed MCP mutation enforcement service keyed by project ownership
  - Normalized MCP rejection payloads with structured `limit_reached` metadata
  - Early mutation-tool dispatch guards that leave read-only MCP tools available
affects: [mcp, backend-enforcement, billing]
tech-stack:
  added: []
  patterns: [pre-dispatch mutation guard, normalized limit denial payload, project-owner enforcement lookup]
key-files:
  created:
    - packages/mcp/src/services/enforcement.service.ts
    - packages/mcp/src/services/enforcement.service.test.ts
  modified:
    - packages/mcp/src/types.ts
    - packages/mcp/src/services/index.ts
    - packages/mcp/src/index.ts
    - packages/mcp/src/index.test.ts
key-decisions:
  - "Resolved MCP mutation enforcement from `projectId` to owning `userId` through Prisma so the guard matches server-side ownership semantics."
  - "Scoped the guard to the eight public task-mutation tools in this phase and left read-only tools, `add_message`, and diagnostic calls untouched."
patterns-established:
  - "MCP mutation denials use the same `code`, `limitKey`, `remaining`, `plan`, `planLabel`, and `upgradeHint` vocabulary as HTTP enforcement."
  - "Mutation tools are blocked before any authoritative command commit or task mutation helper runs."
requirements-completed: [ENF-02, ENF-03]
duration: 4min
completed: 2026-04-03
---

# Phase 32 Plan 02: MCP mutation guard keyed by project ownership with structured tariff denials

**MCP task mutations now enforce expired-plan write blocking before command dispatch while keeping read-only tools available for agent context gathering.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-03T11:05:58+03:00
- **Completed:** 2026-04-03T11:09:53+03:00
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Extended normalized MCP mutation results with first-class `limit_reached` enforcement metadata.
- Added a dedicated enforcement service that resolves `projectId` to `userId` and denies expired paid-plan mutations.
- Guarded the eight public MCP mutation tools before command execution and locked the behavior with regression tests.

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend the normalized MCP rejection contract for tariff denials** - `9773a70` (test), `6bcd355` (feat)
2. **Task 2: Guard mutating MCP tools and prove read tools still pass through** - `a2dbbf1` (test), `5206f08` (feat)

## Files Created/Modified

- `packages/mcp/src/types.ts` - Added `limit_reached` and typed enforcement metadata on normalized mutation results.
- `packages/mcp/src/services/enforcement.service.ts` - Added Prisma-backed project-owner lookup and expired-plan mutation denial logic.
- `packages/mcp/src/services/enforcement.service.test.ts` - Added contract coverage for typed denial payloads and ownership resolution order.
- `packages/mcp/src/services/index.ts` - Exported the new enforcement helpers from the service barrel.
- `packages/mcp/src/index.ts` - Inserted the pre-dispatch mutation guard for public MCP write tools.
- `packages/mcp/src/index.test.ts` - Added regression coverage for denied mutation tools and read-only pass-through.

## Decisions Made

- Used `projectId -> userId -> subscription` resolution inside MCP enforcement instead of trusting any ambient actor context.
- Returned structured denials through the normalized mutation wrapper rather than introducing a separate MCP-only error shape.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Source-level `node --test` imports for new TypeScript files did not resolve freshly added `.ts` modules without a build step in this repo. Verification was run against the compiled `packages/mcp/dist/*.test.js` outputs after `tsc`, which exercised the same test coverage cleanly.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- MCP and HTTP mutation surfaces now share the same expired-plan denial vocabulary for Phase 33 frontend constraint UX work.
- Read-only MCP tools remain available for diagnostics and context loading even when write tools are denied.

## Self-Check: PASSED

- FOUND: `.planning/phases/32-backend-enforcement/32-02-SUMMARY.md`
- FOUND: `9773a70`
- FOUND: `6bcd355`
- FOUND: `a2dbbf1`
- FOUND: `5206f08`
