---
status: awaiting_human_verify
trigger: "work-order-reset-on-reload: Когда меняешь порядок работ (drag-and-drop), ждёшь сохранения, перезагружаешь страницу — порядок сбрасывается к исходному. НО если после этого снова перезагрузить страницу (ничего не делая) — порядок становится изменённым (как перетаскивали)."
created: 2026-03-15T00:00:00Z
updated: 2026-03-15T00:01:00Z
---

## Current Focus

hypothesis: CONFIRMED — gantt-lib fires onTasksChange AND onReorder for the same drag event. handleTasksChange fires first and saves tasks with OLD sortOrder values to the DB (overwriting any previous save). handleReorder fires concurrently and saves NEW sortOrder values. The "Сохранено" indicator shows when the FIRST save (with OLD sortOrders) completes — user reloads thinking it's done. The second save (correct sortOrders) completes in the background. Second reload picks up correct values.
test: traced gantt-lib source — confirmed both onTasksChange and onReorder are called synchronously; traced batchUpdateTasks — confirmed it writes sortOrder when present on task objects (gantt-lib passes original tasks through spread, so sortOrder from previous server fetch IS included)
expecting: fix prevents handleTasksChange from writing stale sortOrders when called as part of a reorder event
next_action: apply fix — prevent handleTasksChange from updating sortOrder fields, since handleReorder is responsible for sortOrder

## Symptoms

expected: После перетаскивания и сохранения порядок должен сохраняться при перезагрузке страницы
actual: Первая перезагрузка показывает старый порядок, вторая — уже новый (правильный)
errors: Нет явных ошибок
reproduction:
  1. Перетащить работы для изменения порядка
  2. Дождаться автосохранения
  3. Перезагрузить страницу → видим старый порядок
  4. Перезагрузить ещё раз → видим новый (правильный) порядок
started: Текущее состояние кода

## Eliminated

- hypothesis: sortOrder is not saved at all
  evidence: batchUpdateTasks explicitly saves sortOrder when present; handleReorder assigns and saves sortOrder
  timestamp: 2026-03-15

- hypothesis: GET /api/tasks doesn't order by sortOrder
  evidence: taskService.list() uses orderBy: [{ sortOrder: 'asc' }] explicitly
  timestamp: 2026-03-15

## Evidence

- timestamp: 2026-03-15
  checked: gantt-lib source /node_modules/gantt-lib/dist/index.js lines 4329-4330
  found: GanttChart.handleReorder calls onTasksChange(normalized) THEN onReorder(normalized, movedTaskId, inferredParentId) — both with the same full normalized task array
  implication: Two concurrent API saves are triggered for every drag-and-drop reorder

- timestamp: 2026-03-15
  checked: gantt-lib does not use sortOrder field internally
  found: grep for "sortOrder" in gantt-lib returns no matches — gantt-lib passes task objects through spread, so any sortOrder on incoming tasks survives to onTasksChange output
  implication: The tasks passed to handleTasksChange from onTasksChange carry the OLD sortOrder values that were loaded from the server

- timestamp: 2026-03-15
  checked: batchUpdateTasks in task.service.ts lines 556-568
  found: updateData includes sortOrder only if sortOrder !== undefined. Since gantt-lib passes through tasks with their original sortOrder fields, handleTasksChange sends tasks WITH sortOrder (old values) and batchUpdateTasks writes those old values to DB
  implication: handleTasksChange's PUT /api/tasks write RESETS sortOrders to old values

- timestamp: 2026-03-15
  checked: saving state flow in handleTasksChange and handleReorder
  found: handleTasksChange's batchImportTasks completes first and sets savingState='saved' because it starts first. handleReorder's batchImportTasks is still in-flight. User sees "Сохранено" and reloads.
  implication: On first reload, DB has old sortOrders (from handleTasksChange win). handleReorder's save finishes in background. Second reload sees correct sortOrders.

## Resolution

root_cause: When the user drags a task, gantt-lib fires BOTH onTasksChange AND onReorder with the same normalized task array. handleTasksChange fires first, saves all tasks to DB INCLUDING their old sortOrder values (which were preserved on the task objects from the previous server fetch). handleReorder fires concurrently, saves correct new sortOrders. handleTasksChange's save completes first and sets savingState='saved', misleading the user. handleReorder's save is still in-flight when user reloads. First reload sees old sortOrders; second reload sees correct ones.

fix: |
  Two changes in packages/web/src/hooks/useBatchTaskUpdate.ts:
  1. In handleTasksChange: strip sortOrder from all tasks before sending to server via batchImportTasks/mutateTask. handleTasksChange must not touch sortOrder — that is handleReorder's responsibility exclusively.
  2. In handleReorder (movedTaskId && inferredParentId !== undefined branch): was only saving the moved task via mutateTask. Fixed to find ALL tasks whose sortOrder changed (not just the moved one) and batch-save them all, same as the else branch.
verification:
files_changed:
  - packages/web/src/hooks/useBatchTaskUpdate.ts
