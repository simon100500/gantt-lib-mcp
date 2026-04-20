---
phase: 46-mcp-replace
verified: pending
status: ready_for_manual_closeout
score: pending
gaps: []
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

## Acceptance Criteria Traceability

| # | Acceptance Criteria | Evidence Target | Current Evidence |
| --- | --- | --- | --- |
| 1 | ordinary conversational mutation requests no longer require `packages/mcp/dist/index.js` | [packages/server/src/agent/direct-tools.ts](../../../packages/server/src/agent/direct-tools.ts), [packages/server/src/agent.direct-tools.test.ts](../../../packages/server/src/agent.direct-tools.test.ts) | `resolveOrdinaryAgentMcpServers()` defaults to `createSdkMcpServer(...)`; explicit legacy subprocess path remains opt-in only. |
| 2 | the primary app path uses shared in-process handlers | [packages/server/src/agent/direct-tools.ts](../../../packages/server/src/agent/direct-tools.ts), [packages/runtime-core/src/tool-core/handlers.ts](../../../packages/runtime-core/src/tool-core/handlers.ts) | direct tool definitions are built from `@gantt/runtime-core` catalog and execute through shared handlers in-process. |
| 3 | Prisma-backed authoritative services are no longer MCP-owned | [packages/runtime-core](../../../packages/runtime-core), [packages/server/src/agent.ts](../../../packages/server/src/agent.ts) | server direct path consumes shared runtime ownership through `@gantt/runtime-core`; MCP is no longer the primary ownership boundary for the ordinary path. |
| 4 | MCP still works as an adapter over the same normalized contracts | [packages/mcp/src/index.ts](../../../packages/mcp/src/index.ts), [packages/mcp/src/public-tools.ts](../../../packages/mcp/src/public-tools.ts), [packages/runtime-core/src/tool-core/adapter-parity.test.ts](../../../packages/runtime-core/src/tool-core/adapter-parity.test.ts) | Phase 46 Plan 04 locked adapter parity and shared-catalog delegation. |
| 5 | staged mutation is fallback-only | [packages/server/src/agent.ts](../../../packages/server/src/agent.ts), [packages/server/src/mutation/orchestrator.ts](../../../packages/server/src/mutation/orchestrator.ts) | ordinary-path telemetry now records `direct_tool_path`, `legacy_subprocess_fallback`, and first-pass verification acceptance; deferred legacy execution stays explicit. |
| 6 | tests and live checks prove direct-path behavior, parity, and telemetry quality | [packages/server/src/agent.direct-tools.test.ts](../../../packages/server/src/agent.direct-tools.test.ts), [46-HUMAN-UAT.md](./46-HUMAN-UAT.md) | automated assertions lock direct path by default, fallback-only semantics, and accepted mutation verification synchronization; manual UAT covers live direct path and MCP adapter checks. |

## Architecture Evidence

### Direct path implementation

- `packages/server/src/agent/direct-tools.ts`
  - `createSdkMcpServer`
  - `buildDirectToolDefinitions`
  - `executeToolCall`
- `packages/server/src/agent.ts`
  - `ordinary_agent_path_telemetry`
  - `direct_tool_path`
  - `legacy_subprocess_fallback`
  - `embedded_tool_call`
  - `fallback_rate`

### Shared runtime ownership

- `@gantt/runtime-core`
  - normalized tool catalog
  - shared handlers
  - transport-neutral runtime ownership

### MCP adapter parity

- `packages/mcp/src/index.ts`
- `packages/mcp/src/public-tools.ts`
- `find_tasks` remains on the normalized shared surface

## Automated Verification

### Commands executed

- `npx tsx --test packages/server/src/agent.direct-tools.test.ts`
- `npm run build -w packages/server`

### Current status

- PASS: direct-path regression suite
- PASS: server build, including dependent runtime-core and MCP builds

### Commit evidence

- `177ed11` `feat(46-05): add direct-path telemetry evidence`
- `9e5a534` `test(46-05): add failing direct-path telemetry coverage`
- `6c2596a` `feat(46-04): thin MCP into runtime-core transport adapter`
- `4e2f0d5` `test(46-04): lock MCP adapter parity with direct handlers`

## Telemetry Review Points

Inspect `ordinary_agent_path_telemetry` for:

- `fallback rate`
- `tool calls per request`
- `verification failure rate`
- `direct_tool_path`
- `legacy_subprocess_fallback`
- `first_direct_pass_accepted`
- `authoritative_verification_accepted`

## Manual Closeout Checklist

- Run the flows in [46-HUMAN-UAT.md](./46-HUMAN-UAT.md).
- Capture one successful ordinary conversational mutation request on the direct in-process tool path.
- Capture one controlled fallback case.
- Capture one MCP adapter proof against the shared normalized surface.
- Record run IDs, requests, and outcomes in the UAT table.

## Final Phase Evidence To Attach

- log excerpt for `ordinary_agent_path_telemetry`
- screenshot or exported task diff from the direct-path run
- MCP adapter tool-list or invocation proof showing `find_tasks`
- any measured telemetry deltas for fallback rate, tool calls per request, and verification failure rate
