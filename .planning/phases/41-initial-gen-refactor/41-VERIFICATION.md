---
phase: 41-initial-gen-refactor
verified: 2026-04-08T11:49:31.9603975Z
status: human_needed
score: 16/16 must-haves verified
human_verification:
  - test: "Run the five manual prompts from docs.md in a real empty project"
    expected: "Each prompt routes through initial_generation, produces subject-specific hierarchy, avoids clarifying questions, and uses partial wording only when salvage occurs"
    why_human: "Live model output quality, sequence realism, and domain specificity depend on a real planner run rather than static code inspection"
  - test: "Inspect a real server debug log for one initial-generation run"
    expected: "The log contains route_selection, object_type_inference, model_routing_decision, planning_output, plan_quality_verdict, compile_verdict, and initial_generation_result for the same runId"
    why_human: "The code and tests verify event emission, but an end-to-end production-like run is still needed to confirm operational observability"
---

# Phase 41: initial-gen-refactor Verification Report

**Phase Goal:** refactor initial generation into an AI-first two-stage lifecycle with explicit routing, validated planning, deterministic execution, observability, and no fallback template shortcut
**Verified:** 2026-04-08T11:49:31.9603975Z
**Status:** human_needed
**Re-verification:** No - initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Empty-project broad generation requests no longer use `initial_schedule_template` or any equivalent deterministic content shortcut | ✓ VERIFIED | `packages/server/src/agent.ts` routes through `selectAgentRoute()` and `runInitialGeneration()`; grep found no legacy template helpers in `agent.ts` or `packages/server/src/initial-generation` |
| 2 | The server has a first-class internal route named `initial_generation` selected from request class plus empty-project state | ✓ VERIFIED | `packages/server/src/initial-generation/route-selection.ts` exports `selectAgentRoute()` returning `initial_generation` for empty broad requests |
| 3 | Ordinary follow-up edits stay on the existing mutation flow and can use the cheap model when configured | ✓ VERIFIED | `packages/server/src/agent.ts` returns early only for `initial_generation`; mutation flow resolves model routing separately with cheap-model fallback |
| 4 | Model choice is decided before each SDK run and recorded as a typed routing decision | ✓ VERIFIED | `packages/server/src/initial-generation/model-routing.ts` returns typed decisions; `agent.ts` and `orchestrator.ts` log `model_routing_decision` before planner/mutation runs |
| 5 | Initial-generation planning receives a short server-side brief plus domain reference instead of a hardcoded task template | ✓ VERIFIED | `brief.ts` builds `starterScheduleExpectation`, `namingBan`, and `serverInferencePolicy`; `planner.ts` assembles prompt from brief and resolved reference |
| 6 | Planning returns a machine-readable `ProjectPlan` with strict schema validation before compilation | ✓ VERIFIED | `planner.ts` validates `projectType`, nodes, unique `nodeKey`, parent/dependency references, non-placeholder titles, and task placement before returning a plan |
| 7 | Weak plans can trigger exactly one repair pass driven by explicit criticism, without evaluator-LLM fan-out or clarifying questions | ✓ VERIFIED | `planner.ts` caps `maxRepairAttempts = 1`, builds repair prompt from verdict reasons, and tests cover one repair then stop |
| 8 | Unknown object types default to generic construction guidance interpreted as a private residential house baseline | ✓ VERIFIED | `domain-reference.ts` falls back to `defaultInterpretation: 'private_residential_house'`; tests cover `Построй график` fallback |
| 9 | Approved plans compile deterministically through `commandService` into one authoritative batch | ✓ VERIFIED | `compiler.ts` emits one `create_tasks_batch`; `executor.ts` commits through `commandService.commitCommand(..., 'agent', ...)` |
| 10 | Schedule compilation supports hierarchy, working-day scheduling, rollup parents, and `FS/SS/FF/SF` dependencies | ✓ VERIFIED | `compiler.ts` schedules task nodes, rolls up phases, preserves dependency metadata; `compiler.test.ts` covers all dependency types and working-day semantics |
| 11 | Technical compile failures can salvage only a maximal valid partial schedule under locked thresholds | ✓ VERIFIED | `executor.ts` prunes broken refs/cycles/empty containers and enforces `0.6` retained-node ratio plus `>= 3` top-level phases and valid child-task/broken-ref checks |
| 12 | Weak salvage returns a controlled error instead of silently committing or falling back to mutation flow | ✓ VERIFIED | `executor.ts` returns `controlled_rejection`; tests assert no mutation-agent fallback symbols and no commit on too-weak salvage |
| 13 | A single initial-generation run can be reconstructed end to end from route selection through final acceptance/rejection | ✓ VERIFIED | `agent.ts` logs `route_selection`; `orchestrator.ts` logs inference, planning, verdict, compile, result; `orchestrator.test.ts` asserts lifecycle event sequence |
| 14 | The full pipeline runs as planning -> quality verdict -> optional repair -> deterministic compile/commit, without hidden fallback into ordinary mutation flow | ✓ VERIFIED | `orchestrator.ts` sequences `planInitialProject()` then `executeInitialProjectPlan()` and returns controlled failures; `agent.ts` returns immediately after `runInitialGeneration()` |
| 15 | Automated tests cover routing, model selection, planning/quality outcomes, compile/salvage outcomes, and log payloads | ✓ VERIFIED | `agent.test.ts`, `planner.test.ts`, `compiler.test.ts`, and `orchestrator.test.ts` cover the required regression surface; 49 tests passed locally |
| 16 | Phase-local docs include manual verification scenarios for broad and specific construction prompts, including `Построй график` | ✓ VERIFIED | `.planning/phases/41-initial-gen-refactor/docs.md` contains the five required prompts and scope guardrails |

