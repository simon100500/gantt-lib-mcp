# T04: 09-session-control 04

**Slice:** S09 — **Milestone:** M001

## Description

Wire auth middleware into REST routes and update the agent runner to use project-scoped data and session-targeted WebSocket broadcasts.

Purpose: After Plans 02 and 03 established the auth API and refactored the store/WS, this plan connects them into the actual request pipeline. Without this, any user could access any project's data.

Output: Protected API routes, project-aware agent runner.

## Must-Haves

- [ ] "GET /api/tasks, POST /api/chat, DELETE /api/tasks require valid Bearer token"
- [ ] "Invalid or missing token returns 401 before handler runs"
- [ ] "Token payload (projectId, sessionId) is available in request context for handlers"
- [ ] "Agent runner loads messages filtered by projectId and broadcasts to sessionId only"
- [ ] "After agent turn, task snapshot broadcast is scoped to sessionId"
- [ ] "DELETE /api/tasks only deletes tasks for the authenticated user's current project"

## Files

- `packages/server/src/middleware/auth-middleware.ts`
- `packages/server/src/agent.ts`
- `packages/server/src/index.ts`
- `packages/server/src/admin.ts`
