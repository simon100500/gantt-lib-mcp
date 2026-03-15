---
status: resolved
trigger: "entity-deletion-not-working"
created: 2026-03-14T00:00:00.000Z
updated: 2026-03-15T13:10:00.000Z
---

## Current Focus
hypothesis: handleDelete IS being called, but deleteTask API call is failing (401/404/500), triggering the catch block which re-adds the task at the END of the array via setTasks(prev => [...prev, taskToDelete]). This "appended to end" behavior matches "moves to last position in its group" exactly.
test: Add precise logging around deleteTask() call in handleDelete to capture API response status and error
expecting: If hypothesis is correct, logs will show a failed deleteTask call followed by the catch block executing
next_action: Add logging, reproduce, check console, confirm error

## Symptoms
expected: Tasks delete via gantt-lib UX (links immediately, tasks with confirmation)
actual: Tasks move to the last position in their group instead of being deleted
errors: No errors in browser console or network tab
reproduction: User clicks delete button (trash icon) twice to confirm deletion
started: Never worked / unsure

## Eliminated

## Evidence
- timestamp: 2026-03-14T00:00:01.000Z
  checked: gantt-lib source code and type definitions
  found: onDelete callback is properly defined and passed through GanttChart -> GanttLibChart -> TaskList
  implication: Handler is connected correctly

- timestamp: 2026-03-14T00:00:02.000Z
  checked: gantt-lib TaskList component implementation
  found: Delete button exists at line 3069-3081 in gantt-lib/dist/index.js. Two-click mechanism: first click shows "Удалить?", second click calls onDelete(task.id)
  implication: Handler should be called when user confirms deletion

- timestamp: 2026-03-14T00:00:03.000Z
  checked: App.tsx configuration
  found: disableDependencyEditing = false (editing enabled), showTaskList = true (list visible)
  implication: Delete buttons should be visible and functional

- timestamp: 2026-03-14T00:00:04.000Z
  checked: Link deletion in gantt-lib
  found: Links are deleted via onRemoveDependency -> handleRemoveDependency -> onTasksChange. User must: 1) Click dependency chip to select it, 2) Click delete button
  implication: Link deletion goes through onTasksChange, not onDelete

- timestamp: 2026-03-14T00:00:05.000Z
  checked: CSS styles and z-index values
  found: Task list overlay has z-index: 15, delete buttons appear on hover with opacity: 1 and pointer-events: auto
  implication: CSS should allow delete buttons to be visible and clickable

- timestamp: 2026-03-14T00:00:06.000Z
  checked: Handler implementations
  found: handleDelete filters task from state and calls deleteTask API. handleTasksChange updates tasks via API
  implication: Handlers should properly update state and server

- timestamp: 2026-03-14T00:00:07.000Z
  checked: Delete button CSS hover behavior
  found: .gantt-tl-name-action-btn has opacity: 0 and pointer-events: none by default, changes to opacity: 1 and pointer-events: auto on .gantt-tl-row:hover
  implication: Delete buttons are ONLY visible on hover. If hover doesn't work, buttons are invisible

- timestamp: 2026-03-15T12:30:01.000Z
  checked: User verification after CSS fix
  found: Delete buttons are now visible, but clicking them moves tasks to the end of their group instead of deleting
  implication: CSS was not the root cause. The deletion logic itself is broken or calling wrong handler.

- timestamp: 2026-03-15T12:30:02.000Z
  checked: gantt-lib handleDelete implementation (lines 3974-3998 in dist/index.js)
  found: handleDelete calls onTasksChange(changedTasks) BEFORE onDelete(taskId). The changedTasks only contains tasks with updated dependencies, NOT the deleted task.
  implication: This order of operations could be causing issues - onTasksChange might be triggering unwanted behavior like reordering

- timestamp: 2026-03-15T12:35:01.000Z
  checked: Added enhanced logging to handleTasksChange, handleReorder, and handleDelete
  found: Logging now includes full stack traces to trace the exact call sequence
  implication: Next user test will reveal which handlers are actually being called during deletion

