---
phase: 41-initial-gen-refactor
plan: 02
subsystem: api
tags: [initial-generation, planning, validation, quality-gate, construction]
requires:
  - phase: 41-01
    provides: typed initial-generation routing shell and model-routing decisions
provides:
  - brief-first planning context with construction-domain reference injection
  - strict ProjectPlan validation with normalized defaults
  - rule-based plan quality verdicts and a capped single repair pass
affects: [initial-generation, compiler, executor, observability]
tech-stack:
  added: []
  patterns: [server-side domain reference injection, strict JSON plan validation, one-shot repair orchestration]
key-files:
  created:
    - packages/server/src/initial-generation/brief.ts
    - packages/server/src/initial-generation/domain-reference.ts
    - packages/server/src/initial-generation/planner.ts
    - packages/server/src/initial-generation/quality-gate.ts
  modified:
    - packages/server/src/initial-generation/planner.test.ts
    - packages/server/src/initial-generation/types.ts
key-decisions:
  - "Keep placeholder titles schema-invalid and reserve the repair loop for plans that are structurally valid but weak on hierarchy, coverage, or sequencing."
  - "Reuse the construction reference map as compact prompt context instead of reviving deterministic task templates."
patterns-established:
  - "Planning prompt pattern: brief plus domain reference plus strict ProjectPlan JSON contract."
  - "Validation pattern: normalize assumptions and dependency defaults before the quality gate runs."
requirements-completed: [IGR-02]
duration: 8min
completed: 2026-04-08
---

# Phase 41 Plan 02: Initial Planning Summary

**Brief-guided initial project planning with construction reference injection, strict ProjectPlan validation, and a one-shot repair gate**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-08T14:23:07Z
- **Completed:** 2026-04-08T14:31:22Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Added a server-side generation brief and domain reference resolver that matches recognized construction prompts and falls back to `private_residential_house` for vague requests.
- Implemented strict `ProjectPlan` validation with default normalization for `assumptions`, dependency `type`, and `lagDays`.
- Added a rule-based quality gate and planner repair flow that allows exactly one repair attempt before returning the best available plan.

## Task Commits

Each task was committed atomically:

1. **Task 1: Build the server-side generation brief and domain-reference resolver** - `df1411e`, `a2913ff`
2. **Task 2: Implement ProjectPlan validation, quality gate, and one-shot repair orchestration** - `528c591`, `b7bf154`

_Note: TDD tasks used test -> feat commits._

## Files Created/Modified

- `packages/server/src/initial-generation/brief.ts` - Builds the short planner brief with scope signals, baseline inference policy, and naming constraints.
- `packages/server/src/initial-generation/domain-reference.ts` - Resolves compact construction-domain guidance, including the locked private-house fallback.
- `packages/server/src/initial-generation/planner.ts` - Builds the planning and repair prompts, validates JSON payloads, normalizes defaults, and caps repair to one pass.
- `packages/server/src/initial-generation/quality-gate.ts` - Scores hierarchy, coverage, sequencing, and placeholder naming to decide accept vs repair.
- `packages/server/src/initial-generation/planner.test.ts` - Covers recognized/fallback prompt handling, schema rejections, and one-shot repair behavior.
- `packages/server/src/initial-generation/types.ts` - Aligns shared planning types with the Phase 41 planner contract.

## Decisions Made

- Placeholder titles remain schema-invalid so the repair loop focuses on quality improvements for otherwise valid plans.
- The construction intent map is injected as compact guidance only; it does not reintroduce deterministic template generation.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- `npm run build -w packages/server` was temporarily blocked while concurrent Phase 41-03 executor work was still landing on the shared branch. Final verification passed once the branch included the executor implementation.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 41-03 can compile against a validated `ProjectPlan` contract with normalized dependency metadata.
- Phase 41-04 can wire orchestration and logging on top of the new planner and quality-gate surface once the executor path lands.

## Known Stubs

None.

## Self-Check: PASSED

- Verified `.planning/phases/41-initial-gen-refactor/41-02-SUMMARY.md` exists.
- Verified task commits `df1411e`, `a2913ff`, `528c591`, and `b7bf154` exist in git history.
- Verified `npx tsx --test packages/server/src/initial-generation/planner.test.ts` and `npm run build -w packages/server` pass on the final shared branch state.
