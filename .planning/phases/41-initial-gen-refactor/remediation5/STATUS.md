# Remediation 5 Status

## Current State

Status date: 2026-04-09

Phase status: in progress

## Completed

1. Dependency contract repair is implemented.

- `planner.ts` now accepts dependency references from:
  - object format with `taskKey`
  - object format with `nodeKey`
  - shorthand string formats observed in logs
- Fresh office-renovation live run confirmed that dependencies now survive scheduling and compile.
- Confirmed live signal:
  - `scheduling_gate_verdict.accepted = true`
  - `dependencyCount = 48`
  - `compile_verdict.compiledDependencyCount = 48`

2. Prompt tightening for single-operation titles is implemented.

- Structure prompt and repair prompt now explicitly require:
  - one task = one construction operation
  - no compound task wording
  - split multi-operation wording into separate tasks/subphases
- Scheduling prompt now hard-specifies dependency output format with explicit good/bad examples.

3. Preview-first UX is implemented at baseline level.

- Server sends provisional `preview_tasks` before final commit.
- Web client renders preview state and replaces it with authoritative final `tasks`.
- Database persistence remains authoritative and final-state driven.

## Remaining Work

1. Verify live kindergarten run end-to-end.

- Target prompt:
  - `График строительства детского сада на 3 этажа`
- Need to confirm:
  - non-zero dependency graph
  - preview arrives before final commit
  - final persisted graph preserves dependencies

2. Verify title-quality improvement manually.

- Need live comparison against previously observed compound examples.
- Goal is not perfect elimination, but material reduction of compound task titles.

3. Verify preview failure behavior.

- Need to confirm UI clears or downgrades preview state when final commit fails.

4. Optionally add more protocol/UI coverage for preview path.

- Current coverage is strongest in planner/orchestrator server tests.

## Success Criteria Check

1. Valid dependency references survive normalization and compile.
- Status: confirmed on fresh office-renovation live run.

2. Successful runs produce non-zero dependency graph when model returns dependencies.
- Status: confirmed on fresh office-renovation live run.

3. Prompt wording materially reduces compound task titles without destructive rejection.
- Status: implementation done, still needs live verification evidence.

4. User sees provisional graph before final persistence completes.
- Status: implementation done, observed in logs via `preview_tasks_broadcast`, still worth one final manual UX check.

5. Final DB writes remain authoritative and single-commit.
- Status: implemented and preserved.

## Suggested Next Step

Run and inspect the acceptance prompt:

- `График строительства детского сада на 3 этажа`

Then close the remaining verification items and mark remediation complete.
