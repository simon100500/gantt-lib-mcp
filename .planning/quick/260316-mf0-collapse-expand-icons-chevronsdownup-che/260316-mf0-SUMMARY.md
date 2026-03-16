---
phase: quick-260316-mf0
plan: "01"
subsystem: web-ui
tags: [ui, icons, toolbar, lucide-react, tailwind]
dependency_graph:
  requires: []
  provides: [updated-toolbar-icons, violet-active-view-toggle]
  affects: [packages/web/src/App.tsx]
tech_stack:
  added: []
  patterns: [ghost-button, icon-only-button, violet-active-state]
key_files:
  created: []
  modified:
    - packages/web/src/App.tsx
decisions:
  - "Kept ChevronDown import for ProjectSwitcher dropdown trigger at line 813"
  - "ChevronsDownUp for collapse (arrows pointing inward), ChevronsUpDown for expand (arrows pointing outward)"
  - "Active view state: bg-violet-600 instead of bg-slate-900 for purple-tinted UI direction"
metrics:
  duration: "~3 minutes"
  completed_date: "2026-03-16"
  tasks_completed: 1
  files_changed: 1
---

# Phase quick-260316-mf0 Plan 01: Collapse/Expand Icons + Violet Active View Toggle Summary

**One-liner:** Swapped ChevronUp/ChevronDown for semantic ChevronsDownUp/ChevronsUpDown icons, converted collapse/expand to ghost icon-only buttons, and introduced bg-violet-600 active state for День/Неделя view toggle.

---

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Update collapse/expand icons and view toggle active style in App.tsx | a5689aa | packages/web/src/App.tsx |

---

## What Was Built

Three targeted changes in `packages/web/src/App.tsx`:

**Change 1 — Import line:**
- Added `ChevronsDownUp` and `ChevronsUpDown` to lucide-react import
- Removed `ChevronUp` (no longer used)
- Kept `ChevronDown` (still used for ProjectSwitcher dropdown trigger at line 813)

**Change 2 — Collapse/Expand buttons:**
- Replaced `<Button variant="outline">` components with plain `<button>` elements
- Removed border, background at rest, and label text
- New style: ghost icon-only, slate-500 text, slate-100 bg on hover
- `ChevronsDownUp` for "Свернуть все" (arrows pointing inward = collapse)
- `ChevronsUpDown` for "Развернуть все" (arrows pointing outward = expand)
- Title attribute provides tooltip accessibility

**Change 3 — View mode toggle active state:**
- Changed `bg-slate-900 text-white` → `bg-violet-600 text-white` for active День/Неделя button
- Inactive hover state (`bg-transparent text-slate-600 hover:bg-slate-100`) unchanged

---

## Verification

- TypeScript: `npx tsc --noEmit` — no errors
- All three changes applied correctly
- ChevronDown preserved for ProjectSwitcher usage

---

## Deviations from Plan

None - plan executed exactly as written.

---

## Self-Check: PASSED

- `packages/web/src/App.tsx` — modified and committed (a5689aa)
- Commit a5689aa exists in git log
- TypeScript compilation: clean
