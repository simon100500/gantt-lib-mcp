# PRD: Remediation 6 for Initial Generation

## Summary

This remediation defines the next quality-focused architecture for initial graph generation after the dependency, prompt, and preview fixes from Remediation 5.

The remaining product problem is no longer only technical correctness.
The larger issue is schedule quality across different request shapes:

- broad whole-project bootstrap requests
- narrow partial-scope requests
- explicit work-list requests
- requests where one clarification would dramatically improve the first generated graph

The system now needs a stronger planning architecture built around domain knowledge, scope-aware routing inside initial generation, and a controlled clarification gate.

The target direction is:

1. separate whole-project bootstrap from partial-scope and work-list bootstrap
2. introduce a reusable domain knowledge layer based on archetypes and object profiles
3. let the model adapt and decompose a locked domain skeleton instead of inventing the entire graph from scratch
4. ask at most one high-impact clarification question when it materially improves graph quality

## Problem Statement

The current initial-generation pipeline is stronger than before, but it still has structural quality limits.

### 1. One initial-generation mode is not enough

Different user requests imply different planning problems:

- `График строительства детского сада на 3 этажа`
  - broad whole-project bootstrap
- `график передачи конструкций подвала секции 5.1-5.4`
  - partial-scope fragment bootstrap
- an explicit list of works pasted by the user
  - work-list normalization and sequencing

Treating all three through the same planning mode leads to:

- over-generation outside the requested scope
- missed fragment-specific milestones
- weak treatment of user-supplied work lists as if they were only hints

### 2. Prompt-only domain knowledge will not scale

As initial generation expands to more project types and object types, quality will degrade if domain knowledge remains mostly embedded in prompts.

Problems with prompt-only knowledge:

- the model re-infers the same construction logic on every run
- quality depends too much on phrasing
- adding new object types requires longer and longer prompts
- retrieval becomes expensive and less deterministic

### 3. Some requests need clarification, but uncontrolled dialogue hurts UX

In some cases a single clarification can significantly improve the generated graph:

- full project vs fragment
- strict work-list vs list plus inferred supporting tasks
- target output for a fragment such as handover, rough readiness, or completion
- desired detail level

But unstructured questioning creates a worse product:

- too much latency before first useful output
- too many unnecessary questions
- inconsistent wording and behavior

## Product Goal

The system should generate higher-quality initial graphs by choosing the correct planning mode, grounding generation in reusable domain knowledge, and asking only one high-impact clarification when needed.

For the user, the target behavior is:

1. broad requests produce strong whole-project starter schedules
2. fragment requests stay strictly within the requested scope
3. explicit work lists are treated as primary source material, not loose inspiration
4. one clarification can be asked when it meaningfully changes graph topology or planning policy
5. the system can expand to more object types without collapsing into prompt sprawl

## Non-Goals

This remediation does not aim to:

- replace deterministic compile/execute with agentic tool loops
- turn initial generation into a long multi-turn interview
- ask multiple clarification questions by default
- introduce full resource planning or cost planning
- make the knowledge layer a general-purpose construction encyclopedia

## Target Architecture

## Stage 0: Intake Normalization

Normalize user input into a stable internal request shape before planning.

Required output:

- normalized request text
- explicit scope signals
- explicit work items if present
- extracted location and fragment scope
- confidence in source completeness

Example:

```json
{
  "rawRequest": "график передачи конструкций подвала секции 5.1-5.4",
  "scopeSignals": {
    "fragment": true,
    "handoverIntent": true,
    "wholeProject": false
  },
  "locationScope": {
    "zone": "подвал",
    "sections": ["5.1", "5.2", "5.3", "5.4"]
  },
  "explicitWorkItems": [],
  "sourceConfidence": "medium"
}
```

## Stage 1: Classification and Planning Mode Selection

Inside `initial_generation`, classify not only route but also planning mode.

Required fields:

- `scope_mode`
- `project_archetype`
- `object_profile`
- `planning_mode`
- `detail_level`
- `calendar_policy`
- `confidence`

### Scope Modes

- `full_project`
- `partial_scope`
- `explicit_worklist`

### Planning Modes

- `whole_project_bootstrap`
- `partial_scope_bootstrap`
- `worklist_bootstrap`

Examples:

