---
id: S07
parent: M001
milestone: M001
provides:
  - npm workspaces monorepo with packages/mcp, packages/server, packages/web
  - "@gantt/mcp: TypeScript MCP server relocated from src/ to packages/mcp/src/"
  - "@gantt/server: Fastify stub on port 3000 with /health endpoint"
  - "@gantt/web: React + Vite app with proxy /api and /ws to localhost:3000"
  - Task and TaskDependency TypeScript interfaces in packages/web/src/types.ts
  - useTasks() React hook fetching GET /api/tasks on mount with setTasks exposed for WebSocket updates
  - GanttChart component using dhtmlx-gantt with useRef/useEffect imperative pattern
  - Two-panel App layout: GanttChart (flex:1) + chat sidebar slot (360px placeholder)
  - Empty state message when tasks array is empty
  - useWebSocket hook managing WS lifecycle with exponential backoff reconnect
  - ChatSidebar component with streaming AI response and conversation history
  - App.tsx wiring GanttChart + ChatSidebar with shared WebSocket state
  - [object Object]
  - nginx.conf: Nginx serving React SPA, proxying /api and /ws to Fastify :3000
  - [object Object]
  - docker-entrypoint.sh: starts Fastify in background, Nginx in foreground
  - .env.example: documents required env vars (OPENAI_API_KEY, DB_PATH, PORT)
  - .dockerignore: excludes build artifacts and dev files from Docker context
requires: []
affects: []
key_files: []
key_decisions:
  - "npm workspaces for monorepo (no lerna/turborepo needed for 3 packages)"
  - "Keep original src/ and agent/ in place until 07-02 validates MCP migration"
  - "packages/mcp/agent/agent.ts updated: PROJECT_ROOT = packages/mcp/, MONOREPO_ROOT = project root"
  - "packages/server declares @gantt/mcp as dependency for future imports"
  - "dhtmlx-gantt integration via useRef + useEffect: init once, re-parse on tasks change"
  - "Empty state rendered in JSX (not gantt.clearAll) to avoid gantt init-before-data race"
  - "setTasks exposed from useTasks hook so 07-05 WebSocket can push updates without prop drilling"
  - "useRef for onMessage callback — avoids recreating WebSocket on every render while still calling latest handler"
  - "setStreaming functional update on 'done' — captures current partial text before clearing to commit to messages"
  - "connected prop passed to ChatSidebar — disables input when WS not open, prevents dropped messages"
  - "GANTT_PROJECT_ROOT/GANTT_MCP_SERVER_PATH/GANTT_MCP_PROMPTS_DIR env vars allow container path overrides without breaking dev workflow"
  - "MCP dist copied to both /app/mcp/dist and /app/packages/mcp/dist — satisfies npm workspace symlink AND direct env var path"
  - "npm workspaces hoist all deps to root node_modules; per-package node_modules not needed in runtime image"
  - "All workspace package.json files copied in each build stage so npm ci workspace validation passes"
  - "Use 127.0.0.1 instead of localhost in nginx proxy_pass — Alpine resolves localhost to ::1 (IPv6) first, causing 502 when Node only binds IPv4"
  - "permissionMode: 'yolo' required in query() options — Docker has no TTY so qwen-code SDK hangs awaiting interactive tool permission prompts"
patterns_established:
  - "Monorepo scripts: build:mcp, build:server, dev:server, dev:web at root level"
  - "Each package self-contained tsconfig (no extending root tsconfig in packages)"
  - "Vite proxy: /api and /ws both target localhost:3000 for local dev"
  - "Imperative DOM library pattern: useRef for container, initialized.current flag to prevent double-init"
  - "daysBetween helper converts YYYY-MM-DD range to dhtmlx duration integer"
  - "Pattern 1: WS message handler via ref — keep WS connection stable, update logic without reconnecting"
  - "Pattern 2: Streaming accumulation — append tokens to streaming string, move to messages[] on 'done'"
  - "Pattern 1: Path override env vars — GANTT_* env vars let docker-entrypoint.sh set correct paths without changing TypeScript code"
  - "Pattern 2: Workspace symlink awareness — copy packages/mcp to both direct and symlink-expected locations in runtime image"
  - "Pattern 3: Alpine IPv6 gotcha — always use 127.0.0.1 not localhost in nginx proxy_pass for co-located Node.js services"
  - "Pattern 4: SDK non-interactive mode — qwen-code query() requires permissionMode: 'yolo' when running inside Docker/CI without a TTY"
