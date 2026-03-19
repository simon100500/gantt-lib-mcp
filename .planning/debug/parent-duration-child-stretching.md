---
status: awaiting_human_verify
trigger: "Investigate issue: parent-duration-child-stretching"
created: 2026-03-19T00:00:00Z
updated: 2026-03-19T00:25:00Z
---

## Current Focus

hypothesis: The implemented fix should stop the app from re-stretching siblings after a child drag and should block direct parent date mutations from both the chart and task list.
test: Confirm the original reproduction in the real UI by dragging/resizing a child past its parent range and by attempting to edit a parent directly.
expecting: Only the dragged child and recomputed parent bounds should change; untouched siblings should keep their dates, and parent date controls should no longer allow editing.
next_action: Ask for human verification in the UI using the original reproduction steps.

## Symptoms

expected: Parent task should be derived from child dates. Dragging/resizing child 2 beyond current parent range may lead to parent recomputation from child dates, but must not directly resize or shift children/siblings. Parent itself must not be manually mutable in a way that propagates changes to children.
actual: If child 2 is moved beyond parent bounds, parent increases and then child 1 and child 2 also increase with it.
errors: none reported
reproduction: Create structure like parent1 with child1, child2, child3. Start dragging/resizing child2 beyond the parent range. Observe parent grows and child1/child2 also grow.
started: unknown

## Eliminated

## Evidence

- timestamp: 2026-03-19T00:00:00Z
  checked: packages/web/src/components/GanttChart.tsx
  found: The web app is a thin wrapper around `gantt-lib` and does not add its own task mutation logic beyond forwarding `onTasksChange`.
  implication: The bug is likely inside `gantt-lib` task update/cascade behavior rather than in the app wrapper.

- timestamp: 2026-03-19T00:00:00Z
  checked: node_modules/gantt-lib/dist/index.mjs
  found: `handleTaskChange` distinguishes parent vs non-parent edits and parent edits still call `cascadeByLinks(updatedTask.id, parentStart, parentEnd, tasks, true)`.
  implication: Parent tasks remain active participants in date-edit flow, and recomputed parent dates can still drive additional cascading.

- timestamp: 2026-03-19T00:10:00Z
  checked: node_modules/gantt-lib/dist/index.mjs
  found: Drag completion uses `universalCascade`, which already handles parent recomputation with a special `parent-recalc` mode that avoids cascading back down into children.
  implication: The core drag cascade path is designed to avoid the reported stretch, so the regression is likely introduced after gantt-lib emits the changed task batch.

- timestamp: 2026-03-19T00:10:00Z
  checked: packages/web/src/hooks/useBatchTaskUpdate.ts
  found: `handleTasksChange` adds all descendants for any changed parent with a date delta, based on a stale assumption that gantt-lib does not move descendants automatically.
  implication: When gantt-lib emits `[changed child, recomputed parent]`, this code stretches siblings that were never part of the drag operation.

- timestamp: 2026-03-19T00:10:00Z
  checked: node_modules/gantt-lib/dist/index.mjs
  found: Task-list date pickers and duration editor are disabled only by `task.locked`; parent rows remain directly editable.
  implication: Even after fixing sibling stretching, parent tasks would still violate the requirement that parent dates are derived-only.

- timestamp: 2026-03-19T00:25:00Z
  checked: packages/web build
  found: `npm.cmd run build -w packages/web` completed successfully after the changes.
  implication: The patched app hook and gantt-lib distribution still type-check and bundle cleanly.

## Resolution

root_cause: `useBatchTaskUpdate` in the web app performs an extra descendant date propagation whenever a parent appears in a changed batch. gantt-lib now already returns recomputed parent updates during child drags, so that extra propagation misclassifies derived parent changes as direct parent edits and stretches siblings. A separate UI gap in gantt-lib allows parent start/end/duration edits even though parent dates should be derived from children only.
fix: Removed the web app’s extra descendant propagation from `useBatchTaskUpdate`, so recomputed parent updates from gantt-lib no longer trigger synthetic sibling date shifts. Also blocked direct parent date mutation in gantt-lib by rejecting parent bar drags and disabling parent task-list start/end/duration edits.
verification:
  - `packages/web/src/hooks/useBatchTaskUpdate.ts` now applies only the task batch emitted by gantt-lib and no longer synthesizes descendant date shifts from parent updates.
  - `node_modules/gantt-lib/dist/index.mjs` and `node_modules/gantt-lib/dist/index.js` now reject parent bar drags and disable parent start/end/duration editors.
files_changed:
  - packages/web/src/hooks/useBatchTaskUpdate.ts
  - node_modules/gantt-lib/dist/index.mjs
  - node_modules/gantt-lib/dist/index.js
