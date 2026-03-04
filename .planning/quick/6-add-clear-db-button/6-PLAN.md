---
phase: quick
plan: 6
type: execute
wave: 1
depends_on: []
files_modified: [packages/mcp/src/store.ts, packages/server/src/index.ts, packages/web/src/App.tsx]
autonomous: false
requirements: [QUICK-06]

must_haves:
  truths:
    - "User can clear all tasks from the database with a button click"
    - "Database is cleared (tasks, dependencies removed)"
    - "Gantt chart updates to show empty state after clearing"
    - "Chat messages are preserved (only tasks cleared)"
  artifacts:
    - path: "packages/mcp/src/store.ts"
      provides: "deleteAll() method"
      exports: ["deleteAll()"]
    - path: "packages/server/src/index.ts"
      provides: "DELETE /api/tasks endpoint"
      exports: ["DELETE /api/tasks"]
    - path: "packages/web/src/App.tsx"
      provides: "Clear Database button"
      min_lines: 30
  key_links:
    - from: "App.tsx Clear button"
      to: "DELETE /api/tasks"
      via: "fetch DELETE request"
      pattern: "fetch.*api/tasks.*DELETE"
    - from: "DELETE /api/tasks"
      to: "taskStore.deleteAll()"
      via: "store method call"
      pattern: "deleteAll|DELETE FROM tasks"
    - from: "Clear button onClick"
      to: "setTasks([])"
      via: "local state update"
      pattern: "setTasks.*\\[\\]"
---

<objective>
Add a "Clear Database" button to remove all Gantt tasks from the database while preserving chat message history.

Purpose: Allow users to quickly reset their project and start fresh without losing chat context.
Output: TaskStore.deleteAll() method + DELETE /api/tasks endpoint + Clear Database button in the web UI control bar
</objective>

<execution_context>
@.planning/STATE.md
</execution_context>

<context>
## Existing Codebase Patterns

### Server API (packages/server/src/index.ts)
- REST routes registered directly on fastify instance
- Pattern: `fastify.delete('/api/tasks', async (req, reply) => { ... })`
- Uses taskStore for data operations
- broadcast() function available from ws.js for WebSocket updates

### TaskStore (packages/mcp/src/store.ts)
- Existing methods: create(), list(), get(), update(), delete(), importTasks()
- importTasks() already clears tasks with `DELETE FROM tasks` (line 364)
- We'll add a new deleteAll() method using the same pattern

### Frontend (packages/web/src/App.tsx)
- Control bar located at lines 96-190
- Existing button pattern: button with onClick handler, inline styles
- Uses setTasks() from useTasks hook to update state
- Red/danger styling already used for "OFF" state buttons
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add deleteAll() method to TaskStore</name>
  <files>packages/mcp/src/store.ts</files>
  <action>
Add a deleteAll() method to the TaskStore class that clears all tasks and their dependencies from the database.

Implementation:
1. Add async deleteAll(): Promise<number> method after the existing delete() method (after line 335)
2. Use the same pattern as importTasks: execute DELETE FROM tasks (CASCADE handles dependencies)
3. Return the number of deleted tasks (rowsAffected)
4. Method should be ~5 lines of code

Code to add (after delete() method):
```typescript
/**
 * Clear all tasks from the database. CASCADE removes dependencies.
 * @returns number of tasks deleted
 */
async deleteAll(): Promise<number> {
  const db = await getDb();
  const result = await db.execute('DELETE FROM tasks');
  return result.rowsAffected ?? 0;
}
```
  </action>
  <verify>
Method exists in TaskStore class after delete() method
  </verify>
  <done>TaskStore has deleteAll() method that clears all tasks from database</done>
</task>

<task type="auto">
  <name>Task 2: Add DELETE /api/tasks endpoint</name>
  <files>packages/server/src/index.ts</files>
  <action>
Add a DELETE /api/tasks endpoint that clears all tasks from the database.

