---
phase: 32-gnatt-lib-parent-tasks-no-longer-sent-wh
plan: 01
subsystem: Frontend & Backend
tags: [gantt-lib, parent-tasks, batch-update, backend-computation]
dependency_graph:
  requires: []
  provides: ["gantt-lib-0.10.0", "parent-task-filtering", "parent-date-computation"]
  affects: ["packages/web", "packages/mcp"]
tech_stack:
  added:
    - "gantt-lib 0.10.0"
  patterns:
    - "Parent task filtering in batch updates"
    - "Backend parent date computation from children"
key_files:
  created: []
  modified:
    - "packages/web/package.json"
    - "packages/web/src/hooks/useBatchTaskUpdate.ts"
    - "packages/mcp/src/services/task.service.ts"
decisions: []
metrics:
  duration: "1 minute"
  completed_date: "2026-03-14"
---

# Phase 32 Plan 01: gantt-lib parent tasks no longer sent when children change Summary

Update gantt-lib to version 0.10.0 and adapt the application to handle the new parent task behavior where parent tasks are no longer sent when children change, reducing redundant data transfer and ensuring parent dates are computed on the backend.

## One-liner

Updated to gantt-lib 0.10.0 with parent task filtering in frontend batch updates and backend parent date computation from children.

## Tasks Completed

### Task 1: Update gantt-lib to version 0.10.0
- Updated `packages/web/package.json` from `gantt-lib: ^0.9.1` to `gantt-lib: ^0.10.0`
- Ran `npm install` to update the package
- **Commit:** `5fd0453`

### Task 2: Update batch update logic to handle new parent task behavior
- Added `filterParentTasks` helper function to filter out parent tasks when children are also in the batch
- Modified `handleTasksChange` to use filtered tasks for optimistic updates and server calls
- Added logging to track when parent tasks are filtered out
- **Commit:** `fb3bf3d`

### Task 3: Add backend parent date computation from children
- Added `computeParentDates` helper method in `TaskService`
- Parent start = min of children starts, Parent end = max of children ends
- Integrated parent date recomputation in `update()` method for single task updates
- Integrated parent date recomputation in `batchUpdateTasks()` for batch updates
- **Commit:** `6c3bf15`

## Deviations from Plan

None - plan executed exactly as written.

## Key Changes

### Frontend (`packages/web/src/hooks/useBatchTaskUpdate.ts`)
- **filterParentTasks**: Filters out parent tasks when their children are also changing
- Compatible with both gantt-lib 0.9.1 (which sends parents) and 0.10.0 (which doesn't)
- Reduces redundant API calls by not sending parent tasks when children change

### Backend (`packages/mcp/src/services/task.service.ts`)
- **computeParentDates**: Computes parent task dates from its children
- Automatically updates parent dates when children are modified
- Handles both single task updates and batch updates

## Verification

1. [x] gantt-lib version is 0.10.0 in package.json and npm list
2. [x] Parent tasks are filtered out when children are also in the batch
3. [x] Backend computes parent dates from children when children are updated
4. [x] Application builds without errors
5. [x] All changes committed to git

## Testing Recommendations

1. Drag a child task and verify only the child is sent to the API (not parent)
2. Drag a parent task and verify only children are sent to the API (not parent)
3. Verify parent dates are automatically computed from children after changes
4. Test demotion/promotion to ensure dates are computed correctly

## Commits

- `5fd0453`: feat(32-01): update gantt-lib to version 0.10.0
- `fb3bf3d`: feat(32-01): add parent task filtering in batch update logic
- `6c3bf15`: feat(32-01): add backend parent date computation from children

## Self-Check: PASSED

All tasks completed successfully, all changes committed, application builds without errors.
