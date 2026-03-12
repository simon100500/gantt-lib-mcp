# Phase 10: work-stability - Research

**Researched:** 2026-03-07
**Domain:** Bug-fix stabilization — React hooks, WebSocket auth, MCP child process env, AI streaming deduplication, system prompt engineering, REST API
**Confidence:** HIGH (all bugs have been traced to specific code locations via direct source reading)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Bug 1: 401 on reload / project switch**
- In `useTasks` on HTTP 401 response: call `refreshAccessToken()`, retry the request once
- If refresh also fails: call `logout()`
- `refreshAccessToken` must be passed into `useTasks` as a parameter (or caller handles retry)

**Bug 2: WebSocket "reconnecting..." after first OTP login**
- `useWebSocket` must react to `accessToken` changing (null → value)
- When token changes: close existing WS, open a new connection immediately
- Mechanism: add `accessToken` as a parameter/dependency that triggers reconnect

**Bug 3: Gantt empties after AI command (no reload)**
- Fix 1: In `agent.ts` MCP `mcpServers.gantt.env`, add `PROJECT_ID: projectId`
- Fix 2: In `packages/mcp/src` (create_task / create_tasks_batch), use `process.env.PROJECT_ID` as default for `project_id` when not explicitly passed
- Fix 3: In `agent.ts` step 9 broadcast, call `taskStore.list(projectId, true)` (includeGlobal=true) so broadcast matches HTTP GET behavior

**Bug 4: Duplicate AI messages in chat**
- Fix streaming event deduplication in `agent.ts` `for await` loop
- Exact approach is Claude's discretion (see below)

**Bug 5: AI writes raw JSON in chat**
- Update `packages/mcp/agent/prompts/system.md`
- New instructions: "After completing a task operation, confirm briefly in 1-2 sentences. Do NOT include JSON exports, code blocks with task data, or full task listings in your response."
- Respond in the user's language (Russian if they write Russian)
- Remove the current `## Output` section that instructs `export_tasks` and printing JSON to stdout

**Bug 6: Chat history disappears on reload**
- Add `GET /api/messages` endpoint in `packages/server/src/index.ts` (protected by `authMiddleware`), project-scoped
- In `App.tsx`, load message history when `auth.isAuthenticated` + `auth.project.id` become true (useEffect)
- Convert DB `Message[]` (role, content, createdAt) to `ChatMessage[]` for display

### Claude's Discretion
- Exact method to distinguish "streaming partial" vs "final summary" SDK events for Bug 4 (accumulate-only-from-streaming vs skip-if-already-sent logic)
- Number of messages to load for Bug 6 history (last 50 or all — either acceptable)
- Order of applying fixes during implementation

### Deferred Ideas (OUT OF SCOPE)
- Optimistic updates (show task before server confirms)
- Toast notifications for errors (instead of console.error)
- "AI thinking..." indicator with cancel ability
</user_constraints>

---

## Summary

Phase 10 is a pure bug-fix stabilization pass on Phase 9 (session-control). There are 6 discrete bugs, each with a known root cause and a specific code location to fix. No new libraries are needed. No new architectural patterns are introduced. All fixes operate within the existing React + Fastify + WebSocket + MCP-child-process architecture.

The bugs form two functional clusters:
1. **Auth token lifecycle failures** (Bugs 1 and 2): The frontend never handles stale access tokens and does not reconnect WebSocket when a token first becomes available.
2. **MCP isolation + streaming correctness** (Bugs 3, 4, 5): The MCP child process runs without `PROJECT_ID`, creating global tasks that the broadcast step does not include; the streaming loop emits duplicate messages; the system prompt instructs the AI to dump JSON.
3. **Missing persistence layer** (Bug 6): Chat history is stored in SQLite but never loaded on client init.

**Primary recommendation:** Implement fixes in dependency order: Bug 3 first (data correctness), Bug 5 (prompt quality), Bug 4 (deduplication), then Bugs 1 and 2 (auth lifecycle), Bug 6 last (history load). Each fix is independent and testable in isolation.

---

## Standard Stack

No new dependencies are introduced in this phase. All fixes use the existing stack.

### Existing Stack (relevant to fixes)

