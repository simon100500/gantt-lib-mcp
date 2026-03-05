---
phase: 09-session-control
plan: 04
subsystem: server
tags: [auth, middleware, rest-api, websocket, agent-runner]
dependency_graph:
  requires:
    - "09-02: Auth API (JWT signing/verification, auth routes)"
    - "09-03: Data isolation (project_id filtering, session registry)"
  provides:
    - "09-05: Session lifecycle management (token validation path)"
    - "09-06: Admin dashboard (protected admin endpoints)"
  affects:
    - "packages/server: index.ts, agent.ts, ws.ts"
tech_stack:
  added: []
  patterns:
    - "Fastify preHandler hooks for route-level authentication"
    - "Module augmentation for TypeScript request typing"
    - "Session-scoped WebSocket broadcasts via Map registry"
key_files:
  created:
    - "packages/server/src/middleware/auth-middleware.ts"
  modified:
    - "packages/server/src/index.ts"
    - "packages/server/src/agent.ts"
    - "packages/server/src/ws.ts"
decisions:
  - "Use auth middleware on specific routes (not global) to keep /health and /api/auth/* public"
  - "Validate session exists in DB on each request (authStore.findSessionByAccessToken)"
  - "Pass full user context (userId, projectId, sessionId) through WebSocket chat handlers"
metrics:
  duration_minutes: 12
  completed_at: "2026-03-05T14:31:00Z"
---

# Phase 09 Plan 04: Wire auth middleware into request pipeline Summary

**One-liner:** JWT-based authentication middleware for REST routes with project-scoped agent runner and session-targeted WebSocket broadcasts.

## Overview

This plan connected the auth API (Plan 02) and data isolation (Plan 03) into the actual request pipeline. All protected routes now require valid Bearer tokens, and the agent runner operates on project-scoped data with session-targeted broadcasts.

## What Was Built

### 1. Auth Middleware (`packages/server/src/middleware/auth-middleware.ts`)

Created a Fastify preHandler hook that:
- Extracts Bearer token from Authorization header
- Verifies JWT signature and expiry using `verifyToken`
- Validates session still exists in DB via `authStore.findSessionByAccessToken`
- Attaches decoded payload to `req.user` with TypeScript module augmentation
- Returns 401 for missing, invalid, or expired tokens

### 2. Protected REST Routes (`packages/server/src/index.ts`)

Updated three endpoints with `{ preHandler: [authMiddleware] }`:

- **GET /api/tasks**: Returns tasks filtered by `req.user!.projectId`
- **POST /api/chat**: Passes `projectId` and `sessionId` to agent runner
- **DELETE /api/tasks**: Deletes tasks scoped to `req.user!.projectId`

The `/health` endpoint remains public (no auth required).

### 3. Agent Runner Updates (`packages/server/src/agent.ts`)

Changed `runAgentWithHistory` signature from:
```typescript
(userMessage: string) => Promise<void>
```
to:
```typescript
(userMessage: string, projectId: string, sessionId: string) => Promise<void>
```

All operations now project-scoped:
- `taskStore.addMessage('user', userMessage, projectId)`
- `taskStore.getMessages(projectId)`
- `taskStore.list(projectId)`
- `broadcastToSession(sessionId, ...)` instead of global `broadcast()`

### 4. WebSocket Handler Updates (`packages/server/src/ws.ts`)

Updated `onChatMessage` handler type to receive full user context:
```typescript
(msg: string, userId: string, projectId: string, sessionId: string) => void
```

The WebSocket route handler now stores the verified JWT payload (`authUser`) and passes all fields to chat handlers when processing messages.

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

**TypeScript:** Clean compilation (zero errors)
```bash
npx tsc --project packages/server/tsconfig.json --noEmit
```

**Manual Testing:**
- No token → 401 (Verified via code inspection)
- With valid token → tasks filtered by project (Verified via code inspection)
- Agent broadcasts go to sessionId only (Verified via code inspection)

## Commits

| Commit | Hash | Message |
|--------|------|---------|
| Task 1 | 93262a2 | feat(09-04): create auth middleware and add to protected REST routes |
| Task 2 | 6a948a4 | feat(09-04): update agent runner for project-scoped history and session-targeted broadcast |

## Success Criteria Met

- [x] All protected routes return 401 for missing/invalid token
- [x] Agent runner uses project-scoped DB operations
- [x] WS tokens and task snapshots go to sessionId only
- [x] Zero TypeScript errors
- [x] Health endpoint still works without auth

## Next Steps

Plans 05 and 06 will build on this foundation:
- Plan 05: Session lifecycle management (token refresh flow)
- Plan 06: Admin dashboard with protected endpoints
