---
phase: quick
plan: 260316-m1z
subsystem: web/ui
tags: [inline-edit, ux, header, project-rename]
dependency_graph:
  requires: []
  provides: [inline-rename-ux]
  affects: [packages/web/src/App.tsx]
tech_stack:
  added: []
  patterns: [controlled-input, useCallback, useRef, conditional-rendering]
key_files:
  created: []
  modified:
    - packages/web/src/App.tsx
decisions:
  - "Placed handleStartInlineRename and handleCommitInlineRename after currentProjectLabel definition to avoid TS forward-reference errors"
  - "Used autoFocus + onFocus select() instead of a useEffect for input focus — simpler and native"
metrics:
  duration: ~8 minutes
  completed: 2026-03-16
---

# Quick Task 260316-m1z: Inline Project Name Rename Summary

**One-liner:** Click-to-edit project name in header breadcrumb with Enter/blur save and Escape cancel, disabled in read-only share mode.

## What Was Built

Replaced the static `<span>` displaying the project name in the top header breadcrumb with an inline-editable input that activates on click. The implementation:

- Click on project name -> input appears pre-filled with current name, text auto-selected
- Enter or blur -> trims, skips save if empty or unchanged, calls `handleSaveProjectName` (works for both guest localStorage and authenticated API PATCH)
- Escape -> cancels without saving, returns to span display
- `hasShareToken` (read-only shared view) -> plain non-clickable span, no hover styling
- Non-share mode span shows hover underline and cursor-pointer as affordance with tooltip "Нажмите, чтобы переименовать"

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Add inline rename state, ref, handlers and replace breadcrumb span | 20d09da | packages/web/src/App.tsx |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Forward reference TS errors for handleStartInlineRename / handleCommitInlineRename**
- **Found during:** Task 1 — TypeScript compilation
- **Issue:** Plan instructed placing handlers after `handleEditGuestProject` (~line 438), but `currentProjectLabel` and `handleSaveProjectName` are defined later (~line 613 and ~line 487 respectively). TypeScript strict mode flagged `TS2448` and `TS2454` errors.
- **Fix:** Moved both handlers to after `currentProjectLabel` definition (after line 622), just before the error-state block.
- **Files modified:** packages/web/src/App.tsx
- **Commit:** 20d09da (same task commit, fix applied before commit)

## Self-Check: PASSED

- packages/web/src/App.tsx modified: FOUND
- Commit 20d09da: FOUND
- TypeScript: 0 errors
