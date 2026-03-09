---
phase: quick-013
plan: 13
subsystem: web-ui
tags: [ux, auth, textarea, chat, guest]
dependency_graph:
  requires: []
  provides: [textarea-chat-input, auth-on-send]
  affects: [ChatSidebar, App]
tech_stack:
  added: []
  patterns: [auth-on-send, auto-grow-textarea]
key_files:
  created: []
  modified:
    - packages/web/src/components/ChatSidebar.tsx
    - packages/web/src/App.tsx
decisions:
  - "Auth-on-send instead of blocking input: guest users type freely, OTP modal opens on submit"
  - "onLoginRequired callback prop for decoupled auth trigger between ChatSidebar and App"
  - "items-end on form wrapper to align send button to textarea bottom edge"
metrics:
  duration: 2 min
  completed_date: "2026-03-09"
  tasks: 2
  files: 2
---

# Phase quick-013: AI Input Textarea with Auth-on-Send Summary

**One-liner:** Auto-growing textarea (1–5 rows) replaces single-line input; unauthenticated users type freely and trigger OTP login only on send, with text preserved.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Refactor ChatSidebar — textarea + auth-on-send | 5b2ef02 | packages/web/src/components/ChatSidebar.tsx |
| 2 | Wire onLoginRequired in App.tsx | f2677d0 | packages/web/src/App.tsx |

## Changes Summary

### Task 1: ChatSidebar refactor

- Replaced `<input type="text">` with `<textarea rows={1}>` that auto-grows via `onInput` handler
- Max height set to `7.5rem` (5 rows at 1.5rem line-height) with `overflow-y-auto` beyond that
- `onKeyDown`: Enter submits, Shift+Enter inserts newline
- Removed `disabled` attribute from textarea for unauthenticated users — only disabled when `aiThinking`
- Removed amber auth warning banner entirely
- `handleSubmit`: if `!isAuthenticated` calls `onLoginRequired?.()` and returns without clearing input
- After authenticated send: clears input and resets textarea height to `auto`
- Form wrapper changed from `items-center` to `items-end` for proper send button alignment
- Send button disabled condition simplified to `disabled || !inputValue.trim()` (removed `!connected`)
- Added `onLoginRequired?: () => void` to `ChatSidebarProps`

### Task 2: App.tsx wiring

- Added `onLoginRequired={() => setShowOtpModal(true)}` prop to ChatSidebar usage
- No other changes needed — OTP modal already controlled, ChatSidebar stays mounted under modal overlay

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- TypeScript: `npx tsc --project packages/web/tsconfig.json --noEmit` — passes with 0 errors
- Build: `npm run -w packages/web build` — exits 0, 2660 modules transformed in 2.25s

## Self-Check: PASSED

- packages/web/src/components/ChatSidebar.tsx — modified and committed (5b2ef02)
- packages/web/src/App.tsx — modified and committed (f2677d0)
- Both commits verified in git log
