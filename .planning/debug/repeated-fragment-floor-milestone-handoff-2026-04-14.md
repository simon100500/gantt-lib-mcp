---
status: open
created: 2026-04-14T19:05:00+03:00
updated: 2026-04-14T19:05:00+03:00
area: mutation
topic: repeated-fragment floor milestone insertion
related_run_id: 9abc7bb0-2e39-47e9-b480-d57876642a6c
related_project_id: 1167467f-5c1a-418d-8bff-480415a1cf9d
---

# Handoff: repeated fragment insertion after initial generation

## Summary

This is not primarily a Phase 43 regression.

The initial generation for the project worked as intended for the prompt:

`График штукатурки стен на 5 секциях по 3 этажа на каждой. Работа в два потока параллельно на разных секциях`

The follow-up mutation request failed:

`На каждом этаже добавь работу (веху) Сдача технадзору`

Expected behavior:
- The system should identify every floor group created by the initial schedule.
- It should append one new milestone task under each floor container such as:
  - `Секция 1, 1 этаж`
  - `Секция 1, 2 этаж`
  - `Секция 1, 3 этаж`
  - ...
  - `Секция 5, 3 этаж`

Actual behavior:
- Nothing visible happened in the UI.
- No MCP tool call was recorded for the run.

## Key Finding

The request reached the mutation pipeline and was classified as `add_repeated_fragment`, but the staged planner did not produce a structured repeated-fragment plan.

Then the request was deferred to the legacy MCP-agent path, and that path never produced:
- any `sdk_assistant_message`
- any `tool_call_received`
- any `agent_attempt_failed`
- any `agent_run_failed`
- any `agent_response_saved`

This means there are two separate issues:

1. The repeated-fragment semantics are underspecified or incorrectly modeled for this schedule shape.
2. The fallback legacy path can fail silently after `agent_prompt_built`.

## Evidence

### Initial generation succeeded

See:
- `.planning/debug/server-agent.log`
- run `aa41b322-59da-4c36-a075-30c46c7a43f8`

Relevant events:
- `initial_generation_interpretation`
- `planner_query_response`
- `initial_generation_result`
- `agent_run_completed`

The generated project clearly contains per-section and per-floor containers such as:
- `Штукатурные работы: Секция 1`
- `Секция 1, 1 этаж`
- `Секция 1, 2 этаж`
- `Секция 1, 3 этаж`

### Failing follow-up mutation

See:
- `.planning/debug/server-agent.log`
- run `9abc7bb0-2e39-47e9-b480-d57876642a6c`

Observed sequence:
- `rest_chat_received`
- `agent_run_started`
- `route_selection` = `mutation`
- `intent_classified` = `add_repeated_fragment`
- `resolution_result`
- `mutation_plan_built`
- `agent_env_resolved`
- `model_routing_decision`
- `agent_prompt_built`

Then the trace stops.

### No MCP invocation

See:
- `.planning/debug/mcp-agent.log`

There is no `tool_call_received` for:
- `aiRunId = 9abc7bb0-2e39-47e9-b480-d57876642a6c`

So the failure happened before the MCP server handled any tool call.

## Important interpretation mistake

The system resolved the scope too narrowly.

In `resolution_result` for run `9abc7bb0-2e39-47e9-b480-d57876642a6c`:
- `selectedContainerId` points to `Штукатурные работы: Секция 1`
- `groupMemberIds` contain only three floor containers

That means the resolver interpreted "на каждом этаже" as "on each floor inside one matched section" instead of:
- all floor containers in the current generated fragment
- or all containers whose title pattern matches `Секция X, Y этаж`

This strongly suggests the real modeling gap is in repeated-fragment scope detection and fragment-plan synthesis, not in Phase 43's route interpretation boundary.

## Working hypothesis

The mutation stack lacks a robust concept of:
- repeated insertion across all homologous containers created by initial generation
- especially when the user refers to a structural class like "каждый этаж" rather than a single named container

Current behavior seems to rely on a narrow resolver hit plus optional semantic fragment-plan generation.
That is too fragile for schedules that were generated from a structured location grid.

## Better product expectation

For schedules generated from prompts like:
- `5 секций`
- `3 этажа на каждой`

the mutation layer should preserve or reconstruct the location lattice:
- section
- floor
- section x floor

Then a request like:
- `На каждом этаже добавь работу (веху) Сдача технадзору`

should compile deterministically into:
- append one milestone under every floor container
- without needing legacy MCP-agent fallback

## Suggested investigation direction

1. Inspect how `findGroupScopes()` and repeated-fragment resolution choose candidate groups.
2. Inspect how `groupScopeHint: "этаж"` is mapped when multiple sections each contain floor nodes.
3. Inspect why only Section 1 was selected as the repeated-fragment root.
4. Inspect why `buildMutationPlan()` received no `fragmentPlan` for this shape.
5. Add a deterministic repeated-fragment path for "append identical task to every matched container".
6. Treat floor containers from initial generation as first-class structural targets, not just free-text names.
7. Fix legacy fallback so it can never fail silently after `agent_prompt_built`.

## Suspect files

- `packages/server/src/mutation/resolver.ts`
- `packages/server/src/mutation/types.ts`
- `packages/server/src/mutation/intent-classifier.ts`
- `packages/server/src/mutation/plan-builder.ts`
- `packages/server/src/mutation/orchestrator.ts`
- `packages/server/src/agent.ts`

## Minimal repro

1. Create empty project.
2. Send:
   `График штукатурки стен на 5 секциях по 3 этажа на каждой. Работа в два потока параллельно на разных секциях`
3. Confirm generated structure includes per-section and per-floor containers.
4. Send:
   `На каждом этаже добавь работу (веху) Сдача технадзору`
5. Observe:
   - no visible project change
   - no MCP tool call for run `9abc7bb0-2e39-47e9-b480-d57876642a6c`

## Good fix criteria

- No fallback to legacy agent is needed for this request.
- The resolver identifies all floor containers across all sections.
- The plan builder emits deterministic append operations for every matched floor node.
- The resulting changed set includes one new milestone per floor container.
- If fallback is ever used, failure must be explicit and user-visible, never silent.
