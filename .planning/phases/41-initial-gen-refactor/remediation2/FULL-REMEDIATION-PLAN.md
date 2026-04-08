# Full Remediation Plan: Initial Generation v2

## Status

Drafted after observing real production failures on April 8, 2026.

Primary failing prompt:
- `График строительства жилого дома на 3 этажа + гараж`

Observed failure modes:
- old route path incorrectly entered `mutation`
- after routing was fixed, planner still produced a non-compiler-safe graph
- planner output passed a naive quality gate but failed deterministic compilation
- final user-visible result was controlled failure instead of a usable starter schedule

This plan replaces the current one-shot planner contract with a staged planning architecture that matches how large WBS schedules are naturally formed.

## Executive Summary

The current architecture asks one LLM response to do too much at once:
- infer domain
- define WBS
- choose schedule structure
- assign durations
- define dependency graph
- satisfy compiler constraints

That contract is too brittle.

The next iteration must split initial generation into explicit planning stages:

1. Route Decision
2. Skeleton WBS Planning
3. Phase-Level Expansion
4. Global Sequencing and Duration Pass
5. Deterministic Compilation
6. Commit

The key change is that the model no longer produces a single monolithic executable plan on the first pass.

Instead:
- first pass creates a good top-level WBS skeleton
- second pass expands each phase in scope
- third pass adds executable sequencing and durations in a compiler-safe structure

This mirrors how real planning tools and human planners work:
- define structure first
- detail one section at a time
- only then finalize sequencing logic

## Product Goal

For an empty project and a broad schedule creation prompt, the system must produce:
- a meaningful top-level WBS
- detailed child tasks inside each phase
- realistic task-level durations
- realistic task-level dependencies
- a compiler-safe executable plan
- one authoritative committed starter schedule

The result must be:
- broad enough to feel like a real baseline
- specific enough to be credible
- structurally valid for deterministic compilation

The system must not fail because the model used summary-style nodes, phase-to-phase links, or mixed abstraction levels.

## Why The Current Contract Fails

### Failure 1: Mixed abstraction levels

The planner currently returns one flat `ProjectPlan` where:
- phase containers
- executable tasks
- sequencing logic
- durations

all coexist in one structure.

The model naturally wants to express:
- phase ordering
- hierarchical summary nodes
- coarse-to-fine decomposition

But the compiler expects:
- strict `phase` containers with no dependencies
- strict `task` nodes with executable dependencies
- no mixed summary semantics

This mismatch causes valid planning intent to become compile-time rejection.

### Failure 2: The LLM is forced to finalize too early

For a large prompt like `жилой дом на 3 этажа + гараж`, the model is asked to:
- create the full WBS
- decide all durations
- decide all dependencies
- satisfy compile rules

in one answer.

That pushes the model toward unstable outputs:
- summary nodes with dependencies
- placeholder dependency references
- broad but non-executable phase graph
- oversized responses with internal inconsistency

### Failure 3: Current repair loop is too coarse

Today there is only one repair pass on the entire plan.

That is wrong for large schedules:
- one weak sub-tree should not require rewriting the full graph
- one invalid phase dependency should not collapse the whole plan
- one compiler issue should not trigger global plan restart

Repair must be localized.

## Target Architecture

## Stage 0: Route Decision

Keep the new agentic route decision.

Input:
- user message
- project state summary
- empty/non-empty flag
- recent conversation summary

Output:
- `initial_generation`
- `mutation`

Requirements:
- structured JSON only
- route confidence
- route reason
- route signals
- logged before any planning work

This stage is already conceptually correct and should remain.

## Stage 1: Skeleton WBS Planning

This is the first new core stage.

The model should produce only a high-level WBS skeleton.

It must not produce:
- executable task dependencies
- final durations for all detailed tasks
- compiler-ready graph

It must produce:
- top-level phases
- high-level child work packages
- optional scope notes
- optional phase ordering hints in a separate field

### Skeleton Output Contract

```ts
type ProjectWbsSkeleton = {
  projectType: string;
  assumptions: string[];
  phases: Array<{
    phaseKey: string;
    title: string;
    objective?: string;
    orderHint: number;
    dependsOnPhaseKeys?: string[];
    workPackages: Array<{
      workPackageKey: string;
      title: string;
      objective?: string;
    }>;
  }>;
};
```

Important:
- `dependsOnPhaseKeys` are only planning hints
- they are not executable task dependencies
- this output is not compiler input

### Skeleton Quality Floor

For broad construction generation:
- at least 4 top-level phases
- at least 3 work packages in each major phase unless explicitly justified
- no placeholder titles
- explicit object-type fit
- garage must appear explicitly when requested
- three-storey scope must affect the shell/superstructure section

### Why this stage helps

The LLM only needs to solve:
- what are the major sections
- what belongs inside each section
- what scope is implied by the prompt

That is easier and more stable than forcing immediate executable graph output.

## Stage 2: Phase Expansion

Each phase from the skeleton is expanded independently.

