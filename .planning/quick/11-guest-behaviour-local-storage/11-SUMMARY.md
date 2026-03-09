---
phase: quick-011
plan: "01"
subsystem: web-frontend
tags: [guest-ux, local-storage, auth, project-switcher]
dependency_graph:
  requires: [useLocalTasks, useAuth, OtpModal]
  provides: [guest-projectswitcher-fix, local-tasks-import-on-login]
  affects: [packages/web/src/App.tsx]
tech_stack:
  added: []
  patterns: [conditional-render-by-auth, async-onSuccess-callback, token-from-callback]
key_files:
  modified:
    - packages/web/src/App.tsx
decisions:
  - "Use !auth.isAuthenticated instead of isDemoMode for ProjectSwitcher visibility — auth state is stable; isDemoMode was fragile"
  - "Use result.accessToken directly in onSuccess callback, not auth.accessToken from state (state updates are async)"
  - "Clear gantt_local_tasks and gantt_demo_mode from localStorage after successful server import"
metrics:
  duration_minutes: 1
  completed_date: "2026-03-09"
  tasks_completed: 2
  files_modified: 1
---

# Quick Task 11: Guest Behaviour — Local Storage Summary

**One-liner:** Fixed ProjectSwitcher disappearing after demo edits; local edited tasks now saved to server on login.

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Fix ProjectSwitcher disappearing for guests | e2a69d2 | packages/web/src/App.tsx |
| 2 | Save local tasks to server on login | d3b8192 | packages/web/src/App.tsx |

## What Was Built

### Task 1 — Fix ProjectSwitcher visibility for guests

**Bug:** When an unauthenticated user edited the demo chart, `isDemoMode` flipped to `false`. The header rendered ProjectSwitcher only when `isDemoMode === true`, so it disappeared after the first edit.

**Fix:** Changed the condition from `isDemoMode &&` to `!auth.isAuthenticated &&`. Now the ProjectSwitcher is always visible to any unauthenticated user, regardless of whether they have edited tasks or are viewing the original demo.

Also removed the now-unused `isDemoMode` local variable from App.tsx.

### Task 2 — Save edited local tasks to server on login

**Feature:** When a guest edits the demo chart and then logs in via OTP, their work was previously lost (server creates an empty project). Now, if `!localTasks.isDemoMode && localTasks.tasks.length > 0`, the OTP success callback sends a `PUT /api/tasks` with the local tasks using the access token directly from the auth result (not from React state, which updates asynchronously).

After a successful import, `gantt_local_tasks` and `gantt_demo_mode` keys are removed from localStorage. If the user logs in without having edited anything (isDemoMode === true), no import happens — the server-created empty project is used as-is.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- packages/web/src/App.tsx — FOUND
- Commit e2a69d2 (Task 1) — FOUND
- Commit d3b8192 (Task 2) — FOUND
