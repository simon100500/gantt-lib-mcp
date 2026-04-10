# Implementation Plan: Remediation 6 for Initial Generation

## Goal

Implement the PRD architecture without breaking the current deterministic `plan -> compile -> execute` boundary.

The implementation should:

1. add mode-aware planning before LLM generation
2. move reusable domain knowledge outside raw prompts
3. support one bounded clarification gate
4. keep compile and execute behavior stable

## Implementation Principles

- keep `compiler.ts` and `executor.ts` unchanged unless integration strictly requires a small adaptation
- move intelligence out of prompt sprawl into typed server-side modules
- keep the first delivery slice narrow and aligned with the PRD
- make each new layer independently testable
- prefer deterministic heuristics first for classification and clarification policy

## Target File Structure

### Existing files to extend

- `packages/server/src/initial-generation/types.ts`
- `packages/server/src/initial-generation/brief.ts`
- `packages/server/src/initial-generation/planner.ts`
- `packages/server/src/initial-generation/orchestrator.ts`
- `packages/server/src/initial-generation/quality-gate.ts`
- `packages/server/src/initial-generation/planner.test.ts`
- `packages/server/src/initial-generation/orchestrator.test.ts`

### New files to add

- `packages/server/src/initial-generation/intake-normalization.ts`
- `packages/server/src/initial-generation/classification.ts`
- `packages/server/src/initial-generation/clarification-gate.ts`
- `packages/server/src/initial-generation/classification.test.ts`
- `packages/server/src/initial-generation/clarification-gate.test.ts`

### New domain knowledge layer

- `packages/server/src/initial-generation/domain/contracts.ts`
- `packages/server/src/initial-generation/domain/registry.ts`
- `packages/server/src/initial-generation/domain/assembly.ts`
- `packages/server/src/initial-generation/domain/assembly.test.ts`
- `packages/server/src/initial-generation/domain/archetypes/new-building.ts`
- `packages/server/src/initial-generation/domain/profiles/kindergarten.ts`
- `packages/server/src/initial-generation/domain/profiles/residential-multi-section.ts`
- `packages/server/src/initial-generation/domain/profiles/office-fitout.ts`
- `packages/server/src/initial-generation/domain/fragments/basement-handover.ts`
- `packages/server/src/initial-generation/domain/fragments/section-fragment.ts`
- `packages/server/src/initial-generation/domain/rules/default-rules.ts`
- `packages/server/src/initial-generation/domain/policies/decomposition.ts`

### Optional extraction if planner grows too much

- `packages/server/src/initial-generation/prompts/whole-project.ts`
- `packages/server/src/initial-generation/prompts/partial-scope.ts`
- `packages/server/src/initial-generation/prompts/worklist.ts`

## Domain Modeling Strategy

The knowledge layer should be modular and layered, not stored in one large prompt or one flat config file.

### Layer order

1. project archetype
2. object profile overlay
3. fragment overlay
4. planning rules
5. decomposition policy

### Why this structure

- archetypes provide stable base construction logic
- profiles add object-specific changes without cloning the full archetype
- fragment overlays isolate partial-scope behavior from full-project logic
- rules remain reusable across multiple profiles
- decomposition policies stay independent from domain content

### First supported slice

- archetype: `new_building`
- object profiles:
  - `kindergarten`
  - `residential_multi_section`
  - `office_fitout`
- fragment support:
  - `basement_handover`
  - `section_fragment`
- worklist support:
  - `strict_worklist`
  - `worklist_plus_inferred_supporting_tasks`

## Phase 1: Contracts and Core Types

### Goal

Create the typed base for the new planning pipeline.

### Changes

Extend `packages/server/src/initial-generation/types.ts` or move part of the contracts into `domain/contracts.ts`.

### Add types for

- `ScopeMode`
- `PlanningMode`
- `DetailLevel`
- `WorklistPolicy`
- `LocationScope`
- `NormalizedInitialRequest`
- `InitialGenerationClassification`
- `ClarificationDecision`
- `DomainSkeleton`
- `DomainPlanningContext`
- `ProjectArchetypeDefinition`
- `ObjectProfileDefinition`
- fragment and rules definitions