| Layer | Technology | Version | Relevant File |
|-------|-----------|---------|---------------|
| Frontend hooks | React | 18.x | `useTasks.ts`, `useWebSocket.ts`, `App.tsx` |
| Token storage | localStorage | built-in | `useAuth.ts` |
| HTTP client | fetch API | built-in | `useTasks.ts`, `App.tsx` |
| WebSocket client | native WebSocket | built-in | `useWebSocket.ts` |
| AI SDK | @qwen-code/sdk | 0.1.5 | `agent.ts` |
| MCP server | @modelcontextprotocol/sdk | current | `packages/mcp/src/index.ts` |
| HTTP server | Fastify 5.x | current | `packages/server/src/index.ts` |
| WS server | @fastify/websocket v11 | current | `packages/server/src/ws.ts` |
| Database | @libsql/client (SQLite) | current | `packages/mcp/src/store.ts` |
| Auth | jsonwebtoken (JWT) | current | `packages/server/src/auth.ts` |

---

## Architecture Patterns

### Current Data Flow (what exists)

```
Browser                          Server                        MCP child
  |                                |                               |
  |-- fetch /api/tasks  ---------->|-- taskStore.list(pid, true) ->|
  |                                |<-- Task[]  -------------------|
  |<-- Task[] ---------------------|
  |
  |-- WS connect ----------------->|-- auth handshake
  |                                |-- sessionConnections Map
  |-- chat message --------------->|-- runAgentWithHistory()
  |                                |   |-- query() MCP subprocess -|
  |                                |   |                            |-- create_task(no project_id)
  |                                |   |<- streaming events --------|
  |<-- token events ---------------|   |
  |<-- done event  ----------------|   |-- taskStore.list(pid) <-- BUG 3: no includeGlobal
  |<-- tasks event  ---------------|      (misses global tasks created by MCP)
```

### Fixed Data Flow (after Phase 10)

```
MCP child launched with env: { DB_PATH, PROJECT_ID }
  --> create_task uses process.env.PROJECT_ID as default
  --> task stored with correct project_id

broadcast step: taskStore.list(projectId, true)  -- matches HTTP GET
  --> client sees same tasks as after reload
```

### Pattern: Token Refresh on 401 in useTasks

**What:** Intercept HTTP 401, call refresh, retry once, logout if retry fails.
**When to use:** Any authenticated fetch that may use a stale 15-min access token.

```typescript
// Conceptual pattern for useTasks refresh-retry
async function fetchWithRefresh(accessToken: string, refreshFn: () => Promise<string | null>) {
  let res = await fetch('/api/tasks', { headers: { 'Authorization': `Bearer ${accessToken}` } });
  if (res.status === 401) {
    const newToken = await refreshFn();
    if (!newToken) return null; // logout triggered inside refreshFn
    res = await fetch('/api/tasks', { headers: { 'Authorization': `Bearer ${newToken}` } });
  }
  return res;
}
```

### Pattern: WebSocket Reconnect on Token Change

**What:** Track accessToken as a reactive value in useWebSocket. When it changes from null to a value, close the old WS and open a new one.
**Why this works:** The current hook calls `connect()` at mount time. If token is null at mount, the auth message is not sent. When token later becomes non-null (after OTP login), the existing WS is already open without auth.

```typescript
// Conceptual: add accessToken as parameter, close+reconnect on change
export function useWebSocket(
  onMessage: (msg: ServerMessage) => void,
  getAccessToken: () => string | null,
  accessToken: string | null  // NEW: trigger reconnect when changes
): UseWebSocketResult {
  useEffect(() => {
    // Close existing connection
    if (wsRef.current) {
      wsRef.current.onclose = null; // prevent auto-reconnect loop
      wsRef.current.close();
    }
    // Only connect if we have a token or on initial mount
    connect();
    return () => { wsRef.current?.close(); };
  }, [accessToken]); // Re-run when token changes
}
```

**Pitfall:** Suppress the auto-reconnect `onclose` handler when intentionally closing for reconnect, or the exponential backoff will interfere.

### Pattern: MCP Child Process env Injection

**What:** Pass `PROJECT_ID` to MCP child process env so create_task uses correct project scope.

