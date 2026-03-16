---
phase: quick-batch-update
plan: 31
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/web/src/hooks/useAutoSave.ts
  - packages/web/src/hooks/useTaskMutation.ts
  - packages/web/src/App.tsx
autonomous: true
requirements:
  - QUICK-001
  - QUICK-002
  - QUICK-003

must_haves:
  truths:
    - "onTasksChange receives only changed tasks from gantt-lib"
    - "Individual task changes are sent to server via PATCH/POST/DELETE"
    - "Optimistic updates maintain UI responsiveness"
    - "Batch cascade operations are handled efficiently"
    - "useAutoSave is replaced with per-task mutation logic"
  artifacts:
    - path: "packages/web/src/hooks/useBatchTaskUpdate.ts"
      provides: "Batch task update hook for handling gantt-lib onChange"
      exports: ["useBatchTaskUpdate"]
    - path: "packages/web/src/App.tsx"
      provides: "Updated app using batch update pattern"
      contains: "useBatchTaskUpdate"
  key_links:
    - from: "packages/web/src/App.tsx"
      to: "packages/web/src/hooks/useBatchTaskUpdate.ts"
      via: "import useBatchTaskUpdate"
      pattern: "useBatchTaskUpdate"
    - from: "packages/web/src/hooks/useBatchTaskUpdate.ts"
      to: "/api/tasks"
      via: "fetch with individual task mutations"
      pattern: "fetch.*api/tasks"
---

## Objective

Update the web application to handle gantt-lib's `onTasksChange` callback correctly according to the batch task principle documented in REFERENCE.md section 12. The library sends ONLY changed tasks, not the full array. The app should process these changes via individual API mutations with optimistic updates.

**Purpose:** Fix the current implementation where useAutoSave sends ALL tasks on every change, causing unnecessary server load and potential race conditions.

**Output:** A new `useBatchTaskUpdate` hook that handles gantt-lib's onChange events correctly with individual task mutations.

## Context

@D:/Projects/gantt-lib/docs/REFERENCE.md (Section 12: onTasksChange Pattern)

Current implementation issues:
1. `useAutoSave` sends ALL tasks via PUT /api/tasks on every change
2. Does not leverage gantt-lib's partial update behavior (only changed tasks)
3. Individual task mutations exist (useTaskMutation) but are not integrated with onChange

From REFERENCE.md section 12:
- `onTasksChange` receives ONLY the changed tasks
- Single task changes are delivered as single-element array
- Correct pattern: merge changed tasks into state using Map
- For REST API: iterate tasks and call individual endpoints
- For batch REST API: send all changed tasks in one request

## Tasks

### Task 1: Create useBatchTaskUpdate hook

**Files:** `packages/web/src/hooks/useBatchTaskUpdate.ts`

**Action:**
Create a new hook that handles gantt-lib's `onTasksChange` callback with proper batch processing:

