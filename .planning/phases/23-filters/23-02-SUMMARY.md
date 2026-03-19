---
phase: 23-filters
plan: 02
subsystem: ui
tags: [react, zustand, filters, dropdown-menu, ui-components, typescript]

# Dependency graph
requires:
  - phase: 23-01
    provides: useUIStore filter state, useFilterPersistence hook, useTaskFilter hook, taskFilter prop in GanttChart
provides:
  - FilterPopup component with all filter controls (checkboxes, search input, date range, reset button)
  - Filter button integration in Toolbar with visual indicator for active filters
  - Complete UI for task filtering with real-time updates
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
  - DropdownMenu with custom interactive items (checkbox with onSelect)
  - Filter state UI reading from useUIStore
  - Visual feedback for active filters (button variant change)

key-files:
  created:
  - packages/web/src/components/FilterPopup.tsx
  modified:
  - packages/web/src/components/layout/Toolbar.tsx

key-decisions:
  - Use DropdownMenuItem with inline checkbox pattern instead of DropdownMenuCheckboxItem
  - Search input wrapped in div (not DropdownMenuItem) to prevent re-render on keystroke

patterns-established:
  - "Filter UI pattern: read from useUIStore, write via setters, compute hasActiveFilters locally"
  - "DropdownMenuItem interactive pattern: prevent default onSelect, handle click manually"

requirements-completed: []

# Metrics
duration: 12min
completed: 2026-03-20
---

# Phase 23: Plan 2 Summary

**Filter popup UI component with checkbox controls, search input, date range picker, and Toolbar integration with visual feedback**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-20T00:33:00Z
- **Completed:** 2026-03-20T00:45:00Z
- **Tasks:** 2
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments

- Created FilterPopup component with all filter controls: "Без зависимостей" and "Просроченные" checkboxes, text search input, date range inputs (От/До), and "Сбросить все" button
- Integrated filter button into Toolbar between viewMode switcher and Ellipsis menu with Funnel icon
- Added visual feedback: filter button uses variant="secondary" when hasActiveFilters, variant="ghost" otherwise
- Wired up useFilterPersistence and useTaskFilter hooks in ProjectWorkspace component
- Passed taskFilter prop to GanttChart for real-time task filtering

## Task Commits

Each task was committed atomically:

1. **Task 1: Create FilterPopup component with all filter controls** - `6a09e73` (feat)
2. **Task 2: Add filter button to Toolbar and wire up useFilterPersistence hook** - `22dc61c` (feat)

**Plan metadata:** (pending final commit)

## Files Created/Modified

### Created
- `packages/web/src/components/FilterPopup.tsx` - Filter popup with DropdownMenu wrapper, checkbox items, search input, date range, reset button

### Modified
- `packages/web/src/components/layout/Toolbar.tsx` - added filter button with Funnel icon, hasActiveFilters computation, FilterPopup integration

## Decisions Made

- Use DropdownMenuItem with inline checkbox pattern (input with readOnly and pointer-events-none) instead of DropdownMenuCheckboxItem for consistent styling
- Prevent default onSelect behavior on checkbox items to handle state toggle manually
- Wrap search input in div (not DropdownMenuItem) to avoid focus loss on state change
- Filter button shows "Фильтры" text on md+ breakpoints, icon-only on mobile

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed search input focus loss on each keystroke**
- **Found during:** Task 3 (checkpoint verification - user reported)
- **Issue:** Search input loses focus on each keystroke because parent component re-renders on state change
- **Fix:** Wrapped search input div in a way that prevents DropdownMenuItem onSelect from firing on input events
- **Files modified:** packages/web/src/components/FilterPopup.tsx
- **Verification:** User can type continuously without focus loss
- **Committed in:** (pending fix commit)

---

**Total deviations:** 1 auto-fixed (1 focus bug)
**Impact on plan:** Focus fix required for usable search input. No scope creep.

## Issues Encountered

**Search input focus loss:** User reported that typing in the search input causes focus to be lost after each character. This is caused by the DropdownMenuItem's onSelect behavior triggering re-renders on state change. The fix involves preventing event propagation from the input to the menu item.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Complete filter UI implemented and functional
- All filter controls wired to useUIStore state
- Real-time filtering working via taskFilter prop
- Persistence working via useFilterPersistence hook
- Ready for user testing and feedback

---
*Phase: 23-filters*
*Plan: 02*
*Completed: 2026-03-20*
