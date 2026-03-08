---
status: resolved
trigger: "JWT tokens expire after idle (~2 hours) and server restart, client doesn't auto-refresh, getting 401 errors"
created: 2026-03-08T14:30:00.000Z
updated: 2026-03-08T14:40:00.000Z
---

## Current Focus
hypothesis: ROOT CAUSE CONFIRMED - The shouldAttemptRefresh logic was treating expired tokens as "fresh" after idle periods
test: Applied fix - simplified 401 handling to always attempt token refresh
expecting: Automatic token refresh on 401 errors, seamless recovery after idle or server restart
next_action: SESSION COMPLETE - User confirmed fix is working. Moving to resolved.

## Symptoms
expected: Seamless reconnection - WebSocket and API automatically restore connection after token expiry or server restart
actual: 401 Unauthorized errors, app doesn't recover
errors:
  - TokenExpiredError: jwt expired at 2026-03-08T13:36:09.000Z
  - [useTasks] Got 401, shouldAttemptRefresh: false isRetry: false
  - [useTasks] Fresh token, retrying once without refresh...
  - [useTasks] Retry also failed: 401
reproduction:
  1. User goes idle for 2+ hours
  2. Or server restarts
  3. On return/refresh - 401 error
started: Problem always existed

## Eliminated

## Evidence
- timestamp: 2026-03-08T14:30:00.000Z
  checked: Initial log analysis
  found: shouldAttemptRefresh is false, token expires, retry doesn't help
  implication: Need to examine refresh token logic and JWT lifetime settings

- timestamp: 2026-03-08T14:31:00.000Z
  checked: JWT token lifetimes in auth.ts
  found: Access token expires in 15 minutes (line 51), refresh token expires in 7 days (line 65)
  implication: After 2+ hours idle, access token is definitely expired, but refresh token should still be valid

- timestamp: 2026-03-08T14:32:00.000Z
  checked: Refresh token implementation in auth-routes.ts (lines 111-150)
  found: POST /api/auth/refresh endpoint exists and looks correct - finds session by refresh token, verifies it, generates new tokens
  implication: Server-side refresh mechanism is properly implemented

- timestamp: 2026-03-08T14:33:00.000Z
  checked: Client-side refresh logic in useAuth.ts (lines 172-211)
  found: refreshAccessToken() function reads refresh token from localStorage, calls /api/auth/refresh, updates localStorage and state
  implication: Client has refresh capability but it's not being called appropriately

- timestamp: 2026-03-08T14:34:00.000Z
  checked: useTasks.ts shouldAttemptRefresh logic (lines 51-76)
  found: Condition is `shouldAttemptRefresh = isRetry || token === lastProcessedToken.current`. After 2+ hour idle, token from localStorage is expired but different from lastProcessedToken (which is null/stale), so shouldAttemptRefresh = false
  implication: ROOT CAUSE IDENTIFIED - The logic treats the expired token as "fresh" because it's different from the last processed token, so it only retries once without refreshing

- timestamp: 2026-03-08T14:35:00.000Z
  checked: WebSocket authentication in ws.ts and useWebSocket.ts
  found: WebSocket sends auth token on connect (line 41 in useWebSocket.ts), server verifies with verifyToken (line 120 in ws.ts). When access token expires, WebSocket connection fails and can't re-authenticate
  implication: WebSocket also needs refresh token capability or fallback to API-based re-authentication

## Resolution
root_cause: The shouldAttemptRefresh logic in useTasks.ts (line 56) uses condition `isRetry || token === lastProcessedToken.current`. After 2+ hours idle, the expired access token from localStorage is treated as "fresh" (different from lastProcessedToken which is null/stale), so shouldAttemptRefresh returns false. The code then retries once without refreshing (lines 64-74), which also fails with 401, and the error is thrown instead of attempting token refresh.

The logic was designed to handle the switchProject case where a new token needs time to propagate, but it incorrectly treats expired tokens after idle periods the same way.

fix: Simplified the 401 handling logic in useTasks.ts to always attempt token refresh on 401 errors. The refreshAccessToken function already handles the case where refresh token is invalid (it calls logout()). This handles both scenarios:
1. Token expired after idle period (refresh token valid, session restored)
2. Server restart (session invalid, refresh fails and user logged out gracefully)

Also improved useWebSocket.ts to:
- Better handle authentication error messages from server
- Properly clear reconnection timeouts to avoid memory leaks
- Reconnect with updated token when accessToken changes

verification: User confirmed fix is working ("confirmed fixed"). The automatic token refresh now handles 401 errors correctly, allowing seamless recovery after idle periods and graceful handling after server restarts.

files_changed:
- packages/web/src/hooks/useTasks.ts: Simplified 401 handling to always attempt refresh
- packages/web/src/hooks/useWebSocket.ts: Added error message handling and timeout cleanup
