---
phase: 30-constraint-engine
plan: 01
subsystem: constraints
tags: [billing, constraints, catalog, shared-module]
requires: []
provides:
  - Canonical shared plan catalog with explicit constraint metadata and pricing
  - `@gantt/mcp/constraints` export surface for downstream packages
  - Web billing adapters derived from the shared catalog instead of duplicated literals
affects: [30-02, 30-03, server, web]
tech-stack:
  added: []
  patterns: [shared tariff catalog, explicit unlimited sentinel, web adapter over shared metadata]
key-files:
  created:
    - packages/mcp/src/constraints/catalog.ts
    - packages/mcp/src/constraints/index.ts
  modified:
    - packages/mcp/package.json
    - packages/web/package.json
    - packages/web/src/lib/billing.ts
key-decisions:
  - "Kept the canonical tariff source of truth in `@gantt/mcp/constraints` so server and web can import the same metadata."
  - "Represented unlimited values explicitly as `unlimited` instead of legacy numeric sentinels."
patterns-established:
  - "Plan metadata, pricing, and limit-key metadata now move together as one shared catalog."
  - "Web billing adapters preserve the current UI API while sourcing labels and pricing from the shared module."
requirements-completed: [ENG-01, ENG-03]
duration: 20min
completed: 2026-04-02
---

# Phase 30 Plan 01 Summary

**Introduced a shared constraint catalog in `@gantt/mcp` and moved the web billing adapter onto that canonical tariff metadata.**

## Performance

- **Duration:** 20 min
- **Completed:** 2026-04-02T23:42:16+03:00
- **Tasks:** 2
- **Files changed:** 5

## Accomplishments

- Added a canonical plan catalog covering all four tariffs, five limit keys, explicit export access levels, and shared monthly/yearly pricing.
- Exported the catalog from `@gantt/mcp/constraints` so downstream packages can import the same metadata surface.
- Rewired the web billing helper module to derive labels and prices from the shared catalog rather than hardcoded local tables.

## Task Commits

1. **Task 1: Create the canonical shared constraint catalog** - `78ccaf7`
2. **Task 2: Move the web billing adapter onto the shared catalog** - `74d59c4`

## Files Created/Modified

- `packages/mcp/src/constraints/catalog.ts` - Canonical plan/limit catalog and helper accessors
- `packages/mcp/src/constraints/index.ts` - Shared constraint export entrypoint
- `packages/mcp/package.json` - Added `./constraints` subpath export
- `packages/web/package.json` - Added workspace dependency on `@gantt/mcp`
- `packages/web/src/lib/billing.ts` - Derived labels and pricing from the shared catalog

## Decisions Made

- Kept `team_members` out of the shared catalog because the phase plan explicitly defers that scope.
- Preserved the existing `PLAN_LABELS` and `PLAN_PRICES` exports in the web layer so current UI consumers do not need to change yet.

## Issues Encountered

- Full `npm run build -w packages/web` is blocked in the sandbox by Vite/esbuild process spawning (`spawn EPERM`), but `npx tsc -p packages/web/tsconfig.json` passes and the shared MCP package build also passes.

## Next Phase Readiness

- Wave 2 can now consume canonical limit-key metadata and plan pricing from `@gantt/mcp/constraints`.
- Server-side persistence and enforcement no longer need to invent their own tariff tables.

## Self-Check: PASSED

- FOUND: `packages/mcp/src/constraints/catalog.ts`
- FOUND: `packages/mcp/src/constraints/index.ts`
- FOUND: commit `78ccaf7`
- FOUND: commit `74d59c4`
