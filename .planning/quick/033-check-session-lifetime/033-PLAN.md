---
phase: quick-033
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/web/src/hooks/useAuth.ts
autonomous: true
requirements: [Q033]

must_haves:
  truths:
    - "Access token is refreshed proactively before it expires, not just reactively on 401"
    - "User does not get logged out after 15 minutes of idle"
    - "Server restart does not invalidate existing DB sessions"
  artifacts:
    - path: "packages/web/src/hooks/useAuth.ts"
      provides: "Proactive token refresh timer (fires ~2 min before expiry)"
  key_links:
    - from: "useAuth proactive timer"
      to: "refreshAccessToken()"
      via: "setTimeout on access token change"
      pattern: "setTimeout.*refreshAccessToken"
---

<objective>
Diagnose session lifetime issues and add proactive token refresh so users stop getting logged out after idle periods.

Purpose: Access tokens expire after 15 minutes. Currently the client only refreshes reactively (on 401). If any code path doesn't go through fetchWithAuthRetry (e.g., WebSocket reconnect, direct fetch calls), the user gets a 401 with no recovery. Adding a proactive refresh timer eliminates the idle-logout problem entirely.

Output: useAuth.ts with a setTimeout-based refresh that fires ~2 minutes before token expiry.
</objective>

<execution_context>
@C:/Users/Volobuev/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Volobuev/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

## Session Lifetime Findings

**Access token:** 15 minutes (`signAccessToken` uses `expiresIn: '15m'`)
**Refresh token:** 7 days (`signRefreshToken` uses `expiresIn: '7d'`)
**DB session `expiresAt`:** 7 days from `createSession` (hardcoded: `Date.now() + 7 * 24 * 60 * 60 * 1000`)

**Current refresh behavior (reactive only):**
- `authMiddleware` calls `verifyToken(token)` — throws `JsonWebTokenError` for expired JWT → returns 401
- `fetchWithAuthRetry` in `useAuth.ts` catches 401 → calls `refreshAccessToken()` → POSTs to `/api/auth/refresh`
- `/api/auth/refresh` verifies refresh token, issues new access + refresh tokens, updates DB session

**Root cause of idle logout:** No proactive refresh timer exists. After 15 minutes idle, the next request gets a 401. The reactive path works for API calls wrapped in `fetchWithAuthRetry`, but:
1. WebSocket reconnects use the access token directly (not through fetchWithAuthRetry)
2. Any direct `fetch` not using `fetchWithAuthRetry` fails silently
3. Even in the happy path, users see a brief failure before recovery

**Server restart issue:** In-memory `sessionCache` (5-min TTL) is wiped on restart. The DB session still exists with the old access token string. The access token in localStorage matches the DB record, so `findSessionByAccessToken` succeeds after restart. Server restart alone should NOT break sessions — but if the server was down longer than the 15-min access token lifetime, the next request gets 401 and needs reactive refresh.

**Fix:** Add a proactive refresh timer in `useAuth.ts` that:
1. Decodes the access token to get its `exp` claim (without re-verifying — it's already trusted from the server)
2. Schedules `refreshAccessToken()` to fire at `exp - 2 minutes`
3. Clears and reschedules whenever the access token changes
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add proactive token refresh timer to useAuth</name>
  <files>packages/web/src/hooks/useAuth.ts</files>
  <action>
Add a `useEffect` in `useAuth` that schedules proactive token refresh whenever `state.accessToken` changes.

Implementation steps:

1. Add a helper function `getTokenExpMs(token: string): number | null` before the `useAuth` function body:
   - Decode the JWT payload (middle segment, base64): `JSON.parse(atob(token.split('.')[1]))`
   - Return `decoded.exp * 1000` (convert seconds to ms) or `null` on parse error

2. Inside `useAuth`, after the existing `useEffect` blocks, add a new `useEffect` with `[state.accessToken, refreshAccessToken]` dependency:
   ```
   useEffect(() => {
     const token = state.accessToken;
     if (!token) return;

     const expMs = getTokenExpMs(token);
     if (!expMs) return;

     const refreshAt = expMs - Date.now() - 2 * 60 * 1000; // 2 min before expiry
     if (refreshAt <= 0) {
       // Already expired or about to expire — refresh immediately
       void refreshAccessToken();
       return;
     }

     const timer = setTimeout(() => {
       void refreshAccessToken();
     }, refreshAt);

     return () => clearTimeout(timer);
   }, [state.accessToken, refreshAccessToken]);
   ```

3. No other changes needed. The existing `refreshAccessToken` already handles the full refresh flow (POST /api/auth/refresh, update localStorage, update state).

Note: Use `atob` for base64 decoding — it is available in all modern browsers and in the Vite/jsdom test environment. Do NOT add the `jwt-decode` library.

Also note: `refreshAccessToken` has `logout` in its dependency array in useCallback. To avoid the proactive timer effect recreating unnecessarily, verify that `refreshAccessToken` is stable (its own deps are stable). It is — `logout` is stable (no deps), so `refreshAccessToken` is stable across renders.
  </action>
  <verify>
    <automated>cd D:/Projects/gantt-lib-mcp && npm run build --workspace=packages/web 2>&1 | tail -20</automated>
  </verify>
  <done>
    - Build passes with no TypeScript errors
    - useAuth.ts contains a useEffect that calls setTimeout with refreshAccessToken
    - Timer fires approximately 13 minutes after login (15 min expiry - 2 min buffer)
    - Timer is cleared on cleanup (return () => clearTimeout(timer))
  </done>
</task>

</tasks>

<verification>
After implementation:
1. `npm run build --workspace=packages/web` passes
2. Grep confirms timer is present: `grep -n "setTimeout.*refresh\|refreshAt" packages/web/src/hooks/useAuth.ts`
3. Manual check: After login, open DevTools Network tab, wait 13 minutes — a POST to `/api/auth/refresh` should appear automatically without any user action
</verification>

<success_criteria>
- Access token is refreshed proactively before expiry, eliminating idle-logout UX
- No new npm dependencies added
- TypeScript build passes
- Existing reactive refresh path (fetchWithAuthRetry on 401) is preserved as fallback
</success_criteria>

<output>
After completion, create `.planning/quick/033-check-session-lifetime/033-SUMMARY.md`
</output>
