# T01: 08-integrate-gantt-lib-library 01

**Slice:** S08 — **Milestone:** M001

## Description

Install gantt-lib package and integrate it into the web package, replacing the placeholder GanttChart component with the actual gantt-lib React component.

Purpose: Replace the placeholder "Gantt chart coming soon" message with a working interactive Gantt chart that displays tasks, enables drag-to-edit, and syncs with WebSocket updates.

Output:
- packages/web/package.json — adds gantt-lib@0.1.1 dependency
- packages/web/src/main.tsx — adds critical CSS import
- packages/web/src/components/GanttChart.tsx — integrates gantt-lib's GanttChart component

## Must-Haves

- [ ] "gantt-lib package is installed in packages/web"
- [ ] "gantt-lib CSS is imported in main.tsx (CRITICAL - without this, nothing renders)"
- [ ] "GanttChart component uses gantt-lib's GanttChart instead of placeholder"
- [ ] "Component renders without TypeScript errors"
- [ ] "Tasks passed to GanttChart are displayed as task bars"

## Files

- `packages/web/package.json`
- `packages/web/src/main.tsx`
- `packages/web/src/components/GanttChart.tsx`