observability_surfaces: []
drill_down_paths: []
duration: 6h (including build debugging and human verification session)
verification_result: passed
completed_at: 2026-03-04
blocker_discovered: false
---
# S07: Web Ui With Real Time Gantt Editing Via Ai Dialogue

**# Phase 07 Plan 01: Monorepo Scaffold Summary**

## What Happened

# Phase 07 Plan 01: Monorepo Scaffold Summary

**npm workspaces monorepo with @gantt/mcp (relocated MCP server), @gantt/server (Fastify stub), and @gantt/web (React + Vite with /api and /ws proxy to :3000)**

## Performance

- **Duration:** 25 min
- **Started:** 2026-03-04T10:12:16Z
- **Completed:** 2026-03-04T10:37:00Z
- **Tasks:** 2
- **Files modified:** 16

## Accomplishments
- Converted single-package project to npm workspaces monorepo with packages/mcp, packages/server, packages/web
- @gantt/mcp compiles from packages/mcp/src/ with zero TypeScript errors (packages/mcp/dist/index.js exists)
- @gantt/server Fastify stub builds and starts on port 3000, /health endpoint returns {"status":"ok"}
- @gantt/web Vite config with proxy /api and /ws targeting localhost:3000

## Task Commits

Each task was committed atomically:

1. **Task 1: Create monorepo root and move MCP sources** - `273c680` (chore)
2. **Task 2: Scaffold server and web packages with stubs** - `68972fa` (feat)

**Plan metadata:** (to be committed with SUMMARY.md)

## Files Created/Modified
- `package.json` - Root workspace config with npm workspaces and monorepo scripts
- `tsconfig.json` - Base config (no rootDir/outDir, each package owns its own)
- `.gitignore` - Added packages/*/dist/ and packages/*/node_modules/
- `packages/mcp/package.json` - @gantt/mcp package definition
- `packages/mcp/tsconfig.json` - MCP TypeScript config (rootDir: src, outDir: dist)
- `packages/mcp/src/*.ts` - All MCP source files (index, store, types, scheduler, config)
- `packages/mcp/agent/agent.ts` - Agent runner with updated path references for monorepo
- `packages/mcp/agent/agent.test.js` - Agent unit tests
- `packages/mcp/agent/prompts/system.md` - System prompt for agent
- `packages/server/package.json` - @gantt/server with Fastify + @libsql/client
- `packages/server/src/index.ts` - Fastify stub with /health endpoint
- `packages/web/package.json` - @gantt/web with React + Vite
- `packages/web/vite.config.ts` - Vite config with /api and /ws proxy to :3000
- `packages/web/index.html` - App entry point
- `packages/web/src/main.tsx` - React root mount
- `packages/web/src/App.tsx` - Stub component

