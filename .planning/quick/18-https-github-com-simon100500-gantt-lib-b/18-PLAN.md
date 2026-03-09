---
phase: quick
plan: 18
type: execute
wave: 1
depends_on: []
files_modified: []
autonomous: true
requirements: []
user_setup: []
must_haves:
  truths:
    - "User can add tasks manually through the gantt chart interface"
    - "Add task button is visible in the task list panel"
    - "New task appears in the chart after creation"
    - "Task creation works in both authenticated and demo modes"
  artifacts:
    - path: "packages/web/src/components/GanttChart.tsx"
      provides: "Gantt chart wrapper with task creation support"
      exports: ["GanttChart"]
    - path: "packages/web/src/App.tsx"
      provides: "Main app with task creation enabled"
  key_links:
    - from: "App.tsx"
      to: "GanttChart.tsx"
      via: "props passthrough"
      pattern: "GanttChart.*props"
---

## Objective

Enable manual task creation functionality using gantt-lib's built-in task list features. According to the updated documentation (version 0.3.2+), gantt-lib now supports adding tasks directly through the task list UI when `showTaskList={true}` is enabled.

**Purpose**: Allow users to manually create tasks without using AI chat
**Output**: Working task creation button in the task list panel

## Context

@packages/web/src/components/GanttChart.tsx
@packages/web/src/App.tsx
@packages/web/src/types.ts
@packages/web/package.json

## Background

From the gantt-lib reference documentation (version 0.3.2+):
- The library now includes built-in task creation UI in the task list
- When `showTaskList={true}`, an "Add Task" button is automatically rendered
- Task list supports inline editing for name, dates, and dependencies
- The current implementation already has `showTaskList` as a toggleable feature

**Current State**:
- `showTaskList` is already implemented and toggleable (line 83 in App.tsx)
- Task list panel is displayed with width 650px
- Inline editing is already enabled (`disableTaskNameEditing={false}`, `disableDependencyEditing={false}`)

**What's Needed**:
- Verify the gantt-lib version supports task creation (current: 0.4.0)
- Ensure the task creation button is visible and functional
- Test that new tasks integrate properly with existing state management

## Tasks

<task type="auto">
  <name>Task 1: Verify and document task creation functionality</name>
  <files>packages/web/src/components/GanttChart.tsx, packages/web/src/App.tsx</files>
  <action>
    1. Verify gantt-lib version (0.4.0) includes task creation features
    2. Confirm that `showTaskList={true}` enables the built-in "Add Task" button
    3. Test task creation flow:
       - Click "Add Task" button in task list
       - New task row appears with editable fields
       - Fill in task details (name, dates)
       - Task appears in gantt chart
    4. Verify integration with existing state management:
       - New tasks trigger `onChange` callback
       - Tasks are saved via useAutoSave (authenticated) or localStorage (demo)
       - No conflicts with AI-generated tasks
    5. Check that all Task interface fields are supported:
       - Required: id, name, startDate, endDate
       - Optional: color, progress, accepted, dependencies, locked, divider

    Note: According to gantt-lib docs, task creation is built-in when showTaskList=true. No code changes should be needed - just verification that it works with current implementation.
  </action>
  <verify>
    <automated>
      npm run dev
      # Then manually test:
      # 1. Open app at http://localhost:5173
      # 2. Ensure task list is visible (click "Показать задачи" if hidden)
      # 3. Look for "Add Task" button in task list header
      # 4. Click button and create a new task
      # 5. Verify task appears in both list and chart
    </automated>
  </verify>
  <done>
    - Task creation button is visible in task list panel
    - New tasks can be created and appear in the chart
    - Created tasks persist (saved to server or localStorage)
    - No console errors during task creation
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>Manual task creation functionality enabled through gantt-lib's built-in task list UI</what-built>
  <how-to-verify>
    1. Start the dev server: `cd packages/web && npm run dev`
    2. Open http://localhost:5173 in your browser
    3. Ensure the task list is visible (click "Показать задачи" button if hidden)
    4. Look for an "Add Task" or "+" button in the task list panel header
    5. Click the button to add a new task
    6. Fill in the task details:
       - Enter a task name (e.g., "New Task")
       - Set start date (e.g., today's date)
       - Set end date (e.g., tomorrow)
    7. Press Enter or click away to save
    8. Verify the task appears in the gantt chart
    9. Try in both demo mode and authenticated mode
    10. Check browser console for any errors

    Expected behavior:
    - "Add Task" button is visible in task list header
    - Clicking adds a new editable row to the task list
    - New task appears in the gantt chart immediately
    - Task persists after page refresh (localStorage in demo, server in authenticated mode)
    - No console errors
  </how-to-verify>
  <resume-signal>Type "approved" if task creation works, or describe any issues you encountered</resume-signal>
</task>

## Verification

- Task creation button is visible and accessible
- New tasks integrate with existing state management
- Works in both authenticated and demo modes
- No conflicts with AI-generated tasks
- Changes persist correctly

## Success Criteria

- Users can manually add tasks through the UI without using AI chat
- Task creation is intuitive and follows the same patterns as task editing
- Created tasks are fully functional (can be edited, moved, resized, have dependencies)
- No code changes were needed (leveraging built-in gantt-lib functionality)

## Output

After completion, create `.planning/quick/18-https-github-com-simon100500-gantt-lib-b/18-SUMMARY.md` with:
- Confirmation that task creation works
- Any issues found and how they were resolved
- Notes on the user experience
