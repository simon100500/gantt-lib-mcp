---
id: T03
parent: S07
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
# T03: 07-web-ui-with-real-time-gantt-editing-via-ai-dialogue 03

**# Phase 07 Plan 03: Fastify Server with WebSocket and Agent Runner Summary**

## What Happened

# Phase 07 Plan 03: Fastify Server with WebSocket and Agent Runner Summary

Fastify v5 backend with WebSocket support, REST API, and agent runner integrating @qwen-code/sdk query() with persistent conversation history from SQLite.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | WebSocket registry, REST task endpoint, and server entry point | c35990b | db.ts, ws.ts, index.ts, mcp/package.json, server/package.json |
| 2 | Agent runner with conversation history and WebSocket streaming | 0f914ad | agent.ts |

## What Was Built

**db.ts** — Thin re-export of `getDb` from `@gantt/mcp/db`. Enables server to use the same SQLite singleton as the MCP child process.

**ws.ts** — WebSocket connection registry:
- `connections: Set<WebSocket>` tracks all open sockets
- `broadcast(msg: ServerMessage): void` serializes and sends to all open connections
- `onChatMessage(handler)` registers callbacks for incoming chat messages
- `registerWsRoutes(fastify)` adds `GET /ws` handler — on connect sends `{type:'connected'}`, routes `{type:'chat'}` messages to handlers

**agent.ts** — `runAgentWithHistory(userMessage)`:
1. Saves user message to DB
2. Loads full message history for context
3. Reads system prompt from `packages/mcp/agent/prompts/system.md`
4. Builds full prompt with history context
5. Runs `query()` from `@qwen-code/sdk` with MCP server as child process
6. Streams `TextBlock` tokens as `{type:'token', content}` over WebSocket
7. Saves assistant response to DB
8. Broadcasts `{type:'tasks', tasks}` snapshot
9. Broadcasts `{type:'done'}`

**index.ts** (rewritten from stub) — Fastify v5 app:
- `GET /health` — liveness probe
- `GET /api/tasks` — returns `taskStore.list()` from SQLite
- `POST /api/chat` — fire-and-forget agent run (streaming via WebSocket)
- `GET /ws` — WebSocket endpoint via `@fastify/websocket`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] @fastify/websocket v10 incompatible with Fastify v5**
- **Found during:** Task 1 smoke test
- **Issue:** `@fastify/websocket@^10` expected Fastify `^4.16.0` but `fastify@5.7.4` is installed — throws `FST_ERR_PLUGIN_VERSION_MISMATCH` at startup
- **Fix:** Upgraded `@fastify/websocket` from `^10.0.1` to `^11.2.0` in `packages/server/package.json`
- **Files modified:** packages/server/package.json, package-lock.json
- **Commit:** c35990b

**2. [Rule 2 - Missing Critical] @gantt/mcp sub-path exports missing**
- **Found during:** Task 1 implementation
- **Issue:** `@gantt/mcp` `package.json` only had `"main": "dist/index.js"` pointing to the MCP stdio server entry — importing `@gantt/mcp/store` or `@gantt/mcp/db` would fail at runtime with no such module
- **Fix:** Added `exports` field to `packages/mcp/package.json` exposing `./store`, `./db`, `./types` sub-paths
- **Files modified:** packages/mcp/package.json
- **Commit:** c35990b

**3. [Rule 1 - Bug] Plan's agent code used event.message.content as string**
- **Found during:** Task 2 implementation (type inspection)
- **Issue:** Plan specified `const token = event.message.content ?? ''` but `SDKAssistantMessage.message.content` is `ContentBlock[]` (array), not a string — would stream empty tokens
- **Fix:** Iterate `event.message.content` blocks, extract `block.text` for `type === 'text'` blocks (matches Phase 06 agent pattern)
- **Files modified:** packages/server/src/agent.ts
- **Commit:** 0f914ad

**4. [Rule 1 - Bug] Plan used array format for mcpServers**
- **Found during:** Task 2 implementation (SDK type check)
- **Issue:** Plan specified `mcpServers: [{ type: 'stdio', command, args, env }]` (array) but SDK v0.1.5 uses `mcpServers: Record<string, McpServerConfig>` (object with named keys)
- **Fix:** Used `mcpServers: { gantt: { command, args, env } }` matching SDK types and Phase 06 agent pattern
- **Files modified:** packages/server/src/agent.ts
- **Commit:** 0f914ad

## Verification Results

- `npm run build:server` exits 0, zero TypeScript errors
- Server starts on custom PORT without errors
- `GET /health` returns `{"status":"ok"}`
- `GET /api/tasks` returns `[]` (empty SQLite DB)
- `POST /api/chat` returns `{"status":"processing"}` (fire-and-forget)
- All four dist files present: `agent.js`, `db.js`, `index.js`, `ws.js`

## Self-Check: PASSED

- packages/server/src/db.ts: FOUND
- packages/server/src/ws.ts: FOUND
- packages/server/src/agent.ts: FOUND
- packages/server/src/index.ts: FOUND (rewritten from stub)
- packages/mcp/package.json: FOUND (exports field added)
- Commit c35990b: FOUND
- Commit 0f914ad: FOUND
