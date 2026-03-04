---
phase: quick-5
plan: 5
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/web/src/components/GanttChart.tsx
  - packages/web/src/App.tsx
  - packages/web/src/types.ts
autonomous: false
requirements: []
user_setup: []
must_haves:
  truths:
    - "Users can edit task names inline in the task list"
    - "Users can edit dependencies inline in the task list"
    - "Users can visually identify expired (overdue) tasks"
    - "Tasks can be locked to prevent editing"
    - "Dependency validation errors are displayed"
    - "Auto-schedule mode cascades task changes"
  artifacts:
    - path: "packages/web/src/types.ts"
      provides: "TypeScript interfaces matching gantt-lib API"
      contains: "accepted, locked, divider fields in Task interface"
    - path: "packages/web/src/components/GanttChart.tsx"
      provides: "GanttChart wrapper with all gantt-lib props"
      exports: "onValidateDependencies, enableAutoSchedule, disableTaskNameEditing, disableDependencyEditing, highlightExpiredTasks"
    - path: "packages/web/src/App.tsx"
      provides: "State management for validation and cascade"
      contains: "handleValidation, handleCascade, toggle functions for editing modes"
  key_links:
    - from: "GanttChart.tsx"
      to: "gantt-lib"
      via: "props forwarding"
      pattern: "GanttLibChart.*onValidateDependencies.*enableAutoSchedule"
    - from: "App.tsx"
      to: "GanttChart.tsx"
      via: "callback props"
      pattern: "onValidateDependencies.*onCascade"
---

<objective>
Add missing gantt-lib features to the web app, particularly dependency editing and validation capabilities.

Purpose: Enable full gantt-lib functionality including inline editing, dependency management, task locking, progress tracking, and auto-schedule mode as documented in the official reference.
Output: Enhanced Gantt chart with all major gantt-lib features enabled and configurable.
</objective>

<execution_context>
@D:/Projects/gantt-lib-mcp/.planning/STATE.md
@D:/Projects/gantt-lib-mcp/packages/web/src/components/GanttChart.tsx
@D:/Projects/gantt-lib-mcp/packages/web/src/App.tsx
@D:/Projects/gantt-lib-mcp/packages/web/src/types.ts
@https://raw.githubusercontent.com/simon100500/gantt-lib/master/docs/REFERENCE.md
</execution_context>

<context>
## Current State Analysis

**Already Implemented (from Phase 08):**
- Basic GanttChart component with drag-to-edit
- onChange handler wired to setTasks
- showTaskList enabled for inline editing
- Custom dayWidth, rowHeight, containerHeight

**Missing Features (from gantt-lib REFERENCE.md):**

1. **Task Properties** (types.ts needs updates):
   - `accepted?: boolean` - Controls progress bar color at 100% (green vs yellow)
   - `locked?: boolean` - Prevents drag/resize/edit
   - `divider?: 'top' | 'bottom'` - Visual grouping lines

2. **GanttChart Props** (GanttChart.tsx needs to forward):
   - `onValidateDependencies?: (result: ValidationResult) => void` - Shows dependency errors
   - `enableAutoSchedule?: boolean` - Cascade mode (predecessors drag successors)
   - `onCascade?: (tasks: Task[]) => void` - Handle cascade updates
   - `disableTaskNameEditing?: boolean` - Control name editing
   - `disableDependencyEditing?: boolean` - Control dependency editing
   - `highlightExpiredTasks?: boolean` - Show overdue tasks in red
   - `headerHeight?: number` - Control header height

3. **ValidationResult Types** (types.ts needs to add):
   ```typescript
   interface DependencyError {
     type: 'cycle' | 'constraint' | 'missing-task';
     taskId: string;
     message: string;
     relatedTaskIds?: string[];
   }

   interface ValidationResult {
     isValid: boolean;
     errors: DependencyError[];
   }
   ```

4. **App.tsx State Management**:
   - Track validation errors and display them
   - Handle onCascade for auto-schedule mode
   - Provide UI controls to toggle editing modes

