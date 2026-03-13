---
phase: quick-batch-update
plan: 31
title: "Batch task update pattern for gantt-lib onChange events"
one-liner: "Implemented useBatchTaskUpdate hook for individual task mutations with optimistic updates"
subsystem: "Web Application Frontend"
tags: ["gantt-lib", "batch-updates", "optimistic-updates", "rest-api"]
dependency_graph:
  requires: []
  provides: ["batch-task-update-hook"]
  affects: ["App.tsx", "useAutoSave.ts"]
tech_stack:
  added: ["useBatchTaskUpdate hook"]
  patterns: ["optimistic updates", "individual REST mutations", "error rollback"]
key_files:
  created: ["packages/web/src/hooks/useBatchTaskUpdate.ts"]
  modified: ["packages/web/src/App.tsx", "packages/web/src/components/GanttChart.tsx", "packages/web/src/hooks/useAutoSave.ts"]
decisions: []
metrics:
  duration: "1 minute"
  completed_date: "2026-03-13T22:52:00Z"
  tasks_completed: 3
  commits: 3
  files_changed: 4
---

# Phase Quick-Batch-Update Plan 31: Batch task update pattern for gantt-lib onChange events

## Summary

Implemented a new `useBatchTaskUpdate` hook that correctly handles gantt-lib's `onTasksChange` callback according to the batch task principle documented in REFERENCE.md section 12. The library sends ONLY changed tasks, not the full array, and the app now processes these changes via individual API mutations with optimistic updates.

**Purpose:** Fixed the inefficient `useAutoSave` implementation that sent ALL tasks via PUT /api/tasks on every change, causing unnecessary server load and potential race conditions.

## What Was Done

### Task 1: Created useBatchTaskUpdate hook
- **File:** `packages/web/src/hooks/useBatchTaskUpdate.ts` (204 lines)
- **Handlers implemented:**
  - `handleTasksChange` - Processes changed tasks with optimistic updates and individual PATCH calls
  - `handleAdd` - Creates new tasks via POST with optimistic add and rollback on error
  - `handleDelete` - Deletes tasks via DELETE with optimistic removal and rollback on error
  - `handleInsertAfter` - Inserts tasks after a given task with create-and-replace pattern
  - `handleReorder` - Handles drag-and-drop reordering with parentId updates
  - `handlePromoteTask` - Promotes child tasks to root level with server update
  - `handleDemoteTask` - Demotes tasks to children with server update

### Task 2: Updated App.tsx to use useBatchTaskUpdate
- Removed `useAutoSave` import and usage
- Added `useBatchTaskUpdate` hook call with tasks, setTasks, accessToken
- Replaced all GanttChart handlers with batchUpdate handlers
- Removed saving status indicator UI (no longer needed with per-task mutations)
- Fixed `handleEmptyChart` to use `batchUpdate.handleAdd`
- Kept `handleCascade` for cascade operations
- Preserved `useTaskMutation` for direct AI agent operations

### Task 3: Deprecated useAutoSave
- Added JSDoc deprecation notice with migration guide
- Fixed TypeScript null check bug (`abortControllerRef.current?.signal`)
- Explained inefficiency of sending all tasks via PUT
- Kept hook for potential legacy use but marked as deprecated

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript null check in useAutoSave**
- **Found during:** Task 2 (build verification)
- **Issue:** TypeScript error at line 168 - `abortControllerRef.current` possibly null
- **Fix:** Changed `abortControllerRef.current.signal` to `abortControllerRef.current?.signal`
- **Files modified:** `packages/web/src/hooks/useAutoSave.ts`
- **Commit:** d0f30e9 (part of Task 3)

**2. [Rule 3 - Blocking] Fixed GanttChart prop passing issue**
- **Found during:** Task 2 (build verification)
- **Issue:** TypeScript error - `onPromoteTask` and `onDemoteTask` props not accepted by gantt-lib types
- **Fix:** Changed to conditional prop spreading `{...(onPromoteTask && { onPromoteTask })}`
- **Files modified:** `packages/web/src/components/GanttChart.tsx`
- **Commit:** ff3aece (part of Task 2)

**3. [Rule 2 - Missing Functionality] Removed saving status UI**
- **Found during:** Task 2
- **Issue:** `savingState` variable no longer exists after removing `useAutoSave`, but UI still referenced it
- **Fix:** Removed saving status indicator UI entirely (not needed with per-task mutations)
- **Files modified:** `packages/web/src/App.tsx`
- **Commit:** ff3aece (part of Task 2)

## Verification

1. **Compilation:** `npm run build --workspace=packages/web` succeeded without errors
2. **TypeScript:** No TypeScript errors after fixes
3. **Handler mapping:** All GanttChart props correctly mapped to batchUpdate handlers
4. **Pattern compliance:** Implementation follows REFERENCE.md section 12 patterns

## Success Criteria

- [x] `useBatchTaskUpdate` hook created with all required handlers
- [x] App.tsx uses new hook instead of useAutoSave
- [x] GanttChart onChange events trigger PATCH/POST/DELETE per task
- [x] Optimistic updates maintain UI responsiveness
- [x] useAutoSave deprecated with notice
- [x] No compilation errors
- [x] Code follows REFERENCE.md section 12 patterns

## Output

After completion, the web application correctly handles gantt-lib's batch update pattern:
- Individual task changes are sent via PATCH to `/api/tasks/{id}`
- New tasks are created via POST to `/api/tasks`
- Deleted tasks are removed via DELETE to `/api/tasks/{id}`
- Optimistic updates ensure immediate UI feedback
- Errors trigger rollback to previous state
- No more full-array PUT requests on every change

## Commits

1. **76af73f** - feat(quick-31): create useBatchTaskUpdate hook for gantt-lib onChange
2. **ff3aece** - feat(quick-31): replace useAutoSave with useBatchTaskUpdate in App.tsx
3. **d0f30e9** - chore(quick-31): deprecate useAutoSave hook

## Self-Check: PASSED

- [x] All created files exist: `packages/web/src/hooks/useBatchTaskUpdate.ts`
- [x] All commits exist: 76af73f, ff3aece, d0f30e9
- [x] Build succeeds without errors
- [x] All tasks completed (3/3)
- [x] SUMMARY.md created

## Notes

The new implementation correctly follows the gantt-lib batch task principle:
- `onTasksChange` receives ONLY the changed tasks
- Single task changes are single-element arrays
- Cascade operations include all affected tasks
- Each task is sent to the server via individual mutation
- Optimistic updates provide immediate feedback
- Error handling with rollback maintains data consistency

This replaces the inefficient useAutoSave pattern that sent ALL tasks via PUT on every change.