## Decisions Made
- Used npm workspaces (native Node.js) rather than lerna or turborepo — three packages is simple enough
- Kept original src/ and agent/ directories in place per plan — to be removed after 07-02 validates migration
- Agent's PROJECT_ROOT in packages/mcp corresponds to packages/mcp/ (2 levels up from dist/agent/), MONOREPO_ROOT is 3 levels up for .env loading and tasks.json output
- @gantt/mcp listed as dependency in packages/server for future imports in 07-03

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed agent.ts PROJECT_ROOT and path references for monorepo**
- **Found during:** Task 1 (creating monorepo root and moving MCP sources)
- **Issue:** agent.ts used `join(__dirname, '../..')` with comment "project root". In new location `packages/mcp/dist/agent/`, this resolves to `packages/mcp/` (package root, not project root). .env loading and tasks.json output would have broken.
- **Fix:** Added MONOREPO_ROOT = `join(__dirname, '../../..')` for .env and tasks.json paths. Kept PROJECT_ROOT = `join(__dirname, '../..')` pointing to packages/mcp/ for the MCP server binary and system prompt (which are correct relative to package). Updated error message from `npm run build` to `npm run build:mcp`.
- **Files modified:** packages/mcp/agent/agent.ts
- **Verification:** Paths are logically correct — system.md at `packages/mcp/agent/prompts/system.md`, MCP server at `packages/mcp/dist/index.js`, .env at monorepo root
- **Committed in:** 273c680 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Essential fix for agent path correctness in monorepo structure. No scope creep.

## Issues Encountered
- Port 3000 was already in use during verification test, tested on port 3001 instead — server started successfully, verification confirmed via Fastify startup log output

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Monorepo scaffold complete — all 3 packages compile and can be started
- 07-02 can now migrate MCP store to SQLite using @libsql/client in packages/mcp
- Original src/ and agent/ directories preserved until 07-02 validates
- packages/server has @gantt/mcp dependency ready for 07-03 server implementation

---
*Phase: 07-web-ui-with-real-time-gantt-editing-via-ai-dialogue*
*Completed: 2026-03-04*

# Phase 07 Plan 02: SQLite Persistence for MCP TaskStore Summary

SQLite-backed TaskStore via @libsql/client with 3-table schema (tasks, dependencies, messages) replacing the in-memory Map, plus async API migration across all MCP tool handlers.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Create db.ts with @libsql/client init and schema | 25bc066 | packages/mcp/src/db.ts |
| 2 | Rewrite TaskStore to SQLite, update scheduler and MCP handlers | 83d1c11 | store.ts, scheduler.ts, types.ts, index.ts, scheduler.test.ts |

## What Was Built

**db.ts** — Singleton `getDb()` function that lazy-initializes an `@libsql/client` Client and creates three tables:
- `tasks` (id, name, start_date, end_date, color, progress)
- `dependencies` (id, task_id FK CASCADE, dep_task_id, type, lag)
- `messages` (id, role, content, created_at)

**store.ts** — `TaskStore` class fully rewritten with async SQLite methods:
- `create`, `list`, `get`, `update`, `delete` — all async, all backed by SQLite
- `exportTasks` / `importTasks` — serialize/deserialize via DB
- `addMessage` / `getMessages` — new methods for AI dialog history
- Scheduler integration: reloads all tasks from DB into a `Map<string, Task>` snapshot, runs `TaskScheduler.recalculateDates()` in memory, writes back updated rows

**scheduler.ts** — Refactored to accept `Map<string, Task>` in constructor instead of a sync `TaskStore` interface. Eliminates async coupling. All DFS logic, date propagation, and cascade behavior preserved intact.

**types.ts** — Added `Message` interface for dialog history.

**index.ts** — All 8 MCP tool handlers updated to `await` store methods. `main()` now calls `await getDb()` for DB initialization on startup. `set_autosave_path` made a no-op (returns success message explaining SQLite is always-on). `TaskScheduler` import removed (not needed in index.ts). `config.ts` / `getAutoSavePath` import removed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] scheduler.test.ts used old MockTaskStore interface**
- **Found during:** Task 2 build verification
- **Issue:** Tests passed `MockTaskStore` (with `get`/`list` methods) to `TaskScheduler` constructor which now expects `Map<string, Task>`
- **Fix:** Rewrote `createMockStore` helper to return a `Map<string, Task>` directly (it already built a `Map` internally); removed `MockTaskStore` interface; removed `@ts-ignore` comment; cleaned up unused imports
- **Files modified:** packages/mcp/src/scheduler.test.ts
- **Commit:** 83d1c11

## Verification Results

