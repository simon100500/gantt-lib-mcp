---
phase: 10-work-stability
verified: 2026-03-07T00:00:00Z
status: passed
score: 7/7 must-haves verified
re_verification: false
---

# Phase 10: work-stability Verification Report

**Phase Goal:** Stabilize the application after Phase 9 auth integration — fix six bugs (Bug1-Bug6) causing 401 errors, WebSocket authentication failures, MCP project-id scoping, streaming duplicates, raw JSON in chat, and lost chat history. After this phase, AI commands produce tasks scoped to the right project, tokens refresh silently, WebSocket connects immediately after OTP login, and chat history survives page reloads.
**Verified:** 2026-03-07
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | AI responds with 1-2 sentence confirmation, never raw JSON exports | VERIFIED | `system.md` line 21-23: "After completing any task operation, confirm briefly in 1-2 sentences. Do NOT include JSON exports... Do NOT call export_tasks unless the user explicitly asks." Old `## Output` section (export_tasks + JSON dump) is absent. |
| 2 | Tasks created by AI are stored with the correct project_id, not NULL | VERIFIED | `agent.ts` line 127: `env: { DB_PATH: dbPath, PROJECT_ID: projectId }`. `mcp/index.ts` line 330: `const resolvedProjectId = argProjectId ?? process.env.PROJECT_ID`. `create_tasks_batch` line 680 passes `process.env.PROJECT_ID` to `taskStore.create()`. |
| 3 | After AI turn completes, broadcast includes both project-scoped and global tasks (matches HTTP GET) | VERIFIED | `agent.ts` line 162: `const tasks = await taskStore.list(projectId, true)`. `index.ts` line 36 uses same signature `taskStore.list(req.user!.projectId, true)`. Both paths now match. |
| 4 | Each AI response appears exactly once in chat (no duplicate messages) | VERIFIED | `agent.ts` lines 135-148: `streamedContent` boolean flag set to `true` on first text block; subsequent `isSDKAssistantMessage` events (final summary) hit `if (streamedContent) continue` guard. |
| 5 | App loads tasks without 401 error even when access token has expired (transparent refresh) | VERIFIED | `useTasks.ts` lines 32-40: on HTTP 401, calls `refreshAccessToken()`, retries with new token once, throws only if retry also fails. `App.tsx` line 16 passes `auth.refreshAccessToken` as second arg. |
| 6 | After OTP login, WebSocket connects and shows connected without requiring a page reload | VERIFIED | `useWebSocket.ts` line 92: `useEffect` depends on `[accessToken]`. When token changes null → value, old connection is closed (with `ws.onclose = null` to suppress backoff loop), and `connect()` is called immediately. `App.tsx` line 58 passes `auth.accessToken` as third arg. |
| 7 | Chat history is restored from server after page reload, scoped to the current project | VERIFIED | `index.ts` lines 54-57: `GET /api/messages` endpoint protected by `authMiddleware`, returns `taskStore.getMessages(req.user!.projectId).slice(-50)`. `App.tsx` lines 96-114: `useEffect` with deps `[auth.isAuthenticated, auth.accessToken, auth.project?.id]` fetches `/api/messages` and populates `messages` state. |

**Score:** 7/7 truths verified

---

## Required Artifacts

### Plan 10-01 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/mcp/agent/prompts/system.md` | System prompt without JSON export instruction | VERIFIED | File contains "Response Format" section with 1-2 sentence rule. Old `## Output / export_tasks` directive absent. "export_tasks" appears only as a negative instruction ("Do NOT call export_tasks..."). |
| `packages/server/src/agent.ts` | MCP child process with PROJECT_ID env, includeGlobal broadcast, dedup guard | VERIFIED | Line 127: `PROJECT_ID: projectId` in mcpServers env. Line 135: `streamedContent` boolean. Line 141: dedup guard `if (streamedContent) continue`. Line 162: `taskStore.list(projectId, true)`. |
| `packages/mcp/src/index.ts` | create_task and create_tasks_batch reading process.env.PROJECT_ID | VERIFIED | Line 330: `const resolvedProjectId = argProjectId ?? process.env.PROJECT_ID`. Line 680: `}, process.env.PROJECT_ID)` in batch loop. |

