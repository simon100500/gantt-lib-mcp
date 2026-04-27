# Phase 46: mcp-replace - Context

**Gathered:** 2026-04-19
**Status:** Ready for planning
**Source:** PRD Express Path (`.planning/reference/46-DIRECT-TOOLS-REPLAN.md`)

<domain>
## Phase Boundary

Phase 46 replaces the ordinary in-app MCP subprocess path with direct in-process tool execution while preserving the product contract introduced by the mutation-refactor work:

- agent-first interpretation stays in `packages/server`
- the normalized typed tool surface stays small and explicit
- authoritative validation and command execution stay server-owned
- verification remains based on authoritative changed-set outcomes

The primary runtime path after this phase is:

`user request -> server agent orchestrator -> in-process tool handlers -> authoritative services -> verification -> user response`

MCP is retained only as a secondary adapter path for future CLI, external agent, or ecosystem integrations.
</domain>

<decisions>
## Implementation Decisions

### Architecture Contract
- The default app path must stop spawning `packages/mcp/dist/index.js` for ordinary conversational mutation requests.
- `@qwen-code/sdk` remains the orchestrator for the main app path.
- The preferred direct integration is an SDK-embedded MCP server using in-process tool handlers, so the model keeps the same tool semantics without the external stdio boundary.
- The staged mutation shell remains available only as compatibility or safety fallback; it is not the preferred happy path for ordinary edits.

### Shared Runtime Ownership
- Create a new transport-neutral workspace package at `packages/runtime-core` with package name `@gantt/runtime-core`.
- Move Prisma bootstrap, shared normalized types, and authoritative Prisma-backed services that the app path depends on out of MCP-owned runtime locations and into `@gantt/runtime-core`.
- During migration, `@gantt/mcp` may temporarily re-export runtime-core modules for compatibility, but MCP must stop being the owner of the shared runtime.

### Tool Core Contract
- `@gantt/runtime-core` becomes the single source of truth for the normalized tool catalog, typed input/output contracts, handler wiring, and transport-neutral helper utilities.
- The canonical normalized tool surface for this phase is:
  - `get_project_summary`
  - `get_schedule_slice`
  - `find_tasks`
  - `get_task_context`
  - `create_tasks`
  - `update_tasks`
  - `move_tasks`
  - `shift_tasks`
  - `delete_tasks`
  - `link_tasks`
  - `unlink_tasks`
  - `recalculate_project`
  - `validate_schedule`
- MCP-specific request/response shaping must live only in the adapter layer; business logic and tool semantics must live in the shared tool core.

### Server Execution Path
- The ordinary server mutation path must expose the shared normalized tools in-process to the Qwen SDK.
- `packages/server` must depend directly on `@gantt/runtime-core` rather than depending on `@gantt/mcp` for core runtime services.
- The legacy subprocess path may remain behind an explicit compatibility flag during migration, but not as the default path.

### Adapter Rules
- `packages/mcp/src/index.ts` becomes a thin transport adapter over the shared tool catalog and shared handlers.
- `packages/mcp/src/public-tools.ts` must stop being a second manually maintained source of truth for tool definitions.
- The MCP adapter must preserve public tool parity with the direct path and must not add unique business logic that the direct path lacks.

### Verification and Rollout
- The phase must prove that ordinary server execution uses the direct in-process path by default.
- The phase must prove MCP adapter parity on the normalized tool surface.
- The phase must add telemetry and verification artifacts that compare direct-path behavior, fallback rate, and tool usage against the old subprocess-oriented assumptions.

### the agent's Discretion
- Exact file/module subdivision inside `packages/runtime-core/src/` as long as transport-neutral ownership is clear.
- Whether the SDK-embedded integration is exposed through one factory or a small set of builder helpers, as long as `packages/server/src/agent.ts` consumes one in-process tool surface.
- Exact test file names and harness placement, as long as direct-path behavior, adapter parity, and fallback telemetry are locked with automated coverage.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase Sources
- `.planning/reference/46-DIRECT-TOOLS-REPLAN.md` — replacement PRD for the direct in-process tooling architecture
- `.planning/reference/mcp-mutation-refactor-prd.md` — product contract and normalized tool philosophy that Phase 46 must preserve
- `.planning/ROADMAP.md` — current phase boundary and dependency on Phase 45
- `.planning/STATE.md` — accumulated architecture decisions through Phase 45

### Server Runtime Boundary
- `packages/server/src/agent.ts` — current agent orchestration, staged mutation path, and legacy subprocess MCP fallback
- `packages/server/src/mutation/orchestrator.ts` — staged mutation shell that becomes compatibility-only
- `packages/server/src/mutation/execution-routing.ts` — current routing between mutation execution modes
- `packages/server/package.json` — server runtime dependency boundary and build chain

### MCP-Owned Surface To Demote
- `packages/mcp/src/index.ts` — current MCP transport plus tool business logic that must be reduced to adapter-only responsibilities
- `packages/mcp/src/public-tools.ts` — current normalized tool catalog definition
- `packages/mcp/src/types.ts` — current shared normalized types that should move under transport-neutral ownership
- `packages/mcp/src/services/index.ts` — current barrel exporting Prisma-backed services for server consumption
- `packages/mcp/src/services/command.service.ts` — authoritative command commit path that must remain shared
- `packages/mcp/src/services/history.service.ts` — history/version service currently owned under MCP
- `packages/mcp/src/services/task.service.ts` — task read service currently owned under MCP
- `packages/mcp/prisma/schema.prisma` — Prisma schema and runtime assumptions that the extracted core must continue to honor

### SDK Integration
- `.planning/reference/sdk-typescript.md` — local Qwen SDK reference showing SDK-embedded MCP servers via `tool()` and `createSdkMcpServer()`
</canonical_refs>

<specifics>
## Specific Ideas

- Preserve the normalized tool semantics instead of replacing them with ad hoc direct function calls.
- Prefer one shared tool catalog consumed by both the server direct path and the MCP adapter.
- Use the direct-path cutover to make `packages/server` stop importing `@gantt/mcp/services`, `@gantt/mcp/types`, and `@gantt/mcp/prisma` as runtime ownership boundaries.
- Keep authoritative result verification, changed-task accounting, and structured fallback messaging intact through the cutover.
</specifics>

<deferred>
## Deferred Ideas

- Removing the MCP adapter entirely from the repository. This phase keeps MCP as a supported secondary transport.
- Expanding the normalized tool surface beyond the direct-tooling replan unless required to preserve parity with the PRD contract.
</deferred>

---

*Phase: 46-mcp-replace*
*Context gathered: 2026-04-19 via PRD Express Path*
