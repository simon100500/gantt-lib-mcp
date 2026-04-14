---
phase: 43-initial-gen-no-regexp
plan: 02
subsystem: api
tags: [initial-generation, interpretation, orchestration, typescript, testing]
requires:
  - phase: 43-01
    provides: unified initial-request interpreter and route-selection contract
provides:
  - technical-only intake normalization without semantic scope inference
  - interpretation-driven classification and clarification decisions
  - shared interpretation reuse across brief, domain assembly, and orchestrator
affects: [43-03, initial-generation, observability]
tech-stack:
  added: []
  patterns: [shared interpretation projection, technical-only normalization, single-call intake reuse]
key-files:
  created: []
  modified:
    - packages/server/src/initial-generation/intake-normalization.ts
    - packages/server/src/initial-generation/classification.ts
    - packages/server/src/initial-generation/clarification-gate.ts
    - packages/server/src/initial-generation/brief.ts
    - packages/server/src/initial-generation/domain/assembly.ts
    - packages/server/src/initial-generation/orchestrator.ts
key-decisions:
  - "Normalization now keeps only technical evidence such as worklist extraction and location scope."
  - "Classification, clarification, brief assembly, and domain assembly all project from one structured interpretation contract."
  - "The orchestrator owns one shared interpretation call for the initial-generation intake sequence and logs that payload."
patterns-established:
  - "Interpretation-first intake: semantic decisions must be projected from validated enums, not raw text."
  - "Technical parsers may still extract ranges, floors, zones, and explicit lists when they do not infer intent."
requirements-completed: [IGNR-02, IGNR-03]
duration: 32min
completed: 2026-04-14
---

# Phase 43 Plan 02: Downstream Consumer Migration Summary

**Interpretation-driven intake consumers with technical-only normalization and one shared orchestrator interpretation result**

## Performance

- **Duration:** 32 min
- **Started:** 2026-04-14T12:34:00+03:00
- **Completed:** 2026-04-14T13:06:45+03:00
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- Removed semantic scope and profile inference from normalization, classification, and clarification.
- Migrated brief assembly and domain assembly to consume structured interpretation fields plus technical location scope.
- Wired the initial-generation orchestrator to compute one shared interpretation result and reuse it across downstream consumers.

## Task Commits

Each task was committed atomically:

1. **Task 1: Strip semantic inference out of normalization, classification, and clarification** - `0e65fb7` (feat)
2. **Task 2: Migrate brief, domain assembly, and orchestrator to reuse one shared interpretation result** - `74b8f9c` (feat)

## Files Created/Modified
- `packages/server/src/initial-generation/intake-normalization.ts` - keeps only technical parsing for whitespace, worklists, sections, floors, zones, and source confidence.
- `packages/server/src/initial-generation/classification.ts` - projects classification fields directly from `InitialRequestInterpretation`.
- `packages/server/src/initial-generation/clarification-gate.ts` - maps clarification asks/proceed decisions from structured interpretation state.
- `packages/server/src/initial-generation/brief.ts` - builds object type, scope signals, and domain summary from interpretation enums and technical location scope.
- `packages/server/src/initial-generation/domain/assembly.ts` - resolves fragments and assumptions from structured scope/profile signals instead of raw-text hints.
- `packages/server/src/initial-generation/orchestrator.ts` - computes and logs one shared interpretation result before downstream deterministic planning.
- `packages/server/src/initial-generation/domain/assembly.test.ts` - covers whole-project, partial-scope basement, and explicit worklist downstream flows.
- `packages/server/src/initial-generation/planner.test.ts` - updates downstream planner/quality-gate coverage to use injected interpretation payloads.
- `packages/server/src/agent.ts` - passes the interpretation query/model into the orchestrator for the shared intake call.

## Decisions Made
- The orchestrator now owns the downstream interpretation call so classification, clarification, brief assembly, and domain assembly read one shared payload.
- Brief and domain assembly preserve technical location parsing, but all semantic distinctions come from interpretation enums or clarification reasons.
- Compatibility fallbacks remain only where tests and quality-gate helpers build briefs without interpretation context.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Finished downstream signature migration required by Task 1**
- **Found during:** Task 1 verification
- **Issue:** `brief.ts`, `domain/assembly.ts`, `orchestrator.ts`, and planner/domain tests still expected the pre-interpretation normalization and classification signatures, so `npm run build -w packages/server` failed.
- **Fix:** Threaded `interpretation` through the downstream contracts, migrated the consumers to shared structured inputs, and updated the affected regression tests.
- **Files modified:** `packages/server/src/initial-generation/brief.ts`, `packages/server/src/initial-generation/domain/contracts.ts`, `packages/server/src/initial-generation/domain/assembly.ts`, `packages/server/src/initial-generation/orchestrator.ts`, `packages/server/src/initial-generation/domain/assembly.test.ts`, `packages/server/src/initial-generation/planner.test.ts`, `packages/server/src/agent.ts`
- **Verification:** `npx tsx --test packages/server/src/initial-generation/classification.test.ts packages/server/src/initial-generation/clarification-gate.test.ts packages/server/src/initial-generation/domain/assembly.test.ts packages/server/src/initial-generation/planner.test.ts packages/server/src/initial-generation/orchestrator.test.ts` and `npm run build -w packages/server`
- **Committed in:** `74b8f9c`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** The deviation was required to make the planned interpretation-driven contract compile and verify. No extra product scope was added.

## Issues Encountered
None beyond the expected downstream signature mismatch uncovered by Task 1 verification.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- The intake path now has a single downstream semantic source of truth, so Phase 43 Plan 03 can focus on observability, telemetry, and regression guards.
- The existing untracked `INITIAL-GENERATION-NO-HARDCODE-PRD.md` remains outside this execution and was not modified.

## Self-Check: PASSED

- FOUND: `.planning/phases/43-initial-gen-no-regexp/43-02-SUMMARY.md`
- FOUND: `0e65fb7`
- FOUND: `74b8f9c`

---
*Phase: 43-initial-gen-no-regexp*
*Completed: 2026-04-14*