### Plan 10-02 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/web/src/hooks/useTasks.ts` | 401-aware fetch with refresh-retry and logout fallback | VERIFIED | Accepts `refreshAccessToken` as second param. Lines 32-40 implement 401 check, token refresh call, single retry, error on retry failure. Cancellation flag prevents stale updates. |
| `packages/web/src/hooks/useWebSocket.ts` | accessToken-reactive WebSocket that reconnects when token changes null to value | VERIFIED | Third param `accessToken: string \| null`. Lines 75-92: `useEffect` with `[accessToken]` dep, closes old WS with `ws.onclose = null` before reconnect. |
| `packages/server/src/index.ts` | GET /api/messages endpoint protected by authMiddleware | VERIFIED | Lines 54-57: `fastify.get('/api/messages', { preHandler: [authMiddleware] }, ...)` returns `taskStore.getMessages(req.user!.projectId).slice(-50)`. |
| `packages/web/src/App.tsx` | useEffect loading history on auth; updated hook call sites | VERIFIED | Line 16: `useTasks(auth.accessToken, auth.refreshAccessToken)`. Line 58: `useWebSocket(handleWsMessage, () => auth.accessToken, auth.accessToken)`. Lines 96-114: history load `useEffect`. |

---

## Key Link Verification

### Plan 10-01 Key Links

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `agent.ts` mcpServers config | `mcp/index.ts` process.env.PROJECT_ID | child process env injection | WIRED | `agent.ts:127` sets `PROJECT_ID: projectId`; `index.ts:330` reads `process.env.PROJECT_ID` as fallback. |
| `agent.ts` broadcast step | `mcp/src/store.ts list()` | `taskStore.list(projectId, true)` | WIRED | `agent.ts:162` calls `taskStore.list(projectId, true)` matching HTTP GET at `index.ts:36`. |

### Plan 10-02 Key Links

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `useTasks.ts` | `useAuth.ts refreshAccessToken()` | refreshAccessToken parameter passed from App.tsx | WIRED | `useTasks.ts:13` accepts param; `App.tsx:16` passes `auth.refreshAccessToken`; called at `useTasks.ts:34` on 401. |
| `useWebSocket.ts` | auth.accessToken state | accessToken parameter; useEffect dependency | WIRED | `useWebSocket.ts:23` accepts `accessToken: string \| null`; `useEffect` at line 92 depends on `[accessToken]`; `App.tsx:58` passes `auth.accessToken`. |
| `App.tsx useEffect` | `index.ts GET /api/messages` | fetch('/api/messages') with Authorization header | WIRED | `App.tsx:99-100` calls `fetch('/api/messages', { headers: { Authorization: Bearer ${auth.accessToken} } })`; endpoint exists at `index.ts:54-57`. |

---

## Requirements Coverage

Bug1-Bug6 are phase-internal bug IDs tracked in `10-RESEARCH.md` and `10-CONTEXT.md`. They do not appear in `REQUIREMENTS.md` (the requirements file covers v1/v2 feature requirements, not Phase 10 stability bugs). No traceability table entry exists for Phase 10 in REQUIREMENTS.md. This is by design — stability bug fixes are not formal product requirements.

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| Bug1 | 10-02-PLAN.md | useTasks throws on 401 instead of attempting token refresh | SATISFIED | `useTasks.ts` refresh-retry logic implemented; `App.tsx` passes `auth.refreshAccessToken` |
| Bug2 | 10-02-PLAN.md | useWebSocket does not reconnect when accessToken becomes available after OTP | SATISFIED | `useWebSocket.ts` `[accessToken]` dependency; `App.tsx` passes reactive token |
| Bug3 | 10-01-PLAN.md | MCP child process runs without PROJECT_ID; broadcast missing includeGlobal | SATISFIED | `agent.ts` env injection + `list(projectId, true)` broadcast; `mcp/index.ts` env fallback in both create handlers |
| Bug4 | 10-01-PLAN.md | Streaming loop broadcasts full assistant text twice | SATISFIED | `streamedContent` boolean guard in `agent.ts` streaming loop |
| Bug5 | 10-01-PLAN.md | System prompt instructs AI to call export_tasks and print raw JSON | SATISFIED | `system.md` rewritten: old Output section removed, Response Format section added |
| Bug6 | 10-02-PLAN.md | No GET /api/messages endpoint; chat history lost on reload | SATISFIED | Endpoint added in `index.ts:54-57`; App.tsx loads history on auth |