Current code in `agent.ts` (lines 123-130):
```typescript
mcpServers: {
  gantt: {
    command: 'node',
    args: [mcpServerPath],
    env: { DB_PATH: dbPath },  // <-- ADD PROJECT_ID here
  },
},
```

Fix:
```typescript
env: { DB_PATH: dbPath, PROJECT_ID: projectId },
```

Then in `packages/mcp/src/index.ts`, in the `create_task` handler:
```typescript
// Extract projectId from args or fall back to env var
const { projectId: argProjectId } = args as { projectId?: string };
const resolvedProjectId = argProjectId ?? process.env.PROJECT_ID;
const task = await taskStore.create(input, resolvedProjectId);
```

Similarly for `create_tasks_batch` which currently passes no projectId to `taskStore.create()`.

### Pattern: includeGlobal in Broadcast

Current broadcast step in `agent.ts` line 157:
```typescript
const tasks = await taskStore.list(projectId);  // BUG: misses global tasks
```

Fix:
```typescript
const tasks = await taskStore.list(projectId, true);  // matches HTTP GET /api/tasks
```

`taskStore.list` signature already supports this (confirmed in `store.ts` line 198).

### Pattern: Streaming Event Deduplication (Bug 4)

**Root cause:** `isSDKAssistantMessage(event)` matches the final complete AssistantMessage event. The loop also processes individual streaming text events via the same check. This means the full text is broadcast twice.

**Fix strategy (accumulate + guard):** Track whether `assistantResponse` was already broadcast from streaming chunks. Only broadcast the final AssistantMessage if `assistantResponse` is still empty.

```typescript
let assistantResponse = '';
let streamedContent = false;

for await (const event of session) {
  if (isSDKAssistantMessage(event)) {
    // If we already streamed tokens, skip the final summary event
    if (streamedContent) continue;
    // Otherwise, handle as full message (fallback for non-streaming SDKs)
    for (const block of event.message.content) {
      if (block.type === 'text' && block.text) {
        assistantResponse += block.text;
        broadcastToSession(sessionId, { type: 'token', content: block.text });
      }
    }
  }
  // Note: also check for streaming partial events (token-level)
  // The exact event type for streaming tokens needs verification with @qwen-code/sdk
  if (isSDKResultMessage(event)) break;
}
```

**Discretion note:** The exact SDK event type hierarchy for `@qwen-code/sdk` v0.1.5 is not fully documented in the codebase. The planner should inspect the actual events emitted by adding a `console.error(event.type)` debug log in a dev run, then choose the correct guard condition.

### Pattern: GET /api/messages Endpoint

**What:** New Fastify route returning project-scoped message history.

```typescript
// In packages/server/src/index.ts
fastify.get('/api/messages', { preHandler: [authMiddleware] }, async (req, reply) => {
  const messages = await taskStore.getMessages(req.user!.projectId);
  // Return last N messages (50 is reasonable default)
  const recent = messages.slice(-50);
  return reply.send(recent);
});
```

`taskStore.getMessages(projectId)` already exists in `store.ts` (lines 477-492). This is a pure route registration — no store changes needed.

### Pattern: Load History in App.tsx

**What:** useEffect triggered by `auth.isAuthenticated` + `auth.project.id`, fetches `/api/messages` and populates `messages` state.

```typescript
// In App.tsx, after existing hooks
useEffect(() => {
  if (!auth.isAuthenticated || !auth.accessToken) return;

  fetch('/api/messages', {
    headers: { 'Authorization': `Bearer ${auth.accessToken}` },
  })
    .then(res => res.ok ? res.json() as Promise<Array<{role: string; content: string}>> : Promise.resolve([]))
    .then(data => {
      const history: ChatMessage[] = data.map(m => ({
        id: String(++msgCounter),
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));
      setMessages(history);
    })
    .catch(() => {/* ignore — fresh session */});
}, [auth.isAuthenticated, auth.accessToken]);
```

**Dependency:** `auth.project.id` changes when project switches. Including it as dependency reloads history per-project.

### Anti-Patterns to Avoid

