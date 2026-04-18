---
phase: 45-history-refactor
plan: 03
subsystem: web
tags: [history, react, zustand, versioning, preview, restore]
requires:
  - phase: 45-02
    provides: version-oriented history list, snapshot preview, and restore API contracts
provides:
  - isolated history viewer state machine for frontend preview mode
  - server-driven version preview and restore orchestration in the history hook
  - workspace snapshot selection that prioritizes preview mode without mutating editing state
affects: [packages/web, history-panel, workspace, zustand]
tech-stack:
  added: []
  patterns: [isolated viewer store, preview-first snapshot selection, server-authoritative history restore]
key-files:
  created:
    - packages/web/src/stores/useHistoryViewerStore.ts
  modified:
    - packages/web/src/hooks/useProjectHistory.ts
    - packages/web/src/components/workspace/ProjectWorkspace.tsx
    - packages/web/src/components/HistoryPanel.tsx
key-decisions:
  - "History preview lives in a dedicated Zustand store so historical snapshots never enter confirmed, pending, or dragPreview editing state."
  - "ProjectWorkspace overlays preview snapshots ahead of normal editing state and disables editing while still allowing version navigation and return-to-current actions."
patterns-established:
  - "The history hook owns product actions showVersion, restoreVersion, and returnToCurrentVersion while snapshot data stays server-authoritative."
  - "History UI remains navigable during preview mode; only chart editing and hotkey mutations are disabled."
requirements-completed: []
duration: 3min
completed: 2026-04-18
---

# Phase 45 Plan 03: Isolated history viewer mode Summary

**Historical version preview is now a separate frontend mode backed by server snapshots and explicit restore semantics.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-18T13:10:49+03:00
- **Completed:** 2026-04-18T13:13:23+03:00
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Added `useHistoryViewerStore` with an explicit inactive/preview state machine for historical snapshots.
- Refactored `useProjectHistory` around version-oriented actions that fetch `/api/history/:groupId/snapshot`, restore via `/api/history/:groupId/restore`, and clear preview after authoritative restore.
- Updated `ProjectWorkspace` and `HistoryPanel` so preview mode renders the selected snapshot first, shows a return-to-current action, and keeps editing disabled without polluting optimistic project state.

## Task Commits

1. **Task 1: add isolated history viewer store** - `77a0faa` (feat)
2. **Task 2: wire version preview and restore into workspace flow** - `47f204f` (feat)

## Decisions Made

- Kept `useProjectStore` unchanged for history concerns so preview isolation is enforced structurally instead of by selector conventions.
- Applied preview mode in `ProjectWorkspace` rather than in the shared task source so normal drag/current derivation still works unchanged underneath the history overlay.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Critical functionality] Extended the history panel to expose preview and return-to-current controls**
- **Found during:** Task 2
- **Issue:** Rewiring only the hook and workspace would not make the new preview mode reachable or dismissible from the existing history UI.
- **Fix:** Added show-version and return-to-current actions to `HistoryPanel`, plus preview highlighting for the selected row.
- **Files modified:** `packages/web/src/components/HistoryPanel.tsx`
- **Commit:** `47f204f`

## Known Stubs

None.

## Self-Check: PASSED
