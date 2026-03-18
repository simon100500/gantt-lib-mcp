# Gantt Integration Audit

Date: 2026-03-19

## Goal

Find remaining legacy logic around task hierarchy, cascade, and parent-date handling outside `gantt-lib`, after fixing the sibling-stretch regression in the web app.

## Summary

There is no second obvious web-side handler equivalent to the removed descendant-synthesis bug in `packages/web/src/hooks/useBatchTaskUpdate.ts`.

The main remaining issue is architectural: hierarchy and scheduling rules still live in three places:

1. `gantt-lib`
2. web integration layer (`packages/web/src/hooks/useBatchTaskUpdate.ts`)
3. server task service (`packages/mcp/src/services/task.service.ts`)

That duplication increases the chance of future drift even when each individual piece looks correct today.

## Findings

### 1. Removed bug was a real web-side legacy rule

File:
- `packages/web/src/hooks/useBatchTaskUpdate.ts`

What was wrong:
- The handler synthesized descendant updates for any changed parent task.
- When `gantt-lib` emitted `[moved child, recomputed parent]`, the app misread the recomputed parent as a direct parent move.
- That caused siblings and descendants to be stretched locally in the app.

Current state:
- Fixed.
- The handler now persists only the task batch actually returned by the library.

### 2. No other matching descendant-synthesis logic found in `packages/web`

Scanned areas:
- `packages/web/src/App.tsx`
- `packages/web/src/components/GanttChart.tsx`
- `packages/web/src/hooks/useBatchTaskUpdate.ts`
- `packages/web/src/stores/useTaskStore.ts`
- `packages/web/src/hooks/useTaskMutation.ts`
- `packages/web/src/hooks/useAutoSave.ts`

Result:
- No second place in the web app was found that manually cascades child date changes from a recomputed parent.
- The dangerous pattern appears to have been isolated to `useBatchTaskUpdate.ts`.

### 3. `useBatchTaskUpdate` still contains business logic beyond transport

File:
- `packages/web/src/hooks/useBatchTaskUpdate.ts`

This hook still owns:
- pure reorder detection
- deletion-specific dependency-only handling
- optimistic merge logic
- reorder persistence with `sortOrder`
- promote/demote optimistic hierarchy updates

Assessment:
- This is not necessarily wrong.
- But this hook is not a thin adapter anymore; it still contains app-owned task semantics.
- Any future misunderstanding of library batch semantics is most likely to happen here again.

### 4. Server still re-implements part of the hierarchy rules

File:
- `packages/mcp/src/services/task.service.ts`

Server-owned rules currently include:
- recomputing parent dates from children
- scheduler-based dependency recalculation
- recomputing affected parents after batch updates

Important detail:
- The current server behavior looks compatible with the intended rule:
  parent dates are derived from children, and siblings are not shifted from parent recompute.
- But this is still an independent implementation of hierarchy behavior outside `gantt-lib`.

Risk:
- If `gantt-lib` behavior changes and server logic is not updated in parallel, client and persisted state can diverge.

### 5. `useAutoSave` is deprecated and currently unused

File:
- `packages/web/src/hooks/useAutoSave.ts`

Result:
- No active usage was found in `packages/web/src`.

Assessment:
- It is not part of the current bug path.
- But it remains a dormant alternate persistence flow that writes full task arrays via `PUT /api/tasks`.
- Keeping it around increases maintenance surface and confusion during debugging.

## Risk Ranking

### High Risk

- `packages/web/src/hooks/useBatchTaskUpdate.ts`
  Because it is the main semantic adapter between library output and persisted app state.

### Medium Risk

- `packages/mcp/src/services/task.service.ts`
  Because it re-applies parent and dependency rules on the backend and can drift from library semantics.

### Low Risk

- `packages/web/src/hooks/useAutoSave.ts`
  Because it is unused, but still present as a legacy alternate path.

## Recommended Direction

### 1. Keep `gantt-lib` as the source of truth for interaction semantics

`gantt-lib` should own:
- drag semantics
- resize semantics
- parent recompute behavior
- dependency cascade behavior
- emitted changed-task batches

The web app should avoid re-deriving any hierarchy date mutations from partial batches.

### 2. Reduce `useBatchTaskUpdate` to persistence/orchestration only

Target responsibilities:
- optimistic state merge of received tasks
- choose `PATCH` vs `PUT`
- save `sortOrder` for reorder operations
- rollback/error UX

Avoid adding back:
- inferred child cascades
- inferred parent cascades
- local hierarchy date recomputation

### 3. Decide whether parent-date recompute belongs to server or library contract

Current state:
- both client/library flow and backend service know the rule "parent dates come from children"

Recommended options:

Option A:
- keep server recompute as persistence safety net
- document clearly that backend normalization may adjust parent dates after save

Option B:
- move toward server trusting the library payload more fully
- keep only validation/integrity checks on backend

If Option A is kept, add explicit tests that server recompute never shifts siblings when only one child changes.

### 4. Remove or archive `useAutoSave`

Recommended actions:
- either delete it
- or move it to an explicit archive/legacy area

Reason:
- it is deprecated and unused
- it creates uncertainty during debugging
- it suggests an old persistence model that is no longer authoritative

## Concrete Next Steps

1. Add regression tests for `useBatchTaskUpdate` around partial batches from `gantt-lib`:
- `[child, recomputed parent]` must not mutate siblings
- `[moved parent, moved children]` must persist exactly what library emitted

2. Add backend tests for `TaskService.batchUpdateTasks` and `TaskService.update`:
- updating one child recomputes parent dates only
- sibling dates remain unchanged

3. Either remove `useAutoSave` or mark it as archived and unreachable from production code.

4. Add a short contract document for integration semantics:
- library emits changed tasks only
- app persists those tasks only
- backend may normalize parent dates, but must not synthesize sibling shifts

## Bottom Line

The specific sibling-stretch bug came from one web-side legacy handler and has been removed.

There is not another equally obvious copy of that bug in `packages/web`.

The bigger remaining problem is duplicated business rules across library, web adapter, and backend service. That duplication is now the main source of future regressions.
