---
phase: 42-mcp-mutation-refactor
verified: 2026-04-13T20:58:19Z
status: gaps_found
score: 2/3 must-haves verified
gaps:
  - truth: "Ordinary conversational edits разных классов (`add`, `shift`, `move-to-date`, `metadata`, `fan-out`, `expand WBS`, `link/unlink`, `delete`) проходят через explicit staged lifecycle и заканчиваются подтверждённым изменением проекта или typed controlled failure"
    status: failed
    reason: "Two promised ordinary mutation families are still hollow in the staged flow: repeated-group fan-out collapses to one root container, and link/unlink resolves only one anchor, producing an incomplete operation."
    artifacts:
      - path: "packages/server/src/mutation/resolver.ts"
        issue: "Stage 2 group resolution keeps only `rootTaskId` in `context.containers` and link/unlink searches only `entitiesMentioned[0]`, so required member-group and second-task anchors are dropped."
      - path: "packages/server/src/mutation/plan-builder.ts"
        issue: "Stage 3 fan-out uses `resolutionContext.containers.map(...)` as `groupIds`, so it fans out only to the root container; link/unlink compiles from the incomplete resolution state and can emit `taskId: \"\"`."
      - path: "packages/server/src/mutation/orchestrator.test.ts"
        issue: "Regression coverage locks only failure UX for group-scope prompts and does not exercise successful per-group fan-out or successful link/unlink staging."
    missing:
      - "Carry repeated-group member IDs from `findGroupScopes()` into `ResolvedMutationContext` and compile `fanout_fragment_to_groups` against those member group IDs."
      - "Resolve both endpoints for `link_tasks` and `unlink_tasks`, then build operations with two concrete task IDs and matching expected changed sets."
      - "Add passing end-to-end staged tests for successful fan-out and link/unlink flows, not only classification or failure cases."
---

# Phase 42: MCP Mutation Refactor Verification Report

**Phase Goal:** Finish the staged mutation refactor so ordinary conversational edits flow through typed classification, resolution, plan formation, deterministic or constrained execution, controlled failures, and full lifecycle observability instead of one opaque freeform mutation attempt.
**Verified:** 2026-04-13T20:58:19Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Ordinary conversational edits разных классов (`add`, `shift`, `move-to-date`, `metadata`, `fan-out`, `expand WBS`, `link/unlink`, `delete`) проходят через explicit staged lifecycle и заканчиваются подтверждённым изменением проекта или typed controlled failure | ✗ FAILED | Single-anchor flows exist, but `add_repeated_fragment` drops `memberTaskIds` and fans out only to `floors-root`, while `link/unlink` resolves only the first named task and can compile `taskId: ""` instead of a two-task command. |
| 2 | LLM остаётся слоем интерпретации недетерминированных вводных и semantic choices, а конечное исполнение mutation plan выполняется серверными алгоритмами | ✓ VERIFIED | `agent.ts` hands ordinary edits into `runStagedMutation` before legacy execution, `orchestrator.ts` resolves/builds/executes, and `execution.ts` commits only through `commandService.commitCommand(...)`. |
| 3 | По одному run в логах восстанавливается полный mutation lifecycle: intent, resolution evidence, selected execution mode, authoritative changed set, final verdict | ✓ VERIFIED | `orchestrator.ts` logs `intent_classified`, `resolution_started`, `resolution_result`, `mutation_plan_built`, `deterministic_execution_started`, `execution_committed`, `verification_result`, and `final_outcome`; `agent.ts` routes those through `writeServerDebugLog(...)`. |