## Key Implementation Notes from REFERENCE.md

**Dependency Editing (Section 14):**
- Dependencies column displays chips with SVG icons for link types (FS/SS/FF/SF)
- Click on a dependency chip to highlight the corresponding arrow on the chart
- Click the task number to scroll the chart to that task and highlight the row
- Use `disableDependencyEditing={true}` to globally disable dependency editing

**Auto-Schedule Modes (Section 13):**
| enableAutoSchedule | onCascade provided | Mode |
|---|---|---|
| false (default) | any | Soft/visual only - tasks move independently |
| true | no | Soft cascade - predecessors drag successors via onChange |
| true | yes | Hard cascade - onCascade fires, onChange does NOT fire |

**Expired Tasks (Section 14):**
- An expired task is one where today is within the task's date range AND progress is less than elapsed percentage
- Expired tasks render with `--gantt-expired-color` background (default: red #ef4444)
- The progress bar for expired tasks displays in a darker red color

**Progress Bar States (Section 14):**
| progress | accepted | Visual Result |
|---|---|---|
| undefined or 0 | any | No progress bar rendered |
| 1-99 | any | Partial progress bar |
| 100 | false/undefined | Full bar in yellow (#fbbf24) |
| 100 | true | Full bar in green (#22c55e) |

</context>

<tasks>

<task type="auto">
  <name>Task 1: Extend Task interface and add validation types</name>
  <files>packages/web/src/types.ts</files>
  <action>
Add missing fields to Task interface and new type definitions:

```typescript
export interface TaskDependency {
  taskId: string;
  type: 'FS' | 'SS' | 'FF' | 'SF';
  lag?: number;
}

export interface DependencyError {
  type: 'cycle' | 'constraint' | 'missing-task';
  taskId: string;
  message: string;
  relatedTaskIds?: string[];
}

export interface ValidationResult {
  isValid: boolean;
  errors: DependencyError[];
}

export interface Task {
  id: string;
  name: string;
  startDate: string | Date;
  endDate: string | Date;
  color?: string;
  progress?: number;
  accepted?: boolean;        // NEW: Controls progress bar color at 100%
  locked?: boolean;          // NEW: Prevents drag/resize/edit
  divider?: 'top' | 'bottom'; // NEW: Visual grouping lines
  dependencies?: TaskDependency[];
}
```

Do NOT modify existing TaskDependency interface - just add the new interfaces and extend Task.
  </action>
  <verify>
grep -n "accepted\|locked\|divider\|ValidationResult\|DependencyError" packages/web/src/types.ts
  </verify>
  <done>
Task interface has accepted, locked, divider fields.
ValidationResult and DependencyError types are exported.
Types match gantt-lib reference specification exactly.
  </done>
</task>

<task type="checkpoint:human-verify">
  <name>Task 2: Add gantt-lib props to GanttChart wrapper</name>
  <files>packages/web/src/components/GanttChart.tsx</files>
  <action>
Update GanttChartProps interface and component to forward all missing gantt-lib props:

1. Extend GanttChartProps interface with:
   - onValidateDependencies?: (result: ValidationResult) => void
   - enableAutoSchedule?: boolean
   - onCascade?: (tasks: Task[]) => void
   - disableTaskNameEditing?: boolean
   - disableDependencyEditing?: boolean
   - highlightExpiredTasks?: boolean
   - headerHeight?: number

2. Update component destructuring to include these new props

3. Forward all props to GanttLibChart

Note: showTaskList should be boolean (not string) - fix the type while adding new props.
  </action>
  <verify>
grep -n "onValidateDependencies\|enableAutoSchedule\|onCascade\|disableTaskNameEditing\|disableDependencyEditing\|highlightExpiredTasks" packages/web/src/components/GanttChart.tsx
  </verify>
  <done>
All gantt-lib props are forwarded through the wrapper.
showTaskList type corrected to boolean.
Component accepts all props documented in gantt-lib REFERENCE.md Section 6.
  </done>
</task>

<task type="checkpoint:human-verify">
  <name>Task 3: Add state management for validation, cascade, and UI controls</name>
  <files>packages/web/src/App.tsx</files>
  <action>
Add state handlers and UI controls for new gantt-lib features:

1. Import new types: ValidationResult, DependencyError

2. Add state for:
   - validationErrors: DependencyError[] (start empty)
   - enableAutoSchedule: boolean (default false)
   - disableTaskNameEditing: boolean (default false)
   - disableDependencyEditing: boolean (default false)
   - highlightExpiredTasks: boolean (default true - useful feature)

3. Add handleValidation callback:
   ```typescript
   const handleValidation = useCallback((result: ValidationResult) => {
     if (!result.isValid) {
       console.error('Dependency validation errors:', result.errors);
       // TODO: Display errors in UI (toast, status bar, etc.)
     }
   }, []);
   ```

4. Add handleCascade callback for auto-schedule mode:
   ```typescript
   const handleCascade = useCallback((shiftedTasks: Task[]) => {
     setTasks(prev => {
       const map = new Map(shiftedTasks.map(t => [t.id, t]));
       return prev.map(t => map.get(t.id) ?? t);
     });
   }, [setTasks]);
   ```

5. Add simple UI controls (buttons/toggles) for:
   - Toggle auto-schedule mode
   - Toggle expired tasks highlight
   - Toggle dependency editing
   - Toggle name editing
   - Scroll to today button (using ref)

6. Pass all new props to GanttChart:
   - onValidateDependencies={handleValidation}
   - enableAutoSchedule={enableAutoSchedule}
   - onCascade={handleCascade}
   - disableTaskNameEditing={disableTaskNameEditing}
   - disableDependencyEditing={disableDependencyEditing}
   - highlightExpiredTasks={highlightExpiredTasks}
   - headerHeight={40}

For the ganttRef, add:
```typescript
const ganttRef = useRef<{ scrollToToday: () => void; scrollToTask: (taskId: string) => void }>(null);
```

And pass ref prop to GanttChart (need to forward ref through wrapper).
  </action>
  <verify>
grep -n "handleValidation\|handleCascade\|enableAutoSchedule\|highlightExpiredTasks\|scrollToToday" packages/web/src/App.tsx
  </verify>
  <done>
State management added for validation, cascade, and feature toggles.
UI controls allow users to enable/disable editing modes.
Scroll to today button works via ganttRef.
Cascade mode properly updates tasks through handleCascade.
  </done>
</task>

</tasks>

<verification>
1. Build web package: cd packages/web && npm run build (no TypeScript errors)
2. Start dev server: npm run dev
3. Verify in browser:
   - Task list shows with inline editing enabled
   - Can click on task names to edit (when not disabled)
   - Can click on dependency chips to see them highlighted
   - Toggle buttons for auto-schedule, expired highlight, etc. work
   - Scroll to today button scrolls the chart
   - Console shows validation errors when creating invalid dependencies
4. Test drag operations with auto-schedule enabled vs disabled
5. Test expired task highlighting (create a task that should be overdue)
</verification>

<success_criteria>
- All gantt-lib props from REFERENCE.md Section 6 are available through the wrapper
- Task interface includes accepted, locked, divider fields
- ValidationResult and DependencyError types are properly defined
- Auto-schedule mode (cascade) works when enabled
- Dependency validation errors are logged and can be displayed
- UI controls allow toggling editing modes and features
- Scroll to today functionality works via ref
- No TypeScript build errors
- Features match gantt-lib 0.3.2 API specification
</success_criteria>

<output>
After completion, create `.planning/quick/5-https-github-com-simon100500-gantt-lib-b/5-SUMMARY.md` with:
- List of all added gantt-lib features
- Notes on any features deferred or requiring additional work
- Recommendations for UI improvements (better error display, etc.)
</output>