**Score:** 16/16 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `packages/server/src/initial-generation/types.ts` | Typed contracts for route, plan, verdict, routing, compile result | ✓ VERIFIED | Exports `GenerationBrief`, `ProjectPlan`, `PlanQualityVerdict`, `RepairReason`, `ModelRoutingDecision` |
| `packages/server/src/initial-generation/route-selection.ts` | Explicit `initial_generation` route classifier | ✓ VERIFIED | Concrete classifier exists and is used from `agent.ts` |
| `packages/server/src/initial-generation/model-routing.ts` | Strong/cheap/main-fallback model selection | ✓ VERIFIED | Reads `OPENAI_MODEL` and `OPENAI_CHEAP_MODEL`/`cheap_model`, emits typed reason |
| `packages/server/src/initial-generation/brief.ts` | Server-side brief builder | ✓ VERIFIED | Produces object type, scope signals, naming ban, starter schedule expectation, inference policy |
| `packages/server/src/initial-generation/domain-reference.ts` | Construction reference resolver with fallback | ✓ VERIFIED | Recognizes kindergarten, office renovation, private house, generic construction fallback |
| `packages/server/src/initial-generation/planner.ts` | Prompt builder, schema validation, one-shot repair | ✓ VERIFIED | Substantive implementation, not a stub; wired into orchestrator |
| `packages/server/src/initial-generation/quality-gate.ts` | Rule-based plan quality verdicts | ✓ VERIFIED | Scores hierarchy, placeholder naming, coverage, and sequencing |
| `packages/server/src/initial-generation/compiler.ts` | Deterministic `ProjectPlan` compiler | ✓ VERIFIED | Emits authoritative `create_tasks_batch` payload with deterministic IDs |
| `packages/server/src/initial-generation/executor.ts` | Compile/commit plus salvage thresholds | ✓ VERIFIED | Uses `commandService.commitCommand`, enforces salvage floor, returns controlled failures |
| `packages/server/src/initial-generation/orchestrator.ts` | End-to-end lifecycle orchestration | ✓ VERIFIED | Sequences planning, quality, repair, execution, reply persistence, broadcasts, logs |
| `packages/server/src/agent.ts` | Production entrypoint wired to Phase 41 flow | ✓ VERIFIED | Uses route selection, initial-generation delegation, and preserved mutation flow |
| `.planning/phases/41-initial-gen-refactor/docs.md` | Manual prompt matrix and scope guardrails | ✓ VERIFIED | Includes all required prompts and “no new MCP tools / no fallback” notes |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `packages/server/src/agent.ts` | `packages/server/src/initial-generation/route-selection.ts` | Route decision before any fast path or SDK run | ✓ WIRED | `selectAgentRoute()` called before direct shift fast path and mutation run setup |
| `packages/server/src/agent.ts` | `packages/server/src/initial-generation/model-routing.ts` | Pre-run model selection for mutation flow | ✓ WIRED | `resolveModelRoutingDecision({ route: 'mutation', env })` logged before mutation SDK run |
| `packages/server/src/agent.ts` | `packages/server/src/initial-generation/orchestrator.ts` | Initial-generation delegation | ✓ WIRED | `runInitialGeneration()` invoked and returned early on `initial_generation` route |
| `packages/server/src/initial-generation/orchestrator.ts` | `packages/server/src/initial-generation/planner.ts` | Planning and optional repair stage | ✓ WIRED | Default deps call `planInitialProject()` |
| `packages/server/src/initial-generation/orchestrator.ts` | `packages/server/src/initial-generation/executor.ts` | Deterministic compile/commit stage | ✓ WIRED | Default deps call `executeInitialProjectPlan()` |
| `packages/server/src/initial-generation/orchestrator.ts` | `packages/server/src/debug-log.ts` via agent logger | Lifecycle event emission | ✓ WIRED | `agent.ts` passes `writeServerDebugLog`-backed logger into orchestrator |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| --- | --- | --- | --- | --- |
| `packages/server/src/initial-generation/orchestrator.ts` | `reference` / `brief` | `resolveDomainReference()` + `buildGenerationBrief()` from user prompt | Yes | ✓ FLOWING |
| `packages/server/src/initial-generation/orchestrator.ts` | `planning.plan` / `planning.verdict` | `planInitialProject()` using planner query result and quality gate | Yes | ✓ FLOWING |
| `packages/server/src/initial-generation/executor.ts` | `compiledSchedule.command` | `compileInitialProjectPlan()` from validated `ProjectPlan` | Yes | ✓ FLOWING |
| `packages/server/src/initial-generation/executor.ts` | committed batch result | `commandService.commitCommand()` authoritative response | Yes | ✓ FLOWING |
| `packages/server/src/agent.ts` | mutation model selection | `resolveModelRoutingDecision()` from env before SDK query | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Phase 41 regression suite passes | `npx tsx --test packages/server/src/agent.test.ts packages/server/src/initial-generation/planner.test.ts packages/server/src/initial-generation/compiler.test.ts packages/server/src/initial-generation/orchestrator.test.ts` | 49 tests passed, 0 failed | ✓ PASS |
| Server package still builds with the refactor | `npm run build -w packages/server` | MCP prebuild + server TypeScript build succeeded | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| IGR-01 | `41-01-PLAN.md` | Empty broad prompts route to dedicated `initial_generation` instead of deterministic template bootstrap | ✓ SATISFIED | `route-selection.ts`, `agent.ts`, and `agent.test.ts` remove template fast path and assert broad empty-project routing |
| IGR-02 | `41-02-PLAN.md` | Planning uses brief/reference injection with strict validation and at most one repair cycle | ✓ SATISFIED | `brief.ts`, `domain-reference.ts`, `planner.ts`, `quality-gate.ts`, `planner.test.ts` |
| IGR-03 | `41-03-PLAN.md` | Approved plans compile deterministically through `commandService` with salvage thresholds and controlled failure | ✓ SATISFIED | `compiler.ts`, `executor.ts`, `compiler.test.ts` |
| IGR-04 | `41-04-PLAN.md` | Lifecycle logs, regression tests, and manual verification docs reconstruct a full run end to end | ✓ SATISFIED | `orchestrator.ts`, `orchestrator.test.ts`, `agent.ts`, `docs.md` |

