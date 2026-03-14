---
status: awaiting_human_verify
trigger: "child-move-500-error: When moving a child task within its parent, the batch API returns 500 Internal Server Error"
created: 2026-03-14T00:00:00.000Z
updated: 2026-03-14T07:30:00.000Z
---

## Current Focus
hypothesis: New batchUpdateTasks method implemented with upsert operations - preserves existing tasks
test: Build successful, awaiting human verification
expecting: Moving a child task should update only the changed tasks, no data loss
next_action: Request human verification

## Symptoms
expected: Moving a child task to a different position inside its parent task should save successfully
actual: CRITICAL - After fix, 500 error is resolved but ALL OTHER TASKS ARE DELETED from database! Only the child and parent are saved.
errors: "Batch import failed: 500 Internal Server Error" (original), then "Data loss - only 2 tasks saved, all others deleted" (after fix)
reproduction: |
  1. Have a project with multiple tasks (e.g., 10 tasks)
  2. Have a parent task with child tasks
  3. Drag a child task to a different position within the parent
  4. Observe that after save, only the child + parent (2 tasks) remain in database
  5. All other 8 tasks are DELETED
started: Long-standing issue, not a recent regression from gantt-lib 0.9.1 update. Data loss introduced by using importTasks for incremental updates.

## Eliminated

## Evidence
- timestamp: 2026-03-14T01:00:00.000Z
  checked: packages/web/src/hooks/useTaskMutation.ts:112-129
  found: batchImportTasks() sends tasks array directly via JSON.stringify() without any date normalization
  implication: Tasks with Date objects get serialized to full ISO format (2026-03-09T00:00:00.000Z)

- timestamp: 2026-03-14T01:00:00.000Z
  checked: packages/web/src/hooks/useTaskMutation.ts:46-56 (mutateTask function)
  found: mutateTask() normalizes dates using task.startDate.toISOString().split('T')[0] before sending
  implication: Single task updates work because dates are normalized to YYYY-MM-DD format

- timestamp: 2026-03-14T01:00:00.000Z
  checked: packages/mcp/src/services/types.ts:30-32 (domainToDate function)
  found: domainToDate() just does `new Date(dateStr)` which can parse ISO format
  implication: The date parsing itself should work, but need to verify actual behavior

- timestamp: 2026-03-14T01:00:00.000Z
  checked: packages/server/src/index.ts:162-176 (PUT /api/tasks handler)
  found: Calls taskService.importTasks(JSON.stringify(tasks), projectId, 'manual-save')
  implication: The tasks array is stringified and sent to importTasks

- timestamp: 2026-03-14T01:00:00.000Z
  checked: packages/mcp/src/services/task.service.ts:411-460 (importTasks method)
  found: Uses domainToDate(task.startDate) and domainToDate(task.endDate) at lines 437-438
  implication: This is where the date format inconsistency causes issues

- timestamp: 2026-03-14T02:00:00.000Z
  checked: packages/mcp/prisma/schema.prisma:119 (Task model)
  found: parentId has foreign key constraint `@relation("TaskHierarchy", fields: [parentId], references: [id], onDelete: SetNull)`
  implication: PostgreSQL enforces that parent row must exist when child is created

- timestamp: 2026-03-14T02:00:00.000Z
  checked: packages/mcp/src/services/task.service.ts:424-455 (importTasks transaction)
  found: Tasks are created in array order using `for (const [index, task] of tasks.entries())` at line 431
  implication: If child appears before parent in array, foreign key constraint will fail

- timestamp: 2026-03-14T02:00:00.000Z
  checked: packages/web/src/hooks/useBatchTaskUpdate.ts:20-30 (handleTasksChange logging)
  found: Symptoms show "Task 0 (child)" and "Task 1 (parent)" - child is at index 0, parent at index 1
  implication: When gantt-lib sends changed tasks, it may send child first, then parent

- timestamp: 2026-03-14T05:00:00.000Z
  checked: Manual testing with topological sort algorithm
  found: Topological sort correctly handles multi-level hierarchies (parent -> child -> grandchild)
  implication: The fix will work for all parent-child relationship scenarios

- timestamp: 2026-03-14T06:00:00.000Z
  checked: npm run build --workspace=packages/mcp and packages/server
  found: Both packages compile successfully with no errors
  implication: The fix is syntactically correct and ready for testing

- timestamp: 2026-03-14T07:00:00.000Z
  checked: Human verification of the topological sort fix
  found: Fix works (no 500 error) BUT causes CATASTROPHIC DATA LOSS
  implication: The root cause diagnosis was correct, but the fix was wrong - we shouldn't be using importTasks at all

- timestamp: 2026-03-14T07:00:00.000Z
  checked: packages/mcp/src/services/task.service.ts:458-462 (importTasks delete logic)
  found: `await tx.task.deleteMany({ where: projectId ? { projectId } : {} })` - DELETES ALL TASKS
  implication: When gantt-lib sends only 2 changed tasks, ALL existing tasks are deleted, then only 2 are created

- timestamp: 2026-03-14T07:00:00.000Z
  checked: packages/web/src/hooks/useBatchTaskUpdate.ts:20-46 (handleTasksChange)
  found: gantt-lib calls handleTasksChange with ONLY changed tasks (e.g., child + parent = 2 tasks)
  implication: This is an incremental update, not a full replacement - using importTasks is fundamentally wrong

- timestamp: 2026-03-14T07:30:00.000Z
  checked: Implemented batchUpdateTasks method in packages/mcp/src/services/task.service.ts
  found: New method uses upsert operations with topological sort for parent-first updates
  implication: Only changed tasks are updated, existing tasks are preserved

- timestamp: 2026-03-14T07:30:00.000Z
  checked: Updated packages/server/src/index.ts to use batchUpdateTasks instead of importTasks
  found: Changed endpoint from importTasks to batchUpdateTasks
  implication: Batch API now correctly handles incremental updates

- timestamp: 2026-03-14T07:30:00.000Z
  checked: npm run build --workspace=packages/mcp and packages/server
  found: Both packages compile successfully with no errors
  implication: The fix is ready for testing

## Resolution
root_cause: The PUT /api/tasks endpoint uses importTasks which is designed for FULL REPLACEMENT (deletes all tasks, then creates new ones). However, gantt-lib's handleTasksChange sends ONLY CHANGED TASKS (incremental update). This causes catastrophic data loss: when moving a child task, gantt-lib sends 2 tasks (child + parent), importTasks deletes all tasks in the project, then creates only those 2 tasks.

fix: Created new batchUpdateTasks method in packages/mcp/src/services/task.service.ts:
- Uses upsert operations (create if not exists, update if exists)
- Preserves all existing tasks - no deletions
- Uses topological sort to ensure parents are created/updated before children
- Updates dependencies correctly (deletes old, creates new)

Updated packages/server/src/index.ts to use batchUpdateTasks instead of importTasks.

files_changed:
- packages/mcp/src/services/task.service.ts (added batchUpdateTasks method)
- packages/server/src/index.ts (changed endpoint to use batchUpdateTasks)
