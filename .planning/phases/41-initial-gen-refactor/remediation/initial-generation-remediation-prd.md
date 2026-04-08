# PRD: Initial Generation Remediation After Phase 41

## Summary

This PRD defines the corrective iteration after Phase 41 shipped an incomplete version of the initial-generation architecture.

Phase 41 introduced the planning/compiler/executor modules, but the production entry path is still wrong in a critical way:
- the route into `initial_generation` is still decided by a brittle regex classifier
- real broad generation prompts can still fall back into the old mutation-agent flow
- the shipped manual validation did not prove that real user prompts actually exercised the new two-stage pipeline
- the quality floor for the resulting starter schedule is too low for production first-run experience

This PRD replaces regex-driven entry routing with an explicit agentic routing stage and tightens the output contract so the system is judged on actual WBS and dependency quality, not just on successful task creation.

## Problem Statement

The current production behavior is not aligned with the original Phase 41 intent.

Observed failure from live logs:
- user prompt: `Нарисуй график строительства жилого дома на 3 этажа + гараж`
- route chosen: `mutation`
- no `planning_output`
- no `plan_quality_verdict`
- no `compile_verdict`
- no `initial_generation_result`
- result: 5 tasks total, no dependency links, weak project structure

This is not a compiler bug first. It is a routing failure first.

The shipped implementation allowed the old mutation-agent path to remain the effective behavior for real broad prompts because the route gateway still depends on keyword matching.

## Root Cause

### 1. Wrong routing architecture

Phase 41 explicitly said:
- routing must depend on request class plus project state
- routing must not rely on a list of phrases
- broad empty-project generation is a product-mode decision, not a text-template heuristic

But the implementation introduced `classifyRequest()` in `packages/server/src/initial-generation/route-selection.ts`, which is still regex/keyword routing.

That violates the PRD intent.

### 2. Manual verification was too shallow

The phase passed automated tests, but the live run that matters was not actually validated against the production route choice.

The validation gap:
- tests proved the new path works when explicitly entered
- tests did not prove real broad prompts reliably enter that path
- human verification did not block on “did the prompt actually go through `initial_generation`?”

### 3. Quality floor is underspecified for real output

The current architecture checks plan validity and compile viability, but not enough product-quality outcomes:
- minimum WBS breadth
- minimum task count per starter schedule
- minimum dependency coverage
- minimum cross-phase sequencing density
- minimum subject specificity for a large request

As a result, the system can produce a technically valid but product-weak schedule.

## Product Goal

For an empty project and a broad build-a-schedule request, the system must:
- reliably choose the initial-generation mode
- generate a real WBS, not a tiny fragment
- generate dependency links as part of the first-run schedule
- run through the two-stage pipeline in production
- make that lifecycle observable in logs for every run

The product must not silently degrade to the old mutation-agent flow for a broad empty-project request just because the wording differs.

## Non-Goals

This PRD does not introduce:
- curated templates as the main solution
- more regex or keyword exceptions
- fallback to the mutation-agent flow for initial-generation failures
- multi-domain expansion beyond the current construction/repair focus
- user clarifying questions for broad empty-project generation

## Target Architecture

### Stage 0: Agentic Route Decision

Replace regex classification with a dedicated route-decision stage.

Input:
- user message
- project state summary
- empty/non-empty project flag
- optional recent conversation context

Output:
- `initial_generation`
- `mutation`
- optionally `read_only` or `explain_only` if needed later

This routing stage must be implemented as a bounded classifier task with a strict structured output, not as a freeform chat answer and not as regex matching.

Required properties:
- decision is made before any planner or mutation-agent run
- decision is logged with evidence
- decision includes confidence and explicit reasoning signals
- decision is deterministic at the system boundary even if model-driven internally

Example structured output:

