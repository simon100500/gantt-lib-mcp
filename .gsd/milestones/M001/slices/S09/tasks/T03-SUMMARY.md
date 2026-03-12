---
id: T03
parent: S09
milestone: M001
provides: []
requires: []
affects: []
key_files: []
key_decisions: []
patterns_established: []
observability_surfaces: []
drill_down_paths: []
duration: 
verification_result: passed
completed_at: 
blocker_discovered: false
---
# T03: 09-session-control 03

**# Phase 09 Plan 03: Data Isolation via project_id Filtering Summary**

## What Happened

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
