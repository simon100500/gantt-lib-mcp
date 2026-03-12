# S08: Integrate Gantt Lib Library

**Goal:** Install gantt-lib package and integrate it into the web package, replacing the placeholder GanttChart component with the actual gantt-lib React component.
**Demo:** Install gantt-lib package and integrate it into the web package, replacing the placeholder GanttChart component with the actual gantt-lib React component.

## Must-Haves


## Tasks

- [x] **T01: 08-integrate-gantt-lib-library 01**
  - Install gantt-lib package and integrate it into the web package, replacing the placeholder GanttChart component with the actual gantt-lib React component.

Purpose: Replace the placeholder "Gantt chart coming soon" message with a working interactive Gantt chart that displays tasks, enables drag-to-edit, and syncs with WebSocket updates.

Output:
- packages/web/package.json — adds gantt-lib@0.1.1 dependency
- packages/web/src/main.tsx — adds critical CSS import
- packages/web/src/components/GanttChart.tsx — integrates gantt-lib's GanttChart component
- [x] **T02: 08-integrate-gantt-lib-library 02**
  - Wire up the onChange handler to enable drag-to-edit persistence in the Gantt chart, and verify that both user interactions (drag/resize) and WebSocket updates work correctly together.

Purpose: Enable users to interactively edit tasks by dragging and resizing in the Gantt chart, with changes persisting to the React state. The onChange handler uses the recommended functional updater pattern to avoid stale closure bugs.

Output:
- packages/web/src/App.tsx — updated to pass onChange={setTasks} to GanttChart
- Manual verification of drag interactions and WebSocket sync

## Files Likely Touched

- `packages/web/package.json`
- `packages/web/src/main.tsx`
- `packages/web/src/components/GanttChart.tsx`
- `packages/web/src/App.tsx`
