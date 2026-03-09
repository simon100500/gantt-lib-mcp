---
phase: quick-020
plan: 01
subsystem: web-ui
tags: [toolbar, switch, ui, auto-schedule]
dependency_graph:
  requires: []
  provides: [SwitchControl component, repositioned toolbar switches]
  affects: [packages/web/src/App.tsx]
tech_stack:
  added: []
  patterns: [track+thumb switch UI, flex-1 spacer for right-side positioning]
key_files:
  modified:
    - packages/web/src/App.tsx
decisions:
  - Replaced ToolbarToggle button component with SwitchControl (track + sliding thumb) for proper on/off switch semantics
  - Positioned both switches on right side of toolbar (after flex-1 spacer) to group settings away from action buttons
  - Kept onCascade/enableAutoSchedule wiring unchanged — existing handleCascade correctly merges shifted tasks into full list
metrics:
  duration: 5 min
  completed_date: 2026-03-09
---

# Phase quick-020 Plan 01: Switch UI for Auto-Schedule and Overdue Summary

**One-liner:** Compact track+thumb SwitchControl components replacing toggle-buttons, repositioned to right side of Gantt toolbar with correct auto-schedule cascade wiring.

## What Was Implemented

Converted the "Авто-планирование" and "Просроченные" toolbar controls from `ToolbarToggle` (button-style) to `SwitchControl` (track + sliding thumb). Both switches now appear on the RIGHT side of the toolbar after the `flex-1` spacer, visually grouping settings away from action buttons like "Сегодня".

### Key changes in `packages/web/src/App.tsx`

- **Removed** `ToolbarToggle` component and its `ToolbarToggleProps` interface (lines ~22-56)
- **Added** `SwitchControl` inline component with:
  - Outer `<label>` for click-target coverage
  - `<span role="switch" aria-checked>` track that turns `bg-primary` when checked, `bg-slate-200` when unchecked
  - Inner `<span>` thumb that translates `translate-x-3` (on) or `translate-x-0` (off)
  - Label text + icon that changes color based on `checked` state
- **Restructured toolbar** layout:
  - Left: ShowTaskList button | sep | Сегодня button
  - Right (after flex-1): SwitchControl(Авто-план) | sep | SwitchControl(Просроченные) | sep | AI assistant button | validation badge
- **Auto-schedule wiring** verified unchanged: `enableAutoSchedule={enableAutoSchedule}` and `onCascade={handleCascade}` props still correctly passed to `<GanttChart>`. The `handleCascade` function merges shifted tasks into the full task list via `Map` lookup.

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check

- [x] `packages/web/src/App.tsx` modified with SwitchControl component
- [x] Build passes: `npm run build --workspace=packages/web` - 0 TypeScript errors, built in 2.46s
- [x] Commit `e360bae` exists: `feat(quick-020): replace ToolbarToggle with SwitchControl, reposition to right side`

## Self-Check: PASSED
