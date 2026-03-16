---
status: resolved
trigger: "При перемещении задач (drag and drop) и дальнейшей перезагрузке страницы порядок задач сбивается."
created: 2026-03-14T00:00:00.000Z
updated: 2026-03-14T01:00:00.000Z
---

## Current Focus
hypothesis: Fix verified by user
test: User confirmed "fixed" - drag-and-drop now persists sortOrder
expecting: Tasks maintain order after reload ✓
next_action: Archive session

## Symptoms
expected: Порядок задач должен сохраняться в базе данных и восстанавливаться при перезагрузке
actual: После F5 или перезапуска приложения задачи возвращаются в старый порядок
errors: Нет явных ошибок
reproduction: Перетащить задачу мышью (drag and drop), затем обновить страницу (F5)
started: Неизвестно, работало ли раньше

## Eliminated

## Evidence
- timestamp: 2026-03-14T00:00:00.000Z
  checked: Prisma schema (packages/mcp/prisma/schema.prisma)
  found: Task model has `sortOrder Int @default(0) @map("sort_order")` field
  implication: Database supports storing sort order

- timestamp: 2026-03-14T00:00:00.000Z
  checked: Task service (packages/mcp/src/services/task.service.ts)
  found: `update()` method (lines 224-302) does NOT handle `sortOrder` field in updateData object
  implication: Drag-and-drop updates via PATCH /api/tasks/:id don't save sortOrder

- timestamp: 2026-03-14T00:00:00.000Z
  checked: Frontend types (packages/web/src/hooks/useTaskMutation.ts)
  found: UpdateTaskInput interface (lines 13-21) does NOT include `sortOrder` field
  implication: Frontend doesn't send sortOrder in update requests

- timestamp: 2026-03-14T00:00:00.000Z
  checked: Frontend mutation (packages/web/src/hooks/useTaskMutation.ts)
  found: `mutateTask()` function (lines 46-82) sends task data without sortOrder
  implication: Drag-and-drop operations don't include order information

- timestamp: 2026-03-14T00:00:00.000Z
  checked: Task service (packages/mcp/src/services/task.service.ts)
  found: `batchUpdateTasks()` method (lines 413-522) explicitly sets `sortOrder: 0` on create and has comment "sortOrder is not updated here" on update (line 492)
  implication: Batch updates don't preserve order either

- timestamp: 2026-03-14T00:00:00.000Z
  checked: Task service (packages/mcp/src/services/task.service.ts)
  found: `importTasks()` method (lines 528-611) DOES set sortOrder based on array position (line 593: `sortOrder: index`)
  implication: Only full import/reload preserves order

## Resolution
root_cause: При drag-and-drop операций фронтенд не отправляет поле sortOrder, а метод TaskService.update() не обрабатывает это поле. Порядок сохраняется только при полной импортации задач (importTasks), но не при инкрементальных обновлениях.
fix: 1. Added sortOrder to Task interface in both frontend and backend types
2. Added sortOrder to UpdateTaskInput interface
3. Updated TaskService.update() to handle sortOrder
4. Updated TaskService.batchUpdateTasks() to handle sortOrder when provided
5. Updated taskToDomain() to return sortOrder
6. Updated useTaskMutation.mutateTask() to send sortOrder
7. Updated useBatchTaskUpdate.handleReorder() to add sortOrder and batch update changed tasks
verification: User confirmed fix is working - task order now persists after drag-and-drop and page reload
files_changed:
- packages/mcp/src/types.ts
- packages/mcp/src/services/task.service.ts
- packages/web/src/types.ts
- packages/web/src/hooks/useTaskMutation.ts
- packages/web/src/hooks/useBatchTaskUpdate.ts
