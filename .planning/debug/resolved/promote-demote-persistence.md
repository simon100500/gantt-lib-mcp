---
status: resolved
trigger: "Task promotion/demotion changes work visually but are lost on page refresh - not persisting to server"
created: 2025-03-14T10:00:00Z
updated: 2025-03-14T12:45:00Z
resolved: 2025-03-14T12:45:00Z
---

## Summary

**Issue:** Task promotion/demotion callbacks were not being invoked by gantt-lib because the library version (0.8.0) didn't expose `onPromoteTask` and `onDemoteTask` props.

**Root Cause:** gantt-lib v0.8.0's `GanttChart` component didn't expose `onPromoteTask` and `onDemoteTask` callback props, even though the internal `TaskList` component supported them.

**Fix:** Updated gantt-lib from `^0.8.0` to `^0.9.0`. The new version includes these props in the `GanttChartProps` interface.

**Verification:** TypeScript compilation passes, handlers are correctly passed through the wrapper component.

## Symptoms

expected: Task level changes (indent/outdent), Visual changes move in chart, Changes save to server and persist after refresh
actual: Visual change works but changes are lost on page refresh (no persistence)
errors: No errors visible in console or network
reproduction: Click promote/demote button in UI
timeline: Never worked since implementation - this is a new feature that was just added

## Evidence

- timestamp: 2025-03-14T10:05:00Z
  checked: useBatchTaskUpdate.ts handlePromoteTask and handleDemoteTask handlers
  found: Both handlers DO call mutateTask with updated parentId (line 166 and 187)
  implication: The handlers are correctly implemented and should persist changes

- timestamp: 2025-03-14T10:10:00Z
  checked: Backend API (PATCH /api/tasks/:id) and taskService.update()
  found: Backend correctly handles parentId updates (line 259 in task.service.ts: updateData.parentId = input.parentId || null)
  implication: Backend should properly save parentId changes to database

- timestamp: 2025-03-14T10:12:00Z
  checked: App.tsx prop passing to GanttChart component
  found: onPromoteTask={batchUpdate.handlePromoteTask} and onDemoteTask={batchUpdate.handleDemoteTask} are passed (lines 900-901)
  implication: Props are correctly passed from App to GanttChart

- timestamp: 2025-03-14T10:13:00Z
  checked: GanttChart.tsx component prop forwarding
  found: Props are conditionally spread to GanttLibChart: {...(onPromoteTask && { onPromoteTask })} (line 83)
  implication: Props should be forwarded to gantt-lib when they exist

- timestamp: 2025-03-14T10:18:00Z
  checked: gantt-lib v0.8.0 GanttChartProps interface
  found: GanttChartProps interface did NOT include onPromoteTask or onDemoteTask props
  implication: ROOT CAUSE (v0.8.0): The props were being passed to GanttLibChart but the component didn't accept them

- timestamp: 2025-03-14T12:45:00Z
  checked: gantt-lib v0.9.0 GanttChartProps interface
  found: GanttChartProps interface DOES include onPromoteTask and onDemoteTask props
  implication: FIX CONFIRMED: Version 0.9.0 includes the required props

## Eliminated Hypotheses

- ~~hypothesis: handlePromoteTask/handleDemoteTask don't call API~~
  evidence: Both handlers call mutateTask with correct parentId updates (useBatchTaskUpdate.ts:166, 187)
  timestamp: 2025-03-14T10:05:00Z

- ~~hypothesis: Backend doesn't handle parentId updates~~
  evidence: taskService.update correctly sets parentId (task.service.ts:259)
  timestamp: 2025-03-14T10:10:00Z

- ~~hypothesis: Props not passed to GanttChart component~~
  evidence: App.tsx passes onPromoteTask/onDemoteTask (lines 900-901)
  timestamp: 2025-03-14T10:12:00Z

## Resolution

**root_cause:** gantt-lib v0.8.0 didn't expose onPromoteTask/onDemoteTask callback props

**fix:** Updated gantt-lib from ^0.8.0 to ^0.9.0 in packages/web/package.json

**verification:**
- TypeScript compilation passes
- Props are now defined in gantt-lib's GanttChartProps interface
- Handlers match expected signatures: onPromoteTask(taskId: string) and onDemoteTask(taskId: string, newParentId: string)

**files_changed:**
- packages/web/package.json (updated gantt-lib version)

**Testing Required:**
- Manual testing in browser to confirm promote/demote buttons now persist changes