**Score:** 2/3 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `packages/server/src/mutation/types.ts` | Typed staged contracts | ✓ VERIFIED | Intent, resolution, plan, execution, failure, and fragment types exist. |
| `packages/server/src/mutation/intent-classifier.ts` | Stage 1 typed classification | ✓ VERIFIED | Locked families and Russian prompt classification exist. |
| `packages/server/src/mutation/execution-routing.ts` | Deterministic/hybrid/full-agent routing | ✓ VERIFIED | Explicit mode routing exists and is used by the orchestrator. |
| `packages/server/src/mutation/resolver.ts` | Stage 2 anchor/container/group resolution | ⚠️ HOLLOW | Wired and substantive, but group-scope data and second-task link/unlink anchors do not survive into usable staged outputs. |
| `packages/server/src/mutation/plan-builder.ts` | Stage 3 semantic plan formation | ⚠️ HOLLOW | Deterministic plans exist, but fan-out and link/unlink compile from incomplete resolution state. |
| `packages/server/src/mutation/execution.ts` | Stage 4 authoritative execution and verification | ✓ VERIFIED | Compiles operations to `ProjectCommand`s and verifies changed-set equality. |
| `packages/server/src/mutation/messages.ts` | Typed staged outcome UX | ✓ VERIFIED | Controlled failure and success builders exist and are used. |
| `packages/server/src/mutation/orchestrator.ts` | End-to-end staged lifecycle shell | ✓ VERIFIED | Classification, resolution, plan build, execution, verification, and final outcome logging are wired. |
| `packages/mcp/src/services/task.service.ts` | Read-only search helpers | ✓ VERIFIED | Task/container/branch/group helpers exist, including `memberTaskIds` from group scopes. |
| `packages/server/src/mutation/orchestrator.test.ts` | Regression coverage for staged behavior | ⚠️ PARTIAL | Covers deterministic success and typed failures, but not successful fan-out to each group or successful link/unlink plan execution. |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `packages/server/src/agent.ts` | `packages/server/src/mutation/orchestrator.ts` | ordinary-edit handoff before legacy mutation attempt | ✓ WIRED | `runStagedMutation(...)` is called before `executeAgentAttempt(...)`. |
| `packages/server/src/mutation/orchestrator.ts` | `packages/server/src/mutation/resolver.ts` | stage 2 resolution | ✓ WIRED | `resolveMutationContext(...)` is called before plan building. |
| `packages/server/src/mutation/orchestrator.ts` | `packages/server/src/mutation/plan-builder.ts` | stage 3 mutation-plan formation | ✓ WIRED | `buildMutationPlan(...)` runs after successful resolution. |
| `packages/server/src/mutation/orchestrator.ts` | `packages/server/src/mutation/execution.ts` | deterministic/hybrid execution | ✓ WIRED | `executeMutationPlan(...)` runs for non-agent plans. |
| `packages/server/src/mutation/orchestrator.ts` | `packages/server/src/mutation/messages.ts` | typed controlled user-facing outcomes | ✓ WIRED | Staged success/failure paths build user-facing Russian messages. |
| `packages/server/src/mutation/resolver.ts` | `packages/mcp/src/services/task.service.ts` | group-scope resolution | ⚠️ PARTIAL | `findGroupScopes()` returns `memberTaskIds`, but resolver keeps only `rootTaskId` in `context.containers`. |
| `packages/server/src/mutation/resolver.ts` | `packages/mcp/src/services/task.service.ts` | two-anchor link/unlink resolution | ✗ NOT_WIRED | Resolver searches only `entitiesMentioned[0]`, so the second task anchor is never resolved. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| --- | --- | --- | --- | --- |
| `packages/server/src/mutation/orchestrator.ts` | `resolutionContext` -> `plan` -> `execution` | classifier/resolver/plan-builder/execution | Yes | ✓ FLOWING |
| `packages/server/src/mutation/resolver.ts` | group scope members | `task.service.ts:349-380` returns `memberTaskIds` | No, staged context keeps only `rootTaskId` (`resolver.ts:149-158`) | ✗ DISCONNECTED |
| `packages/server/src/mutation/plan-builder.ts` | `groupIds` for fan-out | `resolutionContext.containers.map(...)` (`plan-builder.ts:294`) | No, yields only `floors-root` in spot-check | ✗ HOLLOW |
| `packages/server/src/mutation/resolver.ts` + `plan-builder.ts` | two task IDs for `link/unlink` | `classifyMutationIntent(...).entitiesMentioned` | No, only first entity is searched; resulting operation had `taskId: ""` in spot-check | ✗ HOLLOW |
| `packages/server/src/mutation/orchestrator.ts` | lifecycle telemetry payloads | `logger.debug(...)` bridged from `agent.ts` to `writeServerDebugLog(...)` | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Staged orchestrator regressions run | `npx tsx --test packages/server/src/mutation/orchestrator.test.ts` | 8 tests passed | ✓ PASS |
| Agent staged integration regressions run | `npx tsx --test packages/server/src/agent.test.ts` | 28 tests passed | ✓ PASS |
| Resolver/plan/execution unit regressions run | `npx tsx --test packages/server/src/mutation/resolver.test.ts packages/server/src/mutation/plan-builder.test.ts packages/server/src/mutation/execution.test.ts` | 11 tests passed | ✓ PASS |
| Fan-out uses per-group member IDs | inline `tsx` spot-check calling `resolveMutationContext()` + `buildMutationPlan()` for `добавь покраску обоев на каждый этаж` | `groupIds` output was `["floors-root"]`, not `["floor-1","floor-2"]` | ✗ FAIL |
| Link intent resolves two anchors | inline `tsx` spot-check calling classifier + resolver + plan builder for `свяжи исполнительную документацию и акт приемки` | search queries were only `["исполнительную документацию"]`; built operation had `taskId: ""` | ✗ FAIL |
| Workspace-wide test script | `npm test -- --runInBand ...` | root package has no `test` script | ? SKIP |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| `MMR-01` | `42-01-PLAN.md` | Ordinary edits pass through explicit `intent -> resolution -> mutation_plan -> execution -> verification` stages instead of one opaque freeform run | ✓ SATISFIED | `agent.ts` hands into `runStagedMutation`; `orchestrator.ts` implements staged lifecycle and only defers complex shapes to legacy. |
| `MMR-02` | `42-02-PLAN.md` | Server resolves task/container anchors for short natural-language edits without making the model invent IDs, placement, or dates | ✗ BLOCKED | Resolver does not fully resolve multi-anchor link/unlink requests and drops group member IDs needed for per-group execution. |
| `MMR-03` | `42-03-PLAN.md` | Common mutations can execute through deterministic or tightly constrained server-side paths with authoritative changed-set verification | ✗ BLOCKED | Shift/date-move/add succeed, but fan-out and link/unlink are not fully executable from staged data flow; spot-checks showed root-only fan-out and malformed link payload. |
| `MMR-04` | `42-02-PLAN.md`, `42-04-PLAN.md` | Simple mutation failures return typed controlled reasons instead of generic “no valid mutation tool call” | ✓ SATISFIED | `messages.ts` maps typed reasons; `agent.test.ts` confirms generic string remains only in legacy fallback branch. |
| `MMR-05` | `42-04-PLAN.md` | Debug logs reconstruct the full mutation lifecycle | ✓ SATISFIED | `orchestrator.ts` emits the full lifecycle event set; `agent.ts` routes them via `writeServerDebugLog(...)`. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| `packages/server/src/mutation/resolver.ts` | 87-120 | Single-anchor extraction reused for `link_tasks` / `unlink_tasks` | 🛑 Blocker | Two-task dependency edits cannot resolve both endpoints. |
| `packages/server/src/mutation/resolver.ts` | 149-158 | Group scope collapsed to one root container | 🛑 Blocker | Repeated-fragment requests cannot fan out to each matched group. |
| `packages/server/src/mutation/plan-builder.ts` | 294-299 | Fan-out `groupIds` derived from `resolutionContext.containers` only | 🛑 Blocker | Execution targets one root branch instead of repeated sibling groups. |
| `packages/server/src/mutation/plan-builder.ts` | 226-251 | Link/unlink plan built from incomplete `resolutionContext.tasks` | 🛑 Blocker | Can emit malformed operations with missing `taskId`. |

### Human Verification Required

No additional human-only checks are blocking the verdict. Automated code-path verification already found functional gaps.

### Gaps Summary

The staged shell is real and much of the architecture exists: classification, routing, server-side plan building, `commandService` execution, typed failures, and lifecycle telemetry are all present. Single-anchor edits such as shift, move-to-date, rename, metadata update, and simple add flows are structurally wired.

The phase goal is still not achieved because two of the promised ordinary mutation families are hollow in the actual code paths. Group fan-out resolves scopes in `TaskService`, but the staged pipeline throws away `memberTaskIds` and executes only against the group root. Link/unlink classification recognizes two named entities, but the resolver searches only the first one, and the plan builder can then emit an operation with an empty `taskId`. Those failures block the roadmap truth that ordinary edits across the promised classes complete through staged execution or typed controlled failure.

---

_Verified: 2026-04-13T20:58:19Z_
_Verifier: Claude (gsd-verifier)_