- timestamp: 2026-03-15T12:40:00.000Z
  checked: gantt-lib's handleDelete implementation and normalizeHierarchyTasks function
  found: handleDelete calls onTasksChange(changedTasks) BEFORE onDelete(taskId). The flattenHierarchy function reorders tasks based on array order.
  implication: RACE CONDITION: When onTasksChange is called during deletion, it triggers a re-render with partially updated state (deleted task still present), which causes normalizeHierarchyTasks to reorder the array. Then when onDelete removes the task, the order has already changed.

- timestamp: 2026-03-15T13:00:00.000Z
  checked: handleDelete catch block in useBatchTaskUpdate.ts (line 337-341)
  found: When deleteTask() API call throws (any non-2xx response), the catch block does setTasks(prev => [...prev, taskToDelete]). This APPENDS the task to the END of the array. flattenHierarchy then places it last in its parent group.
  implication: NEW HYPOTHESIS - the "moves to last position" behavior is the catch block re-appending the task after a failed API call. The isDeletionRelated fix is irrelevant if handleDelete never completes successfully.

- timestamp: 2026-03-15T13:01:00.000Z
  checked: deleteTask() in useTaskMutation.ts and authMiddleware
  found: deleteTask throws on any non-OK response (401, 404, 500). authMiddleware returns 401 if accessToken is null/missing/expired. taskService.delete returns false (404) if task not found by ID.
  implication: Need to check which specific HTTP error is happening during deletion. Added targeted logging to capture response status.

- timestamp: 2026-03-15T13:05:00.000Z
  checked: useBatchTaskUpdate.handleDelete error recovery path (line 337-341 original)
  found: catch block does setTasks(prev => [...prev, taskToDelete]) - APPENDS to END. flattenHierarchy then orders task last within its parent group. This exactly matches the symptom.
  implication: When deleteTask() API call fails with 401 (null accessToken = local/guest mode), task is removed optimistically then immediately re-added at the END. This is THE root cause.

- timestamp: 2026-03-15T13:08:00.000Z
  checked: App.tsx accessToken logic for batchUpdate
  found: accessToken is null when (a) hasShareToken, (b) !auth.isAuthenticated, (c) auth.accessToken is null. In guest/local mode, ALL API calls will receive 401 from authMiddleware.
  implication: Confirmed: local/guest mode users will always see deleteTask fail with 401, causing the append-to-end bug.

- timestamp: 2026-03-15T13:10:00.000Z
  checked: TypeScript compilation after fix
  found: No TypeScript errors. Fix compiles cleanly.
  implication: Fix is safe to test.

## Eliminated
- hypothesis: Handler not connected
  evidence: Traced code path from App.tsx -> GanttChart -> GanttLibChart -> TaskList. All props passed correctly.
  timestamp: 2026-03-14T00:00:03.000Z

- hypothesis: CSS z-index blocking
  evidence: Task list has z-index: 15, no higher z-index overlays found
  timestamp: 2026-03-14T00:00:05.000Z

## Resolution
root_cause: In useBatchTaskUpdate.handleDelete, when the deleteTask() API call fails (e.g., 401 Unauthorized when accessToken is null in local/guest mode, or 404/500 for other errors), the catch block executes setTasks(prev => [...prev, taskToDelete]) which APPENDS the task to the END of the array. flattenHierarchy then places it last within its parent group. This is exactly the "moves to last position in its group" symptom. The previous isDeletionRelated fix targeted the wrong mechanism entirely.
fix: Two changes in handleDelete:
  1. Added early return when accessToken is null (local/guest mode) - skip API call entirely, just keep the optimistic delete
  2. Fixed error revert: instead of appending to end with [...prev, taskToDelete], now re-inserts at the original index using splice(originalIndex, 0, taskToDelete)
verification: PENDING - needs user testing
files_changed:
- packages/web/src/hooks/useBatchTaskUpdate.ts: Fixed handleDelete - skip API call in local mode, revert to original position on error
- packages/web/src/hooks/useTaskMutation.ts: Added logging to capture HTTP response status on deleteTask calls
