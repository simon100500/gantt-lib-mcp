# Remediation 5 Plan: Dependency Contract, Prompt Tightening, and Preview-First UX

## Summary

The current initial-generation flow is now able to complete a final batch commit, but it still misses the product goal in three visible ways:

1. task dependencies are silently lost, so the generated chart starts almost everything on the same date
2. the model still produces compound task/group titles that compress multiple construction operations into one node
3. the user waits too long before seeing anything useful

This remediation fixes those issues without reintroducing destructive validation that deletes generated work.

The plan is:

1. fix the dependency I/O contract so scheduling metadata survives parsing and compilation
2. tighten prompts so the model stops emitting compound work titles by instruction, not by hard rejection
3. split UX into `preview generation` and `authoritative commit`, so users see a provisional graph before the final DB write

## Problem Statement

### 1. Dependency graph is being dropped by the server parser

Observed runtime behavior:

- `scheduling_gate_verdict` reports `missing_dependency_graph`
- `dependencyCount: 0`
- `compiledDependencyCount: 0`
- the chart renders with tasks starting in parallel

Root cause:

- the scheduling prompt tells the model to reference dependencies by `taskKey`
- the parser currently reads dependency references from `nodeKey`
- valid model output can therefore be normalized into an empty dependency list

This is a server contract bug, not a model-quality issue.

### 2. Compound titles are still being generated

Observed bad examples:

- `Возведение несущих конструкций техподполья и обратная засыпка`
- `Укладка гидроизоляционного ковра и устройство парапетов`

These combine different operations, different readiness logic, and often different crews into one node.

Important constraint from product direction:

- do not reject or delete generated work because a title is compound
- do not solve this with hard post-generation blocking
- solve it in prompting and repair prompting

### 3. End-user latency is too high

Observed runtime behavior:

- initial generation can take long enough that the user sees no meaningful graph for too long
- even after planner progress exists on the server, the UI receives only the final committed `tasks` payload

This creates poor UX even when the final result eventually succeeds.

## Target Product Behavior

For a broad empty-project request such as:

- `График строительства детского сада на 3 этажа`

the system should:

1. generate a 3-level structure with concrete, single-operation task titles
2. preserve a non-trivial dependency graph through parser, planning output, compile, and DB commit
3. show a provisional graph in the UI before authoritative persistence completes
4. commit only one final accepted schedule to the database

The preview may be provisional.
The DB state must remain authoritative.

## Non-Goals

This remediation does not aim to:

- add hard blocking validation for compound titles
- delete, prune, or silently rewrite generated tasks because their wording is imperfect
- reintroduce the old `skeleton -> per-phase expansion` runtime pipeline
- make the preview state authoritative in the database

## Key Decisions

### 1. Fix dependency parsing at the contract boundary

The scheduling stage must accept dependency references from the shape the prompt actually requests.

Required compatibility:

- accept `taskKey`
- accept `nodeKey` as backward-compatible fallback

The parser must not silently erase valid dependency references only because the field name differs.

### 2. Solve compound wording in prompts, not gates

Prompting must explicitly state:

- one task = one construction operation
- one title = one dominant completion criterion
- do not join different operations with `и`, `/`, `+`, or comma-style composition
- if the wording implies multiple operations, split them into separate tasks or separate subphases
- task-level compound formulations are not allowed

This instruction belongs in:

- the main structure prompt
- the structure repair prompt

The quality gate should remain focused on structural and technical correctness, not soft editorial preferences.

### 3. Add preview-first UX while keeping final commit authoritative

The user should see intermediate useful output before the final DB commit finishes.

The intended split is:

1. planner produces an accepted provisional structure or provisional scheduled plan
2. server broadcasts that result through WebSocket as preview-only data
3. UI renders the provisional graph locally
4. server compiles and commits the final schedule
5. UI receives authoritative persisted `tasks`

This gives fast perceived response without compromising DB consistency.

## Workstreams

## Workstream A: Dependency Contract Repair

### Goal

Ensure that valid dependency references from scheduling-model output survive normalization and reach the final compiled graph.

### Required changes

1. Update scheduled dependency normalization in `packages/server/src/initial-generation/planner.ts`

The parser must:

- read `taskKey` first when present
- fall back to `nodeKey`
- validate the resolved key against the structure task-key set
- preserve `type` and `lagDays`

