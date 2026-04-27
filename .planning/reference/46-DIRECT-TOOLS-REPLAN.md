# Phase 46 Replan: Direct In-Process Tooling

## Summary

Phase 46 is re-scoped from "simplify the MCP mutation surface" to "extract tool core from MCP and move the application path to direct in-process tool execution".

This replan keeps the product goal from `.planning/reference/agent-tooling-simplification-prd.md`:

- agent-first interpretation
- small normalized typed tool surface
- authoritative server validation and execution
- verification-first mutation outcomes

But it changes the implementation strategy:

- `@qwen-code/sdk` remains the agent orchestrator
- the main app path stops spawning the external MCP stdio server for ordinary requests
- tool handlers and Prisma-backed domain services move into a shared in-process core
- MCP remains as an external adapter for future CLI / ecosystem / remote-agent use cases

## Why This Replan Exists

The current architecture pays for an extra protocol and process boundary on the critical mutation path:

- `packages/server/src/agent.ts` starts a Qwen SDK session
- Qwen SDK connects to `packages/mcp/dist/index.js` via `mcpServers`
- the MCP process then dispatches into Prisma-backed services

This was useful as an initial proof of hypothesis that an agent can drive tools through MCP.

Now that this hypothesis is validated, the same architecture is no longer the best default for the in-app product path. For ordinary conversational edits, the extra MCP subprocess and transport hop likely add avoidable latency and complexity without adding product value.

## Target Architecture

### Primary app path

`user request -> server agent orchestrator -> direct in-process tool handlers -> authoritative command execution -> verification -> user response`

### Optional external path

`external agent / CLI -> MCP adapter -> same shared tool handlers -> authoritative command execution -> verification`

### Layer split

#### 1. Agent orchestrator

Owned by `packages/server`.

Responsibilities:

- load prompt and session context
- run Qwen SDK
- expose the normalized tool surface to the model
- collect tool telemetry
- verify authoritative results
- decide compatibility fallback behavior

#### 2. Tool core

New shared in-process layer.

Responsibilities:

- define normalized typed tool contracts
- implement read and mutation handlers
- call authoritative services
- return normalized outcomes for verification and telemetry

This layer must not depend on MCP transport.

#### 3. Domain / persistence services

Prisma-backed authoritative services extracted away from MCP-specific ownership.

Responsibilities:

- task/project reads
- command execution
- history/version semantics
- schedule validation
- billing / enforcement hooks where applicable

#### 4. MCP adapter

Retained, but demoted to an optional adapter.

Responsibilities:

- expose the same normalized tool contracts over MCP
- translate MCP tool requests into calls to the shared tool core
- avoid owning business logic that the app path depends on

## Required Architecture Changes

### A. Extract shared tool core

Create a shared module boundary for the normalized tool catalog and handlers so both:

- direct in-process server execution
- MCP adapter execution

use the same implementation.

The shared core should include:

- canonical tool definitions
- typed input/output contracts
- handler registration
- normalized mutation result formatting
- shared validation helpers that are not transport-specific

### B. Move Prisma-backed services out of MCP ownership

`packages/mcp` should stop being the place that owns core domain services required by the application path.

Prisma-backed authoritative services currently living under `packages/mcp/src/services/*` and related shared runtime modules should be moved into a shared non-MCP-owned location so that:

- the server can import them directly without depending on the MCP package as a runtime boundary
- MCP can become a thin adapter over those services

The exact destination can be a new shared package or a shared server-owned core module, but it must be transport-neutral.

### C. Replace app-path MCP subprocess usage

In `packages/server/src/agent.ts`, ordinary agent requests should stop using:

- external stdio MCP server startup
- `node packages/mcp/dist/index.js` as the default tool execution path

Instead, the Qwen SDK integration should expose the normalized tools in-process.

Preferred implementation direction:

- first check whether `@qwen-code/sdk` can host SDK MCP servers in-process using the existing tool semantics
- if that fits cleanly, keep MCP semantics but remove the subprocess boundary
- if that still adds avoidable abstraction overhead, expose direct SDK-callable tools backed by the shared core

The key requirement is the same in both cases:

- no external MCP subprocess on the ordinary in-app mutation path

### D. Keep MCP as adapter-only

`packages/mcp/src/index.ts` should become a thin adapter that:

- imports shared tool definitions and handlers
- registers them for MCP transport
- performs MCP-specific request/response shaping only

It must not continue owning unique tool logic that diverges from the direct path.

### E. Re-scope staged mutation compatibility

The current staged mutation flow should remain only as compatibility / safety fallback where still justified.

It must no longer be the default product path.

