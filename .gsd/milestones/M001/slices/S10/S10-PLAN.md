# S10: Work Stability

**Goal:** Fix three server-side/MCP bugs that cause silent data corruption and chat UX breakage:

- Bug 3: MCP child process runs without PROJECT_ID, so tasks are created with project_id=NULL.
**Demo:** Fix three server-side/MCP bugs that cause silent data corruption and chat UX breakage:

- Bug 3: MCP child process runs without PROJECT_ID, so tasks are created with project_id=NULL.

## Must-Haves


## Tasks

- [x] **T01: Server-side stability fixes** `est:2min`
  - Fix three server-side/MCP bugs that cause silent data corruption and chat UX breakage:

- Bug 3: MCP child process runs without PROJECT_ID, so tasks are created with project_id=NULL. The broadcast step uses list(projectId) without includeGlobal, so the Gantt chart empties after AI commands even though tasks exist in DB.
- Bug 4: The for-await streaming loop broadcasts the full assistant text twice — once from streaming token events and once from the final AssistantMessage event.
- Bug 5: The system prompt instructs the AI to call export_tasks and print raw JSON, filling the chat with unreadable output.

Purpose: After this plan, AI commands produce tasks scoped to the right project, the Gantt updates in real-time with the correct task set, and responses are concise readable text.
Output: Three files modified: system.md (rewritten), agent.ts (env + broadcast + dedup), mcp/index.ts (env fallback in create_task + create_tasks_batch).
- [x] **T02: 10-work-stability 02**
  - Fix three frontend/API bugs that break the user-facing experience after Phase 9 auth was added:

- Bug 1: useTasks throws on 401 instead of attempting a token refresh. Any user opening the app 15+ minutes after their last login sees a red error screen.
- Bug 2: useWebSocket calls connect() at mount time — if accessToken is null (not yet logged in), the auth handshake is never sent. After OTP login succeeds, the token changes in state but useWebSocket does not reconnect, leaving the WS unauthenticated until the user manually refreshes.
- Bug 6: Chat history is stored in the `messages` DB table (from Phase 9) but no GET /api/messages endpoint exists, so the client always starts with an empty messages array. History disappears on every reload.

Purpose: After this plan, the app session is self-healing: stale tokens refresh silently, WebSocket authenticates immediately after OTP login, and chat history survives page reloads.
Output: Four files modified — useTasks.ts (refresh retry), useWebSocket.ts (accessToken dependency), index.ts (new endpoint), App.tsx (three wiring changes).

## Files Likely Touched

- `packages/mcp/agent/prompts/system.md`
- `packages/server/src/agent.ts`
- `packages/mcp/src/index.ts`
- `packages/web/src/hooks/useTasks.ts`
- `packages/web/src/hooks/useWebSocket.ts`
- `packages/server/src/index.ts`
- `packages/web/src/App.tsx`
