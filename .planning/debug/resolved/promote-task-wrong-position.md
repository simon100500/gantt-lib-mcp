---
status: resolved
trigger: "When promoting a child task out of its parent group (handlePromoteTask), the task visually appears one position lower than expected on first action. After page refresh, it correctly appears right below the parent group."
created: 2026-03-16T00:00:00Z
updated: 2026-03-16T00:00:00Z
---

## Current Focus

hypothesis: The optimistic update in handlePromoteTask reads `lastSiblingIndex` from the CURRENT array before removing the promoted task. When the promoted task IS the last sibling (or any sibling), removing it from the array shifts all subsequent indices down by 1. The `insertIndex` is computed as `lastSiblingIndex.index + 1` on the ORIGINAL array, but the slice is done on `withoutPromoted` (which is one element shorter). This means the promoted task is inserted one position too late, landing one slot below where it should be.
test: Trace the index arithmetic in handlePromoteTask's setTasks callback with an example
expecting: Confirm that insertIndex is off-by-one when the promoted task precedes the last sibling (or is the last sibling)
next_action: confirmed — proceed to fix_and_verify

## Symptoms

expected: After promote, child task should appear immediately below the parent group (right below the last sibling / parent block)
actual: On first promote action, child task ends up one position lower — it skips over the next task. After page refresh it is in the correct position.
errors: No errors. Logs show handlePromoteTask + mutateTask succeed. Server response has parentId: undefined (correct). Visual position is wrong until refresh.
reproduction: Promote any child task from a parent group via context menu
timeline: Likely introduced during state management refactor

## Eliminated

(none yet)

## Evidence

- timestamp: 2026-03-16T00:00:00Z
  checked: handlePromoteTask optimistic update (useBatchTaskUpdate.ts lines 544-568)
  found: |
    lastSiblingIndex is computed from the ORIGINAL `currentTasks` array (with the promoted task still in it).
    Then `withoutPromoted = currentTasks.filter(t => t.id !== taskId)` removes the promoted task — this array is 1 shorter.
    `insertIndex = lastSiblingIndex.index + 1` is still the index from the original (longer) array.
    When we do `withoutPromoted.slice(0, insertIndex)`, that insertIndex points one slot further than intended
    because removing the promoted task shifts everything after it down by one.

    Concrete example (tasks array, 0-based):
      index 0: parentTask
      index 1: child A  (parentId = parentTask)
      index 2: child B  (parentId = parentTask, this is the task being promoted)
      index 3: nextRootTask

    lastSiblingIndex is picked as index 2 (the last sibling by position, which happens to be the promoted task itself, or child A if promoted task comes last).

    Case: promoting child B (index 2, last sibling):
      siblings = [child A, child B], last sibling by position = child B at index 2
      insertIndex = 2 + 1 = 3
      withoutPromoted = [parentTask(0), child A(1), nextRootTask(2)]  ← 3 elements now
      slice(0, 3) = entire array
      promoted task appended at the END → child B lands AFTER nextRootTask instead of BEFORE it

    Case: promoting child A (index 1, NOT last sibling — child B at index 2 is last):
      lastSiblingIndex.index = 2 (child B)
      insertIndex = 3
      withoutPromoted = [parentTask(0), child B(1), nextRootTask(2)]
      slice(0, 3) = entire array
      promoted task appended at the END → same bug

    In both cases the promoted task ends up after nextRootTask instead of before it.
    The correct insertIndex for `withoutPromoted` should account for whether the promoted task
    appeared before the last sibling in the original array. If it did, the last sibling's effective
    index in `withoutPromoted` is (lastSiblingIndex.index - 1), so insertIndex should be
    lastSiblingIndex.index (not +1) in that situation.
  implication: The off-by-one in index math causes the task to land one position too far down. After a server refresh the sortOrder from the DB places it correctly (the server stores parentId=null but the position is determined by server sortOrder from before or a default sort).

- timestamp: 2026-03-16T00:00:00Z
  checked: mutateTask and server state
  found: mutateTask sends parentId: null correctly. Server returns task with parentId: undefined. No sortOrder is sent in the promote call (task object doesn't have sortOrder attached). So on refresh, the order comes from DB sortOrder which may have been set during the last reorder — explaining why refresh shows the correct position (whatever the DB retained).
  implication: The bug is purely in the client-side optimistic update index arithmetic.

## Resolution

root_cause: |
  In handlePromoteTask's setTasks callback, `lastSiblingIndex` is computed from the original
  `currentTasks` array. Then the promoted task is removed to form `withoutPromoted` (length - 1).
  `insertIndex = lastSiblingIndex.index + 1` is never adjusted for the removal of the promoted task.
  If the promoted task's position in the original array is <= lastSiblingIndex.index, then in
  `withoutPromoted` the last sibling sits at index (lastSiblingIndex.index - 1), so the correct
  insertIndex is lastSiblingIndex.index (not +1). The current code uses the un-adjusted +1, placing
  the task one position too far.

fix: |
  In the setTasks callback of handlePromoteTask, after computing `withoutPromoted`, determine the
  correct insertIndex by finding the last sibling's NEW index in `withoutPromoted` and inserting
  after it. The simplest approach: find the last sibling index in withoutPromoted directly,
  rather than deriving it from the original array index.

verification: |
  Index arithmetic traced manually for both "promoting last sibling" and "promoting non-last sibling"
  cases. In both cases the promoted task now lands at insertIndex = lastSiblingInWithout.index + 1,
  which is the slot immediately after the last remaining sibling and immediately before the next
  root-level task — matching the expected gantt-lib behavior. Confirmed by user in live UI: promoted
  task now lands in the correct position immediately below the parent group on the first action,
  without needing a page refresh.
files_changed: [packages/web/src/hooks/useBatchTaskUpdate.ts]
