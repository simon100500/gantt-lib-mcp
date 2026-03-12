---
id: S10
parent: M001
milestone: M001
provides:
  - MCP child process with PROJECT_ID env injection so tasks are stored with correct project scope
  - Streaming dedup guard to prevent duplicate AI response broadcasts
  - includeGlobal broadcast so Gantt chart shows correct task set after AI commands
  - System prompt without JSON export instruction — AI responds with 1-2 sentence confirmations
requires: []
affects: []
key_files: []
key_decisions:
  - "Use env injection (PROJECT_ID in mcpServers env) instead of per-call arg for project scoping in MCP child process"
  - "streamedContent boolean flag: skip final summary AssistantMessage if tokens already streamed, avoiding duplicate broadcast"
  - "taskStore.list(projectId, true) in broadcast step to include global tasks matching HTTP GET behavior"
  - "system.md Response Format section: 1-2 sentence confirmation, no JSON exports, respond in user language"
patterns_established:
  - "MCP env injection pattern: pass projectId as PROJECT_ID env var to child process, read via process.env.PROJECT_ID with argProjectId as override"
  - "Streaming dedup guard: set streamedContent=true on first text block, skip isSDKAssistantMessage if streamedContent already set"
observability_surfaces: []
drill_down_paths: []
duration: 2min
verification_result: passed
completed_at: 2026-03-07
blocker_discovered: false
---
# S10: Work Stability

**# Phase 10 Plan 01: Work Stability Bug Fixes Summary**

## What Happened

# Phase 10 Plan 01: Work Stability Bug Fixes Summary

**Three silent data-corruption and chat-UX bugs fixed: AI tasks now stored with correct project_id, Gantt chart updates correctly after AI commands, and assistant responses appear exactly once as readable text.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-07T08:19:42Z
- **Completed:** 2026-03-07T08:22:00Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- Bug 3 fixed: MCP child process now receives PROJECT_ID via env injection; tasks created by AI are stored with the correct project scope rather than NULL
- Bug 3c fixed: Broadcast after agent turn uses taskStore.list(projectId, true) to include global tasks, matching HTTP GET behavior and preventing Gantt chart emptying
- Bug 4 fixed: streamedContent boolean guard prevents duplicate broadcast of assistant text (SDK fires AssistantMessage for both streaming chunks and the final summary message)
- Bug 5 fixed: system.md rewritten — removed step 5 (export_tasks/JSON output), added Response Format section requiring 1-2 sentence confirmations with no JSON in chat

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite system.md** - `fcd647e` (fix)
2. **Task 2: Fix agent.ts — PROJECT_ID, dedup guard, includeGlobal** - `3f1e421` (fix)
3. **Task 3: Fix mcp/index.ts — process.env.PROJECT_ID fallback** - `e832c75` (fix)

## Files Created/Modified
- `packages/mcp/agent/prompts/system.md` - Rewritten: removed export_tasks workflow step and JSON output section, added Response Format with 1-2 sentence confirmation rule
- `packages/server/src/agent.ts` - Three fixes: PROJECT_ID env injection into MCP child process, streamedContent dedup guard in streaming loop, includeGlobal=true in broadcast
- `packages/mcp/src/index.ts` - Two fixes: create_task uses resolvedProjectId = argProjectId ?? process.env.PROJECT_ID; create_tasks_batch passes process.env.PROJECT_ID to taskStore.create

## Decisions Made
- Use env injection (PROJECT_ID in mcpServers env config) to scope MCP child process to current project — cleaner than passing per-call args since child process runs independently
- streamedContent boolean flag approach: skip the final AssistantMessage event if tokens were already streamed, as the SDK fires isSDKAssistantMessage for both partial stream events and the final complete message
- taskStore.list(projectId, true) with includeGlobal=true in broadcast to match what the HTTP GET endpoint returns, preventing the Gantt chart from appearing empty after AI operations

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