- `npm run build:mcp` exits 0, zero TypeScript errors
- `DB_PATH=./test-verify.db node packages/mcp/dist/index.js` starts without crashing
- DB tables verified: `['dependencies', 'messages', 'tasks']` all present
- All `taskStore.*` calls in compiled index.js use `await` (grep confirmed 0 non-awaited calls)

## Self-Check: PASSED

- packages/mcp/src/db.ts: FOUND
- packages/mcp/src/store.ts: FOUND (rewritten)
- packages/mcp/src/types.ts: FOUND (Message type added)
- packages/mcp/src/scheduler.ts: FOUND (Map-based snapshot)
- packages/mcp/src/index.ts: FOUND (async handlers)
- Commit 25bc066: FOUND
- Commit 83d1c11: FOUND

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

# Phase 07 Plan 04: Gantt Chart Rendering Component Summary

**dhtmlx-gantt integrated into React with useTasks() hook fetching /api/tasks, two-panel layout (Gantt + sidebar slot), and empty-state message**

## Performance

- **Duration:** 10 min
- **Started:** 2026-03-04T10:34:08Z
- **Completed:** 2026-03-04T10:44:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- dhtmlx-gantt renders task bars with name, color, progress, and dependency links
- useTasks() hook fetches /api/tasks on mount, exposes setTasks for WebSocket updates in 07-05
- Two-panel App layout: Gantt area (flex:1) with loading/error states, sidebar slot (360px) for 07-05
- Empty state message displayed when tasks array is empty (no gantt init needed)
- TypeScript interfaces for Task and TaskDependency match the MCP package types

## Task Commits

Each task was committed atomically:

1. **Task 1: Types, useTasks hook, and dhtmlx-gantt dependency** - `9b81365` (feat)
2. **Task 2: GanttChart component and App layout** - `5f48925` (feat)

## Files Created/Modified
- `packages/web/src/types.ts` - Task and TaskDependency interfaces (mirrors mcp types)
- `packages/web/src/hooks/useTasks.ts` - useTasks() hook with fetch /api/tasks on mount
- `packages/web/src/components/GanttChart.tsx` - dhtmlx-gantt component with useRef/useEffect
- `packages/web/src/App.tsx` - Two-panel layout: GanttChart + sidebar placeholder slot
- `packages/web/package.json` - Added dhtmlx-gantt ^8.0.0 dependency

## Decisions Made
- Used `initialized.current` ref flag to guard against double init in React StrictMode
- Empty state returned as JSX div rather than relying on gantt.clearAll, avoiding the need for gantt to be initialized before first render when tasks is empty
- setTasks is returned from useTasks but not directly used in App.tsx — 07-05 will consume it via the WebSocket hook

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- GanttChart component ready for live data updates via setTasks
- App layout has sidebar slot (`id="chat-sidebar-slot"`) ready for 07-05 chat integration
- Vite proxy on /api and /ws already configured for :3000 backend

---
*Phase: 07-web-ui-with-real-time-gantt-editing-via-ai-dialogue*
*Completed: 2026-03-04*

## Self-Check: PASSED

- packages/web/src/types.ts: FOUND
- packages/web/src/hooks/useTasks.ts: FOUND
- packages/web/src/components/GanttChart.tsx: FOUND
- packages/web/src/App.tsx: FOUND
- .planning/phases/07-web-ui-with-real-time-gantt-editing-via-ai-dialogue/07-04-SUMMARY.md: FOUND
- Commit 9b81365: FOUND
- Commit 5f48925: FOUND

# Phase 07 Plan 05: Chat Sidebar and WebSocket Integration Summary

**React chat sidebar with real-time AI token streaming over WebSocket, exponential backoff reconnect, and live Gantt task updates on {type:'tasks'} broadcast**

## Performance

