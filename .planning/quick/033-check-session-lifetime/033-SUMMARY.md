---
phase: quick-033
plan: "01"
subsystem: web/auth
tags: [auth, jwt, token-refresh, session]
dependency_graph:
  requires: []
  provides: [proactive-token-refresh]
  affects: [useAuth, session-lifetime]
tech_stack:
  added: []
  patterns: [proactive-refresh-timer, jwt-decode-atob]
key_files:
  created: []
  modified:
    - packages/web/src/hooks/useAuth.ts
decisions:
  - "Use atob() for JWT base64 decode — no new npm dependency needed"
  - "Place proactive useEffect after refreshAccessToken useCallback declaration to avoid TS2448 (block-scoped variable used before declaration)"
metrics:
  duration: ~5 min
  completed: 2026-03-15
  tasks_completed: 1
  files_modified: 1
---

# Phase quick-033 Plan 01: Check Session Lifetime Summary

**One-liner:** Proactive JWT refresh timer fires 2 minutes before token expiry, eliminating idle-logout UX caused by reactive-only 401 recovery.

---

## What Was Built

Added a `getTokenExpMs()` helper and a `useEffect`-based proactive refresh timer to `useAuth.ts`.

**Helper function** (`getTokenExpMs`):
- Decodes the JWT payload using `atob(token.split('.')[1])`
- Returns `exp * 1000` (ms) or `null` on parse error
- No new npm dependencies — `atob` is available in all modern browsers and Vite/jsdom test environments

**Proactive refresh `useEffect`:**
- Dependencies: `[state.accessToken, refreshAccessToken]`
- On each new access token: decodes expiry, schedules `refreshAccessToken()` at `exp - 2 minutes`
- If token is already expired or within the 2-min buffer: refreshes immediately
- Cleans up via `return () => clearTimeout(timer)` on token change or unmount
- Placed after the `refreshAccessToken` `useCallback` declaration (required to avoid TypeScript block-scoped variable error)

---

## Root Cause Context (from plan)

**Access token lifetime:** 15 minutes
**Refresh token lifetime:** 7 days
**Previous behavior:** Reactive only — `fetchWithAuthRetry` catches 401, calls `refreshAccessToken`. Any code path not using `fetchWithAuthRetry` (WebSocket reconnects, direct `fetch` calls) would silently fail after 15 minutes of idle.

---

## Tasks

| # | Task | Commit | Status |
|---|------|--------|--------|
| 1 | Add proactive token refresh timer to useAuth | 64534eb | Complete |

---

## Verification

- `npm run build --workspace=packages/web` passes (TypeScript + Vite, no errors)
- `grep -n "setTimeout.*refresh\|refreshAt" packages/web/src/hooks/useAuth.ts` confirms timer present at lines 233, 234, 242
- Existing reactive refresh path (`fetchWithAuthRetry` on 401) preserved as fallback

---

## Deviations from Plan

**1. [Rule 3 - Blocking] Moved useEffect after refreshAccessToken declaration**

- **Found during:** Task 1 — first build attempt
- **Issue:** TypeScript error TS2448: "Block-scoped variable 'refreshAccessToken' used before its declaration" — the proactive effect was initially placed before the `refreshAccessToken` `useCallback`, but `const` declarations are not hoisted
- **Fix:** Removed misplaced effect, re-added it immediately after the `refreshAccessToken` `useCallback` closing brace
- **Files modified:** packages/web/src/hooks/useAuth.ts
- **Commit:** 64534eb (same task commit, deviation fixed inline before final commit)

---

## Self-Check

- [x] `packages/web/src/hooks/useAuth.ts` exists and modified
- [x] Commit 64534eb exists
- [x] Build passes with no TypeScript errors

## Self-Check: PASSED
