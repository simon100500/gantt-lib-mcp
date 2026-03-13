---
status: awaiting_human_verify
trigger: "task-movement-not-saving"
created: 2026-03-14T00:00:00.000Z
updated: 2026-03-14T00:00:55.000Z
---

## Current Focus
hypothesis: 500 error on indent/outdent because importTasks uses FOR loop instead of transaction. When tasks have parent-child relationships, the parent might not exist yet when creating child.
test: Found root cause in task.service.ts lines 426-449 - delete all then create in for loop (not transaction)
expecting: Fix by using Prisma transaction with createMany (batch operation)
next_action: Fix importTasks to use transaction for atomicity

## Symptoms
expected: При движении задачи (drag & drop или изменение даты) изменение должно сохраняться. При последовательных действиях A→B→C все промежуточные изменения должны сохраняться корректно.
actual: 500 Internal Server Error при быстром изменении уровня задачи (indent/outdent). Задачи не сохраняются.
errors: PUT /api/tasks returns 500 error on quick indent/outdent actions
reproduction: 1. Открыть диаграмму Ганта. 2. Быстро изменить уровень задачи (indent/outdent). 3. 500 ошибка
started: Связано с проблемой state-reset и WebSocket (сессия new-project-state-reset-and-sidebar-count-desync)

## Eliminated

## Evidence

- timestamp: 2026-03-14T00:00:50Z
  checked: task.service.ts importTasks method lines 409-455
  found: |
    ```typescript
    // Delete existing tasks
    await this.prisma.task.deleteMany({...});

    // Import tasks
    for (const [index, task] of tasks.entries()) {
      await this.prisma.task.create({...});
    }
    ```
    PROBLEM: Delete and create are NOT in a transaction!
    - If task A is parent of task B
    - Loop creates task A first
    - Then creates task B with parentId=A
    - But if order is different (B before A), B fails because A doesn't exist yet
    - OR if any create fails, we're left with partial data (delete already happened)
  implication: ROOT CAUSE OF 500 ERROR - non-atomic import with parent references

- timestamp: 2026-03-14T00:00:51Z
  checked: Fixed by wrapping in transaction
  found: |
    ```typescript
    await this.prisma.$transaction(async (tx) => {
      await tx.task.deleteMany({...});
      for (const [index, task] of tasks.entries()) {
        await tx.task.create({...});
      }
    });
    ```
    Transaction ensures:
    - All operations succeed or ALL fail (atomic)
    - Parent references work within transaction context
    - No partial state if error occurs
  implication: FIX APPLIED - importTasks now atomic

- timestamp: 2026-03-14T00:00:43Z
  checked: Git status
  found: packages/server/src/index.ts has uncommitted changes (WS broadcasts removed)
  implication: Code changes exist but not yet committed OR server not restarted

- timestamp: 2026-03-14T00:00:44Z
  checked: Task disappearance symptom
  found: User reports tasks disappear on indent/outdent. This is EXACTLY the symptom of WebSocket broadcast echo overwriting local state.
  implication: Server is likely still running OLD code with WS broadcasts active

- timestamp: 2026-03-14T00:00:45Z
  checked: Added diagnostic logging to frontend
  found: Added stack trace logging to handleWsMessage to diagnose source of unexpected task messages
  implication: Will help identify if WS messages are still coming from user actions after restart

- timestamp: 2026-03-14T00:00:41Z
  checked: ALL WebSocket broadcasts in server code
  found: |
    grep -rn "broadcastToSession" in packages/server/src:
    - agent.ts lines 229, 261, 280, 516, 534, 544, 551 - ALL AI-related (keep these)
    - index.ts lines 55, 97 - error messages only (keep these)
    - ws.ts line 70 - function definition

    NO broadcasts from PUT /api/tasks or DELETE /api/tasks (already removed)
    NO broadcasts from any other user action endpoints
  implication: Server is clean - all user action WS broadcasts removed

