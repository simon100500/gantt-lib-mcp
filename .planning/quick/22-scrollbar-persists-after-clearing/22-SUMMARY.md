---
phase: quick
plan: 22
subsystem: ui
tags: [react, textarea, scrollbar, dynamic-overflow, css-in-js]

# Dependency graph
requires:
  - phase: quick-13
    provides: auto-growing textarea component
provides:
  - Textarea with dynamic overflow-y control based on content height
  - Scrollbar only appears when content actually overflows maxHeight
affects: [chat-input, user-experience]

# Tech tracking
tech-stack:
  added: []
  patterns: [dynamic-overflow-control, inline-style-override]

key-files:
  created: []
  modified:
    - packages/web/src/components/ChatSidebar.tsx

key-decisions:
  - "Use inline style.overflowY to override Tailwind overflow-y-auto class"
  - "Set overflow threshold at 120px (7.5rem maxHeight)"

patterns-established:
  - "Dynamic overflow pattern: Check scrollHeight vs threshold, set overflow accordingly"
  - "Reset both height and overflow when clearing input"

requirements-completed: [QUICK-022]

# Metrics
duration: 3min
completed: 2026-03-09
---

# Phase quick-22: Fix scrollbar persisting after clearing Summary

**Dynamic textarea overflow-y control to hide scrollbar when content doesn't exceed maxHeight**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-09T15:40:00Z
- **Completed:** 2026-03-09T15:43:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Textarea scrollbar now only appears when content overflows the 120px maxHeight
- Clearing text properly resets both height and overflow-y to initial state
- Existing auto-grow behavior preserved

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix textarea scrollbar persistence after clearing** - `fd83303` (fix)

**Plan metadata:** N/A (single commit)

## Files Created/Modified

- `packages/web/src/components/ChatSidebar.tsx` - Added dynamic overflow-y control in handleTextareaInput and reset in handleSubmit

## Code Changes

### handleTextareaInput function
```typescript
function handleTextareaInput(e: React.FormEvent<HTMLTextAreaElement>) {
  const el = e.currentTarget;
  el.style.height = 'auto';
  const newHeight = el.scrollHeight;
  el.style.height = newHeight + 'px';
  // Only show scrollbar when content actually overflows
  el.style.overflowY = newHeight > 120 ? 'auto' : 'hidden';
}
```

### handleSubmit function (added overflow reset)
```typescript
if (inputRef.current) inputRef.current.style.height = 'auto';
if (inputRef.current) inputRef.current.style.overflowY = 'hidden';
```

## Decisions Made

- **Inline style override:** Used `el.style.overflowY` to override Tailwind's `overflow-y-auto` class - inline styles have higher specificity
- **Threshold value:** Used 120px as the overflow threshold (matches the `maxHeight: '7.5rem'` style)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Fix complete. The textarea now properly hides the scrollbar when empty or when content doesn't overflow.

---
*Phase: quick-22*
*Completed: 2026-03-09*
