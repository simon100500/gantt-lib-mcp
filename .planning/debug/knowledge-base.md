# GSD Debug Knowledge Base

Resolved debug sessions. Used by `gsd-debugger` to surface known-pattern hypotheses at the start of new investigations.

---

## promote-task-wrong-position — Promoted task lands one slot too low in optimistic update
- **Date:** 2026-03-16
- **Error patterns:** promote, optimistic update, wrong position, off-by-one, handlePromoteTask, lastSiblingIndex, insertIndex, parentId, setTasks, filter, slice
- **Root cause:** In `handlePromoteTask`'s `setTasks` callback, `lastSiblingIndex` was computed from the original `currentTasks` array. After filtering out the promoted task into `withoutPromoted` (length - 1), `insertIndex = lastSiblingIndex.index + 1` was never adjusted. If the promoted task appeared at or before the last sibling in the original array, the last sibling's effective index in `withoutPromoted` is one less, so the un-adjusted `+1` places the promoted task one position too far down.
- **Fix:** Compute `lastSiblingInWithout` by finding the last sibling directly in `withoutPromoted` (after removing the promoted task), then use `lastSiblingInWithout.index + 1` as the insert index. This eliminates the stale-index dependency on the original array.
- **Files changed:** packages/web/src/hooks/useBatchTaskUpdate.ts
---
