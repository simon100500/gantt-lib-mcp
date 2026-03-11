---
phase: quick-23-client-authoritative-rollback-jump-dupli
plan: 23
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/web/src/hooks/useAutoSave.ts
  - packages/web/src/hooks/useTasks.ts
  - packages/web/src/hooks/useTaskStream.ts
  - packages/web/src/App.tsx
  - packages/server/src/index.ts
  - packages/mcp/src/store.ts
autonomous: true
requirements:
  - SYNC-01: Client-authoritative sync for manual edits
  - SYNC-02: Remove rollback/jump/duplicate behavior
  - SYNC-03: Remove task-SSE for manual edits, keep only for AI stream
  - SYNC-04: Simplify API to GET/PUT /api/tasks (no PATCH)

must_haves:
  truths:
    - "Manual task edits persist locally without server interference"
    - "Server returns stored snapshot without recalculation"
    - "Client PUTs entire task array as source of truth"
    - "SSE only broadcasts AI streaming, not manual edits"
    - "No rollback/jump/duplicate on manual changes"
  artifacts:
    - path: "packages/web/src/hooks/useAutoSave.ts"
      provides: "Debounced PUT /api/tasks on manual changes"
      exports: ["useAutoSave"]
    - path: "packages/server/src/index.ts"
      provides: "GET and PUT /api/tasks endpoints"
      exports: ["fastify.get('/api/tasks')", "fastify.put('/api/tasks')"]
    - path: "packages/web/src/hooks/useTaskStream.ts"
      provides: "SSE connection for AI streaming only"
      exports: ["useTaskStream"]
  key_links:
    - from: "packages/web/src/hooks/useAutoSave.ts"
      to: "/api/tasks"
      via: "PUT request with full task array"
      pattern: "fetch.*api/tasks.*method.*PUT"
    - from: "packages/server/src/index.ts"
      to: "taskStore.importTasks"
      via: "Direct storage without recalculation"
      pattern: "importTasks.*projectId"
    - from: "packages/web/src/hooks/useTaskStream.ts"
      to: "/stream/ai"
      via: "EventSource for AI tokens only"
      pattern: "EventSource.*stream/ai"
---

<objective>
Rewrite diagram synchronization as a simple client-authoritative system for manual editing.

Purpose: Eliminate rollback/jump/duplicate behavior when users manually edit tasks and connections. The frontend becomes the source of truth, while the server simply stores and returns snapshots without recalculation.

Output:
- Client PUTs entire task array to /api/tasks
- Server stores snapshot without recalculation
- SSE used only for AI token streaming (not task sync)
- Manual edits stay local until explicit save/load

This replaces the complex PATCH/SSE sync system with straightforward GET/PUT operations.
</objective>

<execution_context>
@D:/Projects/gantt-lib-mcp/.planning/STATE.md
@D:/Projects/gantt-lib-mcp/packages/web/src/hooks/useAutoSave.ts
@D:/Projects/gantt-lib-mcp/packages/web/src/hooks/useTasks.ts
@D:/Projects/gantt-lib-mcp/packages/web/src/hooks/useTaskStream.ts
@D:/Projects/gantt-lib-mcp/packages/server/src/index.ts
@D:/Projects/gantt-lib-mcp/packages/mcp/src/store.ts
</execution_context>

<context>
## Current Architecture Problems

The current system has multiple synchronization paths that cause conflicts:

1. **SSE task sync** (`/stream/tasks`) - broadcasts server snapshots to all clients
2. **PATCH endpoint** (`/api/tasks`) - incremental updates with upserts/deletes
3. **PUT endpoint** (`/api/tasks`) - full task replacement
4. **Auto-save hook** - debounced PATCH on every change
5. **Server-side scheduler** - recalculates dates on every mutation

This causes:
- **Rollback**: Server snapshot overwrites manual edits
- **Jump**: Task order changes when SSE arrives
- **Duplicate**: Same changes sent multiple times via PATCH + SSE

## New Architecture: Client-Authoritative

**Core principle:** Frontend is source of truth for manual edits. Server is passive storage.

**Synchronization flow:**
1. User edits tasks locally (no server communication)
2. Debounced PUT /api/tasks with full task array
3. Server stores snapshot WITHOUT recalculation
4. Other clients see updates via next GET /api/tasks (poll or manual refresh)
5. AI streaming still uses SSE (/stream/ai only)

**API changes:**
- Keep: GET /api/tasks (return stored snapshot)
- Keep: PUT /api/tasks (store full task array)
- Remove: PATCH /api/tasks (no incremental updates)
- Remove: SSE /stream/tasks for manual edits (AI stream only)

**Key implementation details:**
- Remove `runScheduler()` call from `TaskStore.importTasks()`
- Remove `broadcastToProject()` from task endpoints
- Remove `useTaskStream()` for task updates (keep only for AI)
- Change `useAutoSave` to PUT full array instead of PATCH
- Remove `syncedTasksHashRef` complexity (no more server acknowledgment)

## Files to Modify

**Frontend:**
- `packages/web/src/hooks/useAutoSave.ts` - Change from PATCH to PUT, remove hash sync logic
- `packages/web/src/hooks/useTasks.ts` - Remove SSE sync, keep only GET
- `packages/web/src/hooks/useTaskStream.ts` - Remove task handling, keep only AI
- `packages/web/src/App.tsx` - Remove task stream handling, simplify auto-save

