---
phase: 46-mcp-replace
plan: 04
subsystem: MCP adapter parity
tags:
  - mcp
  - runtime-core
  - adapter
  - parity-tests
requires:
  - 46-02
  - 46-03
provides:
  - Thin MCP transport adapter over shared tool-core handlers
  - Shared-catalog-derived public MCP tool list
  - Adapter parity coverage against direct in-process handlers
affects:
  - packages/mcp/src/index.ts
  - packages/mcp/src/public-tools.ts
  - packages/mcp/src/index.test.ts
  - packages/runtime-core/src/tool-core/adapter-parity.test.ts
tech_stack:
  added: []
  patterns:
    - transport-only MCP adapter
    - shared normalized tool catalog
    - direct-vs-adapter parity tests
key_files:
  created:
    - packages/runtime-core/src/tool-core/adapter-parity.test.ts
  modified:
    - packages/mcp/src/index.ts
    - packages/mcp/src/public-tools.ts
    - packages/mcp/src/index.test.ts
decisions:
  - The MCP package now delegates normalized tool semantics through `executeToolCall()` and keeps only transport-specific request/response shaping.
  - `PUBLIC_MCP_TOOLS` is derived from `NORMALIZED_TOOL_CATALOG` so the direct path and MCP adapter cannot drift on the published shared surface.
  - Adapter parity is locked at the semantic payload level, allowing MCP-specific `content` wrapping while requiring identical normalized results underneath.
requirements_completed: []
metrics:
  duration: 7 min
  completed_at: 2026-04-20T09:33:43+03:00
---
# Phase 46 Plan 04: MCP Adapter Parity Summary

The MCP package is now a thin transport adapter over the shared runtime-core tool surface, with automated parity tests proving it matches the direct in-process handler behavior.

Start: 2026-04-20T09:26:47+03:00
End: 2026-04-20T09:33:43+03:00
Duration: 7 min
Tasks: 2
Files touched: 4

## Outcomes

- Replaced the MCP package's hand-written normalized tool branching with shared `executeToolCall()` delegation through runtime-core.
- Derived `PUBLIC_MCP_TOOLS` from `NORMALIZED_TOOL_CATALOG`, keeping MCP list responses aligned with the shared direct-path catalog.
- Preserved MCP-only transport concerns such as the `ping` tool, conversation-history helpers, debug logging, and `content` response wrapping.
- Added adapter-level tests for list/call shaping and direct-vs-adapter parity tests for read, mutation, and validation flows.

## Task Commits

- `77f2032` `test(46-04): add failing MCP adapter delegation coverage`
- `6c2596a` `feat(46-04): thin MCP into runtime-core transport adapter`
- `4e2f0d5` `test(46-04): lock MCP adapter parity with direct handlers`

## Deviations from Plan

None.

## Known Stubs

None.

## Verification

- `npx tsx --test packages/mcp/src/index.test.ts`
- `npx tsx --test packages/runtime-core/src/tool-core/adapter-parity.test.ts`
- `npm run build -w packages/mcp`
- `npm run build -w packages/runtime-core`

## Next Step

Ready for `46-05-PLAN.md`.

## Self-Check: PASSED
