---
phase: quick-015
plan: 01
subsystem: web-ui
tags: [ux, websocket, guest, chips]
dependency_graph:
  requires: []
  provides: [consistent-ws-indicator, always-enabled-chips]
  affects: [packages/web/src/components/ChatSidebar.tsx, packages/web/src/App.tsx]
tech_stack:
  added: []
  patterns: [displayConnected derivation for guest/auth split]
key_files:
  modified:
    - packages/web/src/components/ChatSidebar.tsx
    - packages/web/src/App.tsx
decisions:
  - "displayConnected = isAuthenticated ? connected : true — guests always show green to avoid misleading amber state"
  - "Removed disabled:opacity-40 and disabled:cursor-not-allowed tokens from chips — they are never disabled now"
metrics:
  duration_minutes: 1
  completed_date: "2026-03-09"
  tasks_completed: 2
  files_modified: 2
---

# Phase quick-015 Plan 01: WS Connected UX Fixes Summary

**One-liner:** Remove WS gate from quick-access chips and show green indicator for guest users who have no WS connection.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Remove !connected from chip disabled prop | 16642a9 | packages/web/src/components/ChatSidebar.tsx |
| 2 | Guest WS indicator always green in App.tsx | 4aa36a5 | packages/web/src/App.tsx |

## What Was Built

**Task 1 — Chip buttons always enabled:**
- Removed `disabled={!connected}` prop from the quick-access chip `<button>` inside ChatSidebar.tsx
- Also removed `disabled:opacity-40 disabled:cursor-not-allowed` className tokens (no longer applicable)
- Chips (Добавить задачу, Сдвинуть сроки, Связать задачи, Показать сводку) are now always clickable

**Task 2 — Guest WS indicator fix:**
- Added `const displayConnected = auth.isAuthenticated ? connected : true;` on line 116 of App.tsx
- Replaced all three `connected ?` references in the footer status bar with `displayConnected`
- Passed `displayConnected` as the `connected` prop to `<ChatSidebar>` so the header dot also reflects guest state
- Guests see green "Подключено" in both the footer and the chat sidebar header
- Authenticated users still see real WS connection state

## Deviations from Plan

None — plan executed exactly as written.

## Verification

TypeScript build passed clean: `✓ built in 2.46s` with 2660 modules transformed, no TypeScript errors.

## Self-Check: PASSED

- [x] `packages/web/src/components/ChatSidebar.tsx` — modified, `disabled={!connected}` removed
- [x] `packages/web/src/App.tsx` — modified, `displayConnected` present at lines 116, 423, 441, 444, 445
- [x] Commit 16642a9 exists
- [x] Commit 4aa36a5 exists
