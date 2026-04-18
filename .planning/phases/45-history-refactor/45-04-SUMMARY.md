---
phase: 45-history-refactor
plan: 04
subsystem: ui
tags: [react, history, preview, toolbar, workspace]
requires:
  - phase: 45-03
    provides: isolated history viewer state and preview-first workspace rendering
provides:
  - version-oriented history rows with explicit preview and restore actions
  - preview-mode workspace banner and toolbar return-to-current controls
  - read-only gating for edits, chat mutations, and history hotkeys during preview
affects: [history-panel, project-workspace, toolbar, history-preview]
tech-stack:
  added: []
  patterns: [version-browser history UI, preview-mode mutation lockout]
key-files:
  created: []
  modified:
    - packages/web/src/components/HistoryPanel.tsx
    - packages/web/src/components/workspace/ProjectWorkspace.tsx
    - packages/web/src/components/layout/Toolbar.tsx
key-decisions:
  - "History rows now preview versions on row click while restore stays an explicit secondary action."
  - "Preview mode composes on top of existing read-only guards and blocks chat, hotkeys, and task-state reflow from mutating live workspace state."
patterns-established:
  - "History UI copy should describe versions and restore targets, never undo/redo mechanics."
  - "Preview mode stays isolated from confirmed/pending state and must short-circuit mutation paths instead of relying on visual affordances only."
requirements-completed: []
duration: 8min
completed: 2026-04-18
---

# Phase 45 Plan 04: History UI Refactor Summary

**Version-browser history rows with explicit restore actions and a hard read-only workspace preview mode**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-18T10:11:00Z
- **Completed:** 2026-04-18T10:19:13Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Converted the history rail into a version list where each row previews on click and shows explicit `Показать эту версию` / `Восстановить эту версию` actions.
- Replaced residual undo/redo-oriented copy in the panel with version-oriented language and current-version cues.
- Added visible preview-mode controls and blocked task mutations, chat sends, shortcut restore, and gantt reflow writes while a historical snapshot is open.

## Task Commits

Each task was committed atomically:

1. **Task 1: Convert the history panel into a version list with preview and restore actions** - `6d116f8` (feat)
2. **Task 2: Add preview-mode workspace UX and hard read-only gating** - `f39f42d` (feat)

## Files Created/Modified

- `packages/web/src/components/HistoryPanel.tsx` - Switched the panel contract and row interactions to version-preview/restore semantics.
- `packages/web/src/components/workspace/ProjectWorkspace.tsx` - Composed preview mode into workspace read-only behavior, hotkeys, task-state flow, and chat disabling.
- `packages/web/src/components/layout/Toolbar.tsx` - Added preview-mode toolbar messaging plus a return-to-current action and mutation-lock affordances.

## Decisions Made

- History rows use row-click preview as the primary action, while restore remains an explicit opt-in action.
- Preview mode short-circuits state-changing paths directly, including chat disabling and gantt day-mode reflow, so historical viewing cannot accumulate optimistic live-state changes.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Task 1 required a small call-site rename in `ProjectWorkspace` to keep the `HistoryPanel` prop contract type-safe after renaming `onShowVersion` to `onPreviewVersion`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The workspace now behaves like a read-only version browser while previewing history.
- Phase 45-05 can build on stable version-oriented UI cues instead of undo/redo language or mixed live-state semantics.

## Self-Check

PASSED

---
*Phase: 45-history-refactor*
*Completed: 2026-04-18*
