---
status: verifying
trigger: "Continue investigating issue: websocket-connection-failed - WebSocket connection to 'ws://localhost:5173/ws' fails"
created: "2025-03-06T00:00:00.000Z"
updated: "2026-03-06T00:00:00.000Z"
---

## Current Focus
hypothesis: ROOT CAUSE FOUND - MCP creates tasks with project_id=null, but frontend queries filter by projectId. Two issues: 1) No projects/sessions exist in DB (user not authenticated via web), 2) MCP tool create_task doesn't pass projectId to taskStore.create()
test: Verified - DB shows 3 tasks with project_id=null, 0 projects, 0 sessions
expecting: Tasks won't appear in UI because /api/tasks filters by projectId, and MCP-created tasks have project_id=null
next_action: Fix applied - Modified TaskStore.list() to support includeGlobal flag, updated /api/tasks to include global tasks. Need to restart server and verify.

## Symptoms
expected: Gantt chart should display tasks after creation via MCP, with real-time sync via WebSocket
actual: MCP returns JSON with tasks successfully, but UI shows nothing - tasks don't appear
errors:
  - useWebSocket.ts:77 WebSocket connection to 'ws://localhost:5173/ws' failed: WebSocket is closed before the connection is established.
  - useWebSocket.ts:69 [ws] error Event
reproduction: Create tasks via MCP, check if they display in the web UI
timeline: Previously worked, now broken. Previous fix (Vite proxy ws:// -> http://) applied but issue persists.

## Eliminated
- hypothesis: Vite proxy config using ws:// protocol
  evidence: Fixed in previous session - vite.config.ts now uses `target: 'http://localhost:3000'`
  timestamp: 2025-03-06T00:00:00.000Z

- hypothesis: WebSocket server not running or misconfigured
  evidence: Server is running on port 3000, WebSocket endpoint is set up correctly with Fastify
  timestamp: 2026-03-06T00:00:00.000Z

## Evidence
- timestamp: "2025-03-06T00:00:00.000Z"
  checked: vite.config.ts WebSocket proxy configuration
  found: The proxy config uses `target: 'ws://localhost:3000'` which is incorrect for Vite's proxy
  implication: Vite proxy needs the target to be http://, not ws:// - Vite handles WebSocket upgrade automatically when ws: true is set

- timestamp: "2026-03-06T00:00:00.000Z"
  checked: Current vite.config.ts
  found: Fix is in place - `target: 'http://localhost:3000'` with `ws: true`
  implication: The Vite proxy configuration is now correct

- timestamp: "2026-03-06T00:00:00.000Z"
  checked: Backend server health
  found: Server is running on port 3000 and responds to /health
  implication: Backend is running, but WebSocket endpoint may have issues

- timestamp: "2026-03-06T00:00:00.000Z"
  checked: Server WebSocket implementation (ws.ts, index.ts)
  found: Server uses Fastify with @fastify/websocket, registerWsRoutes sets up /ws endpoint with auth handshake
  implication: Server WebSocket setup looks correct - requires auth token as first message

- timestamp: "2026-03-06T00:00:00.000Z"
  checked: TaskStore implementation (store.ts)
  found: Tasks are stored with optional project_id. create() accepts projectId parameter. list() filters by projectId.
  implication: If MCP creates tasks without project_id, they won't show up when UI queries with project_id

- timestamp: "2026-03-06T00:00:00.000Z"
  checked: MCP create_task implementation (packages/mcp/src/index.ts:349)
  found: `await taskStore.create(input)` - NO project_id passed
  implication: Tasks created via MCP have project_id=null

- timestamp: "2026-03-06T00:00:00.000Z"
  checked: Frontend useTasks hook (packages/web/src/hooks/useTasks.ts:23-24)
  found: Fetches from /api/tasks with Authorization header
  implication: Queries tasks filtered by user's projectId

- timestamp: "2026-03-06T00:00:00.000Z"
  checked: Backend /api/tasks endpoint (packages/server/src/index.ts:33-36)
  found: `taskStore.list(req.user!.projectId)` - filters by projectId
  implication: Only returns tasks with matching project_id

- timestamp: "2026-03-06T00:00:00.000Z"
  checked: Database state
  found: 3 tasks with project_id=null, 0 projects, 0 sessions
  implication: CONFIRMED - MCP creates tasks without project_id, UI can't see them because it filters by projectId

- timestamp: "2026-03-06T00:00:00.000Z"
  checked: SQL query for including global tasks
  found: `SELECT * FROM tasks WHERE project_id = ? OR project_id IS NULL` works correctly
  implication: Modified TaskStore.list() to support includeGlobal flag

## Resolution
root_cause: MCP create_task tool doesn't pass projectId to taskStore.create(). Tasks are created with project_id=null, but the web UI queries tasks filtered by the user's projectId. Since there are no projects/sessions in DB (user never authenticated via web), MCP-created tasks are invisible to the web UI.

fix:
1. Added optional `projectId` parameter to MCP create_task tool schema
2. Added `projectId` to CreateTaskInput type
3. Modified create_task handler to extract and pass projectId to taskStore.create()
4. Modified TaskStore.list() to accept `includeGlobal` flag
5. Modified /api/tasks endpoint to call taskStore.list(projectId, true) to include global tasks

verification: Pending - server restart required for changes to take effect

files_changed:
  - packages/mcp/src/types.ts - Added projectId to CreateTaskInput
  - packages/mcp/src/index.ts - Added projectId to create_task tool schema and handler
  - packages/mcp/src/store.ts - Added includeGlobal parameter to list() method
  - packages/server/src/index.ts - Modified /api/tasks to include global tasks
