# T03: 09-session-control 03

**Slice:** S09 — **Milestone:** M001

## Description

Refactor TaskStore to filter all operations by project_id. Refactor WebSocket registry to target broadcasts by sessionId. These two can run in Wave 2 alongside Plan 02 since they touch different files.

Purpose: Data isolation between users' projects. Targeted WebSocket delivery so one user's AI response doesn't appear in another user's chat.

Output: Modified store.ts and ws.ts. Both backward-compatible — existing callers that don't pass projectId still work (returns all or broadcasts globally).

## Must-Haves

- [ ] "TaskStore methods (list, create, update, delete) accept projectId and filter by it"
- [ ] "TaskStore message methods (addMessage, getMessages) accept projectId and filter by it"
- [ ] "WebSocket connections are tracked by sessionId (Map<string, Set<WebSocket>>)"
- [ ] "broadcastToSession(sessionId, msg) sends only to sockets belonging to that session"
- [ ] "Global broadcast() still works for admin/system messages"
- [ ] "WS handshake reads Bearer token from first message (auth handshake pattern)"

## Files

- `packages/mcp/src/store.ts`
- `packages/server/src/ws.ts`
