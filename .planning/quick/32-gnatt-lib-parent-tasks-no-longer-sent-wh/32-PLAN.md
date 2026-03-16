---
phase: 32-gnatt-lib-parent-tasks-no-longer-sent-wh
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/web/package.json
  - packages/web/src/hooks/useBatchTaskUpdate.ts
  - packages/mcp/src/services/task.service.ts
autonomous: true
requirements: []
user_setup: []
must_haves:
  truths:
    - "gantt-lib updated to version 0.10.0 with parent task fixes"
    - "Parent tasks no longer sent when children change in onCascade"
    - "Backend computes parent dates from children when needed"
    - "Child move sends only the child task"
    - "Parent move sends only children with delta (not parent itself)"
    - "Demotion computes dates from children, not from parent"
  artifacts:
    - path: "packages/web/package.json"
      provides: "Updated gantt-lib dependency to 0.10.0"
      contains: '"gantt-lib": "^0.10.0"'
    - path: "packages/web/src/hooks/useBatchTaskUpdate.ts"
      provides: "Updated batch update logic to handle parent task changes"
      min_lines: 50
    - path: "packages/mcp/src/services/task.service.ts"
      provides: "Backend parent date computation from children"
      exports: ["batchUpdateTasks", "update"]
  key_links:
    - from: "packages/web/src/hooks/useBatchTaskUpdate.ts"
      to: "/api/tasks (PUT)"
      via: "fetch with only changed tasks (no parent when children change)"
      pattern: "batchImportTasks.*changedTasks"
    - from: "packages/mcp/src/services/task.service.ts"
      to: "Database"
      via: "Parent date computation from children"
      pattern: "computeParentDates|children.*min.*max"
---

<objective>
Update gantt-lib to version 0.10.0 and adapt the application to handle the new parent task behavior where parent tasks are no longer sent when children change.

Purpose: Apply important gantt-lib fix that prevents parent tasks from being sent unnecessarily when children change, reducing redundant data transfer and ensuring parent dates are computed on the backend.

Output: Updated gantt-lib dependency, modified batch update logic to filter out parent tasks when they are included with children changes, and backend computation of parent dates from children.
</objective>

<execution_context>
@C:/Users/Volobuev/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Volobuev/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@packages/web/package.json
@packages/web/src/hooks/useBatchTaskUpdate.ts
@packages/mcp/src/services/task.service.ts
@packages/server/src/index.ts

# Current gantt-lib version
The project currently uses gantt-lib version 0.9.1. The latest version 0.10.0 includes important fixes for parent task handling.

# Current behavior (0.9.1)
- When children change, parent tasks are also included in the onTasksChange callback
- Parent dates may be sent from the frontend
- Demotion uses parent dates for the child

# New behavior (0.10.0)
- Parent tasks are NOT sent when children change (only children are sent)
- Parent dates should be computed on backend from children
- Child move sends only the child task
- Parent move sends only children with new delta
- Demotion computes dates from children, not from parent
</context>

<tasks>

<task type="auto">
  <name>Task 1: Update gantt-lib to version 0.10.0</name>
  <files>packages/web/package.json</files>
  <action>
    Update the gantt-lib dependency from 0.9.1 to 0.10.0 in packages/web/package.json:
    1. Change "gantt-lib": "^0.9.1" to "gantt-lib": "^0.10.0"
    2. Run npm install to update the package

    This update includes the fix where parent tasks are no longer sent when children change.
  </action>
  <verify>
    <automated>cd "D:\Projects\gantt-lib-mcp\packages\web" && npm list gantt-lib</automated>
  </verify>
  <done>gantt-lib updated to version 0.10.0 in package.json and node_modules</done>
</task>

