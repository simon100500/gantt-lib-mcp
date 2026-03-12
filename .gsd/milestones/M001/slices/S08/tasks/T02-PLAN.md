# T02: 08-integrate-gantt-lib-library 02

**Slice:** S08 — **Milestone:** M001

## Description

Wire up the onChange handler to enable drag-to-edit persistence in the Gantt chart, and verify that both user interactions (drag/resize) and WebSocket updates work correctly together.

Purpose: Enable users to interactively edit tasks by dragging and resizing in the Gantt chart, with changes persisting to the React state. The onChange handler uses the recommended functional updater pattern to avoid stale closure bugs.

Output:
- packages/web/src/App.tsx — updated to pass onChange={setTasks} to GanttChart
- Manual verification of drag interactions and WebSocket sync

## Must-Haves

- [ ] "onChange handler is passed from App.tsx to GanttChart component"
- [ ] "Dragging a task bar updates the task state"
- [ ] "Resizing a task by dragging edges updates the task dates"
- [ ] "Changes made via drag operations persist across re-renders"
- [ ] "WebSocket task updates still sync correctly with the chart"

## Files

- `packages/web/src/App.tsx`
