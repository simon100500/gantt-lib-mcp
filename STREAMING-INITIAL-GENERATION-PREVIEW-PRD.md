# PRD: Streaming Preview для Initial Generation

## 1. Summary

Нужно добавить отдельный UX-режим для `initial generation`, в котором пользователь видит постепенное появление строк и задач в графике во время генерации.

Это не authoritative schedule-building. Это purely visual streaming preview.

Финальный сохранённый график по-прежнему приходит отдельным полным `tasks` snapshot и остаётся source of truth. Промежуточные задачи могут расходиться с конечным результатом.

## 2. Goal

Сделать initial generation визуально "живой":

- задачи появляются постепенно;
- сначала можно показывать крупные этапы;
- потом подэтапы;
- потом более детальные строки;
- UI не ждёт молча до конца полной генерации.

Пользователь должен видеть, что график "строится", даже если промежуточная структура потом изменится.

## 3. Core Product Requirement

Во время initial generation система должна отправлять несколько промежуточных preview-обновлений, чтобы в таблице и графике постепенно появлялись новые строки задач.

Минимальное ожидаемое ощущение:

- сначала появляется 3-7 верхнеуровневых этапов;
- затем добавляются подэтапы;
- затем могут появиться более детальные задачи;
- в конце приходит финальный настоящий snapshot, который полностью заменяет preview.

## 4. Scope

### In Scope

- только `initial generation`;
- только визуальный progressive preview;
- WebSocket events для промежуточных task rows;
- UI-отрисовка provisional task rows;
- финальная замена preview на authoritative snapshot.

### Out of Scope

- streaming для ordinary mutation path;
- гарантия совпадения preview и финального графика;
- интерактивное редактирование preview;
- сохранение preview в БД;
- undo/redo для preview;
- history entries для preview.

## 5. UX Behavior

### 5.1 During Generation

После запуска initial generation UI должен:

- показать состояние "Генерируем график";
- начать получать provisional tasks;
- отрисовывать их как обычные строки графика;
- визуально помечать preview-режим.

### 5.2 Preview Semantics

Промежуточные задачи:

- не считаются сохранёнными;
- могут исчезать;
- могут переименовываться;
- могут менять структуру;
- могут не совпасть с финальным графиком.

Это допустимо.

### 5.3 Finalization

После завершения generation:

- preview state сбрасывается;
- приходит обычный `tasks` snapshot;
- UI заменяет provisional rows на финальный график;
- пользователь видит уже настоящий сохранённый результат.

## 6. Backend Behavior

Backend initial-generation pipeline должен уметь отправлять несколько волн preview-данных.

### 6.1 Preview Waves

Нужны как минимум 3 волны:

1. `preview_wave_1`
   верхнеуровневые этапы проекта
2. `preview_wave_2`
   этапы + подэтапы
3. `preview_wave_3`
   этапы + подэтапы + часть или все детальные задачи

Можно больше, если удобно, но не обязательно.

### 6.2 Preview Source

Источник preview может быть:

- производным от structure plan;
- производным от intermediate executable plan;
- искусственно собранным из planner output.

Не требуется, чтобы preview был точным или полностью валидным.

### 6.3 Final Source

Финальный `tasks` snapshot остаётся единственным authoritative result и должен формироваться как сейчас через обычный compile/execute flow.

## 7. Transport Contract

Нужен отдельный WS event для incremental preview rows.

### Option A — Preferred

Новый тип:

- `preview_tasks_append`

Payload:

- `tasks: unknown[]`
- `wave: number`
- `provisional: true`

Смысл:

- UI добавляет новые строки к уже показанным provisional rows.

### Option B — Simpler

Новый тип:

- `preview_tasks_replace`

Payload:

- `tasks: unknown[]`
- `wave: number`
- `provisional: true`

Смысл:

- UI на каждой волне полностью заменяет текущий preview новым набором.

Предпочтительно начать с `replace`, потому что он проще и надёжнее. Пользователь всё равно увидит постепенный рост списка, даже если backend каждый раз шлёт весь accumulated preview.

## 8. UI Requirements

### 8.1 Preview Rendering

UI должен:

- принимать streaming preview events;
- держать отдельный provisional task state;
- показывать provisional rows в gantt и table;
- не смешивать preview с confirmed project snapshot.

### 8.2 Visual Treatment

У provisional rows должен быть явный визуальный статус, например:

- пониженная opacity;
- badge "Черновик" или "Генерация";
- shimmer/loading style;
- отключённое редактирование.

### 8.3 Replacement Rule

При финальном `tasks`:

- provisional state полностью очищается;
- confirmed state заменяется финальным snapshot.

### 8.4 Failure Rule

Если initial generation упала:

- preview очищается или помечается как failed;
- UI показывает ошибку;
- provisional rows не считаются сохранёнными.

## 9. Architectural Principle

Preview generation и final schedule generation должны быть разделены.

Preview:

- UX-only;
- ephemeral;
- может быть неточным.

Final result:

- authoritative;
- persisted;
- validated existing pipeline.

Нельзя строить бизнес-логику вокруг preview rows.

## 10. Implementation Outline

### Phase 1 — Transport

- Добавить новый WS message type для progressive preview.
- Поддержать `wave` metadata.

### Phase 2 — Backend Preview Builder

- На основе structure/schedule planning добавить функцию сборки preview tasks.
- Отправлять 2-4 последовательных preview updates в initial-generation orchestrator.

### Phase 3 — UI Preview State

- Добавить отдельный state для streaming preview rows.
- Поддержать replace или append semantics.

### Phase 4 — Visual Layer

- Добавить визуальную маркировку provisional rows.
- Заблокировать редактирование preview.

### Phase 5 — Finalization and Failure

- На финальном `tasks` очищать preview.
- На failure очищать preview и показывать статус ошибки.

## 11. Acceptance Criteria

- При initial generation пользователь видит постепенное появление задач в графике до финального результата.
- Preview rows приходят в несколько волн, а не одним финальным блоком.
- Preview может отличаться от финального графика, и это считается нормальным поведением.
- Финальный `tasks` snapshot полностью заменяет provisional preview.
- Preview не попадает в persisted project state.
- Failure не оставляет UI в ложном "сохранённом" состоянии.

## 12. Success Metric

Успехом считается состояние, при котором initial generation визуально воспринимается как живой процесс:

- график не "молчит" до конца;
- строки появляются постепенно;
- пользователь видит движение;
- финальный результат остаётся корректным и authoritative.
