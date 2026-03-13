# Context: Refactor Task Save from Bulk to Individual

## Problem Summary

**Current Issue:** User actions (drag, indent, move) send ENTIRE task array to server, which deletes ALL tasks and recreates them. This causes:
- 500 errors on quick indent/outdent operations
- Lost changes during rapid sequential actions
- Unnecessary database load (delete + insert all tasks for one change)
- Poor scalability

## Current Architecture (BROKEN)

### Frontend: `packages/web/src/hooks/useAutoSave.ts`
```typescript
// Line 167: Sends ENTIRE tasks array
body: JSON.stringify(tasks)  // ALL tasks every time!
```

**Problem:** Every drag/indent sends all 7, 50, 500+ tasks...

### Server: `packages/server/src/index.ts`
```typescript
// Line 72-79: PUT /api/tasks
fastify.put('/api/tasks', { preHandler: [authMiddleware] }, async (req, reply) => {
  const tasks = req.body as unknown[];  // Receives ALL tasks
  const count = await taskService.importTasks(JSON.stringify(tasks), req.user!.projectId, 'manual-save');
  return reply.send({ saved: count });
});
```

### Service: `packages/mcp/src/services/task.service.ts`
```typescript
// Lines 423-454: importTasks - DELETES EVERYTHING then recreates
await this.prisma.$transaction(async (tx) => {
  // Delete existing tasks for project (cascades to dependencies)
  await tx.task.deleteMany({
    where: projectId ? { projectId } : {},
  });

  // Import all tasks in transaction
  for (const [index, task] of tasks.entries()) {
    await tx.task.create({ ... });  // Recreate all!
  }
});
```

**Problem:** Every user change = DELETE ALL + INSERT ALL

## Why This Causes Issues

1. **Race conditions:** Multiple simultaneous deletes/creates cause conflicts
2. **Lost changes:** Delete happens before new create - window of data loss
3. **500 errors:** Parent references may not exist during transaction
4. **Performance:** Deleting 500 tasks to update 1 is wasteful
5. **Scalability:** With 1000+ tasks, this will timeout

## Target Architecture

### Individual Task Operations

```
User drags task → Send ONLY changed task → Update single row
User indents task → Send ONLY changed task → Update single row + parentId
User deletes task → Send task ID → Delete single row
```

### API Changes Needed

**NEW: PATCH /api/tasks/:id**
```typescript
// Update single task
fastify.patch('/api/tasks/:id', { preHandler: [authMiddleware] }, async (req, reply) => {
  const taskId = req.params.id;
  const updates = req.body; // { name?, startDate?, endDate?, parentId?, progress? }
  const task = await taskService.update(taskId, updates, 'manual-save');
  return reply.send(task);
});
```

**NEW: POST /api/tasks**
```typescript
// Create single task
fastify.post('/api/tasks', { preHandler: [authMiddleware] }, async (req, reply) => {
  const input = req.body; // CreateTaskInput
  const task = await taskService.create(input, req.user!.projectId, 'manual-save');
  return reply.send(task);
});
```

**NEW: DELETE /api/tasks/:id**
```typescript
// Delete single task
fastify.delete('/api/tasks/:id', { preHandler: [authMiddleware] }, async (req, reply) => {
  const deleted = await taskService.delete(req.params.id, 'manual-save');
  return reply.send({ deleted });
});
```

**KEEP: PUT /api/tasks** (for bulk import/AI operations only)

### Frontend Changes

**New: `useTaskMutation` hook**
```typescript
// Track individual task changes
export function useTaskMutation() {
  const mutateTask = async (task: Task) => {
    const response = await fetch(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        name: task.name,
        startDate: task.startDate,
        endDate: task.endDate,
        parentId: task.parentId,
        progress: task.progress,
      }),
    });
    return response.json();
  };

  return { mutateTask };
}
```

**Update Gantt component to use individual mutations:**
- On drag end: Call `mutateTask(changedTask)` NOT `setTasks(allTasks)`
- On indent: Call `mutateTask(taskWithNewParentId)`
- Optimistic update: Update local state immediately, then mutate

### Database Operations

**Already exists in task.service.ts:**
- `create()` - Line 101 ✅ (uses transaction)
- `update()` - Line 224 ✅ (uses transaction)
- `delete()` - Line 306 ✅ (cascade delete)

**These methods are correct!** Just need proper API routing.

## Implementation Plan

### Phase Goals
1. Add individual task API endpoints (PATCH, POST, DELETE with :id)
2. Create `useTaskMutation` hook for individual operations
3. Update Gantt component to use individual mutations
4. Keep PUT /api/tasks for bulk/AI operations only
5. Remove WebSocket from user edits (keep for AI only)
6. Test: Quick indent/outdent works without 500
7. Test: Rapid drag operations work smoothly
8. Test: Page refresh shows correct state

### Files to Change
1. `packages/server/src/index.ts` - Add PATCH /api/tasks/:id, POST /api/tasks, DELETE /api/tasks/:id
2. `packages/web/src/hooks/useTaskMutation.ts` - NEW FILE (individual mutations)
3. `packages/web/src/components/Gantt.tsx` (or similar) - Use new hook
4. Keep `useAutoSave.ts` for fallback/bulk operations
5. `packages/web/src/App.tsx` - Remove WS handling for 'tasks' type (already done)

### Success Criteria
- [ ] Single task update sends 1 task, not all tasks
- [ ] Quick indent/outdent doesn't cause 500 errors
- [ ] Multiple rapid drags work smoothly
- [ ] Changes persist after page refresh
- [ ] No WebSocket echo issues (already fixed)
- [ ] AI agent still works via WebSocket
- [ ] Bulk import still works (PUT /api/tasks)

## Technical Notes

- taskService.update() already handles parent validation
- taskService.update() already handles circular dependency detection
- taskService.update() already runs scheduler for date recalculation
- Just need to expose via proper REST API
- Frontend needs optimistic updates for UX

## Related Issues
- Debug session: `.planning/debug/task-movement-not-saving.md`
- Related session: `new-project-state-reset-and-sidebar-count-desync.md`
