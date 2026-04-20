---
phase: 46-mcp-replace
verified: 2026-04-20
status: gaps_found
score: 4/6 acceptance criteria met
gaps:
  - The direct in-process tool loop is not the primary ordinary path yet; staged mutation still runs first and can return before direct tools execute.
  - Staged mutation is not fallback-only in the current control flow.
  - Human UAT evidence and real automatic fallback telemetry are still missing.
---

# Phase 46 Verification Report

## Goal

Prove the Phase 46 replan shipped the direct-tooling architecture:

1. ordinary requests no longer require `packages/mcp/dist/index.js`
2. the primary app path uses shared in-process handlers
3. Prisma-backed authoritative services are no longer MCP-owned
4. MCP still works as an adapter over the same normalized contracts
5. staged mutation is fallback-only
6. tests and live checks prove direct-path behavior, parity, and telemetry quality

## Verdict

`gaps_found`

Phase 46 made substantial architectural progress and completed all planned implementation work, but it does not yet satisfy the core replan contract that the direct in-process tool loop is the primary ordinary path and staged mutation is fallback-only.

## Acceptance Criteria Review

| # | Acceptance Criteria | Verdict | Evidence |
| --- | --- | --- | --- |
| 1 | ordinary conversational mutation requests no longer require `packages/mcp/dist/index.js` | PASS | [packages/server/src/agent/direct-tools.ts](../../../packages/server/src/agent/direct-tools.ts) defaults to `createSdkMcpServer(...)`; the subprocess path is explicit opt-in only. |
| 2 | the primary app path uses shared in-process handlers | FAIL | [packages/server/src/agent.ts](../../../packages/server/src/agent.ts) still invokes `runStagedMutation()` before the ordinary direct tool loop and can return early on staged success. |
| 3 | Prisma-backed authoritative services are no longer MCP-owned | PASS | Shared ownership now lives in `@gantt/runtime-core`, while MCP re-exports runtime-core modules through [packages/mcp/src/services/index.ts](../../../packages/mcp/src/services/index.ts), [packages/mcp/src/types.ts](../../../packages/mcp/src/types.ts), and [packages/mcp/src/prisma.ts](../../../packages/mcp/src/prisma.ts). |
| 4 | MCP still works as an adapter over the same normalized contracts | PASS | [packages/mcp/src/index.ts](../../../packages/mcp/src/index.ts) delegates through shared `executeToolCall()`, and [packages/mcp/src/public-tools.ts](../../../packages/mcp/src/public-tools.ts) derives the list from `NORMALIZED_TOOL_CATALOG`. |
| 5 | staged mutation is fallback-only | FAIL | Current control flow still makes staged mutation the first path for likely mutations instead of a post-direct fallback. |
| 6 | tests and live checks prove direct-path behavior, parity, and telemetry quality | PARTIAL | Automated tests and builds passed, but [46-HUMAN-UAT.md](./46-HUMAN-UAT.md) has no executed run log yet, and telemetry does not yet evidence a real automatic direct-to-legacy runtime fallback. |

## What Passed

- Direct server tooling no longer requires the ordinary path to spawn `packages/mcp/dist/index.js`.
- Shared runtime ownership is no longer MCP-owned; runtime-core is the transport-neutral boundary.
- MCP is now an adapter over the shared catalog and handlers rather than a separate business-logic owner.
- Automated parity and direct-path regression coverage passed:
  - `npx tsx --test packages/mcp/src/index.test.ts`
  - `npx tsx --test packages/runtime-core/src/tool-core/adapter-parity.test.ts`
  - `npx tsx --test packages/server/src/agent.direct-tools.test.ts`
  - `npm run build -w packages/mcp`
  - `npm run build -w packages/runtime-core`
  - `npm run build -w packages/server`

## Gaps Found

### 1. Direct path is not yet the primary ordinary path

In [packages/server/src/agent.ts](../../../packages/server/src/agent.ts), likely mutation requests still go through `runStagedMutation()` before the ordinary direct tool loop. When staged handling succeeds, the request returns before the direct in-process shared handler path executes.

Impact:
- The main architectural goal of the replan is not fully achieved.
- The direct tool loop is present, but it is not the default first execution path for ordinary conversational mutations.

### 2. Staged mutation is not fallback-only

The replan required staged mutation compatibility to become a bounded fallback. The current flow still treats staged mutation as the first-line path rather than a fallback entered after direct-path insufficiency or verification failure.

Impact:
- Acceptance criterion 5 is not met.
- Telemetry describing fallback remains conceptually ahead of the runtime behavior it is supposed to prove.

### 3. Manual and telemetry evidence is incomplete

[46-HUMAN-UAT.md](./46-HUMAN-UAT.md) exists, but the run log is still unfilled. In addition, `ordinary_agent_path_telemetry` currently summarizes the initial compatibility mode at the call site, so the repository does not yet contain evidence of a real automatic direct-to-legacy fallback run.

Impact:
- The closeout evidence is incomplete.
- Live proof of direct-path behavior, bounded fallback, and MCP adapter continuity is still pending.

## Recommended Gap Closure

1. Change `packages/server/src/agent.ts` so ordinary conversational mutations attempt the shared direct in-process tool loop first.
2. Move staged mutation behind a true fallback decision based on direct-path insufficiency, verification failure, or explicit safety gating.
3. Extend telemetry so it records final compatibility mode and can prove automatic fallback, not just env-forced legacy mode.
4. Execute the manual flows in [46-HUMAN-UAT.md](./46-HUMAN-UAT.md) and record the run log.

## Next Action

Use gap-closure planning for Phase 46.