- **Duration:** 1 min
- **Started:** 2026-03-04T10:38:11Z
- **Completed:** 2026-03-04T10:38:53Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- useWebSocket hook connects to /ws, calls onMessage callback on each parsed JSON message, and reconnects automatically with exponential backoff (1s → 2s → 4s → max 16s)
- ChatSidebar shows full conversation history, renders streaming partial response with blinking cursor, and disables input while AI is thinking or WS is disconnected
- App.tsx wires all state together: tasks update immediately on {type:'tasks'}, tokens accumulate in streaming string, 'done' commits accumulated text as assistant message

## Task Commits

Each task was committed atomically:

1. **Task 1: useWebSocket hook with reconnect logic** - `464a37e` (feat)
2. **Task 2: ChatSidebar component and App.tsx integration** - `b158339` (feat)

## Files Created/Modified

- `packages/web/src/hooks/useWebSocket.ts` - WebSocket hook with connect/send/reconnect; exports useWebSocket, ServerMessage, ClientMessage types
- `packages/web/src/components/ChatSidebar.tsx` - Scrollable chat panel with streaming message, send form, connection indicator; exports ChatSidebar, ChatMessage
- `packages/web/src/App.tsx` - Updated to import and wire ChatSidebar + useWebSocket alongside GanttChart + useTasks

## Decisions Made

- Used `useRef` for the `onMessage` callback so the WebSocket connection is created once on mount but always calls the latest handler — avoids stale closure without triggering reconnect on every render cycle.
- The `setStreaming` functional update on 'done' captures the current accumulated partial text before clearing to zero — ensures no tokens are lost at the moment the message is finalized.
- `connected` prop passed through to ChatSidebar disables the input when WS is not OPEN, preventing messages being silently dropped.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Full web UI ready: Gantt chart displays tasks, chat sidebar accepts user input, AI response streams in real time, tasks update live on broadcast
- Server (07-03) must be running on :3000 for WS and REST to function; Vite proxy routes /ws and /api to :3000
- Ready for deployment plan (07-06) — static build served by Fastify, single container

---
*Phase: 07-web-ui-with-real-time-gantt-editing-via-ai-dialogue*
*Completed: 2026-03-04*

# Phase 07 Plan 06: CapRover Deployment Configuration Summary

**Multi-stage Docker build (React+Vite + Node/Fastify + Nginx) with CapRover captain-definition, SQLite persistent volume at /data/gantt.db, Nginx proxying /api and /ws to Fastify on 127.0.0.1:3000, and permissionMode yolo for non-interactive MCP tool execution — verified end-to-end by human**

## Performance

- **Duration:** ~6 hours (includes build debugging and human verification)
- **Started:** 2026-03-04T10:41:44Z
- **Completed:** 2026-03-04T18:45:00Z
- **Tasks:** 2 (Task 1 auto + Task 2 human-verify — approved)
- **Files modified:** 8

## Accomplishments

- Dockerfile builds the complete application in 3 stages: Stage 1 builds the React/Vite web app, Stage 2 compiles server+mcp TypeScript, Stage 3 is nginx:alpine + nodejs runtime serving both
- nginx.conf routes all traffic correctly: `/` serves React SPA with fallback to index.html, `/ws` proxies WebSocket with upgrade headers, `/api/` proxies REST to Fastify on `127.0.0.1:3000`
- captain-definition enables one-click CapRover deployment via `dockerfilePath: ./Dockerfile`
- docker-entrypoint.sh starts Fastify on :3000 in background, then Nginx on :80 in foreground with SQLite at /data/gantt.db
- docker-compose.yml added for local development convenience
- End-to-end verified by human: chat message → AI agent → MCP tool calls → Gantt update → SQLite persist after container restart

## Task Commits

Each task was committed atomically:

1. **Task 1: Dockerfile, nginx.conf, captain-definition, .env.example, entrypoint** - `289db7b` (feat)
2. **Post-checkpoint fix: nginx 127.0.0.1 + docker-compose.yml** - `796b4a7` (fix)
3. **Post-checkpoint fix: permissionMode yolo in agent.ts** - `eb9a2fd` (feat)
4. **Task 2: Human verification checkpoint** - approved (no code commit required)

