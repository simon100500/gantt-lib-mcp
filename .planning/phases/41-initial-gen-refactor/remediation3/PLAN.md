# Remediation 3 Plan: Incremental Initial Generation

## Problem Statement

The current remediation still misses the product goal in practice:

- work appears in the UI only at the very end
- the first visible result can take several minutes
- token spend is too high for a starter schedule
- task names are too long and overloaded
- legacy execution paths still exist and create ambiguity

Observed from logs on April 8, 2026:

- progressive commits can already happen server-side
- but task broadcasts still happen only once at the end
- recent successful run produced around 100 visible tasks and 130 task nodes in planning
- this is too large for first-pass generation

The next remediation must optimize for:

1. early visible progress
2. bounded first-pass scope
3. predictable naming
4. one active runtime path only

## Target Product Behavior

For an empty project and a broad request like:

- `График строительства жилого дома на 3 этажа + гараж`

the system must:

1. create top-level phases first and show them in the graph immediately
2. expand phases one by one directly into the graph
3. broadcast task updates after each successful commit
4. stop at a bounded starter schedule size
5. leave the user with a usable partial result even if a later phase fails

The first visible result should appear quickly, before full generation finishes.

## Key Decisions

### 1. Commit skeleton first

Keep the new staged architecture, but make the skeleton commit a first-class user-visible milestone.

Required:

- top-level phases commit first
- immediate `tasks` websocket broadcast after skeleton commit
- optional assistant progress event later, but task visibility is primary

### 2. Expand one phase at a time

Do not wait for all expansions to finish before updating the graph.

Required:

- expand one phase
- compile only the currently available partial plan
- commit child tasks for that phase
- broadcast updated tasks immediately
- continue to next phase

### 3. Enforce a first-pass budget

The starter schedule should be intentionally compact.

Recommended first-pass hard limits:

- 4 to 6 top-level phases
- 3 to 5 child tasks per phase
- 24 to 30 task nodes total
- no more than 2 entry tasks in one phase

This is not a detailed production WBS.
It is the first usable baseline.

Detailed expansion should become a later explicit operation.

### 4. Shorten task titles

Task names must be concise and graph-friendly.

Rules:

- target 30 to 55 characters
- hard cap around 70 characters
- avoid long comma-separated enumerations
- one action + one object
- no narrative phrasing

Examples:

- good: `Разработка котлована`
- good: `Монтаж кровли`
- bad: `Монтаж дренажа, выпусков канализации, вводов водоснабжения и гильз под коммуникации`

### 5. Remove runtime legacy paths

There must be one active initial-generation execution model.

Remove from runtime path:

- legacy one-shot planner assumptions
- compile-time salvage behavior as a primary path
- old ambiguity between staged generation and monolithic execution

If old modules remain for tests or migration, they must not be reachable from the production flow.

## Workstreams

## Workstream 1: Immediate Broadcasts

Files:

- `packages/server/src/initial-generation/orchestrator.ts`

Deliver:

- broadcast tasks after skeleton commit
- broadcast tasks after each phase commit
- avoid waiting until `finishSuccessfulRun` for first visible UI state

Acceptance:

- logs show multiple `tasks_broadcast` events in one initial-generation run
- top-level phases appear before full generation completes

## Workstream 2: Bounded Starter Scope

Files:

- `packages/server/src/initial-generation/skeleton-planner.ts`
- `packages/server/src/initial-generation/phase-expander.ts`
- `packages/server/src/initial-generation/quality-gate.ts`

Deliver:

- explicit upper bounds for first-pass phases/tasks
- prompt instructions for compact starter scope
- quality gate rejects oversized first-pass output

Acceptance:

- broad house prompt no longer generates 100+ visible tasks on first pass
- final first-pass graph stays within defined budget

## Workstream 3: Compact Naming Policy

Files:

- `packages/server/src/initial-generation/skeleton-planner.ts`
- `packages/server/src/initial-generation/phase-expander.ts`
- possibly new helper module for title normalization

Deliver:

- short-title prompt rules
- post-LLM normalization or rejection for oversized titles
- tests for title length policy

Acceptance:

- generated task titles fit comfortably in the graph
- long enumerative titles are rewritten or rejected

## Workstream 4: Runtime Path Cleanup

Files:

- `packages/server/src/initial-generation/orchestrator.ts`
- `packages/server/src/initial-generation/executor.ts`
- any unused imports and stale tests

Deliver:

- one active initial-generation execution path
- remove dead runtime references to legacy flow
- keep test-only artifacts only if justified

Acceptance:

- production initial-generation path is unambiguous
- logs correspond only to incremental staged execution

## Workstream 5: Token-Cost Reduction

Files:

- `packages/server/src/initial-generation/skeleton-planner.ts`
- `packages/server/src/initial-generation/phase-expander.ts`

Deliver:

- smaller prompts
- less repeated context per phase
- no oversized previous payloads unless repairing a specific phase

Acceptance:

- lower latency and lower token spend on the same benchmark prompt

## Suggested Execution Order

1. add immediate broadcasts after each commit
2. add scope budget and title cap
3. retest the benchmark prompt manually
4. remove leftover runtime legacy path
5. tune prompts for token reduction

## Manual Verification Scenario

Prompt:

- `График строительства жилого дома на 3 этажа + гараж`

Expected:

- top-level phases visible quickly
- then phased expansion appears incrementally
- no manual dates from the model
- concise names
- total first-pass graph remains compact
- if failure occurs on a later phase, already committed graph stays visible

## Session Goal

Do not pursue more “generate everything then validate at the end”.

The immediate next session should focus on:

- progressive visibility
- bounded starter result
- short names
- runtime cleanup
