---
status: verifying
trigger: "Investigate issue: repeated-fragment-floor-milestone"
created: 2026-04-14T00:00:00+03:00
updated: 2026-04-14T00:00:00+03:00
---

## Current Focus

hypothesis: the no-op is fixed by keeping all matched floor groups in resolution and synthesizing a single-node repeated fragment when semantic extraction omits fragmentPlan
test: run targeted mutation tests covering multi-group resolution, synthesized repeated milestone fan-out, and execution type preservation
expecting: repeated floor milestone prompt completes in staged mutation with `create_tasks_batch` and no legacy deferral
next_action: execute targeted test suite for mutation resolver/plan builder/execution/orchestrator

## Symptoms

expected: The system should append one milestone `Сдача технадзору` under every floor container across all sections, e.g. every `Секция X, Y этаж` node.
actual: UI shows no change. No MCP tool call was recorded for run `9abc7bb0-2e39-47e9-b480-d57876642a6c`.
errors: No explicit error. Trace reaches `route_selection = mutation`, `intent_classified = add_repeated_fragment`, `resolution_result`, `mutation_plan_built`, `agent_prompt_built`, then stops. `mutation_plan_built` returned `operations: []`, `why: "Недостаточно структурированных semantic данных для repeated fragment plan."`, `needsAgentExecution: true`.
reproduction: 1) Generate project from `График штукатурки стен на 5 секциях по 3 этажа на каждой. Работа в два потока параллельно на разных секциях`. 2) Send `На каждом этаже добавь работу (веху) Сдача технадзору`. 3) Observe no visible changes and no MCP tool call.
started: Confirmed on 2026-04-14. User hypothesis says this is not primarily a Phase 43 regression.

## Eliminated

## Evidence

- timestamp: 2026-04-14T00:00:00+03:00
  checked: required handoff and mutation pipeline files
  found: `resolveMutationContext()` handles `add_repeated_fragment` by taking only `groupScopes[0]` and copying only that group's `memberTaskIds`
  implication: repeated-fragment scope can collapse to a single matched group even when multiple homologous groups exist

- timestamp: 2026-04-14T00:00:00+03:00
  checked: `buildMutationPlan()` repeated fragment branch
  found: missing `intent.fragmentPlan` or empty `groupMemberIds` returns deterministic plan failure with `needsAgentExecution: true`
  implication: semantic extraction must supply a structured fragment plan or the request is forced onto legacy fallback

- timestamp: 2026-04-14T00:00:00+03:00
  checked: `TaskService.findGroupScopes()` and mutation tests
  found: group scopes are partitioned by immediate parent and existing resolver test coverage only models a single returned scope
  implication: a real section x floor hierarchy can legitimately produce multiple scope buckets, but the current staged path is not tested to union them

- timestamp: 2026-04-14T00:00:00+03:00
  checked: mutation execution routing and command support
  found: `add_repeated_fragment` always runs in `hybrid` mode, but server execution already supports `fanout_fragment_to_groups`; only the absence of `fragmentPlan` causes deferral. MCP command types also support milestone creation.
  implication: this request can be fixed safely server-side without relying on legacy agent fallback

## Resolution

root_cause:
fix: aggregate all repeated-fragment group scopes in staged resolution, synthesize a one-node repeated fragment for simple repeated task requests, and preserve milestone typing through mutation execution
verification:
files_changed: [packages/server/src/mutation/types.ts, packages/server/src/mutation/intent-classifier.ts, packages/server/src/mutation/plan-builder.ts, packages/server/src/mutation/execution.ts, packages/server/src/mutation/plan-builder.test.ts, packages/server/src/mutation/orchestrator.test.ts, packages/server/src/mutation/execution.test.ts]