```json
{
  "scope_mode": "full_project",
  "planning_mode": "whole_project_bootstrap",
  "project_archetype": "new_building",
  "object_profile": "kindergarten",
  "detail_level": "medium",
  "confidence": 0.93
}
```

```json
{
  "scope_mode": "partial_scope",
  "planning_mode": "partial_scope_bootstrap",
  "project_archetype": "new_building",
  "object_profile": "residential_multi_section",
  "detail_level": "medium",
  "confidence": 0.89
}
```

```json
{
  "scope_mode": "explicit_worklist",
  "planning_mode": "worklist_bootstrap",
  "project_archetype": "unknown",
  "object_profile": "unknown",
  "detail_level": "medium",
  "confidence": 0.95
}
```

## Stage 2: Clarification Gate

After classification and before skeleton planning, run a bounded clarification gate.

The gate must not produce open-ended dialogue.
It must decide:

- `ask`
- `proceed_with_assumptions`

### Clarification Policy

Ask only if the missing information materially changes one of:

- graph topology
- sequencing logic
- scope boundary
- decomposition depth
- fragment completion target

Do not ask if the missing information only affects soft estimate quality.

### Hard Clarification Examples

- unclear whether request is whole project or fragment
- unclear whether user work list is exhaustive or illustrative
- unclear fragment end-state such as handover vs completion

### Soft Clarification Examples

- low vs medium detail
- calendar preference
- section split preference

### Constraints

- ask at most one question before generation
- if unanswered, proceed with a logged fallback assumption
- clarification output must be structured

Example:

```json
{
  "clarification_needed": true,
  "impact": "high",
  "reason": "scope_boundary_ambiguity",
  "question": "Нужен график по всему объекту или только по передаче конструкций подвала секций 5.1-5.4?",
  "choices": [
    "Только этот фрагмент",
    "Это часть большого проекта, но сейчас нужен именно этот фрагмент"
  ],
  "fallbackAssumption": "Считать запрос локальным фрагментом"
}
```

## Stage 3: Domain Skeleton Assembly

The server should assemble a locked skeleton from a domain knowledge layer before LLM decomposition.

The model should adapt and fill the skeleton, not invent construction logic from scratch every time.

### Knowledge Layer Components

#### 1. Project Archetypes

General construction canvases such as:

- `new_building`
- `fit_out`
- `reconstruction`
- `industrial`
- `infrastructure`

Each archetype defines:

- typical stages
- required work families
- canonical milestone skeleton
- default sequencing expectations

#### 2. Object Profiles

Object-specific overlays such as:

- `office`
- `kindergarten`
- `school`
- `warehouse`
- `clinic`
- `residential_multi_section`

Each profile defines:

- added or removed work families
- object-specific dependencies
- object-specific milestones
- object-specific wording and decomposition hints

#### 3. Planning Rules

Rule packs must encode:

- mandatory family presence
- forbidden ordering
- minimum handover logic
- allowable parallelism patterns
- common missing-family checks

#### 4. Decomposition Policies

Policies for:

- `low`
- `medium`
- `high`

These policies must constrain:

- target task count
- decomposition depth
- allowed task granularity

## Stage 4: Mode-Specific Planning

Use different planning behavior for each mode.

### A. Whole-Project Bootstrap

Use:

- archetype skeleton
- object profile overlay
- full project milestones
- balanced cross-phase dependency graph

This mode is the successor to the current broad initial-generation flow.

### B. Partial-Scope Bootstrap

Use:

- fragment-oriented skeletons
- explicit location scope
- fragment-specific milestones
- minimal generation outside requested scope

Typical examples:

- basement handover
- section-based front opening
- facade zone package
- floor-by-floor fit-out fragment

This mode must not pad the graph with unrelated top-level phases.

### C. Work-List Bootstrap

Treat the user-supplied list as the primary source of truth.

Behavior:

- normalize and deduplicate supplied items
- infer grouping and sequencing
- add supporting tasks only if policy allows it
- mark inferred additions explicitly

Support two policies:

- `strict_worklist`
- `worklist_plus_inferred_supporting_tasks`

## Stage 5: Deterministic Validation, Compile, and Execute

Keep the current server-side boundaries:

- LLM planning output
- validation and quality gate
- deterministic compiler
- single authoritative commit