<task type="auto">
  <name>Task 2: Update batch update logic to handle new parent task behavior</name>
  <files>packages/web/src/hooks/useBatchTaskUpdate.ts</files>
  <action>
    Modify the handleTasksChange function in useBatchTaskUpdate.ts to filter out parent tasks when they are included with children changes:

    1. Add a helper function to identify parent tasks:
    ```typescript
    // Filter out parent tasks when children are also in the batch
    // gantt-lib 0.10.0 no longer sends parents with children, but we handle both cases
    const filterParentTasks = (tasks: Task[]): Task[] => {
      const taskIds = new Set(tasks.map(t => t.id));
      return tasks.filter(task => {
        // Keep task if it has no parentId or if its parent is not in the batch
        return !task.parentId || !taskIds.has(task.parentId);
      });
    };
    ```

    2. Apply the filter in handleTasksChange before the optimistic update:
    ```typescript
    // Filter out parent tasks when children are also changing (gantt-lib 0.10.0 compatibility)
    const filteredTasks = filterParentTasks(changedTasks);
    const changedMap = new Map(filteredTasks.map(t => [t.id, t]));
    ```

    3. Log the filtering for debugging:
    ```typescript
    if (changedTasks.length !== filteredTasks.length) {
      console.log(`[useBatchTaskUpdate] Filtered out ${changedTasks.length - filteredTasks.length} parent tasks`);
    }
    ```

    4. Use filteredTasks for all subsequent operations (optimistic update and server update)
  </action>
  <verify>
    <automated>grep -n "filterParentTasks\|Filter out parent tasks" "D:\Projects\gantt-lib-mcp\packages\web\src\hooks\useBatchTaskUpdate.ts"</automated>
  </verify>
  <done>Parent tasks are filtered out when children are also in the batch, reducing redundant API calls</done>
</task>

<task type="auto">
  <name>Task 3: Add backend parent date computation from children</name>
  <files>packages/mcp/src/services/task.service.ts</files>
  <action>
    Add a method to compute parent task dates from children in task.service.ts:

    1. Add a private method to compute parent dates:
    ```typescript
    // Helper: Compute parent task dates from its children
    private async computeParentDates(parentId: string, projectId?: string): Promise<{ startDate: Date; endDate: Date } | null> {
      const children = await this.prisma.task.findMany({
        where: { parentId },
        select: { startDate: true, endDate: true },
      });

      if (children.length === 0) {
        return null;
      }

      // Parent start = min of children starts
      // Parent end = max of children ends
      const startDate = new Date(Math.min(...children.map(c => c.startDate.getTime())));
      const endDate = new Date(Math.max(...children.map(c => c.endDate.getTime())));

      return { startDate, endDate };
    }
    ```

    2. Modify the update method to recompute parent dates when a child is updated:
    ```typescript
    // After updating a task, recompute parent dates if this is a child task
    if (updatedTask.parentId) {
      const parentDates = await this.computeParentDates(updatedTask.parentId, projectId);
      if (parentDates) {
        await this.prisma.task.update({
          where: { id: updatedTask.parentId },
          data: {
            startDate: parentDates.startDate,
            endDate: parentDates.endDate,
          },
        });
      }
    }
    ```

    3. Add similar logic to batchUpdateTasks to recompute all affected parents:
    ```typescript
    // After batch update, recompute parent dates for all affected parents
    const affectedParentIds = new Set<string>();
    for (const task of tasks) {
      if (task.parentId) {
        affectedParentIds.add(task.parentId);
      }
    }

    for (const parentId of affectedParentIds) {
      const parentDates = await this.computeParentDates(parentId, projectId);
      if (parentDates) {
        await this.prisma.task.update({
          where: { id: parentId },
          data: {
            startDate: parentDates.startDate,
            endDate: parentDates.endDate,
          },
        });
      }
    }
    ```
  </action>
  <verify>
    <automated>grep -n "computeParentDates" "D:\Projects\gantt-lib-mcp\packages\mcp\src\services\task.service.ts"</automated>
  </verify>
  <done>Parent task dates are automatically computed from children on the backend when children are updated</done>
</task>

</tasks>

<verification>
1. gantt-lib version is 0.10.0 in package.json and npm list
2. Parent tasks are filtered out when children are also in the batch
3. Backend computes parent dates from children when children are updated
4. No parent tasks are sent unnecessarily in onCascade events
5. Test by dragging a child task and verify only the child is sent to the API
6. Test by dragging a parent task and verify only children are sent to the API
</verification>

<success_criteria>
- gantt-lib updated to 0.10.0
- Parent task filtering implemented in useBatchTaskUpdate
- Backend parent date computation implemented in TaskService
- All changes committed to git
- Application builds without errors
</success_criteria>

<output>
After completion, create `.planning/quick/32-gnatt-lib-parent-tasks-no-longer-sent-wh/32-01-SUMMARY.md`
</output>
