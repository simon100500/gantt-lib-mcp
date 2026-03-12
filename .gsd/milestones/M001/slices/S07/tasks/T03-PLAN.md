# T03: 07-web-ui-with-real-time-gantt-editing-via-ai-dialogue 03

**Slice:** S07 — **Milestone:** M001

## Description

Implement the `@gantt/server` Fastify backend with WebSocket support, REST API, and agent runner integration.

Purpose: This is the central hub — it receives chat messages from the web UI, runs the AI agent with conversation history, streams responses back via WebSocket, and broadcasts task updates when the AI modifies the Gantt data.

Output:
- packages/server/src/db.ts — thin re-export of getDb from @gantt/mcp (same DB file)
- packages/server/src/ws.ts — WebSocket connection registry, broadcast(), registerWsRoutes()
- packages/server/src/agent.ts — runAgentWithHistory() wrapping @qwen-code/sdk query() with history + streaming callback
- packages/server/src/index.ts — Fastify app with @fastify/websocket, GET /api/tasks, POST /api/chat, WS /ws

## Must-Haves

- [ ] "POST /api/chat accepts {message: string} and returns 200"
- [ ] "WebSocket /ws broadcasts task snapshots to all connected clients when DB changes"
- [ ] "Agent runner calls @qwen-code/sdk query() with conversation history from DB"
- [ ] "Model responses stream token-by-token over WebSocket to connected clients"
- [ ] "GET /api/tasks returns current tasks array from SQLite"
- [ ] "Server starts on PORT env var (default 3000) without crashing"

## Files

- `packages/server/src/index.ts`
- `packages/server/src/db.ts`
- `packages/server/src/agent.ts`
- `packages/server/src/ws.ts`