### Exit criteria

- all downstream modules can depend on typed contracts
- no domain data is hidden in untyped string blobs

## Phase 2: Intake Normalization

### Goal

Convert raw user input into a stable request shape before classification.

### File

- `packages/server/src/initial-generation/intake-normalization.ts`

### Responsibilities

- normalize raw request text
- detect explicit scope signals
- detect fragment markers
- extract location scope
- extract explicit work items if present
- estimate source completeness confidence

### Initial implementation approach

- deterministic heuristics and lightweight parsing only
- no extra model call in the first version

### Exit criteria

- broad project request, fragment request, and explicit work list produce clearly different normalized outputs

## Phase 3: Classification and Planning Mode Selection

### Goal

Choose the correct planning mode before prompt construction.

### File

- `packages/server/src/initial-generation/classification.ts`

### Responsibilities

- determine `scopeMode`
- determine `planningMode`
- infer `projectArchetype`
- infer `objectProfile`
- infer `detailLevel`
- set `confidence`

### Rules for first implementation

- use deterministic classification for stability
- map broad bootstrap requests to `whole_project_bootstrap`
- map fragment requests to `partial_scope_bootstrap`
- map explicit lists to `worklist_bootstrap`

### Tests

- `График строительства детского сада на 3 этажа`
- `график передачи конструкций подвала секции 5.1-5.4`
- pasted explicit work list

### Exit criteria

- classification returns the expected planning mode for all core PRD cases

## Phase 4: Clarification Gate

### Goal

Add a bounded pre-generation decision on whether one clarification is worth asking.

### File

- `packages/server/src/initial-generation/clarification-gate.ts`

### Responsibilities

- return only `ask` or `proceed_with_assumptions`
- ask at most one question
- ask only when impact is high
- attach fallback assumption if no answer is available

### First implementation scope

- support:
  - `scope_boundary_ambiguity`
  - `fragment_target_ambiguity`
  - `worklist_completeness_ambiguity`
- keep `detail_policy_ambiguity` as optional or deferred if it does not materially alter topology

### Important integration note

If the current orchestration cannot pause for a real answer, the gate still runs and returns structured output, but execution proceeds with `fallbackAssumption`.

### Exit criteria

- no open-ended questioning
- ambiguous fragment prompts produce exactly one structured clarification decision

## Phase 5: Knowledge Layer

### Goal

Move reusable domain logic from prompts into modular definitions.

### Files

- `packages/server/src/initial-generation/domain/*`

### Responsibilities

- define archetypes
- define object overlays
- define fragment overlays
- define planning rules
- define decomposition policies

### Required first content

#### Archetype

- `new_building`

#### Profiles

- `kindergarten`
- `residential_multi_section`
- `office_fitout`

#### Fragments

- `basement_handover`
- `section_fragment`

#### Rules

- mandatory family presence
- forbidden ordering
- minimum fragment handover logic
- allowable parallelism patterns

### Exit criteria

- adding a new profile does not require editing a giant prompt template
- domain knowledge can be assembled from typed modules

## Phase 6: Skeleton Assembly

### Goal

Assemble a locked planning skeleton before LLM decomposition.

### File

- `packages/server/src/initial-generation/domain/assembly.ts`

### Responsibilities

- merge archetype + profile + fragment + rules + decomposition policy
- return a normalized planning skeleton for prompt generation
- make assumptions explicit

### Expected output

- stage families
- milestone skeleton
- required work families
- sequencing expectations
- scope boundaries for fragment mode
- decomposition limits

### Exit criteria

- planner no longer starts from a blank domain prompt
- full-project and fragment requests receive different skeletons before LLM generation

## Phase 7: Mode-Specific Planner Refactor

### Goal

Replace one generic planning flow with mode-aware planning behavior.

### Primary file

- `packages/server/src/initial-generation/planner.ts`

### Planner input should include

- normalized request
- classification
- clarification decision
- assembled skeleton
- worklist policy

### Modes to implement

#### Whole project bootstrap

- use archetype skeleton
- use profile overlay
- use full-project milestones
- generate balanced cross-phase dependency graph

