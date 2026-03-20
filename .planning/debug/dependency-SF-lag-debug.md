Задача с связью SF странно работает: 
при установки связи с лагом SF 0 при перезагрузке лаг становится +1
Так же нестабильно сохранение самого лага. Не сохраняется его изменение, либо лаг становится на +1 больше всегда.

index-DqMFKy_U.js:236 [useBatchTaskUpdate] handleTasksChange START
index-DqMFKy_U.js:236 [useBatchTaskUpdate] changedTasks count: 3
index-DqMFKy_U.js:236 [useBatchTaskUpdate] CALLER: at https://getgantt.ru/assets/index-DqMFKy_U.js:235:190406
index-DqMFKy_U.js:237 [useBatchTaskUpdate] FULL STACK: Error
    at https://getgantt.ru/assets/index-DqMFKy_U.js:237:78
    at https://getgantt.ru/assets/index-DqMFKy_U.js:235:190406
    at https://getgantt.ru/assets/index-DqMFKy_U.js:235:133778
    at I4 (https://getgantt.ru/assets/index-DqMFKy_U.js:235:129109)
    at R4 (https://getgantt.ru/assets/index-DqMFKy_U.js:235:131919)
index-DqMFKy_U.js:237 [useBatchTaskUpdate] Full changedTasks data:
index-DqMFKy_U.js:237 (индекс)idnameparentIdstartDateendDate(индекс)idnameparentIdstartDateendDate0'4678d9d3-55ef-43df-a531-34eed779d04c''Радиаторы''651aadfb-e039-4a8d-89b1-55c1dafc1248''2026-01-24T00:00:00.000Z''2026-01-30T00:00:00.000Z'1'651aadfb-e039-4a8d-89b1-55c1dafc1248''Сантехоборудование''3d09621d-dfb2-41ac-a0df-5125bb8b8f6f''2026-01-24''2026-09-28'2'3d09621d-dfb2-41ac-a0df-5125bb8b8f6f''Комплектация'undefined'2025-11-26''2026-10-18'Array(3)
index-DqMFKy_U.js:237 [useBatchTaskUpdate] Optimistic state updated
index-DqMFKy_U.js:237 [useBatchTaskUpdate] Using BATCH API for 3 tasks
index-DqMFKy_U.js:236 [useTaskMutation] BATCH IMPORT - sending 3 tasks via PUT /api/tasks
index-DqMFKy_U.js:236 [useTaskMutation] Batch tasks: (3) [{…}, {…}, {…}]
index-DqMFKy_U.js:236 [useTaskMutation] BATCH IMPORT SUCCESS - 3 tasks saved
index-DqMFKy_U.js:237 [useBatchTaskUpdate] BATCH saved 3 tasks
index-DqMFKy_U.js:237 [useBatchTaskUpdate] handleTasksChange DONE
