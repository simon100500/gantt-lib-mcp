---
phase: quick-014
plan: 14
subsystem: web-ui
tags: [ux, chat, chips, quick-access]
key-files:
  modified:
    - packages/web/src/components/ChatSidebar.tsx
decisions:
  - Chip buttons gated only on WS connection, not auth or AI-thinking state — chips are example prompts for all users including guests
  - Trailing space appended to chip text so cursor lands after insertion point for immediate continued typing
metrics:
  duration: 5 min
  completed: 2026-03-09
  tasks: 1
  files: 1
---

# Phase quick-014 Plan 14: Unlock Quick-Access Buttons Summary

Quick-access chip buttons now remain clickable for all users (including guests and during AI responses); clicking a chip inserts the chip text with a trailing space and moves focus to the textarea.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Unlock chips and add trailing space on activation | d24628e | packages/web/src/components/ChatSidebar.tsx |

## Changes Made

### `handleChip` — trailing space
Changed `setInputValue(chip)` to `setInputValue(chip + ' ')` so the cursor lands after the chip text, ready for the user to continue typing without an extra keypress.

### Chip `disabled` prop — remove auth/AI gate
Changed `disabled={disabled || !connected}` to `disabled={!connected}`. The `disabled` prop represents "AI is thinking" and was unnecessarily blocking chip use. The `!connected` gate remains so chips stay disabled when the WebSocket is down (they would have no effect anyway).

Auth-gating is not needed on chips because guests clicking Send are already redirected to the OTP login modal via `handleSubmit`.

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- [x] `packages/web/src/components/ChatSidebar.tsx` modified
- [x] Commit d24628e exists
- [x] TypeScript compiles without errors (`npx tsc --noEmit -p packages/web/tsconfig.json`)
