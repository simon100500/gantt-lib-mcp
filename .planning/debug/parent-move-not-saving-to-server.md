---
status: resolved
trigger: "parent-move-not-saving-to-server"
created: 2026-03-14T00:00:00.000Z
updated: 2026-03-14T00:00:00.000Z
---

# RESOLVED

## Root Cause
**This was a gantt-lib bug (version 0.9.0)** - issue was closed in gantt-lib repository.

When dragging a parent task, gantt-lib 0.9.0 called BOTH `onTasksChange` and `onCascade`:
1. `onTasksChange` was called with the parent appearing **TWICE** (old position + new position)
2. `onCascade` was called immediately after with correct data
3. This created a race condition where the same task was saved twice with different dates

## Fix Applied
1. **Updated gantt-lib from 0.9.0 to 0.9.1** - the fix is in gantt-lib now
2. **Updated local GanttChart wrapper** to use new `enableAutoSchedule` prop
3. **Removed debug logging** that was added during investigation

## Files Changed
- `packages/web/package.json` - bumped gantt-lib to ^0.9.1
- `packages/web/src/components/GanttChart.tsx` - added `enableAutoSchedule` prop
- `packages/web/src/App.tsx` - now passes `enableAutoSchedule={autoSchedule}` instead of `disableConstraints`

## Technical Details
In gantt-lib 0.9.1:
- Added `enableAutoSchedule` prop to control cascade behavior
- Fixed callback logic to avoid duplicate `onTasksChange` + `onCascade` calls
- `onCascade` is now called correctly only when `enableAutoSchedule` is true

## Verification
User confirmed fix works - parent task movement now persists correctly.
