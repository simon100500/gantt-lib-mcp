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
  - useEffect on tasks.length resets sidebar visibility when all tasks removed
  - StartScreen uses same chip pill style as ChatSidebar for visual consistency
metrics:
  duration: "~5 min (tasks 1-2 complete; task 3 awaiting human verification)"
  completed_date: "2026-03-09"
  tasks_completed: 2
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

## Task Status

| Task | Name | Status | Commit |
|------|------|--------|--------|
| 1 | Create StartScreen component | Done | d3ced5a |
| 2 | Wire StartScreen into App.tsx | Done | 5775386 |
| 3 | Human verification of start screen | Awaiting verification | — |

## Self-Check: PARTIAL (awaiting Task 3 human verification)

- [x] `packages/web/src/components/StartScreen.tsx` exists
- [x] `packages/web/src/App.tsx` imports StartScreen and renders conditionally on `tasks.length === 0`
- [x] `chatSidebarVisible` initial state is `false` in App.tsx
- [x] TypeScript compiles without errors
- [ ] Task 3 (human-verify checkpoint) not yet completed
