---
phase: 46-mcp-replace
plan: 03
subsystem: server direct tool path
tags:
  - server
  - qwen-sdk
  - direct-tools
  - compatibility-fallback
requires:
  - 46-01
  - 46-02
provides:
  - Embedded SDK-backed ordinary agent tool path
  - Explicit legacy subprocess compatibility mode
  - Direct-path regression coverage without MCP subprocess bootstrap
affects:
  - packages/server/src/agent.ts
  - packages/server/src/agent/direct-tools.ts
  - packages/server/src/agent.direct-tools.test.ts
  - packages/server/src/mutation/execution-routing.ts
  - packages/server/package.json
  - packages/runtime-core/package.json
  - packages/server/tsconfig.json
  - package-lock.json
tech_stack:
  added:
    - "@qwen-code/sdk"
    - "zod"
  patterns:
    - sdk-embedded mcp server
    - direct in-process tool execution
    - compatibility-only subprocess fallback
    - isolated node:test regression coverage
key_files:
  created:
    - packages/server/src/agent/direct-tools.ts
  modified:
    - packages/server/src/agent.ts
    - packages/server/src/agent.direct-tools.test.ts
    - packages/server/src/mutation/execution-routing.ts
    - packages/server/package.json
    - packages/runtime-core/package.json
    - packages/server/tsconfig.json
    - package-lock.json
decisions:
  - The ordinary app path now resolves `mcpServers` through an embedded SDK server by default instead of unconditionally spawning `packages/mcp/dist/index.js`.
  - The direct tool adapter lives in a focused server module so regression tests can validate the transport bridge without booting the full agent runtime.
  - `createToolContext()` is deferred until actual tool execution, avoiding Prisma side effects during direct-path contract tests while preserving runtime behavior.
requirements_completed: []
metrics:
  duration: 53 min
  completed_at: 2026-04-20T09:16:11+03:00
---
# Phase 46 Plan 03: Server Direct Tool Path Summary

The ordinary server agent path now uses an SDK-embedded in-process tool surface backed by the shared runtime-core catalog, with the legacy MCP subprocess retained only behind an explicit compatibility mode.

Start: 2026-04-20T08:23:00+03:00
End: 2026-04-20T09:16:11+03:00
Duration: 53 min
Tasks: 2
Files touched: 8

## Outcomes

- Added `packages/server/src/agent/direct-tools.ts` as the server-owned bridge from the shared normalized tool catalog into Qwen SDK `tool()` definitions and `createSdkMcpServer(...)`.
- Switched `packages/server/src/agent.ts` to resolve ordinary `mcpServers` through the embedded direct path by default, while still allowing `legacy-subprocess` compatibility mode.
- Kept the compatibility subprocess configuration explicit and non-default, including the existing environment wiring for run/session/attempt metadata.
- Added regression coverage proving the default path is SDK-embedded, the legacy path remains opt-in, and the direct tool definitions mirror the shared catalog.
- Added the server package's explicit runtime ownership for `@qwen-code/sdk` and `zod`, plus runtime-core export/path updates needed for the new subpath imports.

## Task Commits

- `4b738a7` `test(46-03): add failing direct tool path regression`
- `d8db90b` `feat(46-03): embed direct tools in server agent path`

## Deviations from Plan

### Auto-fixed Issues

**1. Direct-path regression tests originally pulled Prisma at import time**
- **Found during:** Task 2 verification
- **Issue:** importing the shared tool-core entrypoint while testing the direct path eagerly touched Prisma-backed runtime services and failed before the contract assertions ran.
- **Fix:** extracted the server-side direct-tool bridge into `packages/server/src/agent/direct-tools.ts`, switched tests to focused imports, and created tool context lazily inside the SDK handler callback.
- **Files modified:** `packages/server/src/agent/direct-tools.ts`, `packages/server/src/agent.direct-tools.test.ts`

**2. Shared JSON schema helpers needed readonly input support**
- **Found during:** Task 1 build verification
- **Issue:** the normalized tool catalog uses readonly `enum` and `required` arrays, which the first adapter helper typing rejected.
- **Fix:** updated the schema-to-Zod adapter to accept readonly arrays and keep the shared catalog definitions intact.
- **Files modified:** `packages/server/src/agent/direct-tools.ts`

## Known Stubs

None.

## Verification

- `npx tsx --test packages/server/src/agent.direct-tools.test.ts`
- `npm run build -w packages/server`

## Next Step

Ready for `46-04-PLAN.md`.

## Self-Check: PASSED
