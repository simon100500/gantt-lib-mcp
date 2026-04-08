# Remediation 4 Plan: Two-Step Initial Generation with 3-Level Hierarchy

## Summary

Replace the current `skeleton -> per-phase expansion -> compile` pipeline with a two-step pipeline split by task type:

1. `Structure planning` on the strong model
   Output: a 3-level tree `phases -> subphases -> tasks` without durations and without dependencies.

2. `Scheduling metadata` on the cheap model
   Output: add `durationDays` and dependencies to the existing leaf tasks.

3. `Deterministic compile`
   Persist and show the final schedule only after both model steps succeed and compile passes.

This keeps the AI-first approach, removes fan-out from multiple per-phase calls, and produces a richer starter schedule than the current 2-level graph.

## Problem Statement

The current runtime path has several structural failures:

- initial generation is still multi-call decomposition at runtime
- all phase expansions run sequentially against the same heavy model
- the starter schedule remains only 2 levels deep
- the model collapses unrelated work into summary phases
- naming quality degrades when the model tries to compress scope into too few top-level blocks

Observed bad example:

- `Инженерное оснащение и контур здания`

This is logically wrong because envelope closure and engineering systems are different workstreams with different sequencing, crews, and readiness conditions.

## Target Product Behavior

For an empty project and a broad prompt such as:

- `График строительства жилого дома на 3 этажа + гараж`

the system must:

1. build a real 3-level hierarchy
2. keep top-level phases logically clean and domain-specific
3. avoid summary or mixed phases
4. add realistic durations and task dependencies only after structure is locked
5. persist only the final accepted compiled result

The starter schedule must be usable, compact, and structurally richer than the current 2-level result.

## Key Decisions

### 1. Split by task type, not by phase count

Do not decompose initial generation into:

- skeleton
- phase 1 expansion
- phase 2 expansion
- phase 3 expansion
- ...

Instead, decompose it into two whole-project steps:

- structure generation
- scheduling metadata generation

This keeps the number of LLM calls bounded and avoids runtime fan-out.

### 2. Step 1 builds hierarchy only

The first model call is responsible only for:

- phases
- subphases
- leaf task naming
- hierarchy correctness
- domain specificity

The first call must not generate:

- durations
- dependencies
- dates
- scheduling metadata

Its purpose is to solve the hardest semantic problem first: a realistic, non-collapsed work breakdown structure.

### 3. Step 2 enriches only leaf tasks

The second model call receives the accepted structure from step 1 and adds only:

- `durationDays`
- task-level dependencies

The second step must not change:

- hierarchy
- titles
- grouping
- phase boundaries
- subphase boundaries

Any structural mutation from step 2 is a contract violation.

### 4. Persist a real 3-level schedule

The final compiled and persisted graph must contain:

- top-level phases
- subphases
- tasks

The 3-level hierarchy is not temporary planning scaffolding.
It is the actual starter schedule shown to the user.

### 5. Ban summary phases and mixed workstreams

Top-level phases must describe one logically coherent stage only.

Explicitly disallow:

- combining unrelated workstreams only to keep the number of phases low
- titles joined with `и`, `+`, or equivalent summary phrasing when the underlying work is heterogeneous
- umbrella phases that merge envelope, MEP, finishing, or commissioning into one block without clear separation

Examples that should fail the gate:

- `Инженерное оснащение и контур здания`
- `Кровля и внутренняя отделка`
- `Фасады + электрика`

## Contracts

### Step 1 Output Contract

Introduce a structural planning contract that supports 3 levels:

- `phase`
- `subphase`
- `task`

Equivalent nested representation is acceptable, but the compile layer must be able to reconstruct explicit 3-level persisted nodes.

Step 1 output must contain:

- project type
- assumptions
- hierarchy
- domain-specific titles

Step 1 output must not contain:

- `durationDays`
- dependency edges
- schedule dates

### Step 2 Output Contract

Step 2 takes the accepted step 1 structure and returns the same structure enriched with:

- `durationDays` on leaf tasks
- `dependsOn` on leaf tasks

Step 2 must not:

- create nodes
- delete nodes
- rename nodes
- move nodes
- merge nodes
- split nodes

## Prompt Rules

### Step 1 Prompt Rules

Prompt must explicitly require:

- 3 hierarchy levels
- domain-specific titles
- one coherent top-level phase per workstream
- no placeholder naming
- no summary or mixed top-level phases

Prompt must explicitly forbid:

- merged heterogeneous phases
- compressed umbrella naming
- durations
- dependencies
- dates

### Step 2 Prompt Rules

Prompt must explicitly require:

- durations on every leaf task
- realistic task-level dependency graph
- no cycles
- no broken references

Prompt must explicitly forbid:

- any change to hierarchy
- any title change
- any grouping change

## Quality Gates

### Structural Gate after Step 1

Check:

- hierarchy depth is exactly 3 levels where required
- top-level phases are coherent
- subphases are meaningful
- leaf tasks are concrete
- titles are domain-specific
- no placeholder names
- no summary or heterogeneous merged phases
- requested components such as `гараж` and `3 этажа` are reflected

Allow at most one repair pass on the strong model.

### Scheduling Gate after Step 2

Check:

- every leaf task has `durationDays`
- dependency graph exists and is non-trivial
- no cycles
- no broken references
- structure is byte-for-byte equivalent in hierarchy and naming to step 1, except for allowed metadata fields

Allow at most one repair pass on the cheap model.

## Runtime Rules

- No per-phase expansion calls inside initial generation
- No skeleton commit
- No partial persisted graph after step 1
- No intermediate task broadcasts before final compile
- Final UI state appears only after accepted compile result

## Latency and Cost Budget

Expected runtime profile:

- 1 strong call for structure
- 1 cheap call for durations and dependencies
- deterministic compile

Target outcome:

- materially lower latency than the current many-call runtime path
- materially lower cost than using the strong model for all expansions
- better hierarchy quality than the current one-shot shallow schedule

## Test Plan

### Functional

- broad empty-project house prompt generates a 3-level graph
- top-level phases are not summary blocks
- subphases exist and are meaningful
- leaf tasks receive durations and dependencies only after step 2

### Contract

- step 2 cannot alter structure from step 1
- compile consumes only accepted enriched plan
- no runtime `phase_expansion_*` path is used in initial generation

### Quality

- forbidden merged-phase examples fail the structural gate
- garage and floor-count requests appear in the hierarchy where relevant
- dependency graph is realistic and compiler-safe

### Performance

- initial generation uses exactly 2 primary LLM calls on success
- no fan-out by number of phases
- no heavy-model use on step 2

## Assumptions

- The user wants a real 3-level starter schedule, not a temporary internal WBS.
- The strongest semantic value of the model is in building the hierarchy first.
- Duration and dependency enrichment is a cheaper, more mechanical task and can be routed to the cheap model.
- Future explicit phase expansion remains a separate feature and is out of scope for this remediation.