For each phase:
- feed the user prompt
- feed the domain brief
- feed the phase title and objective
- feed neighboring phase context
- ask the model to expand only this phase into executable tasks

### Phase Expansion Output Contract

```ts
type ExpandedPhasePlan = {
  phaseKey: string;
  tasks: Array<{
    nodeKey: string;
    title: string;
    durationDays: number;
    dependsOnWithinPhase: Array<{
      nodeKey: string;
      type: 'FS' | 'SS' | 'FF' | 'SF';
      lagDays?: number;
    }>;
    sequenceRole?: 'entry' | 'intermediate' | 'exit';
  }>;
};
```

Rules:
- only task nodes
- no nested summary nodes
- no top-level phase nodes in expansion output
- only within-phase dependencies allowed here
- cross-phase sequencing is deferred

### Why this stage helps

The model works on one local scope:
- `Подготовка территории`
- `Нулевой цикл`
- `Отделка`

This is dramatically easier than planning the entire project graph in one shot.

This also creates a future product capability:
- “детализируй отделку”
- “раскрой инженерные системы”
- “сделай WBS по гаражу подробнее”

## Stage 3: Global Sequencing and Duration Reconciliation

After phase expansions exist, server code performs a global reconciliation pass.

This stage can be model-assisted, but should be bounded and narrow.

Goal:
- connect expanded phases into a coherent executable plan
- add cross-phase task links
- preserve compiler-safe structure

This stage may be:
- rule-based first
- model-assisted later

### Recommended v1 implementation

Start with server-guided sequencing using:
- phase order from skeleton
- `sequenceRole` markers from expansion output
- deterministic heuristics for linking exit tasks to next-phase entry tasks

For example:
- exit tasks of `Предстроительная подготовка` -> entry tasks of `Подготовка территории`
- exit tasks of `Нулевой цикл` -> entry tasks of `Надземная часть`
- exit tasks of `Надземная часть` -> entry tasks of `Инженерные системы`
- closed-loop shell tasks -> entry tasks of `Отделка`

Then optionally run a small bounded model pass to refine only cross-phase links.

### Final Executable Plan Contract

```ts
type ExecutableProjectPlan = {
  projectType: string;
  assumptions: string[];
  nodes: Array<{
    nodeKey: string;
    title: string;
    kind: 'phase' | 'task';
    parentNodeKey?: string;
    durationDays: number;
    dependsOn: Array<{
      nodeKey: string;
      type: 'FS' | 'SS' | 'FF' | 'SF';
      lagDays?: number;
    }>;
  }>;
};
```

Hard rules:
- `phase` nodes may never carry dependencies
- only `task` nodes may carry dependencies
- phase nodes are containers only

## Stage 4: Deterministic Compiler

The compiler should remain deterministic and authoritative.

But its behavior must change in one important way:

The compiler should not act as a cleanup-based rescue layer for bad planning structure.

Today too much bad structure is pushed into compile/salvage.
That is the wrong layer.

The planner pipeline must hand the compiler an already compiler-safe executable plan.

Compiler responsibility:
- validation
- deterministic scheduling
- deterministic task ID generation
- authoritative `create_tasks_batch`

Compiler non-responsibility:
- repairing phase graph semantics
- deleting large parts of the plan to make it fit
- interpreting summary-level planning intent

If the executable plan violates basic structure:
- reject before compile
- send repair back to the correct earlier stage

## New Validation Model

Validation must be staged.

## Skeleton Gate

Checks:
- enough phases
- enough work packages
- object-specific scope is represented
- no generic labels
- major requested components are present

Examples:
- `гараж` must appear
- `3 этажа` must influence superstructure decomposition

## Phase Expansion Gate

Checks:
- enough tasks in the phase
- no placeholders
- no orphan tasks
- within-phase sequence realism
- no impossible ordering

## Executable Graph Gate

Checks:
- no phase dependencies
- enough task count
- enough dependency count
- enough cross-phase dependency count
- phase containers preserved
- graph acyclic
- object fit remains intact

## Data Model Changes

The server should introduce separate types instead of overloading `ProjectPlan` for all stages.

Recommended new types:
- `ProjectWbsSkeleton`
- `ExpandedPhasePlan`
- `ExecutableProjectPlan`
- `CrossPhaseLinkPlan`

The current `ProjectPlan` type should become the final executable contract only.

## Prompting Strategy

## Skeleton Prompt

The skeleton prompt should say:
- build a high-level WBS only
- do not output task-level dependencies
- do not output a compiler-ready graph
- define phases and work packages
- reflect object scale and requested components

The model should not be asked for exact durations everywhere at this stage.

## Expansion Prompt

The expansion prompt should say:
- expand only one phase
- produce executable child tasks
- add realistic within-phase durations
- add only within-phase dependencies
- do not create phase-to-phase dependencies
- do not invent other phases

## Reconciliation Prompt

If model-assisted:
- connect already expanded phases
- only propose cross-phase task links
- do not rewrite the WBS
- do not introduce summary nodes