The system.md verification criterion ("grep returns 0") contradicts the plan's own new content template, which includes "Do NOT call export_tasks" — the word export_tasks appears in the negative instruction. The file is correct; the old broken instruction ("Call export_tasks as the final step") was removed and replaced with the prohibitive "Do NOT call export_tasks unless the user explicitly asks."

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All three bugs (Bug 3, Bug 4, Bug 5) are fixed and both TypeScript packages compile cleanly
- AI commands will now create tasks scoped to the correct project_id
- Gantt chart will update in real-time with the correct task set after AI turns
- Assistant responses appear exactly once as concise readable text (no duplicate messages, no JSON dumps)

---
*Phase: 10-work-stability*
*Completed: 2026-03-07*

# Phase 10 Plan 02: Auth Self-Healing — Refresh Retry, WS Reconnect, Chat History Summary

**One-liner:** Silent 401 refresh-retry in useTasks, token-reactive WS reconnect in useWebSocket, and persistent chat history via GET /api/messages — three targeted fixes that make the session self-healing after Phase 9 auth was added.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Fix useTasks refresh-retry on 401; add GET /api/messages endpoint | 3fac8fa | useTasks.ts, index.ts |
| 2 | Fix useWebSocket — add accessToken dependency for reconnect | ed4fd86 | useWebSocket.ts |
| 3 | Wire App.tsx — update hook call sites and add history load on auth | a0ef9b8 | App.tsx |

## What Was Built

### Bug 1 Fix — useTasks refresh-retry (packages/web/src/hooks/useTasks.ts)

The hook now accepts a second parameter `refreshAccessToken: () => Promise<string | null>`. When the initial fetch returns HTTP 401, it calls `refreshAccessToken()` (which either returns a fresh token or calls `logout()` internally), then retries the fetch once with the new token. If the retry also fails it sets error state. A cancellation flag prevents state updates after component unmount.

### Bug 2 Fix — useWebSocket token-reactive reconnect (packages/web/src/hooks/useWebSocket.ts)

Added third parameter `accessToken: string | null`. The mounting `useEffect` now depends on `[accessToken]` instead of `[connect]`. When a token changes from null to a value (after OTP login), the effect fires: it sets `ws.onclose = null` on the existing connection before closing it (suppressing the exponential backoff loop), then calls `connect()` to establish a fresh authenticated connection. The `connect` useCallback itself remains unchanged with `[]` deps — it reads the token via a ref which is always current.

### Bug 6 Fix — GET /api/messages endpoint (packages/server/src/index.ts)

New route `GET /api/messages` added after `GET /api/tasks`, protected by `authMiddleware`. Calls `taskStore.getMessages(req.user!.projectId)` and returns the last 50 messages via `.slice(-50)`.

### App.tsx wiring (packages/web/src/App.tsx)

Three changes:
1. `useTasks(auth.accessToken, auth.refreshAccessToken)` — passes refresh function
2. `useWebSocket(handleWsMessage, () => auth.accessToken, auth.accessToken)` — passes reactive token
3. New `useEffect` with deps `[auth.isAuthenticated, auth.accessToken, auth.project?.id]` fetches `/api/messages` and populates `messages` state with `ChatMessage[]` objects using the existing `msgCounter` for ID generation

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| refreshAccessToken passed as parameter | Keeps hook dependency explicit; avoids importing auth context inside hook |
| useEffect depends on [accessToken] | connect is memoized with [] — token changes would never re-trigger if using [connect] |
| ws.onclose = null before intentional close | Prevents backoff handler from racing with deliberate reconnect |
| history load fires on project switch | auth.project?.id in deps means switching projects loads that project's history |

## Deviations from Plan

None — plan executed exactly as written. The useEffect import was already present in App.tsx so no extra import was needed. TypeScript check revealed App.tsx had `useEffect` imported via React destructuring already missing from the import — fixed by adding `useEffect` to the existing import statement.

## Self-Check: PASSED

All modified files exist on disk. All task commits verified in git log:
- 3fac8fa: Task 1 (useTasks + GET /api/messages)
- ed4fd86: Task 2 (useWebSocket accessToken dependency)
- a0ef9b8: Task 3 (App.tsx wiring)