Fallback decisions should be based on:

- authoritative tool results
- verification outcomes
- explicit ambiguity or safety limits

and not on enum-first preclassification before the first real tool loop.

## Execution Plan

### Step 1. Freeze the new architecture contract

Produce a revised Phase 46 context / verification basis that explicitly states:

- direct in-process tooling is now the primary app-path target
- MCP is retained as an external adapter, not as the main runtime boundary
- shared tool core and shared Prisma-backed services are required outputs of the phase

### Step 2. Extract shared domain ownership from `packages/mcp`

Refactor authoritative services and shared types out of MCP-owned runtime locations into a transport-neutral shared layer.

Minimum expected extractions:

- Prisma access bootstrap
- task/project services
- command execution service
- history/version support
- shared normalized types used by both server and MCP

### Step 3. Extract shared tool handlers

Introduce a shared tool-core module that defines and runs the normalized tool surface:

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

This module becomes the single source of truth for:

- tool metadata
- handler wiring
- normalized results

### Step 4. Switch the app path to direct in-process tools

Update `packages/server/src/agent.ts` so the ordinary Qwen SDK mutation loop uses the shared tool core directly in-process instead of the external MCP stdio server.

This step must preserve:

- prompt behavior
- typed validation
- verification logic
- accepted/rejected tool call accounting
- existing user-facing mutation completion semantics

### Step 5. Thin MCP into an adapter

Refactor `packages/mcp/src/index.ts` and related MCP registration code so it delegates to the shared tool core.

MCP must continue to work, but only as a transport shell over the same direct handlers.

### Step 6. Retune tests and live harnesses

Update regression and live E2E harnesses so they verify:

- ordinary server execution uses the direct in-process tool path
- MCP adapter still exposes the same normalized surface
- prompt/tool behavior remains agent-first
- fallback telemetry and verification remain correct
- latency and tool-count instrumentation can compare direct-path vs compatibility-path behavior

## Public Interfaces / Contracts

The normalized tool surface from the PRD remains the public contract.

The key contract change is architectural, not product-facing:

- before: server app path depends on MCP runtime boundary
- after: server app path depends on shared tool core directly

MCP remains supported, but as a secondary transport adapter over the same contracts.

## Acceptance Criteria

- ordinary conversational mutation requests no longer require spawning `packages/mcp/dist/index.js`
- the primary app path uses shared in-process tool handlers
- Prisma-backed authoritative services are no longer owned only by `packages/mcp`
- MCP still works against the same normalized tool contracts through an adapter layer
- staged mutation orchestration is fallback-only, not the default critical path
- tests prove direct-path behavior and MCP adapter parity on the normalized tool set
- live E2E coverage remains centered on end-user outcomes, tool efficiency, and verification quality

## Test Plan

### Static / structural checks

- server runtime no longer hardcodes external MCP subprocess startup for ordinary requests
- shared tool definitions are imported by both server direct path and MCP adapter
- MCP adapter contains transport wiring, not unique business logic

### Unit / integration checks

- direct in-process handlers return the same typed normalized outcomes as MCP-backed handlers
- authoritative changed IDs and verification inputs remain stable
- direct tool execution preserves accepted/rejected mutation accounting
- compatibility fallback still triggers only after direct-path verification says the first pass was insufficient

### Live E2E checks

Run the canonical scenario set from the PRD on the real prompt/tool loop and assert:

- successful completion rate
- fallback rate
- average tool calls per request
- unnecessary tool-call rate
- verification failure rate
- ambiguity handling quality

Where practical, compare direct-path execution against the old MCP subprocess path during migration to confirm the simplification does not degrade outcomes.

## Deliverables

- revised Phase 46 context or replacement replan document
- shared transport-neutral Prisma/service layer
- shared tool-core module for normalized tool handlers
- server agent integration using direct in-process tool execution
- MCP adapter refactored to delegate to shared handlers
- updated tests and live E2E harnesses
- verification notes documenting direct-path cutover and retained MCP role

## Assumptions

- `@qwen-code/sdk` can support an in-process integration path that removes the external MCP subprocess from the ordinary app flow
- preserving MCP for future CLI / external-agent use is still desirable, but not worth paying for on the app critical path
- the user prefers medium-term architectural cleanup over a minimal patch that only optimizes the current MCP path
- backward compatibility is required for tool contracts and authoritative mutation semantics, but not for keeping MCP as the default internal runtime boundary

## Recommended Follow-Up

Use this document as the replacement planning basis for Phase 46 and treat the existing `46-01`, `46-02`, and `46-03` plans as superseded where they assume MCP remains the primary internal execution path.