**Backend:**
- `packages/server/src/index.ts` - Remove PATCH endpoint, remove SSE broadcasts from task endpoints
- `packages/mcp/src/store.ts` - Remove `runScheduler()` call from `importTasks()`, keep data as-is
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Remove server-side scheduler recalculation and SSE broadcasts</name>
  <files>packages/mcp/src/store.ts, packages/server/src/index.ts</files>
  <behavior>
    - Test 1: TaskStore.importTasks() stores tasks without running scheduler
    - Test 2: PUT /api/tasks does not broadcast to SSE
    - Test 3: GET /api/tasks returns stored tasks as-is
  </behavior>
  <action>
    In packages/mcp/src/store.ts:
    1. Remove the private runScheduler() method call from importTasks()
    2. Store tasks exactly as provided in the JSON array
    3. Keep all dependency/transaction logic for data integrity
    4. Return count without triggering any recalculation

    In packages/server/src/index.ts:
    1. Remove the fastify.patch('/api/tasks') endpoint entirely
    2. Remove broadcastToProject() calls from PUT /api/tasks
    3. Keep GET /api/tasks returning taskStore.list() as-is
    4. Keep DELETE /api/tasks for clear functionality
    5. Add comment: "Client-authoritative: server stores snapshot without recalculation"
  </action>
  <verify>
    <automated>curl http://localhost:3000/api/tasks -H "Authorization: Bearer $TOKEN" returns stored tasks without modification</automated>
  </verify>
  <done>
    Server stores task snapshots passively. No scheduler runs on import. No SSE broadcasts on task changes.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Change client auto-save from PATCH to PUT with full task array</name>
  <files>packages/web/src/hooks/useAutoSave.ts</files>
  <behavior>
    - Test 1: useAutoSave sends PUT request with full tasks array
    - Test 2: Debounce logic prevents rapid PUT requests
    - Test 3: No hash comparison or server sync acknowledgment
  </behavior>
  <action>
    In packages/web/src/hooks/useAutoSave.ts:
    1. Change saveTaskPatch() to PUT full task array:
       - Method: 'PUT' (not PATCH)
       - Body: JSON.stringify(tasks) (not patch object)
       - Remove X-Client-Id header (not needed)
    2. Remove computeTasksHash() function (not needed)
    3. Remove buildTaskPatch() function (not needed)
    4. Remove syncedTasksHashRef parameter and all hash sync logic
    5. Keep debounce logic (pendingSaveRef, flushPendingSaveRef)
    6. Simplify effect: just PUT when tasks change, no hash checks
    7. Keep pagehide/visibilitychange flush for navigation

    Signature changes:
    - Remove syncedTasksHashRef parameter
    - Keep: tasks, accessToken, clientId (for debugging only)
  </action>
  <verify>
    <automated>grep -n "method.*PATCH" packages/web/src/hooks/useAutoSave.ts returns no matches (all changed to PUT)</automated>
  </verify>
  <done>
    Client PUTs entire task array on debounced changes. No PATCH, no hash logic, no server sync acknowledgment.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Remove task SSE synchronization, keep only AI streaming</name>
  <files>packages/web/src/hooks/useTaskStream.ts, packages/web/src/hooks/useTasks.ts, packages/web/src/App.tsx</files>
  <behavior>
    - Test 1: useTaskStream only handles AI messages, not tasks
    - Test 2: useTasks only fetches via GET, no SSE handling
    - Test 3: App.tsx removes task stream handling
  </behavior>
  <action>
    In packages/web/src/hooks/useTaskStream.ts:
    1. Remove 'tasks' from TaskStreamMessage type
    2. Remove sourceClientId handling
    3. Update onMessage type to exclude task updates
    4. Keep only AI-related message types
    5. Add comment: "SSE for AI streaming only (not task sync)"

    In packages/web/src/hooks/useTasks.ts:
    1. Remove onServerTasksSynced parameter
    2. Remove all SSE-related logic
    3. Keep only GET /api/tasks fetch
    4. Keep loading/error states
    5. Remove normalizeTaskOrder/sortTasksByOrder (not needed here)

    In packages/web/src/App.tsx:
    1. Remove useTaskStream import and usage for tasks
    2. Keep useAIStream for AI tokens only
    3. Remove syncedTasksHashRef entirely
    4. Remove handleServerTasksSynced callback
    5. Pass null/undefined for removed useAutoSave parameters
    6. Remove task stream message handler
    7. Keep AI stream message handler
  </action>
  <verify>
    <automated>grep -n "type.*tasks" packages/web/src/hooks/useTaskStream.ts returns no matches (task type removed)</automated>
  </verify>
  <done>
    SSE handles only AI token streaming. No task sync via SSE. Tasks sync via explicit GET/PUT only.
  </done>
</task>

</tasks>

<verification>
## Manual Verification Steps

1. **Test manual edit persistence:**
   - Edit task name/date in chart
   - Verify change stays local (no immediate server update)
   - Wait for debounce (should see PUT in network tab)
   - Reload page
   - Verify change persists

2. **Test no rollback/jump:**
   - Reorder tasks by drag-and-drop
   - Make another edit
   - Verify order doesn't change
   - Reload page
   - Verify order persists

3. **Test AI streaming still works:**
   - Send AI message
   - Verify tokens stream via SSE
   - Verify AI changes appear after completion

4. **Test multi-client (optional):**
   - Open two browser windows
   - Edit in window A
   - Manually refresh window B
   - Verify changes appear (not real-time)
</verification>

<success_criteria>
- [ ] Server stores task snapshots without recalculation
- [ ] Client PUTs full task array (not PATCH)
- [ ] SSE removed for task sync (AI only)
- [ ] Manual edits persist without rollback
- [ ] Task order doesn't jump on changes
- [ ] No duplicate saves (PUT + SSE)
- [ ] AI streaming still functional
</success_criteria>

<output>
After completion, create `.planning/quick/23-client-authoritative-rollback-jump-dupli/23-SUMMARY.md`
</output>
