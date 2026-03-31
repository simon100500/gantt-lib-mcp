---
phase: 36-unified-scheduling-core
plan: 01
subsystem: infra
tags: [tsup, dts, subpath-export, gantt-lib, npm, packaging]

# Dependency graph
requires:
  - phase: 35-scheduling-core-adoption
    provides: headless scheduling core in gantt-lib/src/core/scheduling
provides:
  - gantt-lib/core/scheduling subpath export with JS + DTS + ESM + CJS
  - gantt-lib as dependency in packages/mcp
  - Verified import path for moveTaskWithCascade, resizeTaskWithCascade, recalculateProjectSchedule
affects: [36-02, 36-03, 36-04, 36-05, 36-06, 36-07]

# Tech tracking
tech-stack:
  added: [tsup dts generation fix]
  patterns: [subpath export with headless-only contract, file: protocol for cross-repo dependency]

key-files:
  created: []
  modified:
    - D:/Projects/gantt-lib/packages/gantt-lib/src/core/scheduling/index.ts
    - D:/Projects/gantt-lib/packages/gantt-lib/src/utils/dependencyUtils.ts
    - D:/Projects/gantt-lib/packages/gantt-lib/src/__tests__/export-contract.test.ts
    - D:/Projects/gantt-lib/packages/gantt-lib/package.json
    - D:/Projects/gantt-lib-mcp/packages/mcp/package.json

key-decisions:
  - "Removed deprecated UI adapter re-exports from core/scheduling to enforce zero-React/DOM contract"
  - "Used file: protocol for gantt-lib dependency since 0.62.0 is not published to npm"

patterns-established:
  - "core/scheduling subpath is pure headless: no React/DOM transitive dependencies"
  - "UI adapter functions (resolveDateRangeFromPixels, clampDateRangeForIncomingFS) live only in adapters/scheduling and re-exported via root index"

requirements-completed: [CORE-EXPORT]

# Metrics
duration: 6min
completed: 2026-03-31
---

# Phase 36 Plan 01: Fix gantt-lib Subpath Export Summary

**Removed React-dependent re-exports from core/scheduling, fixed tsup DTS generation, linked gantt-lib 0.62.0 to MCP package with verified import of scheduling functions**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-31T21:28:11Z
- **Completed:** 2026-03-31T21:34:23Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- gantt-lib/core/scheduling subpath export now generates .d.ts, .d.mts, .mjs, .js files
- MCP package can import scheduling functions with full TypeScript type safety
- Deprecated UI adapter functions removed from headless core module

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix gantt-lib DTS generation** - `86067a3` (feat) — in gantt-lib repo
2. **Task 2: Add gantt-lib dependency to MCP package** - `ad567b4` (feat) — in gantt-lib-mcp repo

## Files Created/Modified
- `gantt-lib/src/core/scheduling/index.ts` - Removed deprecated UI adapter re-exports (resolveDateRangeFromPixels, clampDateRangeForIncomingFS)
- `gantt-lib/src/utils/dependencyUtils.ts` - Split imports: core scheduling from ../core/scheduling, UI adapters from ../adapters/scheduling
- `gantt-lib/src/__tests__/export-contract.test.ts` - Removed backward-compat test for UI adapter re-exports from core/scheduling
- `gantt-lib/package.json` - Bumped version to 0.62.0
- `gantt-lib-mcp/packages/mcp/package.json` - Added gantt-lib as dependency (file: protocol)

## Decisions Made
- **Removed deprecated re-exports from core/scheduling** to enforce the "zero React/DOM" contract. The functions remain available via root `gantt-lib` export and `gantt-lib/adapters/scheduling`
- **Used file: protocol** for cross-repo dependency since gantt-lib 0.62.0 is not yet published to npm (latest published is 0.28.1). This is a development-time linking strategy

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed dependencyUtils.ts import after removing core/scheduling re-exports**
- **Found during:** Task 1 (Build failed after removing deprecated re-exports)
- **Issue:** `utils/dependencyUtils.ts` imported `resolveDateRangeFromPixels` and `clampDateRangeForIncomingFS` from `../core/scheduling` which no longer exports them
- **Fix:** Split the import into two: core scheduling functions from `../core/scheduling`, UI adapter functions from `../adapters/scheduling`
- **Files modified:** gantt-lib/src/utils/dependencyUtils.ts
- **Verification:** Build succeeds, export-contract tests pass (3/3)
- **Committed in:** 86067a3 (Task 1 commit)

**2. [Rule 3 - Blocking] Updated export-contract test to match new export surface**
- **Found during:** Task 1 (Test would fail for removed backward-compat exports)
- **Issue:** Test verified resolveDateRangeFromPixels and clampDateRangeForIncomingFS in core/scheduling module
- **Fix:** Removed the backward-compat test case; kept 3 remaining tests (command-level API, domain types, dependencyUtils)
- **Files modified:** gantt-lib/src/__tests__/export-contract.test.ts
- **Verification:** vitest run passes 3/3 tests
- **Committed in:** 86067a3 (Task 1 commit)

**3. [Rule 3 - Blocking] Used file: protocol instead of semver range for gantt-lib**
- **Found during:** Task 2 (npm install failed: gantt-lib@^0.62.0 not on npm)
- **Issue:** gantt-lib 0.62.0 is local-only (npm registry has 0.28.1)
- **Fix:** Changed dependency to `"file:D:/Projects/gantt-lib/packages/gantt-lib"` for local linking
- **Files modified:** packages/mcp/package.json
- **Verification:** npm install succeeds, import resolves correctly
- **Committed in:** ad567b4 (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (3 blocking)
**Impact on plan:** All auto-fixes were necessary for build/import correctness. No scope creep.

## Issues Encountered
- npm hoists the old gantt-lib@0.28.1 to root node_modules, so imports from workspace root resolve the wrong version. Running from packages/mcp directory resolves the correct local version. This is a known npm workspace hoisting behavior.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- gantt-lib/core/scheduling subpath export is fully functional with JS + DTS + ESM + CJS
- MCP package can import scheduling functions with type safety
- All downstream plans (36-02 through 36-07) can now use `import { ... } from 'gantt-lib/core/scheduling'`
- Note: gantt-lib 0.62.0 needs to be published to npm before production deployment; file: protocol is dev-only

---
*Phase: 36-unified-scheduling-core*
*Completed: 2026-03-31*

## Self-Check: PASSED

- FOUND: 36-01-SUMMARY.md
- FOUND: index.d.ts, index.d.mts, index.mjs, index.js in dist/core/scheduling/
- FOUND: commit 86067a3 (gantt-lib repo)
- FOUND: commit ad567b4 (gantt-lib-mcp repo)