The knowledge layer and clarification gate must improve planning quality without weakening deterministic execution.

## Domain Contracts

## Classification Contract

```ts
type ScopeMode =
  | 'full_project'
  | 'partial_scope'
  | 'explicit_worklist';

type PlanningMode =
  | 'whole_project_bootstrap'
  | 'partial_scope_bootstrap'
  | 'worklist_bootstrap';

type InitialGenerationClassification = {
  scopeMode: ScopeMode;
  planningMode: PlanningMode;
  projectArchetype: string;
  objectProfile: string;
  detailLevel: 'low' | 'medium' | 'high';
  confidence: number;
  explicitWorkItemsPresent: boolean;
  locationScope?: {
    sections?: string[];
    floors?: string[];
    zones?: string[];
  };
};
```

## Clarification Contract

```ts
type ClarificationDecision =
  | {
      action: 'proceed_with_assumptions';
      assumptions: string[];
    }
  | {
      action: 'ask';
      impact: 'high';
      reason:
        | 'scope_boundary_ambiguity'
        | 'fragment_target_ambiguity'
        | 'worklist_completeness_ambiguity'
        | 'detail_policy_ambiguity';
      question: string;
      choices: string[];
      fallbackAssumption: string;
    };
```

## Knowledge Layer Contract

```ts
type ProjectArchetypeDefinition = {
  archetypeKey: string;
  defaultStages: string[];
  requiredFamilies: string[];
  milestoneSkeleton: string[];
  defaultRules: string[];
};

type ObjectProfileDefinition = {
  profileKey: string;
  archetypeKey: string;
  addedFamilies: string[];
  excludedFamilies: string[];
  milestoneOverrides: string[];
  sequencingOverrides: string[];
};
```

## Quality Requirements

The new architecture must improve quality differently per mode.

### Whole Project

- reflects the object type and scale
- includes a non-trivial dependency graph
- covers mandatory families from archetype and profile

### Partial Scope

- stays inside the requested fragment
- includes fragment-appropriate completion milestones
- avoids unrelated whole-project padding

### Work List

- preserves user-provided work scope
- does not silently replace user scope with generic template content
- distinguishes user-supplied and inferred tasks

### Clarification

- asks no more than one question before generation
- only asks when impact is high
- otherwise proceeds with explicit assumptions

## Implementation Scope

This remediation should include:

1. add `scope_mode` and `planning_mode` classification inside initial generation
2. introduce a clarification gate with structured ask/proceed output
3. create the first knowledge-layer format for archetypes, profiles, and rules
4. support at least one whole-project archetype and one fragment archetype path
5. support explicit work-list bootstrap mode
6. keep compile/execute deterministic and unchanged at the boundary

## Suggested First Delivery Slice

Do not attempt all domains at once.

Start with:

- archetype: `new_building`
- object profiles:
  - `kindergarten`
  - `residential_multi_section`
  - `office_fitout`
- fragment support:
  - basement handover
  - section-based fragment
- work-list support:
  - strict normalization
  - optional inferred-support policy

## Validation Requirements

### Automated

Add tests that prove:

- classification chooses `whole_project_bootstrap` for broad whole-project prompts
- classification chooses `partial_scope_bootstrap` for fragment prompts
- classification chooses `worklist_bootstrap` for explicit work-list prompts
- clarification gate asks only when impact is high
- work-list mode preserves supplied scope
- partial-scope mode does not introduce unrelated whole-project phases

### Manual

Verify at least these prompts:

- `График строительства детского сада на 3 этажа`
- `график передачи конструкций подвала секции 5.1-5.4`
- explicit pasted work list for a fragment package
- ambiguous fragment prompt that should trigger exactly one clarification

For each run, confirm:

- chosen planning mode is correct
- clarification behavior is correct
- graph stays inside intended scope
- dependency logic remains credible
- assumptions are visible when no clarification answer is given

## Success Criteria

This remediation is complete when all are true:

- initial generation no longer behaves like one generic bootstrap mode
- the server can distinguish full-project, partial-scope, and work-list generation
- a single clarification can be asked when it materially improves quality
- reusable archetype/profile knowledge exists outside raw prompts
- fragment requests stay constrained to fragment scope
- explicit work lists are preserved as source-of-truth input
