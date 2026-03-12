# T04: 07-web-ui-with-real-time-gantt-editing-via-ai-dialogue 04

**Slice:** S07 — **Milestone:** M001

## Description

Build the Gantt chart rendering component for the web package. This plan focuses exclusively on task visualization — the chat sidebar and WebSocket wiring are added in plan 07-05.

Purpose: Users need to see their Gantt chart. This plan implements a working Gantt render using dhtmlx-gantt (the same library the project is built around — `gantt-lib` wraps it), with a data-fetching hook that loads tasks from the REST API.

Output:
- packages/web/src/types.ts — Task/TaskDependency interfaces matching the MCP package types
- packages/web/src/hooks/useTasks.ts — React hook for task state + fetch
- packages/web/src/components/GanttChart.tsx — Gantt chart using dhtmlx-gantt
- packages/web/src/App.tsx — Layout with GanttChart taking full viewport (sidebar slot for 07-05)

## Must-Haves

- [ ] "Gantt chart renders visually with at least one task bar on screen"
- [ ] "Task bars show name, span proportional to start/end dates on a timeline"
- [ ] "GET /api/tasks is called on mount and tasks are displayed"
- [ ] "Empty state message shown when no tasks exist"
- [ ] "Gantt updates when tasks prop changes (driven by WebSocket in 07-05)"

## Files

- `packages/web/src/App.tsx`
- `packages/web/src/components/GanttChart.tsx`
- `packages/web/src/hooks/useTasks.ts`
- `packages/web/src/types.ts`
- `packages/web/index.html`
- `packages/web/package.json`
