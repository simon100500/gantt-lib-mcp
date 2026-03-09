---
phase: quick
plan: 18
subsystem: "Task Management UI"
tags: ["feature", "task-creation", "callbacks"]
dependency_graph:
  requires: []
  provides: ["manual-task-creation"]
  affects: ["GanttChart.tsx", "App.tsx"]
tech_stack:
  added: []
  patterns: ["callback-passthrough"]
key_files:
  created: []
  modified: ["packages/web/src/components/GanttChart.tsx", "packages/web/src/App.tsx"]
decisions: []
metrics:
  duration: "2 minutes"
  completed_date: "2025-01-09"
---

# Phase quick Plan 18: Enable Manual Task Creation Summary

**One-liner:** Added onAdd, onDelete, and onInsertAfter callbacks to enable gantt-lib's built-in manual task creation UI.

## Implementation Summary

The "Add Task" button in gantt-lib's TaskList component only appears when the `onAdd` callback is provided. This plan adds the missing task management callbacks to enable manual task creation through the UI.

### Changes Made

**1. Updated GanttChart.tsx (packages/web/src/components/GanttChart.tsx)**
   - Added `onAdd?: (newTask: Task) => void` to GanttChartProps interface
   - Added `onDelete?: (taskId: string) => void` to GanttChartProps interface
   - Added `onInsertAfter?: (taskId: string, newTask: Task) => void` to GanttChartProps interface
   - Passed through all three callbacks to the underlying GanttLibChart component

**2. Updated App.tsx (packages/web/src/App.tsx)**
   - Implemented `handleAddTask` callback: adds new task to the tasks array
   - Implemented `handleDeleteTask` callback: removes task by ID from tasks array
   - Implemented `handleInsertAfterTask` callback: inserts new task after specified task ID
   - Wired up all three callbacks to the GanttChart component props

### Callback Implementations

```typescript
// Add new task to the end of the list
const handleAddTask = useCallback((newTask: Task) => {
  setTasks(prev => [...prev, newTask]);
}, [setTasks]);

// Remove task by ID
const handleDeleteTask = useCallback((taskId: string) => {
  setTasks(prev => prev.filter(t => t.id !== taskId));
}, [setTasks]);

// Insert new task after a specific task
const handleInsertAfterTask = useCallback((taskId: string, newTask: Task) => {
  setTasks(prev => {
    const index = prev.findIndex(t => t.id === taskId);
    if (index === -1) return prev;
    const newTasks = [...prev];
    newTasks.splice(index + 1, 0, newTask);
    return newTasks;
  });
}, [setTasks]);
```

## Deviations from Plan

**None** - The implementation followed the user's clarification exactly. The plan's original task assumed no code changes were needed, but the user clarified that callbacks were required for the "Add Task" button to appear.

## Verification

**Build Status:** PASSED
- TypeScript compilation: Successful
- Vite build: Successful (2.36s)
- No type errors or build warnings

**Expected Behavior:**
1. "Add Task" button should now be visible in the task list panel header
2. Clicking the button adds a new editable task row
3. New tasks appear in the gantt chart immediately
4. Tasks persist via useAutoSave (authenticated) or localStorage (demo mode)
5. Delete and insert-after functionality works for task management

## Integration Points

- **State Management:** All callbacks use `setTasks` from `useTasks` or `useLocalTasks` hooks
- **Auto-save:** Changes trigger `useAutoSave` for authenticated users
- **Local Storage:** Demo mode saves to localStorage via `useLocalTasks`
- **Validation:** New tasks integrate with existing dependency validation system

## Technical Notes

- The gantt-lib library (v0.4.0) conditionally renders the "Add Task" button based on callback presence
- All three callbacks are optional, but `onAdd` is required for the button to appear
- Callback implementations use functional state updates to avoid stale closure issues
- The `onInsertAfter` callback includes bounds checking to prevent errors if task ID is not found

## Testing Recommendations

1. **Manual Task Creation:**
   - Start dev server: `cd packages/web && npm run dev`
   - Open http://localhost:5173
   - Ensure task list is visible (click "Показать задачи")
   - Look for "Add Task" button in task list header
   - Click button and create a new task
   - Verify task appears in both list and chart

2. **Task Deletion:**
   - Right-click or use task menu to delete a task
   - Verify task is removed from both list and chart
   - Check that dependencies are updated

3. **Task Insertion:**
   - Use insert-after functionality to add tasks in specific positions
   - Verify correct ordering in task list and chart

4. **Persistence:**
   - Test in both demo mode and authenticated mode
   - Refresh page and verify tasks persist
   - Check browser console for errors

## Commits

- **0026085:** feat(quick-018): add task management callbacks to GanttChart
  - Add onAdd, onDelete, onInsertAfter props to GanttChartProps interface
  - Pass through task management callbacks to gantt-lib GanttLibChart
  - Implement handleAddTask, handleDeleteTask, handleInsertAfterTask in App.tsx
  - Wire up callbacks to GanttChart component for manual task creation