- **Do not pass `refreshAccessToken` as a new hook parameter changing the signature dramatically** — consider passing it via a `deps` object or updating useTasks to accept an options object.
- **Do not reconnect WebSocket on every render** — the accessToken dependency must be stable (use the actual string value, not a getter function reference).
- **Do not use `onclose` auto-reconnect when manually closing for reconnect** — this creates a loop. Clear the handler before `.close()`.
- **Do not update messages state in App.tsx before WS is connected** — history load is independent of WS; they can race without issue.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Token refresh | Custom refresh middleware | Existing `refreshAccessToken()` in `useAuth.ts` | Already implemented, handles storage and state update |
| Message history storage | New messages table | Existing `taskStore.getMessages()` in `store.ts` | Already stores and retrieves with project_id filter |
| WS connection management | Custom reconnect timer | Existing backoff logic in `useWebSocket.ts` | Already has exponential backoff; just add token-change trigger |
| API auth guard | Custom token check | Existing `authMiddleware` preHandler | Validates JWT, populates `req.user` with projectId/sessionId |

---

## Common Pitfalls

### Pitfall 1: WebSocket Reconnect Loop
**What goes wrong:** When manually closing the WS to reconnect (Bug 2 fix), the existing `onclose` handler fires and triggers the exponential backoff reconnect, which then creates a second connection racing with the intentional reconnect.
**Why it happens:** `onclose` always fires on `ws.close()`, whether intentional or not.
**How to avoid:** Before calling `ws.close()` for an intentional reconnect, set `ws.onclose = null`. Then call `connect()` directly.
**Warning signs:** "reconnecting" logs appearing twice in sequence, or doubled connections in server session map.

### Pitfall 2: useTasks Signature Change Breaking App.tsx
**What goes wrong:** Adding `refreshAccessToken` param to `useTasks` requires updating the call site in `App.tsx`.
**Why it happens:** The hook destructures `auth.refreshAccessToken` — if this prop changes (e.g., during re-renders), it may cause `useEffect` to re-fire.
**How to avoid:** Wrap `refreshAccessToken` in `useCallback` (already done in `useAuth.ts` line 137) so its reference is stable. Pass `auth.refreshAccessToken` directly.

### Pitfall 3: create_tasks_batch Missing Project ID
**What goes wrong:** The `create_tasks_batch` handler (lines 674-679 in `index.ts`) calls `taskStore.create({ ... })` with no projectId argument. Even after adding `PROJECT_ID` to env, this tool won't scope tasks correctly unless the batch handler also reads `process.env.PROJECT_ID`.
**How to avoid:** Fix BOTH `create_task` AND `create_tasks_batch` handlers in `packages/mcp/src/index.ts`.

### Pitfall 4: loadSnapshot in store.ts Ignores Global Tasks
**What goes wrong:** The scheduler's `loadSnapshot(projectId)` uses `WHERE project_id = ?` (no global tasks). After Bug 3 fix, tasks will have the correct project_id, so this is fine — but if global tasks still exist from before the fix, they won't be scheduled.
**How to avoid:** This is an existing limitation documented in CONTEXT.md. The fix properly scopes new tasks going forward. Old global tasks remain visible via `includeGlobal=true` in list/broadcast.

### Pitfall 5: Message History Contains AI JSON Responses (Before Bug 5 Fix)
**What goes wrong:** Loading history (Bug 6 fix) will show old messages that include raw JSON dumps. These are stored in the DB from before Bug 5 is fixed.
**How to avoid:** Apply Bug 5 (system prompt fix) before or simultaneously with Bug 6. Accept that old messages may look ugly — the fix applies going forward.

### Pitfall 6: App.tsx Error Display Swallows Authenticated Errors
**What goes wrong:** Lines 115-121 of `App.tsx` render a full-page error if `error && auth.isAuthenticated`. After Bug 1 fix, a 401 that gets refreshed should not set `error` state. If refresh fails (logout triggered), `isAuthenticated` will be false and the OTP modal shows.
**How to avoid:** In useTasks, only call `setError()` on non-401 errors, or on 401 where refresh also fails. A successful retry should clear the error state.

---

## Code Examples