```json
{
  "route": "initial_generation",
  "confidence": 0.96,
  "reason": "empty_project_broad_schedule_creation",
  "signals": [
    "empty_project",
    "user_requests_new_schedule",
    "request_scope_is_broad",
    "not_a_targeted_edit"
  ]
}
```

### Stage 1: WBS Planning

This remains an AI planning step.

Input:
- user request
- generation brief
- domain reference
- route decision context

Output:
- strict `ProjectPlan`

But the quality floor must be raised.

### Stage 1.5: Product Quality Gate

The quality gate must evaluate not only validity but product adequacy.

In addition to current checks, it must score:
- top-level phase count
- total task count
- number of tasks with dependencies
- subject specificity of phase titles
- whether the plan reflects the object scale stated by the user
- whether the plan captures parallel streams where the object obviously requires them

This gate should still remain rule-based in `v1.1`, but it must judge plan usefulness, not merely schema compliance.

### Stage 2: Deterministic Execution

Keep deterministic compilation and one authoritative batch commit through `commandService`.

The planner output contract remains `ProjectPlan`.
The executor input remains validated plan JSON.
The executor output remains one `create_tasks_batch` command.

This part is mostly correct conceptually and should not be replaced with mutation-agent fallback.

## New Quality Requirements

For broad empty-project construction generation, a starter schedule is not acceptable unless all of the following are true:

- at least 4 top-level phases remain after compile cleanup
- at least 8 task nodes remain after compile cleanup
- at least 3 dependency links remain unless the object type explicitly justifies fewer
- at least 2 dependency chains span across different top-level phases
- no more than 20% of task titles may be generic placeholders or weak generic nouns
- the schedule reflects the object type and scope from the prompt

These are product-level acceptance criteria, not just internal hints.

If the plan is valid but fails these minimums:
- it should trigger one repair pass
- if still weak after repair, the system should fail in a controlled way
- it should not commit a “technically valid but embarrassing” starter schedule

## Dependency Requirements

Phase 41 correctly added support for dependency types in the compiler contract, but the next iteration must lock product expectations explicitly.

The broad initial-generation result must include:
- explicit dependency links in the produced schedule
- links visible in committed task payloads
- logs showing dependency count in the compiled output

Required observability additions:
- `planning_output.taskNodeCount`
- `planning_output.dependencyCount`
- `compile_verdict.compiledTaskCount`
- `compile_verdict.compiledDependencyCount`
- `initial_generation_result.outcome`

If dependency count is zero for a broad construction schedule, that must be treated as a failed quality outcome unless the request explicitly asked for a dependency-free outline.

## Routing Rules

The next iteration must enforce these routing rules:

- Empty project + broad “build me a schedule” intent -> always evaluate through the route-decision stage
- Broad creation must not depend on any specific verb like `построй`, `создай`, or `нарисуй`
- Non-empty project + targeted edit -> mutation flow
- Empty project + tiny targeted request may still use mutation flow only if the route-decision stage explicitly selects it

Forbidden implementation patterns:
- regex verb lists for broad-generation routing
- keyword allowlists as the primary route decision
- phrase-specific patches like “also include `нарисуй`”

## Logging Requirements

Each initial-generation run must produce one reconstructable chain in logs:

- `route_selection`
- `route_decision_evidence`
- `object_type_inference`
- `model_routing_decision`
- `planning_output`
- `plan_quality_verdict`
- `plan_repair_requested` if applicable
- `compile_verdict`
- `initial_generation_result`

Additional required fields:
- route confidence
- planning node count
- planning dependency count
- compiled task count
- compiled dependency count
- whether the run passed the product adequacy floor

## Validation Requirements

### Automated

Add tests that prove:
- `Нарисуй график строительства жилого дома на 3 этажа + гараж` enters `initial_generation`
- broad prompts with wording variants do not depend on keyword lists
- a broad construction plan with zero dependencies fails the quality gate
- a plan with too few tasks fails the quality gate
- compile logs include dependency counts
- no broad empty-project request falls into mutation flow without an explicit route-decision verdict saying so