No orphaned Phase 41 requirement IDs were found: all IDs declared in Phase 41 plan frontmatter (`IGR-01` through `IGR-04`) exist in `.planning/REQUIREMENTS.md`, and `.planning/REQUIREMENTS.md` maps exactly those four IDs to Phase 41.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| None | - | No blocking stub, placeholder, or hidden-fallback patterns found in the Phase 41 implementation surface | ℹ️ Info | The remaining `return null` matches are helper-control paths, not user-visible stubs |

### Human Verification Required

### 1. Live Prompt Matrix

**Test:** Run each prompt from `.planning/phases/41-initial-gen-refactor/docs.md` in a real empty project.
**Expected:** The result is subject-specific, hierarchically useful, realistically sequenced, contains no clarifying question, and falls back to a private-house baseline for `Построй график`.
**Why human:** Actual planner output quality and domain realism depend on the live model.

### 2. Live Observability Trace

**Test:** Inspect `.planning/debug/server-agent.log` after one real initial-generation run using a single `runId`.
**Expected:** The log reconstructs the full lifecycle with `route_selection`, `object_type_inference`, `model_routing_decision`, `planning_output`, `plan_quality_verdict`, `compile_verdict`, and `initial_generation_result`.
**Why human:** Tests prove event emission shape, but not a real operational run with real planner output and persisted logs.

### Gaps Summary

No implementation gaps were found in the codebase against the Phase 41 must-haves. The phase is code-complete and passes its automated verification surface, but final sign-off still depends on human validation of live model output quality and real-run observability.

---

_Verified: 2026-04-08T11:49:31.9603975Z_
_Verifier: Claude (gsd-verifier)_