2. Update tests for parser compatibility

Add regression coverage for:

- dependency objects using `taskKey`
- dependency objects using `nodeKey`
- malformed dependency objects still being ignored safely

3. Verify end-to-end metrics

After the fix, successful runs should no longer show:

- `dependencyCount: 0`
- `compiledDependencyCount: 0`

for plans that clearly contain dependency references in raw planner output.

## Workstream B: Prompt Tightening for Single-Operation Titles

### Goal

Reduce compound task naming at generation time without deleting tasks after generation.

### Required changes

1. Tighten structure prompt wording in `packages/server/src/initial-generation/planner.ts`

Add explicit instructions that:

- each task title must describe exactly one construction operation
- each subphase title must describe one coherent grouping, not multiple unrelated operations
- combined formulations are forbidden at task level
- if multiple operations are needed, they must be split into separate tasks

2. Tighten structure repair prompt wording

The repair prompt must reiterate the same rule, because the repair call is where the model is most likely to compress work in order to satisfy other constraints.

3. Preserve soft behavior

Do not:

- add a new gate reason that rejects compound titles
- prune or mutate generated nodes just because wording is compound

The desired effect should come from generation guidance, not destructive post-processing.

## Workstream C: Preview-First UI and WebSocket Protocol

### Goal

Let the user see a provisional graph before final commit.

### Required changes

1. Extend WebSocket protocol in `packages/server/src/ws.ts`

Add a preview message type, for example:

- `preview_tasks`
- or `preview_plan`

The payload should be clearly marked provisional so the UI can render it without treating it as authoritative persisted state.

2. Broadcast preview from initial-generation orchestrator

At minimum, send preview after planning succeeds and before final commit starts.

Recommended first step:

- broadcast the compiled provisional task graph before commit

This avoids making the UI understand the nested planner structure directly if that is more expensive to integrate.

3. Update web client handling in `packages/web/src/App.tsx` and related state holders

The UI should:

- render provisional tasks immediately
- visually indicate preview/loading state
- replace provisional state with authoritative committed `tasks` when final commit succeeds
- clear or downgrade preview state if final commit fails

### Important boundary

Preview is UX only.
Database persistence remains a single final commit.

## Implementation Order

1. Fix dependency parsing and add parser regression tests
2. Tighten structure and repair prompts around single-operation titles
3. Add preview WebSocket message type and provisional UI rendering
4. Verify a live run against the kindergarten prompt

This order is intentional:

- first restore schedule correctness
- then improve generation quality
- then improve perceived latency

## Verification Plan

### Automated

1. Planner tests

Add tests proving that scheduled dependencies survive when the model returns:

- `dependsOn: [{ taskKey: ... }]`
- `dependsOn: [{ nodeKey: ... }]`

2. Build verification

Run:

- `npm run build -w packages/mcp`
- `npm run build -w packages/server`

3. WebSocket protocol tests if available

If the repo has protocol-level tests, add coverage for preview messages.

### Manual

Run the prompt:

- `График строительства детского сада на 3 этажа`

Expected:

1. logs show raw `planner_query_response` with dependency references
2. `scheduling_gate_verdict` no longer reports `dependencyCount: 0`
3. `compile_verdict` shows non-zero `compiledDependencyCount`
4. UI shows a provisional graph before final commit completes
5. final graph preserves dependencies instead of starting all tasks on the same day
6. task wording quality improves without tasks disappearing because of editorial checks

## Success Criteria

This remediation is complete when all are true:

1. valid dependency references from scheduling output survive normalization and reach final compile
2. successful initial-generation runs produce a non-zero dependency graph when the model returns dependencies
3. prompt wording materially reduces compound task titles without introducing destructive rejection behavior
4. the user sees a provisional graph before final persistence completes
5. final DB writes remain authoritative and single-commit

## Risks

### 1. Preview divergence

The provisional graph may differ from the final committed graph.

Mitigation:

- make preview state explicitly provisional in protocol and UI
- always replace it with authoritative committed tasks on success

### 2. Prompt tightening may not fully eliminate compound titles

This is acceptable as long as quality improves and tasks are not deleted by gate logic.

### 3. UI complexity increases

A preview state introduces an extra client state mode.

Mitigation:

- keep protocol explicit
- keep preview rendering additive, not a rewrite of the task store architecture
