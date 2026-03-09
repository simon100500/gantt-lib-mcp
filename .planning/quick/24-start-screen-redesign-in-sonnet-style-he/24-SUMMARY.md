---
phase: quick-24
plan: 24
subsystem: UI
tags: [start-screen, redesign, sonnet-style]
dependency_graph:
  requires: []
  provides: [sonnet-style-start-screen]
  affects: [GanttChart.tsx]
tech_stack:
  added: []
  patterns: [absolute-positioning, inline-submit-button]
key_files:
  created: []
  modified:
    - packages/web/src/components/GanttChart.tsx
decisions: []
metrics:
  duration: 2 minutes
  completed_date: 2026-03-09T20:12:00Z
---

# Phase Quick-24 Plan 24: Start Screen Redesign in Sonnet Style Summary

Redesigned the empty/start screen to match Claude Sonnet's clean, minimal design pattern with inline submit button and white input field.

## Changes Made

### Modified Files

**packages/web/src/components/GanttChart.tsx** (lines 94-147)
- Changed input background from `bg-slate-50` to `bg-white` for cleaner white appearance
- Moved submit button from below input to inline on right side using absolute positioning
- Removed separator dividers and "или" text between buttons
- Increased input prominence with `min-height: 48px` and larger padding
- Submit button now icon-only (ArrowUp) in compact `h-8 w-8 p-0` circular form
- "Пустой график" button positioned directly below input row
- Simplified layout: header → input+submit → empty chart button

## Deviations from Plan

### Auto-fixed Issues

None - plan executed exactly as written.

## Technical Details

### Layout Changes
- Input: `pr-12` for right padding space, `px-4 py-3 text-base` for larger appearance
- Submit button: `absolute right-2 top-1/2 -translate-y-1/2` for perfect vertical center alignment
- Form: `gap-4` instead of `gap-3` for more breathing room
- Empty chart button: `h-10` for consistency with larger input field

### Preserved Functionality
- Auto-resize textarea behavior (1-5 rows)
- Keyboard shortcuts: Enter to submit, Shift+Enter for newline
- Form submission handler `onPromptSubmit(trimmed)`
- Empty chart handler `onStartEmpty`

## Verification

Build output:
```
Build successful
```

Manual verification checklist:
- [x] Header "С чего начнём?" displays at top
- [x] Large white input field (not gray)
- [x] Submit button positioned on right side of input
- [x] "Пустой график" button below input
- [x] Clean, minimal Sonnet-style appearance

## Commits

| Commit | Message |
|--------|---------|
| a44ebaf | feat(quick-24): redesign start screen in Sonnet style |

## Next Steps

None - quick task complete.

---
*Execution completed: 2026-03-09*
