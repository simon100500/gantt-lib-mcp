---
phase: 43-initial-gen-no-regexp
plan: 01
subsystem: api
tags: [initial-generation, routing, strict-json, typescript, testing]
requires:
  - phase: 41-initial-gen-refactor
    provides: initial-generation orchestration, model routing, and planner repair patterns
  - phase: 42-mcp-mutation-refactor
    provides: mutation route behavior that initial-generation routing must preserve
provides:
  - shared initial-request interpretation contract
  - strict JSON interpreter with one repair pass and technical-only fallback
  - route selection driven by validated interpretation output
affects: [initial-generation, route-selection, classification, clarification, brief, domain-assembly]
tech-stack:
  added: []
  patterns: [single interpretation boundary, strict enum validation, interpreter-driven route selection]
key-files:
  created: [packages/server/src/initial-generation/interpreter.ts, packages/server/src/initial-generation/interpreter.test.ts]
  modified: [packages/server/src/initial-generation/types.ts, packages/server/src/initial-generation/route-selection.ts, packages/server/src/agent.ts, packages/server/src/agent.test.ts]
key-decisions:
  - "Route selection now trusts the shared interpreter payload and maps only interpreter outcomes or project-state fallback reasons."
  - "Conservative fallback uses only project emptiness, hierarchy, extracted worklist count, and parsed location scope; it does not inspect semantic user words."
  - "The existing route-decision query hook in agent.ts was widened to interpreter and repair stages so the new boundary could reuse the production query path."
patterns-established:
  - "Initial-generation semantics must enter the pipeline through InitialRequestInterpretation, not route-local heuristics."
  - "Model output failures get at most one repair pass before a technical fallback result is emitted."
requirements-completed: [IGNR-01]
duration: 6 min
completed: 2026-04-14
---

# Phase 43 Plan 01: Unified Interpretation Contract Summary

**Structured initial-generation interpretation with strict enum validation, one repair pass, and interpreter-driven route selection**

## Performance

- **Duration:** 6 min
- **Started:** 2026-04-14T12:30:43+03:00
- **Completed:** 2026-04-14T12:36:43+03:00
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Added the typed `InitialRequestInterpretation` contract and supporting enums to the shared initial-generation type surface.
- Implemented `interpretInitialRequest()` with strict JSON prompting, schema validation, one repair attempt, and conservative technical fallback.
- Refactored `selectAgentRoute()` to consume the interpreter output and removed lexical route fallback helpers from `route-selection.ts`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create the unified initial-request interpretation contract and interpreter module** - `590d0e7` (test), `d366c10` (feat)
2. **Task 2: Replace route-selection lexical fallback with the shared interpreter output** - `f3d2054` (test), `fc971e5` (feat)

**Plan metadata:** pending docs commit

## Files Created/Modified
- `packages/server/src/initial-generation/types.ts` - shared interpretation enums and contract fields for route, request kind, scope, profile, and clarification.
- `packages/server/src/initial-generation/interpreter.ts` - strict JSON interpreter, validation, repair loop, and technical fallback.
- `packages/server/src/initial-generation/interpreter.test.ts` - paraphrase, worklist, targeted-edit, repair, and fallback regression coverage.
- `packages/server/src/initial-generation/route-selection.ts` - interpreter-driven route selection with explicit fallback reasons and threaded interpretation payload.
- `packages/server/src/agent.ts` - widened the route query stage contract so production can run interpretation and one repair pass.
- `packages/server/src/agent.test.ts` - route-selection regressions for paraphrases, targeted edit routing, and model-unavailable fallback.

## Decisions Made
- Route-selection reasons now summarize interpreter outcomes instead of re-validating semantics locally.
- The interpreter treats empty output as a direct conservative fallback, while parse/schema failures get one repair attempt first.
- Route selection keeps its public entrypoint stable by adapting the existing query callback into the interpreter interface.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Expanded the route query stage contract in agent.ts**
- **Found during:** Task 2 (Replace route-selection lexical fallback with the shared interpreter output)
- **Issue:** `selectAgentRoute()` needed interpreter and repair stages, but the production query hook only accepted the legacy route-decision stage.
- **Fix:** Widened `InitialGenerationRouteDecisionQueryInput.stage` and allowed one extra turn for repair requests.
- **Files modified:** `packages/server/src/agent.ts`
- **Verification:** `npx tsx --test packages/server/src/agent.test.ts packages/server/src/initial-generation/interpreter.test.ts`; `npm run build -w packages/server`
- **Committed in:** `fc971e5`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary to let route selection reuse the production model query path. No scope creep.

## Issues Encountered
- None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- The codebase now has one canonical interpretation payload that downstream initial-generation modules can consume in Phase 43-02.
- Route-selection no longer performs semantic keyword fallback, so remaining semantic consumers can migrate onto the same contract incrementally.

## Self-Check

PASSED

- FOUND: `.planning/phases/43-initial-gen-no-regexp/43-01-SUMMARY.md`
- FOUND: `590d0e7`
- FOUND: `d366c10`
- FOUND: `f3d2054`
- FOUND: `fc971e5`

---
*Phase: 43-initial-gen-no-regexp*
*Completed: 2026-04-14*
