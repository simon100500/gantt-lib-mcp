---
phase: quick-012
plan: "01"
subsystem: web/auth
tags: [guest, auth, project-name, otp]
dependency_graph:
  requires: [quick-011]
  provides: [QUICK-12]
  affects: [packages/web/src/App.tsx]
tech_stack:
  added: []
  patterns: [fetch-after-login, auth-state-update]
key_files:
  modified:
    - packages/web/src/App.tsx
decisions:
  - "Call auth.login() a second time with updated project name so React state reflects the rename immediately without a page reload"
  - "Keep PATCH call unconditional on task presence — project rename is independent of task import"
metrics:
  duration: 5 min
  completed: 2026-03-09
---

# Quick Task 12: Fix Project Name Not Transferred on Guest Login — Summary

**One-liner:** PATCH /api/projects/:id call after OTP login transfers guest-renamed project name to server, with immediate React state update via second auth.login() call.

## What Was Done

Extended the OTP `onSuccess` callback in `App.tsx` to send the locally stored project name to the server after a guest authenticates. The existing task-import block was refactored into a clearly named `hasLocalEdits` variable, and a separate project-name block was added underneath.

The project-name block:
1. Checks whether `localTasks.projectName` differs from the default `'Мой проект'`
2. Sends `PATCH /api/projects/:id` with `{ name: localTasks.projectName }` using the fresh `result.accessToken`
3. Calls `auth.login()` with the updated project object so the header shows the new name without a reload

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Rename server project to match local name after login | f4511b1 | packages/web/src/App.tsx |

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- TypeScript build: `✓ built in 2.42s` — no errors
- PATCH /api/projects/:id pattern present in App.tsx onSuccess block
- Call is guarded by `localTasks.projectName !== 'Мой проект'` check

## Self-Check: PASSED

- [x] `packages/web/src/App.tsx` modified with PATCH call
- [x] Commit f4511b1 exists
- [x] TypeScript build passes