### Current useTasks (full, for reference)
```typescript
// Source: packages/web/src/hooks/useTasks.ts (actual file)
export function useTasks(accessToken: string | null): UseTasksResult {
  useEffect(() => {
    if (!accessToken) { setLoading(false); return; }
    fetch('/api/tasks', { headers: { 'Authorization': `Bearer ${accessToken}` } })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<Task[]>;
      })
      // ... setTasks, setLoading, setError
  }, [accessToken]);
}
// BUG: throws on 401 — no refresh logic
```

### Current useWebSocket connect() trigger
```typescript
// Source: packages/web/src/hooks/useWebSocket.ts lines 74-79
useEffect(() => {
  connect();
  return () => { wsRef.current?.close(); };
}, [connect]); // BUG: connect is memoized with useCallback([]) — never changes
// So when accessToken goes null→value, no reconnect happens
```

### Current agent.ts MCP env (Bug 3)
```typescript
// Source: packages/server/src/agent.ts lines 123-130
mcpServers: {
  gantt: {
    command: 'node',
    args: [mcpServerPath],
    env: { DB_PATH: dbPath },  // PROJECT_ID missing
  },
},
// Broadcast step (line 157):
const tasks = await taskStore.list(projectId);  // includeGlobal missing
```

### Current system.md (Bug 5 — problematic section)
```markdown
# Workflow step 5 (current, to be removed):
## Output
After calling `export_tasks`, present the JSON result directly in your response
so the agent script can capture it.
```

### taskStore.list() signature (already correct)
```typescript
// Source: packages/mcp/src/store.ts line 198
async list(projectId?: string, includeGlobal = false): Promise<Task[]>
// Used in HTTP route as: taskStore.list(req.user!.projectId, true)  -- correct
// Used in broadcast as: taskStore.list(projectId)  -- BUG: missing true
```

### taskStore.getMessages() (already exists, just need route)
```typescript
// Source: packages/mcp/src/store.ts line 477
async getMessages(projectId?: string): Promise<Message[]>
// Returns all messages ORDER BY created_at ASC, filtered by project_id
// No changes needed to store — only a new GET /api/messages route is required
```

---

## State of the Art

| Old Approach | Current Approach | Phase | Impact |
|--------------|-----------------|-------|--------|
| In-memory task store | SQLite via @libsql/client | Phase 7 | Tasks persist across server restarts |
| No auth | OTP + JWT sessions | Phase 9 | Multi-user with project isolation |
| Global broadcast | broadcastToSession() | Phase 9 | AI responses targeted per session |
| No chat history API | taskStore.getMessages() exists | Phase 9 | DB layer ready, API endpoint missing |

---

## Open Questions

1. **@qwen-code/sdk streaming event types**
   - What we know: `isSDKAssistantMessage` and `isSDKResultMessage` are exported. The loop accumulates text from `event.message.content` (ContentBlock[]).
   - What's unclear: Whether there are intermediate streaming-only events (e.g., a type like `SDKStreamingEvent`) vs. the final full AssistantMessage. The current code may be treating the final message as both a streaming accumulator and a broadcast target.
   - Recommendation: Add `console.error('[debug]', event.type, event)` to the loop in a dev build to capture the actual event sequence. Then decide: either use a `streamedContent` boolean guard, or only accumulate from one specific event type.

2. **accessToken stability for useWebSocket dependency**
   - What we know: `auth.accessToken` is a string | null in React state. It changes once (null → token string) after OTP login.
   - What's unclear: Whether passing `accessToken` directly as a prop to `useWebSocket` (vs. having `useWebSocket` subscribe to auth state internally) is cleaner.
   - Recommendation: Pass `accessToken: string | null` as a third parameter to `useWebSocket`. This keeps the hook pure and testable.

---

## Validation Architecture

No automated test infrastructure exists for this project's web/server packages (no jest.config, no vitest.config, no test/ directories in packages/web or packages/server). Phase 10 is a bug-fix phase — validation is manual E2E testing against the running application.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None (manual testing) |
| Config file | none |
| Quick run command | Manual browser test |
| Full suite command | Manual browser test suite |

### Phase Requirements -> Test Map

