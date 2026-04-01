---
phase: 35-scheduling-core-adoption
verified: 2026-03-31T19:20:00Z
status: passed
score: 16/16 must-haves verified
---

# Phase 35: Scheduling Core Adoption Verification Report

**Phase Goal:** Сервер выполняет schedule mutations теми же правилами, что и актуальный gantt-lib core, и возвращает authoritative changed-set для agent/web persistence
**Verified:** 2026-03-31
**Status:** passed
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths -- Plan 35-03

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Agent guidance prefers schedule-intent mutations over raw date rewrites when dependencies matter | VERIFIED | `packages/mcp/agent/prompts/system.md:29-32` prefers `move_task` / `resize_task` / `recalculate_schedule`; `packages/mcp/agent/prompts/system.md:76` repeats the rule for linked edits |
| 2 | Scheduling tool responses are treated as authoritative changed sets in the agent contract | VERIFIED | `packages/mcp/agent/prompts/system.md:39-41` instructs the agent to trust `changedTasks` / `changedIds` and surface empty or partial results explicitly |
| 3 | Server verification computes the actual persisted changed set rather than inferring success from a single edited task | VERIFIED | `packages/server/src/agent.ts:523-534` computes `actualChangedTaskIds`, compares them with run mutation IDs, and records consistency |
| 4 | Partial or stale mutation results are rejected explicitly | VERIFIED | `packages/server/src/agent.ts:736-741` converts inconsistent changed sets into a partial-mutation failure path instead of returning success |
| 5 | Retry guidance also steers the agent toward schedule-intent tools and changed-set-aware answers | VERIFIED | `packages/server/src/agent.ts:768-769` tells retries to prefer `move_task` / `resize_task` / `recalculate_schedule` and reflect the full authoritative cascade |
| 6 | Server API responses surface `changedIds` from the authoritative save path | VERIFIED | `packages/server/src/index.ts:100-116` calls `taskService.updateWithResult()` and returns the result including `changedIds` |
| 7 | The web mutation hook normalizes schedule-aware responses into `task`, `changedTasks`, and `changedIds` | VERIFIED | `packages/web/src/hooks/useTaskMutation.ts:32-64` defines and normalizes `TaskMutationResponse` around `changedTasks` / `changedIds` |
| 8 | The web save flow merges server-returned changed tasks into local state instead of trusting stale local cascade math | VERIFIED | `packages/web/src/hooks/useBatchTaskUpdate.ts:104-112` applies authoritative task results by merging `result.changedTasks` into state |
| 9 | Linked/deletion-related batch edits persist through an authoritative cascade path | VERIFIED | `packages/web/src/hooks/useBatchTaskUpdate.ts:114-133` iterates pending changed tasks through `mutateTask()` and updates local state from returned `changedTasks` |
| 10 | Schedule-aware batch saves avoid the generic batch path and use authoritative per-task PATCH persistence | VERIFIED | `packages/web/src/hooks/useBatchTaskUpdate.ts:287-290` switches schedule-aware batches to the authoritative cascade flow |
| 11 | Single-task saves also apply the authoritative server result | VERIFIED | `packages/web/src/hooks/useBatchTaskUpdate.ts:305-309` uses `applyAuthoritativeTaskResult(await mutateTask(...))` |

**Score:** 11/11 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/mcp/agent/prompts/system.md` | Agent rules for schedule-aware planning mutations | VERIFIED | Prefers schedule-intent tools and changed-set-aware verification for linked edits |
| `packages/server/src/agent.ts` | Changed-set aware mutation verification | VERIFIED | Computes actual changed IDs, run changed IDs, and rejects inconsistent mutation footprints |
| `packages/server/src/index.ts` | API responses preserve authoritative schedule result metadata | VERIFIED | PATCH task route returns `updateWithResult()` payload with `changedIds` |
| `packages/web/src/hooks/useTaskMutation.ts` | Client mutation contract exposes authoritative changed-task payloads | VERIFIED | Normalizes both legacy and changed-set responses into one authoritative shape |
| `packages/web/src/hooks/useBatchTaskUpdate.ts` | Web reconciliation applies server-authoritative changed tasks | VERIFIED | Merges returned `changedTasks` into local state for single and schedule-aware batch saves |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `packages/mcp/agent/prompts/system.md` | `packages/server/src/agent.ts` | Agent mutation protocol and verification expectations | WIRED | Prompt prefers `move_task` / `resize_task` / `recalculate_schedule`; server retry/verification logic enforces the same changed-set contract |
| `packages/web/src/hooks/useBatchTaskUpdate.ts` | `packages/server/src/index.ts` | Client applies final affected-task state returned by server | WIRED | Web hook consumes `changedTasks` / `changedIds`; server PATCH route returns `taskService.updateWithResult()` with `changedIds` |

### Automated Checks

| Check | Status | Details |
|-------|--------|---------|
| `npm run build -w packages/server` | PASSED | Initial sandbox run failed with `EPERM` on `dist` writes; rerun outside sandbox completed successfully |
| `npm run build --workspace @gantt/web` | PASSED | Initial sandbox run failed with `spawn EPERM`; rerun outside sandbox completed successfully with non-blocking bundle warnings |

### Commit Verification

| Commit | Expectation | Status |
|--------|-------------|--------|
| `8091406` | Authoritative schedule result application in agent/server/web flow | VERIFIED |
| `a737f1a` | Changed-set verification hardening and prompt guidance | VERIFIED |
| `7679a7d` | MCP schedule command surface from prior plan dependency | VERIFIED |
| `5492c9d` | Headless scheduling core from prior plan dependency | VERIFIED |

### Requirements Coverage

No formal requirement IDs were assigned to Phase 35 plan frontmatter (`requirements: []`). Verification is anchored to the PRD at `.planning/reference/scheduling-core-adoption-prd.md` and the plan-level must-haves for 35-01, 35-02, and 35-03.

### Human Verification Recommended

1. **Linked drag/save flow in the browser**
   - Test: Move a dependency-linked task in the Gantt UI and save it.
   - Expected: The persisted result matches the returned authoritative cascade, including downstream tasks and summary recomputes.
   - Why human: This requires a live browser session plus real project data.

2. **Agent schedule mutation response wording**
   - Test: Ask the agent to move a dependency-linked task and inspect its final answer.
   - Expected: The answer reflects the full server-reported changed set rather than only the directly edited task.
   - Why human: This depends on live model behavior over the MCP tool surface.

### Gaps Summary

No gaps found. The phase now has a consistent authoritative changed-set contract across MCP prompt guidance, server-side verification, API responses, and web reconciliation. Both required builds passed, and all referenced phase commits exist in git history.

---

_Verified: 2026-03-31_
_Verifier: Codex (direct verification pass after stalled verifier agent)_
