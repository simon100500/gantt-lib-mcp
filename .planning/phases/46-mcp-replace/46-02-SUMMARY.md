---
phase: 46-mcp-replace
plan: 02
subsystem: shared tool core
tags:
  - runtime-core
  - tool-core
  - transport-neutral
requires:
  - 46-01
provides:
  - Canonical normalized tool catalog
  - Transport-neutral handler execution layer
  - Deterministic find_tasks capability and normalized mutation semantics
affects:
  - packages/runtime-core/src/tool-core/catalog.ts
  - packages/runtime-core/src/tool-core/types.ts
  - packages/runtime-core/src/tool-core/context.ts
  - packages/runtime-core/src/tool-core/handlers.ts
  - packages/runtime-core/src/tool-core/index.ts
  - packages/runtime-core/src/tool-core/handlers.test.ts
  - packages/runtime-core/package.json
tech_stack:
  added: []
  patterns:
    - canonical tool catalog
    - transport-neutral in-process handlers
    - node:test coverage for normalized result semantics
key_files:
  created:
    - packages/runtime-core/src/tool-core/handlers.ts
  modified:
    - packages/runtime-core/src/tool-core/catalog.ts
    - packages/runtime-core/src/tool-core/types.ts
    - packages/runtime-core/src/tool-core/context.ts
    - packages/runtime-core/src/tool-core/index.ts
    - packages/runtime-core/src/tool-core/handlers.test.ts
    - packages/runtime-core/package.json
decisions:
  - The shared tool core returns plain typed objects, leaving transport-specific wrapping to later adapters.
  - `find_tasks` lives in the shared handler layer as a first-class normalized capability rather than an MCP-only helper.
  - Mutation batching keeps the existing accepted/rejected normalized result contract so the direct path and MCP adapter can share semantics.
requirements_completed: []
metrics:
  duration: 39 min
  completed_at: 2026-04-20T09:48:00+03:00
---
# Phase 46 Plan 02: Shared Tool Core Summary

The repository now has one canonical tool catalog and one transport-neutral handler layer under `@gantt/runtime-core/tool-core`, ready for both direct in-process execution and the later MCP adapter.

Start: 2026-04-20T09:09:00+03:00
End: 2026-04-20T09:48:00+03:00
Duration: 39 min
Tasks: 2
Files touched: 7

## Outcomes

- Added the canonical normalized tool catalog and typed execution contracts for the shared read/mutation surface, including `find_tasks`.
- Implemented `createToolHandlers()` and `executeToolCall()` as transport-neutral execution entrypoints over runtime-core services.
- Preserved normalized mutation result semantics for accepted and rejected command flows, including aggregate handling for batch-like operations such as `shift_tasks`.
- Added handler tests covering typed read responses, compact ranked task search, accepted mutation behavior, rejected mutation aggregation, and schedule validation output.
- Exposed the tool-core entrypoint from `@gantt/runtime-core` for downstream consumers.

## Task Commits

- `06ca2b4` `test(46-02): add failing tool-core catalog contract test`
- `b8bc630` `feat(46-02): add shared tool-core catalog and context`
- `214c18a` `test(46-02): add failing transport-neutral handler tests`

## Deviations from Plan

### Auto-fixed Issues

**1. Handler test assertions needed stricter casts under workspace TypeScript settings**
- **Found during:** Task 2 verification
- **Issue:** two assertions in `handlers.test.ts` cast typed result objects directly to `Record<string, unknown>`, which fails under the current strict compiler settings.
- **Fix:** changed both assertions to cast through `unknown`, preserving the test intent while satisfying TypeScript.
- **Files modified:** `packages/runtime-core/src/tool-core/handlers.test.ts`

## Known Stubs

None.

## Verification

- `npx tsx --test packages/runtime-core/src/tool-core/handlers.test.ts`
- `npm run build -w packages/runtime-core`

## Next Step

Ready for `46-03-PLAN.md`.

## Self-Check: PASSED
