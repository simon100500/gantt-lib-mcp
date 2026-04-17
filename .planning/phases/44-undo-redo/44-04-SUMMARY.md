---
phase: 44-undo-redo
plan: 04
subsystem: ui
tags: [react, zustand, history, undo-redo, hotkeys]
requires:
  - phase: 44-02
    provides: grouped history API with authoritative undo/redo endpoints
  - phase: 44-03
    provides: user and agent mutation-group titles from the existing commit path
provides:
  - frontend history API client hook with authoritative replay refresh
  - toolbar history toggle and visible grouped history panel
  - fixed Ctrl+Z and Ctrl+Shift+Z undo/redo workspace shortcuts
affects: [phase-44-verification, workspace-ui, history-api]
tech-stack:
  added: []
  patterns: [authoritative replay refresh, workspace side-panel history UI, fixed keyboard replay shortcuts]
key-files:
  created: [packages/web/src/hooks/useProjectHistory.ts, packages/web/src/components/HistoryPanel.tsx]
  modified: [packages/web/src/lib/apiTypes.ts, packages/web/src/stores/useUIStore.ts, packages/web/src/components/layout/Toolbar.tsx, packages/web/src/components/workspace/ProjectWorkspace.tsx, packages/web/src/App.tsx]
key-decisions:
  - "Undo/redo actions in the workspace always reconcile through useProjectStore.setConfirmed() plus clearTransientState() after successful history replay."
  - "The history panel stays inside the existing workspace shell as a toggleable rail instead of introducing modal routing or a separate history page."
patterns-established:
  - "Protected replay UI inside the web workspace receives the auth token from App.tsx rather than reaching into storage directly."
  - "History replay shortcuts ignore editable targets and choose redo from the latest redoable grouped history item."
requirements-completed: [HIS-05]
duration: 6min
completed: 2026-04-18
---

# Phase 44 Plan 04: History panel and authoritative replay Summary

**Grouped history UI with authoritative undo/redo replay, toolbar access, and fixed workspace hotkeys on top of the phase 44 history API**

## Performance

- **Duration:** 6 min
- **Started:** 2026-04-17T21:24:00Z
- **Completed:** 2026-04-17T21:30:10Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Added typed frontend history contracts, panel visibility state, and a dedicated `useProjectHistory` hook for `/api/history` list and replay calls.
- Added a visible `История` toolbar toggle and a grouped history panel with actor, title, status, timestamp, and undo/redo controls.
- Wired `Ctrl+Z` and `Ctrl+Shift+Z` into the project workspace so replay actions refresh from the authoritative server snapshot instead of local optimistic state.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add the web history client hook and panel state** - `112b40c` (feat)
2. **Task 2: Add the history panel, toolbar toggle, and fixed undo/redo hotkeys** - `23218fe` (feat)

## Files Created/Modified

- `packages/web/src/lib/apiTypes.ts` - added typed history list and replay response contracts for the web app
- `packages/web/src/stores/useUIStore.ts` - added persisted UI flag and setter for the history panel
- `packages/web/src/hooks/useProjectHistory.ts` - added protected history list, undo, redo, and authoritative refresh flow
- `packages/web/src/components/HistoryPanel.tsx` - added grouped history panel UI with replay controls
- `packages/web/src/components/layout/Toolbar.tsx` - added `История` toggle in desktop and overflow toolbar actions
- `packages/web/src/components/workspace/ProjectWorkspace.tsx` - mounted history panel and fixed Ctrl+Z / Ctrl+Shift+Z replay shortcuts
- `packages/web/src/App.tsx` - passed the existing project access token into the workspace history UI

## Decisions Made

- Kept replay state adoption inside `useProjectHistory` so both panel actions and hotkeys reuse the same authoritative `setConfirmed()` and `clearTransientState()` path.
- Reused the existing workspace shell for history by adding a toggleable right rail and mobile stacked panel instead of creating separate routing or modal state.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Passed the existing project access token into `ProjectWorkspace`**
- **Found during:** Task 2 (Add the history panel, toolbar toggle, and fixed undo/redo hotkeys)
- **Issue:** `ProjectWorkspace` did not receive an auth token, so the new protected history hook could not call `/api/history` from inside the workspace component.
- **Fix:** Added an optional `accessToken` prop to `ProjectWorkspace` and wired the current authenticated token from `App.tsx`.
- **Files modified:** `packages/web/src/App.tsx`, `packages/web/src/components/workspace/ProjectWorkspace.tsx`
- **Verification:** `npm run build -w packages/web`
- **Committed in:** `23218fe` (part of task commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Required to make the planned history UI functional. No scope creep beyond the minimum wiring.

## Issues Encountered

- The first Task 2 build failed because `HistoryPanel` callback prop types were narrower than the hook's replay promise return values; relaxing the handler types resolved the mismatch without changing behavior.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 44 now has the complete user-facing history surface needed for verification: visible grouped history, toolbar entrypoint, panel replay controls, and fixed keyboard shortcuts.
- No known blockers remain for phase-level verification.

## Self-Check: PASSED

- Verified summary file exists at `.planning/phases/44-undo-redo/44-04-SUMMARY.md`
- Verified task commits `112b40c` and `23218fe` exist in git history

---
*Phase: 44-undo-redo*
*Completed: 2026-04-18*