Implementation:
1. Add after the existing POST /api/chat endpoint (after line 44)
2. Import broadcast from './ws.js' if not already imported
3. Call taskStore.deleteAll()
4. Broadcast 'tasks' message via WebSocket to update all connected clients
5. Return success response with deleted count

Code to add (after POST /api/chat endpoint):
```typescript
fastify.delete('/api/tasks', async (_req, reply) => {
  const count = await taskStore.deleteAll();
  broadcast({ type: 'tasks', tasks: [] });
  return reply.send({ deleted: count });
});
```
  </action>
  <verify>Endpoint responds to DELETE /api/tasks with { deleted: N }</verify>
  <done>DELETE /api/tasks endpoint clears database and broadcasts empty tasks</done>
</task>

<task type="auto">
  <name>Task 3: Add Clear Database button to UI</name>
  <files>packages/web/src/App.tsx</files>
  <action>
Add a "Clear Database" button to the control bar that calls DELETE /api/tasks and updates local state.

Implementation:
1. Create handleClearDatabase callback using useCallback (after handleScrollToToday around line 84)
2. Fetch DELETE /api/tasks, handle errors, setTasks([]) on success
3. Add red button in control bar (after "Scroll to Today" button, before validation errors span, around line 177)

Code to add:

```typescript
// After handleScrollToToday (around line 84):
const handleClearDatabase = useCallback(async () => {
  if (!confirm('Are you sure you want to clear all tasks? This cannot be undone.')) return;
  try {
    const res = await fetch('/api/tasks', { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to clear database');
    setTasks([]);
  } catch (err) {
    alert(`Error clearing database: ${err}`);
  }
}, []);
```

Button JSX (add after "Scroll to Today" button, before validation errors):
```typescript
<button
  onClick={handleClearDatabase}
  style={{
    padding: '6px 12px',
    backgroundColor: '#ef4444',
    color: 'white',
    border: '1px solid #dc2626',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '13px',
    marginLeft: '8px'
  }}
>
  Clear Database
</button>
```
  </action>
  <verify>
Button visible in control bar with red styling, clicking it clears tasks and shows confirmation
  </verify>
  <done>Clear Database button in UI calls DELETE /api/tasks and updates task state</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>
    - TaskStore.deleteAll() method to clear all tasks
    - DELETE /api/tasks endpoint that clears database and broadcasts update
    - "Clear Database" button in the web UI control bar with confirmation dialog
  </what-built>
  <how-to-verify>
1. Start the server: cd packages/server && npm run dev
2. Start the web client: cd packages/web && npm run dev
3. Open browser to http://localhost:5173
4. Add some test tasks via AI chat or direct editing
5. Click the "Clear Database" button in the control bar
6. Confirm the dialog when prompted
7. Verify all tasks disappear from the Gantt chart
8. Refresh the page and verify tasks stay cleared
9. Check that chat messages are still visible (not cleared)
  </how-to-verify>
  <resume-signal>Type "approved" if tasks clear correctly, or describe issues</resume-signal>
</task>

</tasks>

<verification>
1. TaskStore.deleteAll() method exists in store.ts
2. DELETE /api/tasks endpoint exists and responds with { deleted: N }
3. Clear Database button is visible in control bar with red styling
4. Clicking button shows confirmation dialog
5. Confirming clears all tasks from UI and database
6. Tasks remain cleared after page refresh
7. Chat messages are preserved (not affected by clear operation)
8. No errors in browser console or server logs
</verification>

<success_criteria>
- User can clear all tasks with single button click
- Confirmation dialog prevents accidental deletion
- Database is cleared (tasks + dependencies via CASCADE)
- Gantt chart updates to empty state immediately
- Chat history is preserved
- No errors in browser console or server logs
</success_criteria>

<output>
After completion, create `.planning/quick/6-add-clear-db-button/6-SUMMARY.md`
</output>
