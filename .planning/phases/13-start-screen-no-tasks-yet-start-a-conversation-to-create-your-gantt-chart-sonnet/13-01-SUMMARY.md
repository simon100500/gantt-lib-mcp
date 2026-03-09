---
phase: 13-start-screen-no-tasks-yet-start-a-conversation-to-create-your-gantt-chart-sonnet
plan: "01"
subsystem: web-ui
tags: [start-screen, ux, onboarding, react]
dependency_graph:
  requires: []
  provides: [StartScreen component, conditional rendering in App]
  affects: [packages/web/src/App.tsx, packages/web/src/components/StartScreen.tsx]
tech_stack:
  added: []
  patterns: [conditional rendering, auto-grow textarea, chip pre-fill pattern]
key_files:
  created:
    - packages/web/src/components/StartScreen.tsx
  modified:
    - packages/web/src/App.tsx
decisions:
  - chatSidebarVisible starts as false — hidden until user interacts (not shown on start screen)
  - handleEmptyChart placed after handleAddTask to avoid TypeScript forward-reference error
  - hasStartedChat flag gates layout switch independent of tasks.length — ensures chat is visible while AI processes first prompt
  - useEffect resets hasStartedChat+chatSidebarVisible only when tasks===0 AND aiThinking===false
  - Project switch resets hasStartedChat so fresh projects always show start screen
  - StartScreen uses same chip pill style as ChatSidebar for visual consistency
metrics:
  duration: "~27 min"
  completed_date: "2026-03-10"
  tasks_completed: 3
  tasks_total: 3
  files_modified: 2
---

# Phase 13 Plan 01: Start Screen Summary

**One-liner:** Sonnet-style centered start screen with textarea, 4 example chips, and «Пустой график» button replaces the "No tasks yet" empty state.

## What Was Built

### StartScreen component (`packages/web/src/components/StartScreen.tsx`)

A full-area centered React component shown when `tasks.length === 0 && !loading`:

- Headline «С чего начнём?» (text-2xl font-semibold centered)
- Auto-growing textarea (rows=3, maxHeight 12rem) with ArrowUp send button overlay — same auto-grow pattern as ChatSidebar
- Enter submits, Shift+Enter inserts newline
- 4 example chips (pill outline style matching ChatSidebar's QUICK_CHIPS):
  - «Загородный дом» → pre-fills construction project prompt
  - «Ремонт офиса» → pre-fills office renovation prompt
  - «ИТ-проект» → pre-fills IT project prompt
  - «Мероприятие» → pre-fills event preparation prompt
- Chip click pre-fills textarea and focuses it WITHOUT submitting
- «Пустой график» blue button (shadcn Button variant=default size=sm)
- Props: `onSend`, `onEmptyChart`, `isAuthenticated?`, `onLoginRequired?`

### App.tsx modifications (`packages/web/src/App.tsx`)

- Imported StartScreen component
- `chatSidebarVisible` initial state changed from `true` → `false`
- `handleStartScreenSend`: opens chat sidebar then calls handleSend
- `handleEmptyChart`: creates placeholder Task (id/name/startDate/endDate today), calls handleAddTask, opens chat sidebar
- `useEffect` on `[tasks.length, loading]`: resets `chatSidebarVisible` to false when tasks reach 0
- Main content area wrapped in conditional: `tasks.length === 0 && !loading` → StartScreen; otherwise full Gantt + toolbar + chat sidebar layout

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| `chatSidebarVisible` starts `false` | Chat sidebar not needed on start screen; opens only after user interaction |
| `handleEmptyChart` declared after `handleAddTask` | TypeScript `useCallback` blocks cannot reference `const` declarations that come later |
| `useEffect` on `tasks.length` for reset | Ensures project switch or delete-all returns user to start screen automatically |
| Same chip pill style as ChatSidebar | Visual consistency — identical class names |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] handleEmptyChart moved after handleAddTask declaration**
- **Found during:** Task 2 TypeScript verification
- **Issue:** `handleEmptyChart` was placed before `handleAddTask` but referenced it — TypeScript error TS2448 "Block-scoped variable used before its declaration"
- **Fix:** Moved `handleEmptyChart` to after `handleAddTask` definition
- **Files modified:** packages/web/src/App.tsx
- **Commit:** 5775386

**2. [Rule 1 - Bug] Chat panel not visible while AI processes first prompt**
- **Found during:** Task 3 (human verification)
- **Issue:** After StartScreen submits, `handleStartScreenSend` called `setChatSidebarVisible(true)` but the entire main layout including the chat sidebar was gated behind `tasks.length > 0`. The existing `useEffect` also actively reset `chatSidebarVisible` to `false` whenever tasks were empty. Result: user saw nothing until page refresh, even though AI was processing correctly.
- **Root cause:** Condition `tasks.length === 0 && !loading` showed StartScreen regardless of whether user had just submitted a prompt. `hasStartedChat` flag was missing.
- **Fix:** Added `hasStartedChat` boolean state. Set to `true` on `handleStartScreenSend`. Main layout condition changed from `tasks.length === 0 && !loading` to `tasks.length === 0 && !loading && !hasStartedChat`. Reset effect now also checks `!aiThinking` so it only fires when AI finishes — keeping layout visible throughout processing. Project switch resets flag for clean state.
- **Files modified:** `packages/web/src/App.tsx`
- **Commit:** 500a8b2

## Task Status

| Task | Name | Status | Commit |
|------|------|--------|--------|
| 1 | Create StartScreen component | Done | d3ced5a |
| 2 | Wire StartScreen into App.tsx | Done | 5775386 |
| 3 | Human verification + bugfix | Done | 500a8b2 |

## Self-Check: PASSED

- [x] `packages/web/src/components/StartScreen.tsx` exists
- [x] `packages/web/src/App.tsx` imports StartScreen and renders conditionally
- [x] `chatSidebarVisible` initial state is `false` in App.tsx
- [x] `hasStartedChat` flag added — transitions to main layout on submit regardless of `tasks.length`
- [x] TypeScript compiles without errors
- [x] All 3 task commits exist in git log (d3ced5a, 5775386, 500a8b2)
