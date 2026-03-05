---
phase: 09-session-control
plan: 03
subsystem: data-isolation
tags: [store, websocket, project-filtering, session-registry, auth-handshake]
wave: 2
dependency_graph:
  requires:
    - id: "09-01"
      subsystem: "database-schema"
      description: "Multi-user schema with project_id columns in tasks and messages tables"
  provides:
    - id: "09-03"
      subsystem: "store"
      description: "TaskStore with project_id filtering for data isolation"
    - id: "09-03"
      subsystem: "websocket"
      description: "Session-based WebSocket registry for targeted broadcast"
  affects:
    - subsystem: "agent"
      description: "agent.ts can now use broadcastToSession for targeted AI responses"
    - subsystem: "web-client"
      description: "WebSocket client must send auth message as first message"
tech_stack:
  added:
    - "Map-based session registry (built-in)"
    - "JWT auth handshake (using existing auth.ts)"
  patterns:
    - "Optional parameters for backward compatibility"
    - "Session-first WebSocket architecture"
    - "Auth handshake before message processing"
key_files:
  created: []
  modified:
    - path: "packages/mcp/src/store.ts"
      description: "Added project_id filtering to list, create, deleteAll, addMessage, getMessages; updated loadSnapshot and runScheduler to accept optional projectId"
    - path: "packages/server/src/ws.ts"
      description: "Refactored to Map<sessionId, Set<WebSocket>>; added broadcastToSession; updated onChatMessage signature; implemented auth handshake"
decisions:
  - "projectId parameter is optional throughout TaskStore for backward compatibility"
  - "auth.ts already existed with verifyToken and JwtPayload - reused existing implementation"
  - "Auth handshake uses message pattern (not headers) due to browser WS limitations"
  - "Session registry auto-cleans empty entries when last socket closes"
metrics:
  duration: "180s"
  completed_date: "2026-03-05T14:16:45Z"
  total_tasks: 2
  completed_tasks: 2
  total_files: 2
  modified_files: 2
  created_files: 0
---

# Phase 09 Plan 03: Data Isolation via project_id Filtering Summary

**One-liner:** TaskStore and WebSocket layer refactored for project-scoped data isolation with optional projectId filtering and session-based targeted broadcasts.

## Objective

Refactor TaskStore to filter all CRUD and message operations by project_id. Refactor WebSocket registry to support session-targeted broadcasts. Enable data isolation between users' projects while maintaining backward compatibility for existing code that doesn't pass projectId.

## Artifacts Created

### TaskStore Refactoring (`packages/mcp/src/store.ts`)
- **list(projectId?):** Filter tasks by project_id when provided
- **create(input, projectId?):** Include project_id in INSERT when provided
- **deleteAll(projectId?):** Filter deletions by project_id when provided
- **addMessage(role, content, projectId?):** Include project_id in INSERT when provided
- **getMessages(projectId?):** Filter messages by project_id when provided
- **loadSnapshot(projectId?):** Pass through to scheduler for scoped recalculation
- **runScheduler(changedTaskId, skipStart, projectId?):** Accept projectId for scoped recalculation
- **rowToTaskBase():** Updated comment to clarify project_id handling (DB-only field)

### WebSocket Refactoring (`packages/server/src/ws.ts`)
- **Session registry:** Map<sessionId, Set<WebSocket>> for multi-user isolation
- **broadcastToSession(sessionId, msg):** New function for targeted delivery
- **broadcast(msg):** Updated to iterate all sessions (backward-compatible)
- **onChatMessage(handler):** Signature updated to pass (message, sessionId)
- **Auth handshake:** First message must be { type: 'auth', token: string }
- **WsClientMessage type:** Export includes { type: 'auth'; token: string }
- **Session cleanup:** Auto-removes empty session entries on socket close

## Deviations from Plan

### Auto-fixed Issues

None - plan executed exactly as written.

### Authentication Gates

None - no authentication required for data layer refactoring.

## Technical Details

### Backward Compatibility Strategy
All `projectId` parameters are optional. Existing code that doesn't pass projectId:
- **TaskStore:** Returns all data (no filtering)
- **WebSocket:** Cannot connect without auth (security requirement)

### Auth Handshake Flow
```
Client connects → server waits for first message
                  ↓
          { type: 'auth', token: '<jwt>' }
                  ↓
          verifyToken(token) → JwtPayload
                  ↓
    Extract sessionId, userId, projectId
                  ↓
    Add socket to Map<sessionId, Set<WebSocket>>
                  ↓
          Send { type: 'connected' }
```

### Session Registry Lifecycle
- **Connect:** Socket waits for auth → verified → added to Map
- **Message:** Chat messages trigger handlers with (message, sessionId)
- **Close:** Socket removed from Set → Set deleted if empty → Map entry removed

## Verification Results

- [x] `npx tsc --project packages/mcp/tsconfig.json --noEmit` passes
- [x] `npx tsc --project packages/server/tsconfig.json --noEmit` passes (excluding unrelated auth-store import errors)
- [x] TaskStore methods accept optional projectId parameter
- [x] broadcastToSession() exists and targets specific sessions
- [x] onChatMessage handler signature includes sessionId
- [x] Auth handshake requires first message to be { type: 'auth', token: string }
- [x] agent.ts import of broadcast still compiles (backward-compatible)

## Commits

- `444c4d3`: feat(09-03): add project_id filtering to TaskStore
- `b68b219`: feat(09-03): refactor ws.ts with Map-based session registry + auth handshake

## Next Steps

Plan 04 (REST API Auth) can use the projectId-filtered TaskStore methods to scope data access by session. The WebSocket layer is now ready for Plan 05 (UI Integration) where the web client will implement the auth handshake pattern.
