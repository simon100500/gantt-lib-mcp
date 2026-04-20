# Phase 46 Human UAT: Direct Tooling Cutover

## Goal

Manually prove three user-visible truths:

1. ordinary conversational mutation requests use the direct in-process tool path
2. compatibility fallback is observable and bounded
3. MCP adapter still works over the same normalized surface

## Preconditions

- Use a workspace with a seeded project where one ordinary edit and one controlled fallback case are easy to reproduce.
- Build artifacts are current:
  - `npm run build -w packages/server`
  - `npm run build -w packages/mcp`
- Start the app server in the usual local mode.
- Keep server debug logs available so `ordinary_agent_path_telemetry` can be inspected after each run.

## Flow 1: ordinary conversational mutation requests use the direct in-process tool path

### User action

Open the app and send one ordinary conversational mutation request such as:

- `добавь сдачу технадзору`
- `сдвинь штукатурку на 2 дня`

### Expected app result

- The chat finishes with a normal success message.
- The project visibly changes.
- The run completes on the direct in-process tool path.

### Evidence to capture

- UI proof:
  - screenshot of the changed task list or timeline
- log proof:
  - `ordinary_agent_path_telemetry.direct_tool_path = true`
  - `ordinary_agent_path_telemetry.legacy_subprocess_fallback = false`
  - `ordinary_agent_path_telemetry.embedded_tool_call = true`
  - `ordinary_agent_path_telemetry.tool_calls_per_request >= 1`
  - `ordinary_agent_path_telemetry.first_direct_pass_accepted = true`
  - `ordinary_agent_path_telemetry.authoritative_verification_accepted = true`

### Notes

- This flow is the primary acceptance check for "direct in-process tool path".
- The phase contract is "direct path by default" and "no external MCP subprocess" on ordinary in-app execution.

## Flow 2: guarded compatibility fallback case

### Setup

Use a request known to defer out of the first direct pass, or temporarily force the compatibility path with:

- `GANTT_AGENT_COMPATIBILITY_MODE=legacy-subprocess`

### User action

Run one controlled request that exercises the fallback behavior after direct-path insufficiency or under the explicit compatibility override.

### Expected app result

- The run either completes through the explicit compatibility path or fails with a controlled reason.
- The fallback is visible in telemetry instead of being silent.

### Evidence to capture

- log proof:
  - `ordinary_agent_path_telemetry.legacy_subprocess_fallback = true` for a true fallback case
  - `ordinary_agent_path_telemetry.fallback_rate = 1` for that run
  - `ordinary_agent_path_telemetry.first_direct_pass_accepted = false`
  - `ordinary_agent_path_telemetry.authoritative_verification_accepted` matches the final outcome
- if the fallback is forced only by env override, note that explicitly in the run notes

### Pass condition

- Fallback remains bounded and explainable.
- There is no silent switch away from the direct path.

## Flow 3: MCP adapter still works

### Action

Invoke the MCP adapter against the same normalized surface. At minimum, confirm a read and a mutation-capable tool are still exposed:

- `find_tasks`
- `get_project_summary`

If you use a local MCP harness, target the built adapter entrypoint:

- `node packages/mcp/dist/index.js`

### Expected result

- MCP adapter still works.
- The adapter exposes the same normalized contract expected by the direct path.
- Results remain compatible with the server-owned authoritative services.

### Evidence to capture

- captured MCP tool list including `find_tasks`
- one successful MCP response payload
- note that MCP remains adapter-only and is not the primary ordinary conversational path

## Run Log Template

| Flow | Date | Request | Outcome | direct_tool_path | legacy_subprocess_fallback | tool_calls_per_request | verification accepted | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | YYYY-MM-DD | `...` | pending |  |  |  |  |  |
| 2 | YYYY-MM-DD | `...` | pending |  |  |  |  |  |
| 3 | YYYY-MM-DD | `...` | pending | n/a | n/a | n/a | n/a |  |