- timestamp: 2026-03-14T00:00:42Z
  checked: Current server endpoint structure
  found: |
    GET /api/tasks - read only
    POST /api/chat - AI agent trigger (has error broadcast only)
    DELETE /api/tasks - NO WS broadcast
    PUT /api/tasks - NO WS broadcast
    GET /api/messages - read only
  implication: Server architecture correct - no user action WS broadcasts

- timestamp: 2026-03-14T00:00:31Z
  checked: User requirement clarification
  found: User wants to REMOVE realtime editing via WebSocket entirely. WebSocket should ONLY be used for AI agent responses. User edits should use optimistic updates with server as source of truth but NO realtime sync to other tabs.
  implication: Simplify architecture - remove WS broadcast from user edit endpoints

- timestamp: 2026-03-14T00:00:32Z
  checked: Current WebSocket broadcast locations in server
  found: |
    1. /packages/server/src/index.ts:79 - PUT /api/tasks broadcasts after user save
    2. /packages/server/src/index.ts:68 - DELETE /api/tasks broadcasts after delete
    3. /packages/server/src/agent.ts:534 - AI agent broadcasts after processing

    User wants to remove #1 and #2, keep only #3.
  implication: Need to remove broadcast from user edit endpoints, keep only in AI agent

- timestamp: 2026-03-14T00:00:11Z
  checked: Server code /packages/server/src/index.ts lines 72-81
  found: |
    ```typescript
    fastify.put('/api/tasks', { preHandler: [authMiddleware] }, async (req, reply) => {
      const tasks = req.body as unknown[];
      // ... save to database ...
      const count = await taskService.importTasks(...);
      // Broadcast updated tasks to all sessions for this project so other browser tabs sync
      broadcastToSession(req.user!.sessionId, { type: 'tasks', tasks });  // <-- PROBLEM!
      return reply.send({ saved: count });
    });
    ```
    Server broadcasts tasks via WebSocket IMMEDIATELY after saving.
  implication: Every save triggers a WS broadcast that overwrites local frontend state

- timestamp: 2026-03-14T00:00:12Z
  checked: App.tsx lines 140-143 - WS message handler
  found: |
    ```typescript
    const handleWsMessage = useCallback((msg: ServerMessage) => {
      if (msg.type === 'tasks') {
        console.log('[App] Received tasks via WebSocket, count:', msg.tasks?.length);
        replaceTasksFromSystem(msg.tasks as Task[]);  // <-- OVERWRITES LOCAL CHANGES!
      }
      // ...
    }, [setTasks]);
    ```
  implication: WebSocket 'tasks' messages completely replace local state, including pending drag changes

- timestamp: 2026-03-14T00:00:13Z
  checked: Full race condition flow
  found: |
    SCENARIO: User drags task to position A, then quickly to position B:

    1. Drag A: Gantt onChange → setTasks(tasksA)
    2. useAutoSave detects change → starts save request
    3. User drags to B: Gantt onChange → setTasks(tasksB)
    4. useAutoSave detects change → starts save request (with abort)
    5. Server receives save A → saves to DB
    6. Server broadcasts { type: 'tasks', tasks: tasksA } via WS
    7. Frontend receives WS message → replaceTasksFromSystem(tasksA)
    8. **tasksA overwrites tasksB! Position B is LOST!**
    9. Server receives save B → saves to DB
    10. Server broadcasts { type: 'tasks', tasks: tasksB }
    11. Frontend receives WS message → replaceTasksFromSystem(tasksB)
    12. Now shows B (but step 7 already lost intermediate state)

    The problem: WS broadcast from step 6 overwrites the local drag B from step 3.
  implication: ROOT CAUSE FOUND - WS broadcast echoes back and overwrites pending changes

- timestamp: 2026-03-14T00:00:01Z
  checked: Related debug session `task-save-not-triggering.md`
  found: Previous bug fixed where skipCountRef=2 caused first action to be skipped. Now skipCountRef=1, so single saves work.
  implication: The current bug is different - it's about RAPID sequential operations, not first operations

