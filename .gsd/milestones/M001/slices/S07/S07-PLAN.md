# S07: Web Ui With Real Time Gantt Editing Via Ai Dialogue

**Goal:** Convert the existing single-package project into an npm workspaces monorepo with three packages: `@gantt/mcp`, `@gantt/server`, and `@gantt/web`.
**Demo:** Convert the existing single-package project into an npm workspaces monorepo with three packages: `@gantt/mcp`, `@gantt/server`, and `@gantt/web`.

## Must-Haves


## Tasks

- [x] **T01: Monorepo scaffold** `est:25min`
  - Convert the existing single-package project into an npm workspaces monorepo with three packages: `@gantt/mcp`, `@gantt/server`, and `@gantt/web`.

Purpose: Establish the structural foundation for the web UI phase. All subsequent plans build on top of this scaffold.

Output:
- Root package.json with `"workspaces": ["packages/*"]`
- packages/mcp/ — TypeScript package containing the moved MCP server source
- packages/server/ — TypeScript package stub with Fastify + @libsql/client deps declared
- packages/web/ — React + Vite package stub with proxy config pointing to :3000
- All three packages compile/start without errors
- [x] **T02: 07-web-ui-with-real-time-gantt-editing-via-ai-dialogue 02**
  - Migrate the MCP package's in-memory TaskStore to SQLite persistence using `@libsql/client` (WASM build — no native compilation required). This plan runs in parallel with 07-01 since it only modifies files within packages/mcp/.

Purpose: All tasks and dialog history become persistent across restarts. The backend (07-03) and web (07-04/05) read the same DB.

Output:
- packages/mcp/src/db.ts — @libsql/client init, CREATE TABLE IF NOT EXISTS for tasks/dependencies/messages
- packages/mcp/src/store.ts — TaskStore reimplemented with async SQLite operations
- packages/mcp/src/types.ts — Add Message type for dialog history
- packages/mcp/src/index.ts — MCP tool handlers updated to use async store methods
- [x] **T03: 07-web-ui-with-real-time-gantt-editing-via-ai-dialogue 03**
  - Implement the `@gantt/server` Fastify backend with WebSocket support, REST API, and agent runner integration.

Purpose: This is the central hub — it receives chat messages from the web UI, runs the AI agent with conversation history, streams responses back via WebSocket, and broadcasts task updates when the AI modifies the Gantt data.

Output:
- packages/server/src/db.ts — thin re-export of getDb from @gantt/mcp (same DB file)
- packages/server/src/ws.ts — WebSocket connection registry, broadcast(), registerWsRoutes()
- packages/server/src/agent.ts — runAgentWithHistory() wrapping @qwen-code/sdk query() with history + streaming callback
- packages/server/src/index.ts — Fastify app with @fastify/websocket, GET /api/tasks, POST /api/chat, WS /ws
- [x] **T04: 07-web-ui-with-real-time-gantt-editing-via-ai-dialogue 04** `est:10min`
  - Build the Gantt chart rendering component for the web package. This plan focuses exclusively on task visualization — the chat sidebar and WebSocket wiring are added in plan 07-05.

Purpose: Users need to see their Gantt chart. This plan implements a working Gantt render using dhtmlx-gantt (the same library the project is built around — `gantt-lib` wraps it), with a data-fetching hook that loads tasks from the REST API.

Output:
- packages/web/src/types.ts — Task/TaskDependency interfaces matching the MCP package types
- packages/web/src/hooks/useTasks.ts — React hook for task state + fetch
- packages/web/src/components/GanttChart.tsx — Gantt chart using dhtmlx-gantt
- packages/web/src/App.tsx — Layout with GanttChart taking full viewport (sidebar slot for 07-05)
- [x] **T05: 07-web-ui-with-real-time-gantt-editing-via-ai-dialogue 05** `est:1min`
  - Implement the Chat sidebar and WebSocket integration that connects the web UI to the AI backend. This plan runs in parallel with 07-04 (Gantt chart) since both only touch packages/web/.

Purpose: Users interact with the AI through the chat sidebar. The AI modifies Gantt tasks, and the chart updates in real time via WebSocket broadcast.

Output:
- packages/web/src/hooks/useWebSocket.ts — manages WS lifecycle (connect, send, reconnect)
- packages/web/src/components/ChatSidebar.tsx — scrollable chat history + input form
- packages/web/src/App.tsx — updated to wire GanttChart + ChatSidebar with shared state
- [x] **T06: 07-web-ui-with-real-time-gantt-editing-via-ai-dialogue 06** `est:6h (including build debugging and human verification session)`
  - Create the CapRover deployment configuration for the complete application: a single Docker container running Nginx (static files + proxy) and Fastify (API + WS + AI agent).

Purpose: Make the application deployable to a VPS via CapRover with persistent SQLite storage. This is the final integration step that validates the full stack works end-to-end in a production-like environment.

Output:
- Dockerfile — multi-stage build producing Nginx+Node runtime image
- nginx.conf — serves React SPA, proxies /api and /ws to Fastify
- captain-definition — CapRover deployment descriptor
- .env.example — documents required environment variables

## Files Likely Touched

- `package.json`
- `packages/mcp/package.json`
- `packages/mcp/tsconfig.json`
- `packages/server/package.json`
- `packages/server/tsconfig.json`
- `packages/web/package.json`
- `packages/web/tsconfig.json`
- `packages/web/vite.config.ts`
- `packages/web/index.html`
- `tsconfig.json`
- `.gitignore`
- `packages/mcp/src/db.ts`
- `packages/mcp/src/store.ts`
- `packages/mcp/src/types.ts`
- `packages/mcp/src/index.ts`
- `packages/server/src/index.ts`
- `packages/server/src/db.ts`
- `packages/server/src/agent.ts`
- `packages/server/src/ws.ts`
- `packages/web/src/App.tsx`
- `packages/web/src/components/GanttChart.tsx`
- `packages/web/src/hooks/useTasks.ts`
- `packages/web/src/types.ts`
- `packages/web/index.html`
- `packages/web/package.json`
- `packages/web/src/hooks/useWebSocket.ts`
- `packages/web/src/components/ChatSidebar.tsx`
- `packages/web/src/App.tsx`
- `Dockerfile`
- `nginx.conf`
- `captain-definition`
- `.env.example`
- `packages/server/src/index.ts`
