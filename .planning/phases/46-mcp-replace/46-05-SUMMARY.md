---
phase: 46-mcp-replace
plan: 05
subsystem: direct-path verification
tags:
  - server
  - telemetry
  - verification
  - direct-tools
requires:
  - 46-01
  - 46-02
  - 46-03
  - 46-04
provides:
  - Direct-path telemetry contract for ordinary agent runs
  - Final regression evidence for default direct execution and bounded fallback
  - Phase verification and human UAT artifacts for the direct-tooling cutover
affects:
  - packages/server/src/agent.ts
  - packages/server/src/agent.direct-tools.test.ts
  - .planning/phases/46-mcp-replace/46-HUMAN-UAT.md
  - .planning/phases/46-mcp-replace/46-VERIFICATION.md
tech_stack:
  added: []
  patterns:
    - ordinary-path telemetry summary
    - fallback-only compatibility evidence
    - phase closeout verification artifacts
key_files:
  created:
    - .planning/phases/46-mcp-replace/46-HUMAN-UAT.md
    - .planning/phases/46-mcp-replace/46-VERIFICATION.md
  modified:
    - packages/server/src/agent.ts
    - packages/server/src/agent.direct-tools.test.ts
decisions:
  - Ordinary-path telemetry is emitted as one summarized `ordinary_agent_path_telemetry` payload so direct execution, fallback use, and verification outcomes can be reviewed per run.
  - Final direct-path tests assert the architectural contract at the source level and runtime boundary level, preventing silent regression back to subprocess-first execution.
  - Human UAT and verification docs trace the replan acceptance criteria explicitly instead of relying on narrative closeout notes.
requirements_completed: []
metrics:
  duration: 4 min
  completed_at: 2026-04-20T10:36:28+03:00
---
# Phase 46 Plan 05: Direct-Path Cutover Evidence Summary

Phase 46 now ends with explicit telemetry, regression assertions, and manual verification artifacts proving that ordinary app requests default to direct in-process tools while MCP remains an adapter-only path.

Start: 2026-04-20T10:32:47+03:00
End: 2026-04-20T10:36:28+03:00
Duration: 4 min
Tasks: 2
Files touched: 4

## Outcomes

- Added `summarizeOrdinaryAgentPathTelemetry()` and `ordinary_agent_path_telemetry` logging so direct-path selection, fallback use, tool-call counts, and authoritative verification acceptance are observable per run.
- Extended the direct-path regression suite to lock the default embedded-direct path, explicit legacy-subprocess fallback semantics, and accepted changed-task synchronization.
- Added `46-HUMAN-UAT.md` with concrete live flows for direct-path success, bounded fallback, and MCP adapter proof.
- Added `46-VERIFICATION.md` mapping the replan acceptance criteria to concrete code, test, and telemetry evidence targets.

## Task Commits

- `9e5a534` `test(46-05): add failing direct-path telemetry coverage`
- `177ed11` `feat(46-05): add direct-path telemetry evidence`
- `6426173` `docs(46-05): add direct-tooling verification artifacts`

## Deviations from Plan

None.

## Known Stubs

None.

## Verification

- `npx tsx --test packages/server/src/agent.direct-tools.test.ts`
- `npm run build -w packages/server`

## Next Step

Ready for phase-level verification and completion.

## Self-Check: PASSED
