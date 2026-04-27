---
phase: 46-mcp-replace
plan: 01
subsystem: runtime-core ownership
tags:
  - runtime-core
  - mcp
  - package-boundary
requires: []
provides:
  - Transport-neutral runtime package for shared Prisma/types/services
  - MCP compatibility shims over runtime-core-owned modules
  - Workspace TypeScript path wiring for runtime-core consumption
affects:
  - packages/runtime-core/package.json
  - packages/runtime-core/src/services/index.ts
  - packages/runtime-core/src/services/command.service.ts
  - packages/runtime-core/src/services/history.service.ts
  - packages/runtime-core/src/services/task.service.ts
  - packages/runtime-core/src/services/project.service.ts
  - packages/runtime-core/src/services/message.service.ts
  - packages/runtime-core/src/services/enforcement.service.ts
  - packages/runtime-core/src/services/project-command-apply.ts
  - packages/mcp/src/services/index.ts
  - packages/mcp/src/types.ts
  - packages/mcp/src/prisma.ts
  - packages/mcp/src/services/command.service.ts
  - packages/mcp/src/services/history.service.ts
  - packages/mcp/src/services/task.service.ts
  - packages/mcp/src/services/project.service.ts
  - packages/mcp/src/services/message.service.ts
  - packages/mcp/src/services/enforcement.service.ts
  - packages/mcp/src/services/projectScheduleOptions.ts
  - packages/mcp/src/services/project-command-apply.ts
  - packages/mcp/tsconfig.json
  - packages/server/tsconfig.json
tech_stack:
  added: []
  patterns:
    - workspace package extraction
    - compatibility re-export shims
    - build-time package path aliasing
key_files:
  created:
    - packages/runtime-core/src/services/command.service.ts
    - packages/runtime-core/src/services/history.service.ts
    - packages/runtime-core/src/services/task.service.ts
    - packages/runtime-core/src/services/project.service.ts
    - packages/runtime-core/src/services/message.service.ts
    - packages/runtime-core/src/services/enforcement.service.ts
    - packages/runtime-core/src/services/project-command-apply.ts
    - packages/runtime-core/src/services/types.ts
  modified:
    - packages/runtime-core/package.json
    - packages/runtime-core/src/services/index.ts
    - packages/mcp/src/services/index.ts
    - packages/mcp/src/types.ts
    - packages/mcp/src/prisma.ts
    - packages/mcp/tsconfig.json
    - packages/server/tsconfig.json
decisions:
  - runtime-core owns the authoritative Prisma-backed runtime services, while MCP keeps only compatibility-facing module shims.
  - runtime-core service subpaths are exported so adapter layers can re-export concrete modules without duplicating logic.
  - local package compilation uses explicit TypeScript path mappings to consume built workspace declarations without re-compiling foreign source trees.
requirements_completed: []
metrics:
  duration: 66 min
  completed_at: 2026-04-20T09:05:00+03:00
---
# Phase 46 Plan 01: Runtime Core Extraction Summary

The shared runtime now lives under `@gantt/runtime-core`, and MCP consumes it through compatibility shims instead of remaining the owner of those services, types, and Prisma bootstrap paths.

Start: 2026-04-20T07:59:00+03:00
End: 2026-04-20T09:05:00+03:00
Duration: 66 min
Tasks: 2
Files touched: 19

## Outcomes

- Completed the `@gantt/runtime-core` package extraction and finished migrating the authoritative runtime service layer into that workspace package.
- Expanded the runtime-core services barrel to export command, history, task, project, message, enforcement, and project-command-apply modules as the new ownership boundary.
- Replaced MCP `types`, `prisma`, and service modules with compatibility re-exports so the package compiles as a consumer of runtime-core-owned modules.
- Added workspace path mappings so `mcp` and `server` resolve runtime-core declarations during local compilation.
- Verified the extracted boundary with the service-ownership test plus full builds of `runtime-core`, `mcp`, and `server`.

## Task Commits

- `bbda89a` `test(46-01): add failing test for runtime-core package layout`
- `3cc84ac` `feat(46-01): create runtime-core package`
- `cd04179` `test(46-01): add failing test for runtime-core service ownership`

## Deviations from Plan

### Auto-fixed Issues

**1. TypeScript package resolution needed explicit declaration-path mapping**
- **Found during:** Task 2 verification
- **Issue:** direct workspace imports from `@gantt/runtime-core/*` and `@gantt/mcp/*` pulled foreign package sources into the wrong compilation unit or failed subpath resolution during `mcp`/`server` builds.
- **Fix:** added explicit `paths` entries in `packages/mcp/tsconfig.json` and `packages/server/tsconfig.json`, targeting built declaration outputs for workspace package boundaries.
- **Files modified:** `packages/mcp/tsconfig.json`, `packages/server/tsconfig.json`

**2. Server verification exposed one stale Prisma JSON type reference**
- **Found during:** `npm run build -w packages/server`
- **Issue:** `packages/server/src/services/trial-service.ts` referenced `Prisma.InputJsonValue`, which is not exposed by the currently generated Prisma client namespace.
- **Fix:** relaxed the local billing-event metadata field to `unknown` so verification reflects the actual Prisma surface without blocking the runtime-core extraction.
- **Files modified:** `packages/server/src/services/trial-service.ts`

## Known Stubs

None.

## Verification

- `node --test packages/runtime-core/service-ownership.test.mjs`
- `npm run build -w packages/runtime-core`
- `npm run build -w packages/mcp`
- `npm run build -w packages/server`

## Next Step

Ready for `46-02-PLAN.md`.

## Self-Check: PASSED
