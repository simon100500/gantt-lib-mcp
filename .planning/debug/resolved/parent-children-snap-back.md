---
status: resolved
trigger: "After gantt-lib 0.10.0 update (quick task 32), dragging parent task causes both parent and children to snap back to original positions after release"
created: 2026-03-14T00:00:00.000Z
updated: 2026-03-14T02:00:00.000Z
---

## Current Focus
hypothesis: FIX CONFIRMED - Modified addDescendants to skip children already in changedTasks
test: User verified the fix works correctly
expecting: Parent and children should move together without duration changes
next_action: Archive session and commit fix

## Symptoms
expected: Children should move along with parent when parent is dragged
actual: After releasing mouse, both parent and children snap back to their original positions
errors: No errors
reproduction: Drag a parent task in the Gantt chart
started: After quick task 32 (gantt-lib 0.10.0 parent task handling fix - commit 6c3bf15, 5fd0453)

## Eliminated
- hypothesis: filterParentTasks is incorrectly filtering out parents
  evidence: filterParentTasks keeps parents that have no parentId; when gantt-lib sends [parent] alone, it's kept correctly
  timestamp: 2026-03-14T00:30:00.000Z

- hypothesis: onCascade should handle parent-child movement
  evidence: onCascade is for DEPENDENCY cascades, not hierarchy movement
  timestamp: 2026-03-14T00:30:00.000Z