## Files Created/Modified

- `Dockerfile` - 3-stage multi-stage build: build-web (React+Vite), build-server (Node+TS), runtime (nginx:alpine + nodejs)
- `nginx.conf` - Nginx server block: SPA fallback, WS proxy with upgrade headers, /api/ proxy to 127.0.0.1:3000
- `captain-definition` - CapRover schema v2 pointing to ./Dockerfile
- `docker-entrypoint.sh` - Shell script starting Fastify with container env vars, then Nginx foreground
- `docker-compose.yml` - Local dev compose: port 8080:80, env_file, named volume gantt-data:/data
- `.dockerignore` - Excludes node_modules, dist, .git, .planning from build context
- `.env.example` - Documents OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_MODEL, DB_PATH, PORT
- `packages/server/src/agent.ts` - Added GANTT_PROJECT_ROOT, GANTT_MCP_SERVER_PATH, GANTT_MCP_PROMPTS_DIR env var overrides; added permissionMode: 'yolo'

## Decisions Made

- Added `GANTT_PROJECT_ROOT` env var support in `agent.ts` because the container path `/app` doesn't match the `../../..` relative resolution from `dist/agent.js`. Dev workflow unchanged (env var not set = falls back to relative path).
- Copied `packages/mcp/dist` to both `/app/mcp/dist` (direct reference by GANTT_MCP_SERVER_PATH) and `/app/packages/mcp/dist` (satisfies npm workspace symlink from `node_modules/@gantt/mcp`).
- npm workspaces hoist all dependencies to root `node_modules`; only root `node_modules` needs to be copied to runtime image, not per-package node_modules.
- Changed nginx proxy_pass from `localhost` to `127.0.0.1` — discovered during container debugging that Alpine Linux resolves `localhost` to `::1` (IPv6) first; Node.js Fastify defaults to IPv4 only, causing 502 errors.
- Added `permissionMode: 'yolo'` to `query()` options — discovered during container testing that the qwen-code SDK pauses for interactive permission prompts; Docker containers have no TTY so the agent hangs indefinitely without this flag.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed container path resolution for agent.ts PROJECT_ROOT**
- **Found during:** Task 1 (Dockerfile creation)
- **Issue:** `agent.ts` uses `join(__dirname, '../../..')` which resolves to `/` (root) when `dist/agent.js` is at `/app/server/dist/` in container, not the project root `/app`
- **Fix:** Added `GANTT_PROJECT_ROOT` env var with fallback to relative resolution; added `GANTT_MCP_SERVER_PATH` and `GANTT_MCP_PROMPTS_DIR` for other container paths; `docker-entrypoint.sh` sets all three vars
- **Files modified:** `packages/server/src/agent.ts`, `docker-entrypoint.sh`
- **Verification:** TypeScript builds clean (`npm run build:server` exits 0)
- **Committed in:** 289db7b (Task 1 commit)

**2. [Rule 1 - Bug] Fixed npm workspace package.json requirement for npm ci**
- **Found during:** Task 1 (Dockerfile review)
- **Issue:** Each build stage only copied its needed package.json files, but `npm ci` with workspaces validates all workspace package.json files are present
- **Fix:** Each build stage copies all 3 workspace package.json files before running `npm ci`
- **Files modified:** `Dockerfile`
- **Verification:** Static analysis — workspace package.json presence matches lockfile expectation
- **Committed in:** 289db7b (Task 1 commit)

**3. [Rule 1 - Bug] Fixed npm workspace symlink in runtime image**
- **Found during:** Task 1 (Dockerfile review)
- **Issue:** `node_modules/@gantt/mcp` is a symlink pointing to `packages/mcp`; runtime image only had `/app/mcp/dist`, not `/app/packages/mcp/dist`, so symlink would be broken
- **Fix:** Copy mcp dist to both `/app/mcp/dist` AND `/app/packages/mcp/dist`; also copy `packages/mcp/package.json`
- **Files modified:** `Dockerfile`
- **Verification:** Static analysis — symlink resolution path matches copied directory
- **Committed in:** 289db7b (Task 1 commit)

