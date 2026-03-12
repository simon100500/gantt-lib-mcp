# T02: 10-work-stability 02

**Slice:** S10 — **Milestone:** M001

## Description

Fix three frontend/API bugs that break the user-facing experience after Phase 9 auth was added:

- Bug 1: useTasks throws on 401 instead of attempting a token refresh. Any user opening the app 15+ minutes after their last login sees a red error screen.
- Bug 2: useWebSocket calls connect() at mount time — if accessToken is null (not yet logged in), the auth handshake is never sent. After OTP login succeeds, the token changes in state but useWebSocket does not reconnect, leaving the WS unauthenticated until the user manually refreshes.
- Bug 6: Chat history is stored in the `messages` DB table (from Phase 9) but no GET /api/messages endpoint exists, so the client always starts with an empty messages array. History disappears on every reload.

Purpose: After this plan, the app session is self-healing: stale tokens refresh silently, WebSocket authenticates immediately after OTP login, and chat history survives page reloads.
Output: Four files modified — useTasks.ts (refresh retry), useWebSocket.ts (accessToken dependency), index.ts (new endpoint), App.tsx (three wiring changes).

## Must-Haves

- [ ] "App loads tasks without 401 error even when access token has expired (transparent refresh)"
- [ ] "After OTP login, WebSocket connects and shows 'connected' without requiring a page reload"
- [ ] "Chat history is restored from server after page reload, scoped to the current project"

## Files

- `packages/web/src/hooks/useTasks.ts`
- `packages/web/src/hooks/useWebSocket.ts`
- `packages/server/src/index.ts`
- `packages/web/src/App.tsx`