## Why the current prompt is wrong

The current planner prompt encourages:
- “Use real construction naming and realistic dependencies”

for the entire project in one pass.

That wording is too broad.

It pushes the model to output:
- giant monolithic graph
- phase-level sequencing embedded in final nodes
- over-compressed summary/executable hybrids

The prompting should instead enforce stage boundaries.

## Server-Orchestrated Planning Lifecycle

New lifecycle events:
- `route_selection`
- `route_decision_evidence`
- `object_type_inference`
- `wbs_skeleton_output`
- `wbs_skeleton_verdict`
- `phase_expansion_started`
- `phase_expansion_output`
- `phase_expansion_verdict`
- `cross_phase_linking_verdict`
- `executable_plan_output`
- `plan_quality_verdict`
- `compile_verdict`
- `initial_generation_result`

This makes failures reconstructable.

## Failure Handling

Failures must be localized.

### If skeleton is weak
- repair skeleton once
- fail if still weak

### If one phase expansion is weak
- repair that phase only
- do not restart the whole plan

### If cross-phase links are weak
- repair only linking stage

### If executable graph is structurally invalid
- reject before compile
- report exact offending phase/task/link

## Delivery Scope

## Workstream 1: Introduce New Stage Contracts

Files:
- `packages/server/src/initial-generation/types.ts`
- new stage-specific modules

Deliver:
- `ProjectWbsSkeleton`
- `ExpandedPhasePlan`
- `ExecutableProjectPlan`
- stage-specific verdict types

## Workstream 2: Replace One-Shot Planner With Skeleton Planner

Files:
- `packages/server/src/initial-generation/planner.ts`
- new `skeleton-planner.ts`

Deliver:
- skeleton-only planning call
- skeleton validation
- one repair pass

## Workstream 3: Add Phase Expansion Pipeline

Files:
- new `phase-expander.ts`
- new tests

Deliver:
- per-phase expansion orchestration
- localized repair
- per-phase metrics

## Workstream 4: Add Cross-Phase Linking Stage

Files:
- new `link-reconciliation.ts`

Deliver:
- server-built cross-phase entry/exit linking
- optional bounded model refinement

## Workstream 5: Rebuild Orchestrator Around Stages

Files:
- `packages/server/src/initial-generation/orchestrator.ts`

Deliver:
- stage-by-stage lifecycle
- explicit failure localization
- structured logging

## Workstream 6: Tighten Compiler Contract

Files:
- `packages/server/src/initial-generation/compiler.ts`
- `packages/server/src/initial-generation/executor.ts`

Deliver:
- compiler only accepts final executable graph
- remove broad salvage as a primary architecture
- convert structural invalidity into earlier-stage repair/rejection

## Workstream 7: New Regression Suite

Tests must cover:
- broad prompt enters initial generation
- skeleton output contains requested garage scope
- phase expansion works for shell, engineering, finishing
- final executable plan contains no phase dependencies
- final compiled output preserves cross-phase links
- exact regression prompt succeeds end-to-end

## Workstream 8: Productized Future Feature

Not required for first remediation delivery, but architecture should support:
- “detail this WBS node”
- “expand finishing”
- “expand garage”

The new phase expansion stage should be implemented so this can later be reused as a standalone user-facing operation.

## Acceptance Criteria

The remediation is complete when all are true:

- `График строительства жилого дома на 3 этажа + гараж` succeeds end-to-end
- route is `initial_generation`
- skeleton includes explicit house + garage-aware scope
- executable plan contains at least 4 top-level phases
- executable plan contains at least 12 task nodes for this prompt
- compiled output contains explicit dependencies
- compiled output contains at least 2 cross-phase dependency chains
- no phase node carries dependencies at final executable stage
- no compile-time collapse deletes the majority of the plan
- logs show which stage produced the final graph

## Non-Goals

This remediation does not aim to:
- build a universal construction planner for every niche asset class
- perfectly estimate durations for all technologies
- introduce user clarification dialogs for broad empty-project requests
- replace deterministic compilation with direct model-generated task payloads

## Risks

### Risk: Stage count increases latency

Mitigation:
- skeleton pass is short
- phase expansions can be parallelized
- cheap model can be used for some phase expansion paths after validation

### Risk: Phase-by-phase expansion causes inconsistency

Mitigation:
- preserve global context in expansion prompt
- add reconciliation stage
- add post-merge executable graph validation

### Risk: Overengineering

Mitigation:
- this is not speculative complexity
- current real logs already prove one-shot planning is failing in production

## Recommendation

Proceed with the staged planner redesign.

Do not keep trying to patch the one-shot planner prompt.

The observed failures are architectural, not wording-level:
- first it routed wrong
- then it parsed wrong
- then it compiled wrong

Those are successive signs that the current contract is fundamentally overloaded.

The correct remediation is:
- separate WBS from executable sequencing
- separate broad planning from local detailing
- separate planning semantics from compile semantics

That is the plan to implement.
