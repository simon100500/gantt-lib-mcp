---
phase: 10-work-stability
plan: "02"
subsystem: web-hooks-auth
tags: [bug-fix, auth, websocket, token-refresh, chat-history]
dependency_graph:
  requires: []
  provides: [transparent-token-refresh, ws-auth-reconnect, chat-history-persistence]
  affects: [useTasks, useWebSocket, App.tsx, server-api]
tech_stack:
  added: []
  patterns: [refresh-retry-on-401, reactive-ws-reconnect, history-load-on-auth]
key_files:
  created: []
  modified:
    - packages/web/src/hooks/useTasks.ts
    - packages/web/src/hooks/useWebSocket.ts
    - packages/server/src/index.ts
    - packages/web/src/App.tsx
decisions:
  - "refreshAccessToken passed as parameter to useTasks — avoids hook importing auth state directly, keeps dependency explicit"
  - "useWebSocket useEffect depends on [accessToken] not [connect] — connect is memoized with [] so token changes would never trigger reconnect"
  - "ws.onclose = null before intentional close — prevents exponential backoff loop racing with deliberate reconnect"
  - "history load useEffect deps include auth.project?.id — fires on project switch as well as initial auth"
metrics:
  duration_minutes: 10
  tasks_completed: 3
  files_modified: 4
  completed_date: "2026-03-07"
---

# Phase 10 Plan 02: Auth Self-Healing — Refresh Retry, WS Reconnect, Chat History Summary

**One-liner:** Silent 401 refresh-retry in useTasks, token-reactive WS reconnect in useWebSocket, and persistent chat history via GET /api/messages — three targeted fixes that make the session self-healing after Phase 9 auth was added.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Fix useTasks refresh-retry on 401; add GET /api/messages endpoint | 3fac8fa | useTasks.ts, index.ts |
| 2 | Fix useWebSocket — add accessToken dependency for reconnect | ed4fd86 | useWebSocket.ts |
| 3 | Wire App.tsx — update hook call sites and add history load on auth | a0ef9b8 | App.tsx |

## What Was Built

### Bug 1 Fix — useTasks refresh-retry (packages/web/src/hooks/useTasks.ts)

The hook now accepts a second parameter `refreshAccessToken: () => Promise<string | null>`. When the initial fetch returns HTTP 401, it calls `refreshAccessToken()` (which either returns a fresh token or calls `logout()` internally), then retries the fetch once with the new token. If the retry also fails it sets error state. A cancellation flag prevents state updates after component unmount.

### Bug 2 Fix — useWebSocket token-reactive reconnect (packages/web/src/hooks/useWebSocket.ts)

Added third parameter `accessToken: string | null`. The mounting `useEffect` now depends on `[accessToken]` instead of `[connect]`. When a token changes from null to a value (after OTP login), the effect fires: it sets `ws.onclose = null` on the existing connection before closing it (suppressing the exponential backoff loop), then calls `connect()` to establish a fresh authenticated connection. The `connect` useCallback itself remains unchanged with `[]` deps — it reads the token via a ref which is always current.

### Bug 6 Fix — GET /api/messages endpoint (packages/server/src/index.ts)

New route `GET /api/messages` added after `GET /api/tasks`, protected by `authMiddleware`. Calls `taskStore.getMessages(req.user!.projectId)` and returns the last 50 messages via `.slice(-50)`.

### App.tsx wiring (packages/web/src/App.tsx)

Three changes:
1. `useTasks(auth.accessToken, auth.refreshAccessToken)` — passes refresh function
2. `useWebSocket(handleWsMessage, () => auth.accessToken, auth.accessToken)` — passes reactive token
3. New `useEffect` with deps `[auth.isAuthenticated, auth.accessToken, auth.project?.id]` fetches `/api/messages` and populates `messages` state with `ChatMessage[]` objects using the existing `msgCounter` for ID generation

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| refreshAccessToken passed as parameter | Keeps hook dependency explicit; avoids importing auth context inside hook |
| useEffect depends on [accessToken] | connect is memoized with [] — token changes would never re-trigger if using [connect] |
| ws.onclose = null before intentional close | Prevents backoff handler from racing with deliberate reconnect |
| history load fires on project switch | auth.project?.id in deps means switching projects loads that project's history |

## Deviations from Plan

None — plan executed exactly as written. The useEffect import was already present in App.tsx so no extra import was needed. TypeScript check revealed App.tsx had `useEffect` imported via React destructuring already missing from the import — fixed by adding `useEffect` to the existing import statement.

## Self-Check: PASSED

All modified files exist on disk. All task commits verified in git log:
- 3fac8fa: Task 1 (useTasks + GET /api/messages)
- ed4fd86: Task 2 (useWebSocket accessToken dependency)
- a0ef9b8: Task 3 (App.tsx wiring)