**Orphaned requirements check:** `grep "Phase 10" .planning/REQUIREMENTS.md` returns no results. No requirements in REQUIREMENTS.md are mapped to Phase 10. The Bug1-Bug6 IDs are internal phase documentation, not formal v1/v2 requirements — no orphaned items.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `packages/web/src/App.tsx` | 81 | `// TODO: Display errors in UI (toast, status bar, etc.)` | Info | Validation errors exist in state but have no toast/modal display. Tracked as future enhancement, not a Phase 10 scope item. Does not block any Phase 10 goal. |

No blockers. No stubs. No empty implementations. No placeholder returns.

---

## Human Verification Required

The following behaviors are functionally correct in code but require a running application to confirm the end-to-end experience:

### 1. Token Refresh Transparency

**Test:** Log in via OTP. Wait 15+ minutes for access token to expire (or manually expire the token in the DB). Reload the page.
**Expected:** Tasks load without a 401 error screen. No manual action required.
**Why human:** Requires time passage and a live auth service; token expiry cannot be simulated statically.

### 2. WebSocket Connect After OTP Login

**Test:** Open the app fresh (no stored session). Complete OTP login. Observe the "connected" indicator in the chat sidebar without reloading the page.
**Expected:** The connected indicator shows green/connected immediately after OTP login completes, without requiring a page reload.
**Why human:** WebSocket connection state is runtime behavior; requires a live server and browser.

### 3. AI Task Scoping

**Test:** Log in with two different user accounts (or two projects). Ask the AI in Project A to create tasks. Switch to Project B. Verify Project B's Gantt chart does not show Project A's tasks.
**Expected:** Tasks are isolated per project; Gantt updates after AI commands show only the correct project's tasks.
**Why human:** Requires multiple live sessions and database state inspection.

### 4. Single AI Response in Chat

**Test:** Send a chat message to the AI (e.g., "Add a task called Test from 2026-04-01 to 2026-04-05"). Observe the chat sidebar.
**Expected:** The AI response appears exactly once, as a concise 1-2 sentence confirmation. No JSON dump. No duplicate message.
**Why human:** Requires a live AI session with the @qwen-code/sdk streaming events.

### 5. Chat History Persistence

**Test:** Send several chat messages. Reload the page. Observe the chat sidebar.
**Expected:** Previous messages (both user and assistant) are visible in the chat sidebar after reload.
**Why human:** Requires live server state, database persistence, and browser reload.

---

## Commit Verification

All 6 task commits documented in SUMMARY files are confirmed in git log:

| Commit | Plan | Description |
|--------|------|-------------|
| `fcd647e` | 10-01 | fix(10-01): rewrite system.md |
| `3f1e421` | 10-01 | fix(10-01): fix agent.ts — PROJECT_ID, dedup guard, includeGlobal |
| `e832c75` | 10-01 | fix(10-01): fix mcp/index.ts — process.env.PROJECT_ID fallback |
| `3fac8fa` | 10-02 | feat(10-02): fix useTasks refresh-retry on 401; add GET /api/messages |
| `ed4fd86` | 10-02 | feat(10-02): fix useWebSocket — reconnect on accessToken change |
| `a0ef9b8` | 10-02 | feat(10-02): wire App.tsx — update hook call sites and add history load |

---

## TypeScript Compilation

| Package | Result |
|---------|--------|
| `packages/server` (`npx tsc --noEmit`) | PASS — zero errors |
| `packages/mcp` (`npx tsc --noEmit`) | PASS — zero errors |
| `packages/web` (`npx tsc --noEmit -p tsconfig.json`) | PASS — zero errors |

---

## Gaps Summary

No gaps. All seven observable truths are verified. All artifacts exist, are substantive, and are wired. All key links are active. TypeScript compiles cleanly across all three packages. The one TODO comment in `App.tsx` (validation error display) is explicitly out of scope for Phase 10.

---

_Verified: 2026-03-07_
_Verifier: Claude (gsd-verifier)_
