# Continue — Resource Planner refactor context

## Last action

Создан отдельный refactor-док [RESOURCE-PLANNER-REFACTOR-PRD.md](../RESOURCE-PLANNER-REFACTOR-PRD.md) и добавлена ссылка на него из [RESOURCE-MANAGEMENT-SCREEN-PRD.md](../RESOURCE-MANAGEMENT-SCREEN-PRD.md). Это разделяет product PRD и технический план выравнивания Resource Planner с Gantt pipeline.

## Next action

Начать `Phase 1 — Freeze current model and define boundaries` из [RESOURCE-PLANNER-REFACTOR-PRD.md](../RESOURCE-PLANNER-REFACTOR-PRD.md): выписать текущие write-paths `ResourcePlannerWorkspace`, затем спроектировать общий helper для schedule mutations, который смогут использовать и Gantt, и Resource Planner.

## Why

Сейчас основная проблема не в UI, а в архитектурном расхождении: Gantt использует `confirmed/pending/dragPreview + localStorage outbox`, а Resource Planner до сих пор частично живёт на отдельном optimistic/reload flow. Пока это не выровнено, экраны могут показывать разное промежуточное состояние.

## Open threads

- Текущий экран ресурсов должен оставаться только `current-project`.
- Возврат к `all-projects` не нужен.
- Следующий верхний scope в будущем — отдельный экран ресурсов для группы проектов, а не расширение текущего экрана.
- Assignment mutations пока могут оставаться отдельной backend-веткой, но их UI/pending/saving semantics надо приблизить к общему pipeline.

## Do not

- Не работать по diff старого product PRD как по техническому плану.
- Не возвращать `all-projects` внутрь текущего `ResourcePlannerWorkspace`.
- Не смешивать в одной задаче pipeline refactor и большой product polish UI.
- Не делать Resource Planner “через компонент ганты”; общий должен быть store/mutation pipeline, а не конкретный renderer.

## Modified files

- `RESOURCE-MANAGEMENT-SCREEN-PRD.md`
- `RESOURCE-PLANNER-REFACTOR-PRD.md`
