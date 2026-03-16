---
status: investigating
trigger: "Удаление связей в UI не работает — клик по кнопке удаления связи ничего не делает, ошибок нет."
created: 2026-03-16T00:00:00Z
updated: 2026-03-16T00:00:00Z
---

## Current Focus
<!-- OVERWRITE on each update - reflects NOW -->

hypothesis: unknown — gathering initial evidence
test: searching codebase for dependency deletion handlers
expecting: find disconnect between UI event and backend handler
next_action: search for delete dependency handlers in frontend and backend

## Symptoms
<!-- Written during gathering, then IMMUTABLE -->

expected: При клике на кнопку удаления связи (dependency) в Gantt UI — связь должна удалиться
actual: Ничего не происходит — связь остаётся, визуальных изменений нет
errors: Нет ошибок в консоли браузера и в логах сервера
reproduction: Кликнуть на кнопку удаления связи в Gantt chart UI
started: Неизвестно когда сломалось

## Eliminated
<!-- APPEND only - prevents re-investigating -->

## Evidence
<!-- APPEND only - facts discovered -->

## Resolution
<!-- OVERWRITE as understanding evolves -->

root_cause:
fix:
verification:
files_changed: []