#### Partial scope bootstrap

- constrain generation to requested fragment
- include fragment-specific milestones
- forbid unrelated whole-project padding

#### Worklist bootstrap

- treat user work list as primary source of truth
- normalize and deduplicate user items
- infer supporting tasks only if policy allows
- make inferred additions explicit

### Prompt strategy

If `planner.ts` gets too large, extract mode-specific prompt builders into:

- `prompts/whole-project.ts`
- `prompts/partial-scope.ts`
- `prompts/worklist.ts`

### Exit criteria

- planner behavior materially differs by mode
- prompts are driven by structured context rather than only raw request text

## Phase 8: Orchestrator Integration

### Goal

Wire the new pipeline into the existing initial-generation orchestration flow.

### File

- `packages/server/src/initial-generation/orchestrator.ts`

### New sequence

1. build normalized intake
2. classify request
3. run clarification gate
4. assemble domain skeleton
5. plan structure and schedule
6. compile
7. execute

### Logging to add

- intake normalization result
- classification result
- clarification decision
- skeleton assembly result
- planning mode used

### Boundary rule

- compile and execute remain deterministic
- authoritative commit behavior remains unchanged

### Exit criteria

- new planning stages are visible in logs
- compile and execution behavior is preserved

## Phase 9: Quality Gate Updates

### Goal

Make validation aware of planning mode.

### File

- `packages/server/src/initial-generation/quality-gate.ts`

### Add checks for

#### Whole project

- mandatory family coverage
- non-trivial dependency richness
- object/profile fit

#### Partial scope

- no generation outside requested fragment
- presence of fragment completion milestones
- no whole-project padding

#### Work list

- preservation of user-supplied scope
- no silent replacement by template content
- inferred additions remain explicit

### Potential new verdict reasons

- `scope_boundary_violation`
- `missing_fragment_milestone`
- `unexpected_whole_project_padding`
- `worklist_scope_drift`

### Exit criteria

- validation can reject mode-specific planning failures that the current broad gate misses

## Phase 10: Tests and Verification

### New tests

- `packages/server/src/initial-generation/classification.test.ts`
- `packages/server/src/initial-generation/clarification-gate.test.ts`
- `packages/server/src/initial-generation/domain/assembly.test.ts`

### Existing test files to expand

- `packages/server/src/initial-generation/planner.test.ts`
- `packages/server/src/initial-generation/orchestrator.test.ts`

### Automated checks required

- broad prompt selects `whole_project_bootstrap`
- fragment prompt selects `partial_scope_bootstrap`
- explicit work list selects `worklist_bootstrap`
- clarification gate asks only when impact is high
- worklist mode preserves user scope
- partial-scope mode does not introduce unrelated phases

### Manual verification prompts

- `График строительства детского сада на 3 этажа`
- `график передачи конструкций подвала секции 5.1-5.4`
- explicit work list for fragment package
- ambiguous fragment prompt that should trigger exactly one clarification

### Exit criteria

- all PRD validation scenarios are covered by automated or manual checks

## Suggested Delivery Order

Implement in this order:

1. contracts and types
2. intake normalization
3. classification
4. clarification gate
5. knowledge layer definitions
6. skeleton assembly
7. planner refactor
8. orchestrator integration
9. quality gate updates
10. test expansion and regression pass

## Checkpoints

### Checkpoint A

- normalization, classification, and clarification exist
- tests for core routing behavior pass

### Checkpoint B

- knowledge layer and skeleton assembly exist
- planner can consume assembled context

### Checkpoint C

- mode-specific planner behavior is live
- orchestrator emits new structured logs

### Checkpoint D

- quality gates are mode-aware
- automated tests cover PRD scenarios

## Done Definition

This remediation is done when:

- initial generation no longer behaves like one generic bootstrap mode
- full project, partial scope, and work list requests are separated by planning mode
- one clarification can be issued in a structured bounded way
- reusable archetype/profile knowledge exists outside raw prompts
- fragment generation stays inside fragment scope
- explicit work lists remain source-of-truth input
- deterministic compile and execute boundaries remain intact