**4. [Rule 1 - Bug] Fixed nginx proxy_pass localhost → 127.0.0.1 (post-checkpoint)**
- **Found during:** Task 2 (human verification — debugging 502 errors)
- **Issue:** nginx proxy_pass to `http://localhost:3000` was resolved to `::1` (IPv6) by Alpine DNS; Fastify bound only to IPv4, causing 502 Bad Gateway on all /api/ requests
- **Fix:** Changed both proxy_pass directives from `http://localhost:3000` to `http://127.0.0.1:3000` in nginx.conf
- **Files modified:** `nginx.conf`
- **Verification:** Human confirmed /health and /api/tasks returned 200 after fix
- **Committed in:** 796b4a7

**5. [Rule 1 - Bug] Added permissionMode: 'yolo' for non-interactive Docker execution (post-checkpoint)**
- **Found during:** Task 2 (human verification — AI agent hang in container)
- **Issue:** qwen-code SDK query() awaits interactive permission prompts before executing MCP tool calls. Docker containers have no TTY — agent hung indefinitely on first tool call
- **Fix:** Added `permissionMode: 'yolo'` to the `options` object in `query()` call
- **Files modified:** `packages/server/src/agent.ts`
- **Verification:** Human confirmed AI chat triggered MCP tool calls and Gantt updated in real time
- **Committed in:** eb9a2fd

**6. [Rule 2 - Missing Critical] docker-compose.yml for local dev (post-checkpoint)**
- **Found during:** Task 2 (human verification setup)
- **Issue:** No compose file; manual `docker run` command required with all flags specified each time
- **Fix:** Created `docker-compose.yml` with service definition (8080:80), env_file, and named volume for SQLite
- **Files modified:** `docker-compose.yml` (created)
- **Committed in:** 796b4a7

---

**Total deviations:** 6 auto-fixed (5 bugs, 1 missing dev tooling; 3 pre-checkpoint static analysis, 3 post-checkpoint runtime debugging)
**Impact on plan:** All auto-fixes necessary for container to function correctly. Alpine IPv6 and Docker non-interactive mode are deployment-environment specifics not visible during local dev. No scope creep.

## Issues Encountered

- Docker Desktop was not running on executor machine, so `docker build` verification was done via static analysis and local TypeScript compilation. Full Docker build verification was deferred to human-verify checkpoint.
- Two runtime bugs were discovered only when the container was actually run: Alpine IPv6 DNS resolution and SDK non-interactive permission mode. Both resolved before checkpoint approval.
- A test artifact (`test-server-verify.db`) was accidentally included in commit `796b4a7` (low impact — SQLite file, ignored in .dockerignore, no secrets).

## User Setup Required

**To deploy to CapRover:**
1. Create CapRover app
2. Enable Persistent Directory at `/data`
3. Set environment variables: `OPENAI_API_KEY`, optionally `DB_PATH=/data/gantt.db`
4. Deploy via git push or upload repo ZIP

**To test locally:**
```bash
docker build -t gantt-web .
docker run -p 8080:80 \
  -e OPENAI_API_KEY=your-key \
  -e DB_PATH=/data/gantt.db \
  -v $(pwd)/local-data:/data \
  gantt-web
```
Then visit http://localhost:8080

## Next Phase Readiness

- Phase 07 is fully complete — all 6 plans executed and human verification passed
- Container is production-ready: `docker compose up --build` works locally end-to-end
- CapRover deployment ready: set OPENAI_API_KEY + enable Persistent Directory at /data, deploy from repo
- No blockers — project milestone v1.0 is complete

---
*Phase: 07-web-ui-with-real-time-gantt-editing-via-ai-dialogue*
*Completed: 2026-03-04*

## Self-Check: PASSED

All files present. Commits 289db7b, 796b4a7, eb9a2fd verified in git log. Human verification approved end-to-end flow.