### Manual

Manual verification must no longer stop at “tasks were created”.

For each live prompt, verify:
- route is actually `initial_generation`
- planner stage ran
- compiler stage ran
- dependency links exist in the resulting schedule
- WBS is not tiny
- output matches the object type and scale

Required manual prompts:
- `Нарисуй график строительства жилого дома на 3 этажа + гараж`
- `Построй график строительства частного дома из газобетона`
- `Построй график строительства детского садика`
- `Построй график ремонта офиса 300 м2`
- `Построй график`

## Delivery Scope For Next Iteration

The next implementation iteration must include:

1. Remove regex-based route classification for broad initial generation.
2. Introduce a dedicated structured route-decision stage.
3. Raise the product-quality floor for WBS size and dependency density.
4. Add logging for planning and compiled dependency counts.
5. Update verification docs so manual sign-off blocks on real route entry and real dependency graph output.

## Suggested Internal Contracts

### Route Decision

```ts
type RouteDecision = {
  route: 'initial_generation' | 'mutation';
  confidence: number;
  reason:
    | 'empty_project_broad_schedule_creation'
    | 'targeted_existing_schedule_edit'
    | 'narrow_creation_request'
    | 'uncertain_default_to_initial_generation';
  signals: string[];
};
```

### Stage Boundary Contract

The next iteration must make the stage boundaries explicit in code, docs, and logs.

#### 1. LLM Planner Output

This is the only JSON the planning model is allowed to return.
It is the output of the AI planning stage.
It is not yet executable by persistence code.
It contains no real task IDs and no compiled dates.

Type:
- `ProjectPlan`

Producer:
- planning-stage LLM

Consumer:
- server validator
- quality gate
- deterministic compiler

#### 2. Server Compiler Input

This is the validated `ProjectPlan` object after:
- JSON parsing
- schema validation
- default normalization
- optional single repair pass

This is still not MCP command payload.
It is the in-memory input to deterministic compilation.

Type:
- validated `ProjectPlan`

Producer:
- planner + validation layer

Consumer:
- deterministic compiler

#### 3. Server Compiler Output

This is the compiler result produced by server code, not by the LLM.
It is the deterministic translation of `ProjectPlan` into the command contract expected by `commandService`.

Type:
- `CompiledInitialSchedule`
- authoritative command payload: `create_tasks_batch`

Producer:
- server compiler

Consumer:
- executor
- `commandService.commitCommand(...)`

#### 4. Committed Result

This is the post-commit result after the compiled batch is applied.
It is the persisted project state/change set returned by the command layer.

Type:
- `CommitProjectCommandResponse`

Producer:
- `commandService`

Consumer:
- orchestrator
- logs
- websocket/UI broadcast

### 1. LLM Planner Output Example

