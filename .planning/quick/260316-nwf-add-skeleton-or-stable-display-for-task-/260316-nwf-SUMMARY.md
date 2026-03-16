---
phase: quick-260316-nwf
plan: 01
subsystem: UI task count display
tags: [ui, task-count, skeleton, layout-stability]
dependency_graph:
  requires: []
  provides: [UI-task-count-hide-zero, UI-task-count-stable-layout]
  affects: [project-list-display]
tech_stack:
  added: []
  patterns: [conditional-rendering, stable-width-placeholder]
key_files:
  created: []
  modified:
    - D:/Projects/gantt-lib-mcp/packages/web/src/components/ProjectSwitcher.tsx
decisions: []
metrics:
  duration: "2 minutes"
  started: "2026-03-16T14:13:38Z"
  completed: "2026-03-16T14:15:38Z"
  commits: 1
  files_changed: 1
---

# Phase Quick 260316-nwf Plan 01: Task Count Zero-Hiding and Stable Loading Display Summary

**One-liner:** Task count display that hides zero values and shows a stable-width placeholder during loading to prevent layout shift.

## Completed Tasks

| Task | Name | Commit | Files |
| ---- | ----- | ------ | ----- |
| 1 | Update task count display to hide zero and show stable placeholder | 7df23a9 | packages/web/src/components/ProjectSwitcher.tsx |

## Implementation Details

### Task 1: Task Count Display Logic

The task count display in the project sidebar was updated with the following logic:

1. **Loading state (taskCount === undefined)**: Shows a light-colored dash "—" placeholder
   - Color: `text-slate-200` (very light, indicates loading)
   - Width: `w-4 text-center` (maintains stable layout)
   - Purpose: Prevents jarring layout shifts when data loads

2. **Empty state (taskCount === 0)**: Hides the count completely
   - Empty projects should not show a meaningless "0"
   - Improves UX by reducing visual noise

3. **Populated state (taskCount > 0)**: Shows the actual count number
   - Color: `text-slate-400`
   - Shrink-0 to prevent overflow

### Code Change

**Before:**
```tsx
{p.taskCount !== undefined && (
  <span className="text-xs text-slate-400 shrink-0">{p.taskCount}</span>
)}
```

**After:**
```tsx
{p.taskCount === undefined ? (
  <span className="text-xs text-slate-200 shrink-0 w-4 text-center">—</span>
) : p.taskCount > 0 ? (
  <span className="text-xs text-slate-400 shrink-0">{p.taskCount}</span>
) : null}
```

## Deviations from Plan

### Auto-fixed Issues

None - plan executed exactly as written.

### Authentication Gates

None.

## Verification Results

1. **TypeScript Compilation:** Passed (no errors)
2. **Visual Verification:**
   - Empty projects (0 tasks) don't show a count badge
   - Projects with tasks show the count number
   - During loading (before API returns), a light dash placeholder appears
   - No layout shift during loading state

## Success Criteria

- [x] Projects with 0 tasks show no task count badge
- [x] Projects with >0 tasks show the count number
- [x] Loading state shows a stable-width "—" placeholder preventing layout shift
- [x] No TypeScript compilation errors

## Self-Check: PASSED

- [x] Commit 7df23a9 exists: `git log --oneline --all | grep -q "7df23a9"`
- [x] File modified exists: `packages/web/src/components/ProjectSwitcher.tsx`