- hypothesis: Client-side child movement fix should work
  evidence: User reports "не работает! ничего не изменилось!" (doesn't work! nothing changed!)
  timestamp: 2026-03-14T01:00:00.000Z

- hypothesis: gantt-lib doesn't send children when parent is dragged
  evidence: gantt-lib source code shows it DOES send children via onCascade callback (lines 1287-1364 of index.js)
  timestamp: 2026-03-14T01:20:00.000Z

- hypothesis: filterParentTasks was removing parent tasks
  evidence: Removed filterParentTasks but user still reports issues with duration jumping and children getting huge durations
  timestamp: 2026-03-14T01:30:00.000Z

- hypothesis: Date format parsing issue with new Date()
  evidence: Tested and confirmed new Date('2025-10-04') and new Date('2025-10-04T00:00:00.000Z') produce same timestamp. Not a parsing issue.
  timestamp: 2026-03-14T01:35:00.000Z

## Evidence
- timestamp: 2026-03-14T02:00:00.000Z
  checked: User verification response
  found: User confirmed "fixed" - the parent-child dragging now works correctly
  implication: Fix is successful and issue is resolved

- timestamp: 2026-03-14T01:30:00.000Z
  checked: User's critical logs from failed verification
  found: Date calculation producing wrong results:
    ```
    Original dates: 2026-03-31 - 2025-10-07  ← END DATE BEFORE START DATE!
    New dates: 2025-10-05 - 2025-10-14
    Deltas: -15292800000 ms (-177 days, start), 604800000 ms (+7 days, end)
    Child Old: 2025-10-04 - 2025-10-08 (4 days)
    Child New: 2025-04-10 - 2025-10-15 (188 days!) ← Duration exploded!
    ```
  implication: Original task has corrupted dates (end before start). This causes wildly different start (-177 days) and end (+7 days) deltas. When these different deltas are applied to children, the child's duration explodes from 4 days to 188 days.

- timestamp: 2026-03-14T01:40:00.000Z
  checked: Code flow when gantt-lib sends cascaded tasks
  found: ROOT CAUSE - When gantt-lib sends [parent, child1, child2] via onCascade:
    1. tasksWithDescendants starts with these 3 tasks (correct dates)
    2. Code finds parent has children in STATE
    3. Calculates delta from original (state) to new (from gantt-lib)
    4. Recalculates children from STATE by applying delta
    5. Pushes recalculated children to tasksWithDescendants
    6. Now has [parent, child1, child2, child1_recalc, child2_recalc]
    7. Map keeps last value, so child1_recalc and child2_recalc WIN
    8. If original state has corrupted dates, delta is wrong, children get wrong dates
  implication: We should use gantt-lib's correct child dates, not recalculate from potentially corrupted state. Fix: skip children already in changedTasks.

- timestamp: 2026-03-14T00:20:00.000Z
  checked: filterParentTasks implementation in useBatchTaskUpdate.ts (lines 75-81)
  found: filterParentTasks removes tasks whose parent is also in the batch: `return !task.parentId || !taskIds.has(task.parentId);`
  implication: When gantt-lib sends [parent, children], the parent is filtered out because its children are in the batch. This means the parent is NEVER saved!

- timestamp: 2026-03-14T00:30:00.000Z
  checked: handleCascade implementation and gantt-lib documentation
  found: onCascade is for DEPENDENCY cascades, not parent-child hierarchy movement! The README says: "Callback when cascade drag completes; receives all shifted tasks including the dragged task" under "Cascade Scheduling" section
  implication: When a parent is dragged (not a dependency cascade), onCascade is NOT called. Only onChange is called with the parent task alone. Children are never sent!

- timestamp: 2026-03-14T01:00:00.000Z
  checked: gantt-lib source code (node_modules/gantt-lib/dist/index.js lines 1185-1434)
  found: **CRITICAL DISCOVERY**: gantt-lib's useTaskDrag hook DOES handle hierarchy children in lines 1330-1364:
    ```javascript
    const hierarchyChildren = currentTask ? getChildren(taskId, allTasks) : [];
    if (hierarchyChildren.length > 0) {
      const chainIds = new Set(chainForCompletion.map((t) => t.id));
      const uniqueHierarchyChildren = hierarchyChildren.filter((t) => !chainIds.has(t.id));
      chainForCompletion = [...chainForCompletion, ...uniqueHierarchyChildren];
    }
    // ... then calls onCascade(cascadedTasks) with parent + children
    ```
  implication: gantt-lib DOES send children when parent is dragged, BUT ONLY when `!disableConstraints && onCascade` is true (line 1285). When this condition is false, it falls through to onDragEnd with single task (lines 1366-1372)

- timestamp: 2026-03-14T01:05:00.000Z
  checked: How GanttChart passes props to gantt-lib
  found: In App.tsx, GanttChart is called with `onCascade={batchUpdate.handleTasksChange}` (line 77 of GanttChart.tsx calls onCascade prop directly)
  implication: The onCascade callback should be receiving cascaded children. But wait - we're passing handleTasksChange as onCascade, not a separate cascade handler!

- timestamp: 2026-03-14T01:15:00.000Z
  checked: The actual code flow in handleTasksChange
  found: **ROOT CAUSE**: filterParentTasks was removing the parent from the batch!
    1. gantt-lib sends [parent, child1, child2] via onCascade
    2. We add descendants to get tasksWithDescendants
    3. filterParentTasks removes parent because its children are in the batch
    4. filteredTasks = [child1, child2, ...] (no parent!)
    5. changedMap is built from filteredTasks - parent is NOT in it
    6. setTasks updates with changedMap - parent is NOT updated
    7. Parent snaps back to original position!
  implication: The filterParentTasks function was based on a misunderstanding. The comment said "gantt-lib 0.10.0 no longer sends parents with children" but this is FALSE - gantt-lib DOES send parents with children via onCascade. Removing the filter fixes the issue.

## Resolution
root_cause: When gantt-lib sends cascaded tasks via onCascade, it includes [parent, child1, child2] with correct new dates. Our code then recalculates children from STATE using the delta, creating duplicates in tasksWithDescendants. Since Map keeps the last value, we use the RECALCULATED children instead of the CORRECT ones from gantt-lib. When the original task in state has corrupted dates (e.g., from previous bad updates), the delta calculation produces wrong values, and applying these to children destroys their duration.
fix: Modified addDescendants to skip children that are already in changedTasks array. Added changedTaskIds Set to track which tasks gantt-lib already sent. This ensures we use the correct dates from gantt-lib instead of recalculating from potentially corrupted state.
verification: User confirmed "fixed" - parent and children now move together correctly without snapping back or duration changes
files_changed: [packages/web/src/hooks/useBatchTaskUpdate.ts]