```typescript
import { useCallback } from 'react';
import type { Task, TaskDependency } from '../types';
import { useTaskMutation } from './useTaskMutation';

export interface UseBatchTaskUpdateOptions {
  tasks: Task[];
  setTasks: (tasks: Task[] | ((prev: Task[]) => Task[])) => void;
  accessToken: string | null;
  onCascade?: (tasks: Task[]) => void;
}

export function useBatchTaskUpdate({
  tasks,
  setTasks,
  accessToken,
  onCascade,
}: UseBatchTaskUpdateOptions) {
  const { mutateTask, createTask, deleteTask } = useTaskMutation(accessToken);

  const handleTasksChange = useCallback(async (changedTasks: Task[]) => {
    // Optimistic update: merge changed tasks into state immediately
    const changedMap = new Map(changedTasks.map(t => [t.id, t]));
    setTasks(prev => prev.map(t => changedMap.get(t.id) ?? t));

    // Server update: send each changed task to server
    // For cascade operations, all tasks are already in changedTasks array
    for (const task of changedTasks) {
      try {
        await mutateTask(task);
      } catch (error) {
        console.error(`[useBatchTaskUpdate] Failed to update task ${task.id}:`, error);
        // On error, you might want to revert the optimistic update
        // For now, we log and continue
      }
    }
  }, [setTasks, mutateTask]);

  const handleAdd = useCallback(async (task: Task) => {
    // Optimistic update
    setTasks(prev => [...prev, task]);

    // Server update
    try {
      const created = await createTask({
        name: task.name,
        startDate: typeof task.startDate === 'string' ? task.startDate : task.startDate.toISOString().split('T')[0],
        endDate: typeof task.endDate === 'string' ? task.endDate : task.endDate.toISOString().split('T')[0],
        color: task.color,
        parentId: task.parentId,
        progress: task.progress,
        dependencies: task.dependencies,
      });

      // Replace optimistic task with server response
      setTasks(prev => prev.map(t => t.id === task.id ? created : t));
    } catch (error) {
      console.error('[useBatchTaskUpdate] Failed to create task:', error);
      // Revert optimistic update on error
      setTasks(prev => prev.filter(t => t.id !== task.id));
    }
  }, [setTasks, createTask]);

  const handleDelete = useCallback(async (taskId: string) => {
    // Optimistic update
    const taskToDelete = tasks.find(t => t.id === taskId);
    setTasks(prev => prev.filter(t => t.id !== taskId));

    // Server update
    try {
      await deleteTask(taskId);
    } catch (error) {
      console.error('[useBatchTaskUpdate] Failed to delete task:', error);
      // Revert optimistic update on error
      if (taskToDelete) {
        setTasks(prev => [...prev, taskToDelete]);
      }
    }
  }, [tasks, setTasks, deleteTask]);

  const handleInsertAfter = useCallback(async (taskId: string, newTask: Task) => {
    // Optimistic update
    setTasks(prev => {
      const index = prev.findIndex(t => t.id === taskId);
      if (index === -1) return prev;
      const newTasks = [...prev];
      newTasks.splice(index + 1, 0, newTask);
      return newTasks;
    });

    // Server update
    try {
      const created = await createTask({
        name: newTask.name,
        startDate: typeof newTask.startDate === 'string' ? newTask.startDate : newTask.startDate.toISOString().split('T')[0],
        endDate: typeof newTask.endDate === 'string' ? newTask.endDate : newTask.endDate.toISOString().split('T')[0],
        color: newTask.color,
        parentId: newTask.parentId,
        progress: newTask.progress,
        dependencies: newTask.dependencies,
      });

      // Replace optimistic task with server response
      setTasks(prev => prev.map(t => t.id === newTask.id ? created : t));
    } catch (error) {
      console.error('[useBatchTaskUpdate] Failed to insert task:', error);
      // Revert optimistic update on error
      setTasks(prev => prev.filter(t => t.id !== newTask.id));
    }
  }, [setTasks, createTask]);

  const handleReorder = useCallback((reorderedTasks: Task[], movedTaskId?: string, inferredParentId?: string) => {
    // Update parentId if provided
    if (movedTaskId && inferredParentId !== undefined) {
      const updated = reorderedTasks.map(t =>
        t.id === movedTaskId
          ? { ...t, parentId: inferredParentId || undefined }
          : t
      );
      setTasks(updated);

      // Send server update for moved task
      const movedTask = updated.find(t => t.id === movedTaskId);
      if (movedTask) {
        mutateTask(movedTask).catch(error => {
          console.error(`[useBatchTaskUpdate] Failed to update task ${movedTaskId}:`, error);
        });
      }
    } else {
      setTasks(reorderedTasks);
    }
  }, [setTasks, mutateTask]);

  const handlePromoteTask = useCallback(async (taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task || !task.parentId) return;

    // Optimistic update: remove parentId and move after last sibling
    setTasks(currentTasks => {
      const parentId = task.parentId!;
      const siblings = currentTasks.filter(t => t.parentId === parentId);

      if (siblings.length <= 1) {
        return currentTasks.map(t => t.id === taskId ? { ...t, parentId: undefined } : t);
      }

      const lastSiblingIndex = currentTasks
        .map((t, i) => ({ task: t, index: i }))
        .filter(({ task }) => task.parentId === parentId)
        .sort((a, b) => b.index - a.index)[0];

      if (!lastSiblingIndex) return currentTasks;

      const withoutPromoted = currentTasks.filter(t => t.id !== taskId);
      const insertIndex = lastSiblingIndex.index + 1;
      const promotedTask = { ...task, parentId: undefined };

      return [
        ...withoutPromoted.slice(0, insertIndex),
        promotedTask,
        ...withoutPromoted.slice(insertIndex)
      ];
    });

    // Server update
    try {
      await mutateTask({ ...task, parentId: undefined });
    } catch (error) {
      console.error('[useBatchTaskUpdate] Failed to promote task:', error);
      // Revert on error
      setTasks(currentTasks => currentTasks.map(t => t.id === taskId ? task : t));
    }
  }, [tasks, setTasks, mutateTask]);

  const handleDemoteTask = useCallback(async (taskId: string, newParentId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    // Optimistic update: set parentId
    setTasks(currentTasks =>
      currentTasks.map(t =>
        t.id === taskId ? { ...t, parentId: newParentId } : t
      )
    );

    // Server update
    try {
      await mutateTask({ ...task, parentId: newParentId });
    } catch (error) {
      console.error('[useBatchTaskUpdate] Failed to demote task:', error);
      // Revert on error
      setTasks(currentTasks => currentTasks.map(t => t.id === taskId ? task : t));
    }
  }, [tasks, setTasks, mutateTask]);

  return {
    handleTasksChange,
    handleAdd,
    handleDelete,
    handleInsertAfter,
    handleReorder,
    handlePromoteTask,
    handleDemoteTask,
  };
}
```

