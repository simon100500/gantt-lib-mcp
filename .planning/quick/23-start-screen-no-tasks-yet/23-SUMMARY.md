---
phase: quick-23
plan: 23
type: quick-task
completed_date: "2026-03-09"
duration_seconds: 180
tasks_completed: 2
files_modified: 2
commits: 2
---

# Phase Quick Task 23: Start screen with prompt input (no tasks yet) Summary

Replace "No tasks yet" message with interactive start screen featuring prompt input field and "Пустой график" button to improve onboarding for new users.

## One-Liner
Empty state now shows "С чего начнём?" heading with auto-resizing textarea for AI prompt submission and "Пустой график" button for empty chart start.

## Deviations from Plan

None - plan executed exactly as written.

## Changes Made

### GanttChart.tsx
- Added new props: `onPromptSubmit?: (prompt: string) => void` and `onStartEmpty?: () => void`
- Replaced empty state div with interactive form component
- Added local state for prompt value with auto-resize behavior
- Implemented Enter key submit, Shift+Enter for newline
- Styled textarea to match ChatSidebar patterns (1-5 rows, auto-scroll)
- Added "С чего начнём?" heading with centered layout (max-width: 420px)
- Added "Создать по описанию" primary button with ArrowUp icon
- Added separator with "или" text
- Added "Пустой график" outline button for empty chart
- Imported useState, ArrowUp icon, Button component, and cn utility

### App.tsx
- Passed `onPromptSubmit` handler to GanttChart that:
  - Calls `handleSend(prompt)` to send message to AI
  - Calls `setChatSidebarVisible(true)` to show chat panel
- Passed `onStartEmpty` handler that:
  - Calls `setShowTaskList(true)` to ensure task list is visible
- Reused existing App.tsx handlers without adding new state

## Technical Details

### Auto-resize Textarea
- Uses `onInput` handler to dynamically adjust height
- Minimum 1 row, maximum ~5 rows (120px height)
- Scrollbar only shows when content overflows
- Matches ChatSidebar implementation pattern

### Form Layout
- Centered flex-col layout with gap-3 spacing
- Max-width container: 420px
- Full-width buttons for better UX
- Separator uses flex with "или" text centered

### Callback Integration
- `onPromptSubmit`: Triggers AI chat with user's message and opens sidebar
- `onStartEmpty`: Shows empty Gantt chart with task list enabled
- Both handlers delegate to existing App.tsx methods

## Files Modified

1. `packages/web/src/components/GanttChart.tsx` - Added interactive empty state
2. `packages/web/src/App.tsx` - Wired callbacks to existing handlers

## Commits

- `a57d7a0`: feat(quick-23): add interactive start screen to GanttChart empty state
- `9fd6396`: feat(quick-23): wire GanttChart empty state callbacks to App handlers

## Success Criteria

- Empty state shows interactive prompt input instead of static "No tasks yet" message
- Prompt submission triggers AI chat with the user's message
- "Пустой график" button shows empty Gantt chart without AI interaction
- UI is responsive and matches existing design patterns
- No TypeScript compilation errors