```json
{
  "projectType": "private_residential_house",
  "assumptions": [
    "RF production calendar defaults",
    "Three-storey house with detached garage"
  ],
  "nodes": [
    {
      "nodeKey": "phase-site-prep",
      "title": "Подготовка площадки и разбивка",
      "kind": "phase",
      "durationDays": 1,
      "dependsOn": []
    },
    {
      "nodeKey": "task-survey",
      "title": "Геодезическая разбивка",
      "parentNodeKey": "phase-site-prep",
      "kind": "task",
      "durationDays": 2,
      "dependsOn": []
    },
    {
      "nodeKey": "phase-foundation",
      "title": "Фундамент и подземная часть",
      "kind": "phase",
      "durationDays": 1,
      "dependsOn": []
    },
    {
      "nodeKey": "task-excavation",
      "title": "Разработка котлована",
      "parentNodeKey": "phase-foundation",
      "kind": "task",
      "durationDays": 4,
      "dependsOn": [
        {
          "nodeKey": "task-survey",
          "type": "FS",
          "lagDays": 0
        }
      ]
    },
    {
      "nodeKey": "task-concrete",
      "title": "Армирование и бетонирование фундамента",
      "parentNodeKey": "phase-foundation",
      "kind": "task",
      "durationDays": 5,
      "dependsOn": [
        {
          "nodeKey": "task-excavation",
          "type": "FS",
          "lagDays": 1
        }
      ]
    },
    {
      "nodeKey": "phase-shell",
      "title": "Коробка дома",
      "kind": "phase",
      "durationDays": 1,
      "dependsOn": []
    },
    {
      "nodeKey": "task-frame",
      "title": "Возведение несущих стен и перекрытий",
      "parentNodeKey": "phase-shell",
      "kind": "task",
      "durationDays": 10,
      "dependsOn": [
        {
          "nodeKey": "task-concrete",
          "type": "FS",
          "lagDays": 0
        }
      ]
    },
    {
      "nodeKey": "phase-garage",
      "title": "Гараж",
      "kind": "phase",
      "durationDays": 1,
      "dependsOn": []
    },
    {
      "nodeKey": "task-garage-shell",
      "title": "Коробка гаража",
      "parentNodeKey": "phase-garage",
      "kind": "task",
      "durationDays": 6,
      "dependsOn": [
        {
          "nodeKey": "task-concrete",
          "type": "SS",
          "lagDays": 2
        }
      ]
    }
  ]
}
```

Meaning:
- this is the planner's strict JSON output
- this is what the LLM must generate
- this is not a compiled task batch
- `nodeKey` values are temporary planning keys, not persisted task IDs

### 2. Server Compiler Output Example

```json
{
  "projectId": "project-123",
  "baseVersion": 17,
  "serverDate": "2026-04-09",
  "type": "create_tasks_batch",
  "tasks": [
    {
      "id": "phase-site-prep-id",
      "projectId": "project-123",
      "name": "Подготовка площадки и разбивка",
      "startDate": "2026-04-09",
      "endDate": "2026-04-10",
      "sortOrder": 0
    },
    {
      "id": "task-survey-id",
      "projectId": "project-123",
      "name": "Геодезическая разбивка",
      "startDate": "2026-04-09",
      "endDate": "2026-04-10",
      "parentId": "phase-site-prep-id",
      "dependencies": [],
      "sortOrder": 1
    },
    {
      "id": "task-excavation-id",
      "projectId": "project-123",
      "name": "Разработка котлована",
      "startDate": "2026-04-11",
      "endDate": "2026-04-16",
      "parentId": "phase-foundation-id",
      "dependencies": [
        {
          "taskId": "task-survey-id",
          "type": "FS",
          "lag": 0
        }
      ],
      "sortOrder": 3
    }
  ]
}
```

Meaning:
- this is produced by the deterministic compiler on the server
- this is not generated by the LLM
- this is the payload the executor passes to `commandService`
- task IDs here are already real/persistable IDs derived by server code

### 3. Committed Result Example

```json
{
  "clientRequestId": "client-123",
  "accepted": true,
  "baseVersion": 17,
  "newVersion": 18,
  "result": {
    "changedTaskIds": [
      "phase-site-prep-id",
      "task-survey-id",
      "task-excavation-id"
    ],
    "changedDependencyIds": [
      "dep-1",
      "dep-2"
    ],
    "conflicts": [],
    "patches": []
  }
}
```

Meaning:
- this is after compilation and after commit
- this is persisted-system output, not planning output
- this is what the orchestrator uses for final success/failure handling and UI/log broadcast

## Success Criteria

This remediation PRD is complete when all of the following are true:

- broad empty-project generation no longer relies on regex routing
- the live prompt `Нарисуй график строительства жилого дома на 3 этажа + гараж` enters `initial_generation`
- broad construction starter schedules contain meaningful WBS depth and dependency links
- logs prove the two-stage lifecycle ran
- manual validation can no longer approve a run that silently fell back to the mutation-agent flow