**Verify:** File exists at `packages/web/src/hooks/useBatchTaskUpdate.ts` with exported `useBatchTaskUpdate` function

**Done:** Hook created with all required handlers (onChange, add, delete, insertAfter, reorder, promote, demote)

---

### Task 2: Update App.tsx to use useBatchTaskUpdate

**Files:** `packages/web/src/App.tsx`

**Action:**
Replace `useAutoSave` with `useBatchTaskUpdate` and update the GanttChart props:

1. Remove `useAutoSave` import and usage
2. Add `useBatchTaskUpdate` import
3. Replace the autoSave logic with batch update handlers
4. Update GanttChart component props to use the new handlers

Key changes:
- Remove `useAutoSave` hook call
- Add `useBatchTaskUpdate` hook call with tasks, setTasks, accessToken
- Use returned handlers in GanttChart props
- Keep useTaskMutation for direct AI agent operations

**Verify:** App.tsx compiles without errors and uses `useBatchTaskUpdate` instead of `useAutoSave`

**Done:** GanttChart onChange events are handled via individual task mutations with optimistic updates

---

### Task 3: Remove or deprecate useAutoSave

**Files:** `packages/web/src/hooks/useAutoSave.ts` (optional cleanup)

**Action:**
Since `useAutoSave` is no longer needed for task updates (replaced by `useBatchTaskUpdate`), you can either:
1. Delete the file entirely, OR
2. Add a deprecation notice at the top

Recommended: Add deprecation notice for now, remove in future cleanup:

```typescript
/**
 * @deprecated This hook is deprecated. Use useBatchTaskUpdate instead.
 * useAutoSave sent ALL tasks on every change, which was inefficient.
 * useBatchTaskUpdate properly handles gantt-lib's partial onChange behavior.
 */
```

**Verify:** File updated with deprecation notice OR file deleted

**Done:** Legacy useAutoSave hook marked as deprecated

---

## Verification

1. Compile the web package: `npm run build --workspace=packages/web`
2. Check that no TypeScript errors exist
3. Verify that GanttChart props match the expected handlers
4. Test that onChange events trigger individual API calls, not full array updates

## Success Criteria

- [x] `useBatchTaskUpdate` hook created with all required handlers
- [x] App.tsx uses new hook instead of useAutoSave
- [x] GanttChart onChange events trigger PATCH/POST/DELETE per task
- [x] Optimistic updates maintain UI responsiveness
- [x] useAutoSave deprecated or removed
- [x] No compilation errors
- [x] Code follows REFERENCE.md section 12 patterns

## Output

After completion, the web application will correctly handle gantt-lib's batch update pattern, sending only changed tasks to the server via individual mutations with optimistic updates.
