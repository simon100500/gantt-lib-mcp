---
phase: 43-initial-gen-no-regexp
plan: 03
subsystem: testing
tags: [initial-generation, observability, telemetry, regression, testing, typescript]
requires:
  - phase: 43-02
    provides: shared interpretation contract consumed by route selection and downstream intake modules
provides:
  - structured interpretation lifecycle logs for validation, fallback, and normalized decisions
  - route-level interpretation evidence at the agent entrypoint before initial-generation branching
  - regression and source-guard coverage against banned semantic helper reintroduction
affects: [initial-generation, observability, verifier, regression-tests]
tech-stack:
  added: []
  patterns: [flattened structured telemetry, source-guard tests, interpretation-over-technical-scope precedence]
key-files:
  created: []
  modified:
    - packages/server/src/agent.ts
    - packages/server/src/initial-generation/orchestrator.ts
    - packages/server/src/initial-generation/orchestrator.test.ts
    - packages/server/src/agent.test.ts
    - packages/server/src/initial-generation/interpreter.test.ts
    - packages/server/src/initial-generation/classification.test.ts
    - packages/server/src/initial-generation/clarification-gate.test.ts
    - packages/server/src/initial-generation/domain/assembly.test.ts
    - packages/server/src/initial-generation/classification.ts
key-decisions:
  - "Interpretation telemetry is logged as flattened structured fields plus the raw interpretation payload so a single run can be reconstructed from logs."
  - "The agent entrypoint forwards interpretation evidence before initial-generation branching so route selection and orchestration logs share the same trace."
  - "Classification now prefers interpreted location scope over technically parsed scope when the interpreter already resolved the fragment."
patterns-established:
  - "Lifecycle telemetry pattern: interpretation, validation, fallback, and normalized decisions are separate structured events."
  - "Source-guard pattern: tests read implementation files directly to block banned semantic helper names from re-entering the intake path."
requirements-completed: [IGNR-04]
duration: 6min
completed: 2026-04-14
---

# Phase 43 Plan 03: Observability and Guard Summary

**Structured interpretation lifecycle telemetry with route-level evidence and source-guard regressions for the no-regexp intake path**

## Performance

- **Duration:** 6 min
- **Started:** 2026-04-14T10:09:27Z
- **Completed:** 2026-04-14T10:15:46Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Added four structured interpretation lifecycle events covering the interpreted payload, validation verdict, fallback provenance, and normalized downstream decisions.
- Surfaced interpretation-derived route evidence from `agent.ts` before the initial-generation branch starts.
- Locked the regression surface with Russian/English paraphrase, ambiguity, explicit worklist, targeted-edit, model-failure, and source-guard coverage.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add structured interpretation lifecycle logging and conservative-fallback telemetry** - `6dfb71c` (feat)
2. **Task 2: Lock the regression and guard surface against semantic runtime heuristics** - `43910d6` (test)

## Files Created/Modified
- `packages/server/src/agent.ts` - logs interpretation evidence at the top-level route decision boundary.
- `packages/server/src/initial-generation/orchestrator.ts` - emits validation, fallback, and normalized-decision telemetry around the shared interpreter result.
- `packages/server/src/initial-generation/orchestrator.test.ts` - asserts happy-path, repair, and fallback event payloads.
- `packages/server/src/agent.test.ts` - locks route selection regressions and source guards for the agent entry surface.
- `packages/server/src/initial-generation/interpreter.test.ts` - guards interpreter-path source files against banned semantic helper names.
- `packages/server/src/initial-generation/classification.test.ts` - verifies paraphrase and fallback-driven classification consistency.
- `packages/server/src/initial-generation/clarification-gate.test.ts` - verifies ambiguity and fallback-driven clarification behavior for paired paraphrases.
- `packages/server/src/initial-generation/domain/assembly.test.ts` - verifies whole-project, partial-scope, and explicit-worklist assembly stability across paraphrases.
- `packages/server/src/initial-generation/classification.ts` - prefers interpreted location scope so paraphrases do not diverge on technical parser artifacts.

## Decisions Made

- Flattened the interpretation telemetry fields into each log event while preserving the nested payload for trace reconstruction.
- Logged the route-level interpretation snapshot in `agent.ts` instead of inventing a second route-evidence schema.
- Fixed classification scope precedence to honor the interpreted contract first and only fall back to technical parsing when the interpreter leaves scope empty.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed paraphrase drift caused by technical location-scope precedence**
- **Found during:** Task 2 (Lock the regression and guard surface against semantic runtime heuristics)
- **Issue:** Russian and English partial-scope paraphrases produced different classification outputs because `classification.ts` preferred technically parsed scope over the interpreter contract.
- **Fix:** Changed classification to use interpreted location scope whenever it is populated, falling back to technical parsing only when the interpretation leaves scope empty.
- **Files modified:** `packages/server/src/initial-generation/classification.ts`, `packages/server/src/initial-generation/classification.test.ts`
- **Verification:** `npx tsx --test packages/server/src/agent.test.ts packages/server/src/initial-generation/interpreter.test.ts packages/server/src/initial-generation/classification.test.ts packages/server/src/initial-generation/clarification-gate.test.ts packages/server/src/initial-generation/domain/assembly.test.ts` and `npm run build -w packages/server`
- **Committed in:** `43910d6`

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** The fix was required to make paraphrase regressions match the shared interpretation contract. No scope creep.

## Issues Encountered

- A new regression exposed residual technical-parser precedence in classification; it was fixed inline and verified within Task 2.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The no-regexp intake path now has reconstructable telemetry and direct source guards against banned helper regressions.
- The untracked `INITIAL-GENERATION-NO-HARDCODE-PRD.md` file remained untouched and outside this execution.

## Self-Check: PASSED

- FOUND: `.planning/phases/43-initial-gen-no-regexp/43-03-SUMMARY.md`
- FOUND: `6dfb71c`
- FOUND: `43910d6`

---
*Phase: 43-initial-gen-no-regexp*
*Completed: 2026-04-14*
