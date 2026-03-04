# Phase 08: Integrate gantt-lib library - Research

**Gathered:** 2026-03-04
**Status:** Ready for planning

---

## Overview

This phase involves integrating [gantt-lib](https://github.com/simon100500/gantt-lib) — a React Gantt chart component library created by the project author — into the web package to replace the current placeholder GanttChart component.

**Project context:** The `gantt-lib-mcp` project is a Model Context Protocol (MCP) server for Gantt chart management with a web UI for real-time AI-assisted editing. The web package currently uses a placeholder component that only displays "Gantt chart coming soon."

---

## Domain Knowledge

### What is gantt-lib?

gantt-lib is a lightweight React/Next.js Gantt chart component with drag-and-drop capabilities. It provides:

- Monthly grid with day headers
- Task bars positioned by start/end dates with customizable colors
- Drag-to-move and drag-to-resize functionality
- Today indicator (vertical red line)
- Progress bars with states (in-progress, completed, accepted)
- 60fps performance with 100+ tasks
- CSS variables for theming
- TypeScript-first design

### Package Identity

| Property | Value |
|---|---|
| Package name | `gantt-lib` |
| Version | `0.1.1` |
| NPM install | `npm install gantt-lib` |
| Peer dependencies | `react >= 18`, `react-dom >= 18` |
| **CSS import (REQUIRED)** | `import 'gantt-lib/styles.css'` |
| Main import | `import { GanttChart, type Task, type TaskDependency } from 'gantt-lib'` |

**Critical:** The CSS import MUST be a separate import line. Without it, task bars, grid lines, and layout will not render correctly.

---

## API Reference Summary

### Core Component: GanttChart

```typescript
interface GanttChartProps {
  tasks: Task[];
  dayWidth?: number;              // default: 40
  rowHeight?: number;             // default: 40
  headerHeight?: number;          // default: 40
  containerHeight?: number | string; // default: undefined (auto)
  onChange?: (tasks: Task[] | ((currentTasks: Task[]) => Task[])) => void;
  onValidateDependencies?: (result: ValidationResult) => void;
  enableAutoSchedule?: boolean;   // default: false
  disableConstraints?: boolean;   // default: false
  onCascade?: (tasks: Task[]) => void;
  showTaskList?: boolean;         // default: false
  taskListWidth?: number;         // default: 520
  disableTaskNameEditing?: boolean; // default: false
}
```

### Task Interface

```typescript
interface Task {
  id: string;                      // required, unique
  name: string;                    // required
  startDate: string | Date;        // ISO string 'YYYY-MM-DD' recommended
  endDate: string | Date;          // ISO string 'YYYY-MM-DD' recommended
  color?: string;                  // default: '#3b82f6'
  progress?: number;               // 0-100
  accepted?: boolean;              // only meaningful when progress === 100
  dependencies?: TaskDependency[];
  locked?: boolean;
  divider?: 'top' | 'bottom';
}
```

### TaskDependency Interface

```typescript
interface TaskDependency {
  taskId: string;                  // ID of the predecessor task
  type: 'FS' | 'SS' | 'FF' | 'SF';
  lag?: number;                    // default: 0
}
```

### Ref API

```typescript
interface GanttChartRef {
  scrollToToday: () => void;
}
```

---

## Current Project Structure

The project is a monorepo using npm workspaces:

```
packages/
  web/     — React + Vite frontend (placeholder GanttChart)
  server/  — Fastify + WebSocket backend
  mcp/     — MCP server with SQLite database
```

### Current Frontend State

**File:** `packages/web/src/components/GanttChart.tsx`

Currently just a placeholder that renders:
- Empty state message when `tasks.length === 0`
- Task count message when tasks exist

**Task Type:** `packages/web/src/types.ts`

```typescript
export interface Task {
  id: string;
  name: string;
  startDate: string;   // YYYY-MM-DD
  endDate: string;     // YYYY-MM-DD
  color?: string;
  progress?: number;
  dependencies?: TaskDependency[];
}

export interface TaskDependency {
  taskId: string;
  type: 'FS' | 'SS' | 'FF' | 'SF';
  lag?: number;
}
```

**Good news:** The existing `Task` interface already matches gantt-lib's interface!

### State Management

**File:** `packages/web/src/hooks/useTasks.ts`

- Fetches tasks from `/api/tasks` endpoint
- Provides `tasks`, `setTasks`, `loading`, `error`
- `setTasks` is exposed for `onChange` callbacks

**File:** `packages/web/src/App.tsx`

- Uses WebSocket for real-time updates
- Receives `ServerMessage` with type `'tasks'` to update task state
- WebSocket handler calls `setTasks(msg.tasks as Task[])`

---

## Integration Requirements

### 1. Package Installation

Add gantt-lib to the web package:

```bash
npm install gantt-lib -w packages/web
```

Or manually add to `packages/web/package.json`:

```json
{
  "dependencies": {
    "gantt-lib": "^0.1.1"
  }
}
```

### 2. CSS Import

CRITICAL: Add the CSS import to the entry point:

**File:** `packages/web/src/main.tsx`

```typescript
import 'gantt-lib/styles.css';
```

### 3. Component Replacement

**File:** `packages/web/src/components/GanttChart.tsx`

Replace placeholder with gantt-lib's GanttChart component.

Key considerations:
- Pass `setTasks` directly to `onChange` prop (library handles functional updaters)
- Handle `onValidateDependencies` for error reporting
- Consider `enableAutoSchedule` for cascade behavior
- Use `ref` for `scrollToToday()` functionality
- Handle empty state (gantt-lib renders calendar even with 0 tasks)

### 4. Sync with WebSocket

The WebSocket integration already works — when the server broadcasts task updates, `setTasks` is called and the component re-renders. No changes needed to WebSocket handling.

### 5. Optional Enhancements

Consider enabling:
- `showTaskList={true}` for left-side task table
- `onValidateDependencies` for error feedback to user
- `scrollToToday` button for navigation
- Custom CSS variables for theming

---

## Validation Architecture

### Dimension 1: Task CRUD
- Can I create a new task via chat and see it in the Gantt chart?
- Can I update a task date via chat and see it move in the chart?
- Can I delete a task via chat and see it disappear?

### Dimension 2: Drag Interactions
- Can I drag a task to move it?
- Can I resize a task by dragging edges?
- Do drag changes persist to the backend?

### Dimension 3: Dependencies
- Do dependency lines render correctly?
- Does dragging a predecessor cascade to successors (if enabled)?
- Are dependency errors reported?

### Dimension 4: Real-time Updates
- When another client updates a task via WebSocket, does the chart update?
- Does the chart maintain scroll position during updates?

### Dimension 5: Empty State
- Is the empty state user-friendly?
- Does the chart handle 0 tasks gracefully?

### Dimension 6: Responsiveness
- Does the chart fit within the viewport?
- Can users scroll/pan the chart?

---

## Technical Decisions

### Date Format

**Decision:** Use ISO strings (`'YYYY-MM-DD'`) for all dates.

**Rationale:**
- gantt-lib recommends ISO strings to avoid timezone issues
- All internal calculations are UTC
- Existing codebase already uses ISO format

### onChange Pattern

**Decision:** Pass `setTasks` directly to `onChange` prop.

**Rationale:**
- gantt-lib emits functional updaters to avoid stale closure bugs
- The library handles the `prev => next` pattern internally
- This is the recommended pattern in the REFERENCE.md

### Auto-Schedule

**Decision:** Start with `enableAutoSchedule={false}` (default), consider enabling in future phase.

**Rationale:**
- Simpler initial integration
- Can be toggled via prop later
- Requires `onCascade` handler when enabled

### Task List

**Decision:** Start with `showTaskList={false}` (default), consider enabling later.

**Rationale:**
- The chat sidebar provides alternative task management
- Can be enabled via prop for power users
- Affects layout (520px width)

### Container Height

**Decision:** Set `containerHeight="100%"` or leave undefined for auto.

**Rationale:**
- Chart should fill available space in main element
- Auto height adapts to content

---

## Potential Issues

### 1. CSS Import Missing

**Symptom:** Task bars, grid lines, and layout don't render.

**Solution:** Ensure `import 'gantt-lib/styles.css'` is in `main.tsx`.

### 2. Stale Closure Bugs

**Symptom:** Fast consecutive drags overwrite each other.

**Solution:** Use `onChange={setTasks}` pattern, not `onChange={(newTasks) => setTasks(newTasks)}`.

### 3. Date Format Issues

**Symptom:** Off-by-one day errors.

**Solution:** Always use ISO strings `'YYYY-MM-DD'`, not `Date` objects.

### 4. Empty State

**Symptom:** Chart shows empty calendar when no tasks exist.

**Solution:** Handle `tasks.length === 0` before rendering GanttChart, render friendly message.

### 5. WebSocket Updates

**Symptom:** Chart doesn't update when server broadcasts.

**Solution:** Ensure `setTasks` is called on WebSocket `'tasks'` message (already implemented in App.tsx).

---

## Minimal Working Example

```tsx
// packages/web/src/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import 'gantt-lib/styles.css'; // <-- REQUIRED

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

```tsx
// packages/web/src/components/GanttChart.tsx
import { GanttChart } from 'gantt-lib';
import type { Task } from '../types.ts';

interface GanttChartProps {
  tasks: Task[];
  onChange?: (tasks: Task[] | ((prev: Task[]) => Task[])) => void;
}

export function GanttChart({ tasks, onChange }: GanttChartProps) {
  if (tasks.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#888' }}>
        <p>No tasks yet. Start a conversation to create your Gantt chart.</p>
      </div>
    );
  }

  return (
    <GanttChart
      tasks={tasks}
      onChange={onChange}
      dayWidth={40}
      rowHeight={40}
      containerHeight="100%"
    />
  );
}
```

```tsx
// packages/web/src/App.tsx
// Update GanttChart usage to pass onChange
<GanttChart tasks={tasks} onChange={setTasks} />
```

---

## File Changes Summary

| File | Change |
|------|--------|
| `packages/web/package.json` | Add `gantt-lib` dependency |
| `packages/web/src/main.tsx` | Add `import 'gantt-lib/styles.css'` |
| `packages/web/src/components/GanttChart.tsx` | Replace with gantt-lib integration |
| `packages/web/src/App.tsx` | Pass `onChange={setTasks}` to GanttChart |

---

## Related Documentation

- [gantt-lib REFERENCE.md](https://github.com/simon100500/gantt-lib/blob/master/docs/REFERENCE.md)
- [gantt-lib README](https://github.com/simon100500/gantt-lib)
- [gantt-lib Demo](https://gantt-lib-demo.vercel.app/)

---

*Research completed: 2026-03-04*
*Phase: 08-integrate-gantt-lib-library*
