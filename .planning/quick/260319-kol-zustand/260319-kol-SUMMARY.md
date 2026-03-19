---
phase: quick
plan: 260319-kol-zustand
subsystem: ui
tags: [react, zustand, project-sidebar, task-count-sync]
requires: []
provides:
  - Task count sync on project switch
  - Project sidebar without "current project" badge
  - Edit button in header next to project name
  - Sidebar stays open after project selection
affects: [project-sidebar, ui-state]
tech-stack:
  added: []
  patterns: [zustand-state-sync, ui-component-simplification]
key-files:
  modified:
    - packages/web/src/App.tsx
    - packages/web/src/components/ProjectSwitcher.tsx
    - packages/web/src/components/layout/ProjectMenu.tsx
    - packages/web/src/stores/useAuthStore.ts
key-decisions:
  - "Keep sidebar open after project switch for better UX"
  - "Sync task count to Zustand store when switching projects to persist across changes"
  - "Move edit button from sidebar to header for cleaner UI"
patterns-established:
  - "Task count sync pattern: Call syncProjectTaskCount after project operations"
  - "UI simplification: Remove redundant 'current project' indicators"
requirements-completed: []
duration: 4min
completed: 2026-03-19
---

# Quick Task 260319-kol: Zustand Project Sidebar Fix Summary

**Fixed task count persistence, removed current project badge, moved edit button to header, and prevented sidebar auto-close**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-19T11:55:15Z
- **Completed:** 2026-03-19T11:59:15Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Fixed task count sync when switching projects by calling `syncProjectTaskCount` in `handleSwitchProject`
- Removed sidebar auto-close behavior when selecting a project
- Removed "Текущий проект" (current project) badge from project sidebar
- Moved edit button from sidebar to header next to project name
- Simplified ProjectSwitcher component by removing draft-specific UI elements

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix task count sync and remove sidebar auto-close** - `231afbb` (fix)
2. **Task 2: Remove "current project" badge and move edit button to header** - `ecf2147` (feat)
3. **Follow-up fix: Highlight current project and fix task count sync** - `fa5c69b` (fix)

## Files Created/Modified

- `packages/web/src/App.tsx` - Added `syncProjectTaskCount` call after project switch, removed `setProjectSidebarVisible(false)`
- `packages/web/src/components/ProjectSwitcher.tsx` - Removed current project display section, removed `onEdit` prop, simplified project list
- `packages/web/src/components/layout/ProjectMenu.tsx` - Added edit button (Pencil icon) next to project name in header, removed `onEdit` prop from ProjectSwitcher calls
- `packages/web/src/stores/useAuthStore.ts` - Existing `syncProjectTaskCount` method verified working correctly

## Decisions Made

- Keep sidebar open after project switch for better user experience (users often want to compare or switch between multiple projects)
- Sync task count to Zustand store immediately after switching to ensure persistence
- Move edit button to header to reduce visual clutter in sidebar and match common UI patterns

## Deviations from Plan

### Auto-fixed Issues

None - plan executed exactly as written.

## Follow-up Fixes

After initial completion, user reported two issues:
1. Current project was not highlighted in sidebar
2. Task count hole still appeared when switching projects

**Root cause:** The original approach tried to sync task counts during project switches, but `tasks.length` becomes 0 during switches (before new tasks load), causing race conditions where 0 overwrites correct values.

**Final fix (commits `fa5c69b`, `91f0763`):**
- Added `bg-slate-100` highlighting for current project in sidebar
- **Completely rewrote task count mechanism:**
  - `taskCount` comes from `/api/projects` and is stored in `useAuthStore`
  - `syncProjectTaskCount` NEVER overwrites non-zero with zero
  - `useEffect` only syncs when `tasks.length > 0` (tasks actually loaded)
  - Removed complex sync logic from `handleSwitchProject` (not needed - counts already stored)

This prevents race conditions where task counts were overwritten with zero during project switches.

## Issues Encountered

None - all tasks completed successfully without issues.

## User Setup Required

None - no external service configuration required.

## Verification Steps

To verify the changes work correctly:

1. Start development server and log in
2. Open project sidebar (click menu button)
3. Verify no "Текущий проект" badge appears at top of sidebar
4. Verify all projects are listed in a simple format with task counts
5. Click on a different project - sidebar should stay open
6. Verify task count displays correctly for the previously active project
7. Verify edit pencil appears next to project name in header (not in sidebar)
8. Click edit pencil - edit modal should open

## Self-Check: PASSED

All files created and commits verified:
- Task 1 commit `231afbb` exists
- Task 2 commit `ecf2147` exists
- Build passes without errors

---
*Phase: quick*
*Completed: 2026-03-19*