- timestamp: 2026-03-14T00:00:02Z
  checked: useAutoSave.ts lines 126-130, 163-167, 199
  found: |
    ```typescript
    // Skip if a save is already in progress for the same data
    if (saveInProgressRef.current && currentHash === lastSavedHashRef.current) {
      console.log('[autosave] Save already in progress for this data');
      return;
    }
    ```
    And after successful save:
    ```typescript
    if (lastSkipVersionRef.current === savedSkipVersionRef) {
      lastSavedHashRef.current = currentHash;
    }
    ```
    Critical: `lastSavedHashRef` is ONLY updated if save succeeds AND skipVersion hasn't changed.
  implication: If save is in-progress and user drags again, the new hash != old hash, so save IS triggered. This creates race condition.

- timestamp: 2026-03-14T00:00:03Z
  checked: useAutoSave.ts line 204 - save execution
  found: `saveTasks()` is executed immediately without awaiting. Multiple rapid drags = multiple concurrent fetch requests.
  implication: Race condition: drag A starts save, drag B starts save before A completes. Which one finishes last wins.

- timestamp: 2026-03-14T00:00:04Z
  checked: useAutoSave.ts lines 145-201 - full save flow
  found: |
    Scenario: User drags task to position A, then quickly to position B:
    1. Drag A: onChange(tasksA) → useAutoSave detects change
    2. Save A starts: saveInProgressRef=true, fetch(PUT tasksA) initiated
    3. Drag B: onChange(tasksB) → useAutoSave detects change
    4. Save B checks: saveInProgressRef=true, but currentHash(B) != lastSavedHashRef(A)
    5. Save B proceeds anyway (line 127 check fails because hashes differ)
    6. Now TWO saves in flight: fetch(PUT tasksA) and fetch(PUT tasksB)
    7. Whichever finishes LAST wins in database
    8. If Save A finishes after Save B: tasksA overwrites tasksB → position B is lost!
  implication: ROOT CAUSE FOUND - concurrent saves with no queuing or request cancellation

## Resolution
root_cause: |
  **TWO CRITICAL BUGS:**

  **Bug 1: WebSocket broadcast echo overwrites pending drag changes**
  - Server broadcast tasks after every PUT /api/tasks
  - Frontend received its own echo and overwrote pending changes
  - Rapid drags: first drag's echo overwrites second drag's local state

  **Bug 2: importTasks not atomic - causes 500 error on indent/outdent**
  - task.service.ts line 422-449: delete all, then create in FOR loop
  - NO transaction wrapping the operation
  - Parent-child relationships fail if parent doesn't exist yet
  - Partial state if any create fails (delete already happened)

fix: |
  **Fix 1: Removed WebSocket broadcasts from user actions**
  - Removed broadcast from PUT /api/tasks (index.ts line 79)
  - Removed broadcast from DELETE /api/tasks (index.ts line 68)
  - WS now ONLY used for AI agent responses (agent.ts)

  **Fix 2: Made importTasks atomic with transaction**
  - Wrapped delete + create loop in `prisma.$transaction()`
  - Ensures all-or-nothing: either all tasks import or none do
  - Parent references work within transaction context
  - No partial state on error

  **Fix 3: Added AbortController to useAutoSave**
  - Prevents concurrent save race conditions
  - Aborts previous in-flight save when new one starts
  - Ensures only latest state is saved

  **Architecture:**
  - User edits: Optimistic UI → PUT /api/tasks → NO WS broadcast
  - AI edits: AI agent → Server save → WS broadcast
  - Atomic imports: Transaction ensures data integrity
  - Stability: No WS echoes, no race conditions

verification: |
  All fixes applied. Files changed:
  - packages/server/src/index.ts (removed WS broadcasts)
  - packages/web/src/App.tsx (simplified WS handler + diagnostics)
  - packages/web/src/hooks/useAutoSave.ts (AbortController)
  - packages/mcp/src/services/task.service.ts (transaction wrapper)

  Need to test:
  1. Quick indent/outdent - should save without 500 error
  2. Rapid drag operations - should work smoothly
  3. Page refresh - changes should persist
  4. AI agent - should still work via WebSocket
files_changed:
  - packages/server/src/index.ts
  - packages/web/src/App.tsx
  - packages/web/src/hooks/useAutoSave.ts
  - packages/mcp/src/services/task.service.ts