| Bug | Behavior | Test Type | Test Procedure |
|-----|----------|-----------|----------------|
| Bug 1 | No 401 error on page reload | manual | Open app after 15+ min, verify tasks load without error |
| Bug 2 | WS connected after OTP login (no reload) | manual | Fresh login via OTP, verify "connected" indicator without reload |
| Bug 3 | Gantt updates after AI command | manual | Ask AI to add task, verify Gantt updates without reload |
| Bug 4 | Single AI message per response | manual | Send chat message, verify message appears once |
| Bug 5 | AI responds with brief text, no JSON | manual | Ask AI to add task, verify response is 1-2 sentences |
| Bug 6 | Chat history preserved on reload | manual | Send messages, reload page, verify history visible |

### Wave 0 Gaps
- No test infrastructure to create — this is a bug-fix phase with manual validation only.

---

## File Change Map

Exact files each bug fix touches:

| Bug | File | Change |
|-----|------|--------|
| Bug 1 | `packages/web/src/hooks/useTasks.ts` | Add refresh-retry on 401; accept `refreshAccessToken` param |
| Bug 1 | `packages/web/src/App.tsx` | Pass `auth.refreshAccessToken` to `useTasks` |
| Bug 2 | `packages/web/src/hooks/useWebSocket.ts` | Add `accessToken` param; reconnect when token changes |
| Bug 2 | `packages/web/src/App.tsx` | Pass `auth.accessToken` to `useWebSocket` |
| Bug 3a | `packages/server/src/agent.ts` | Add `PROJECT_ID: projectId` to MCP env |
| Bug 3b | `packages/mcp/src/index.ts` | Use `process.env.PROJECT_ID` as default in `create_task` and `create_tasks_batch` |
| Bug 3c | `packages/server/src/agent.ts` | Change `taskStore.list(projectId)` to `taskStore.list(projectId, true)` |
| Bug 4 | `packages/server/src/agent.ts` | Fix streaming deduplication in `for await` loop |
| Bug 5 | `packages/mcp/agent/prompts/system.md` | Rewrite to remove JSON export instruction; add brief-response rule |
| Bug 6a | `packages/server/src/index.ts` | Add `GET /api/messages` route |
| Bug 6b | `packages/web/src/App.tsx` | Add `useEffect` to load history on auth |

**Total files:** 6 unique files, 11 change sites.

---

## Sources

### Primary (HIGH confidence)
- Direct source reading of `packages/web/src/hooks/useTasks.ts` — confirmed 401 not handled
- Direct source reading of `packages/web/src/hooks/useWebSocket.ts` — confirmed `connect` memoized with empty deps, no token-change trigger
- Direct source reading of `packages/web/src/hooks/useAuth.ts` — confirmed `refreshAccessToken()` exists and is stable via `useCallback`
- Direct source reading of `packages/server/src/agent.ts` — confirmed `PROJECT_ID` missing from MCP env; confirmed `list(projectId)` without includeGlobal
- Direct source reading of `packages/mcp/src/index.ts` — confirmed `create_task` reads `projectId` from args but `create_tasks_batch` passes none to `taskStore.create()`
- Direct source reading of `packages/mcp/src/store.ts` — confirmed `list(projectId, includeGlobal=false)` signature, confirmed `getMessages()` exists
- Direct source reading of `packages/server/src/index.ts` — confirmed no `GET /api/messages` endpoint
- Direct source reading of `packages/web/src/App.tsx` — confirmed `messages` initialized as `[]` with no history load
- Direct source reading of `packages/mcp/agent/prompts/system.md` — confirmed problematic `## Output` section instructing JSON export

### Secondary (MEDIUM confidence)
- CONTEXT.md bug analysis — root causes corroborated by source code reading

---

## Metadata

**Confidence breakdown:**
- Bug root causes: HIGH — verified by reading actual source code, not hypothesized
- Fix approach (Bugs 1, 3, 5, 6): HIGH — straightforward code changes, patterns clear from existing code
- Fix approach (Bug 2 — WS reconnect): HIGH — mechanism clear, onclose loop pitfall documented
- Fix approach (Bug 4 — dedup): MEDIUM — exact SDK event types not confirmed without running a debug session; guard pattern is solid but exact condition needs verification
- File change map: HIGH — all file paths confirmed via direct reads

**Research date:** 2026-03-07
**Valid until:** 2026-04-07 (stable codebase, no fast-moving dependencies involved)