# PRD: Resource Planner Refactor и выравнивание с Gantt pipeline

## 1. Зачем нужен отдельный документ

`RESOURCE-MANAGEMENT-SCREEN-PRD.md` описывает продуктовый экран ресурсов: UX, состояния, сценарии пользователя и ожидаемое поведение.

Для рефакторинга этого недостаточно. Нам нужен отдельный технический документ, который отвечает на другой вопрос:

- как перевести текущий `ResourcePlannerWorkspace` на те же принципы записи и optimistic state, что уже используются в основном Gantt;
- как убрать архитектурное расхождение между экраном задач и экраном ресурсов;
- как делать изменения безопасно, поэтапно и с внятными критериями завершения.

Этот документ и есть рабочая база для рефакторинга.

## 2. Как по нему работать

Работать нужно не по diff от старого PRD, а по разнице между:

1. текущей реализацией кода;
2. целевой архитектурой, описанной в этом документе.

Практически это означает:

- продуктовые требования берём из `RESOURCE-MANAGEMENT-SCREEN-PRD.md`;
- технический план рефакторинга, инварианты и этапы берём из этого документа;
- каждое изменение проверяем на соответствие общей project mutation model, а не только на локальную работоспособность resource screen.

## 3. Текущая проблема

Сейчас Gantt screen и Resource Planner screen опираются на одну и ту же доменную базу, но живут на разных принципах client-side поведения.

### 3.1 Что уже хорошо сделано в Gantt

Основной Gantt уже использует полноценный mutation pipeline:

- команды проекта идут через `useCommandCommit`;
- pending-команды пишутся в `localStorage` outbox;
- есть `pending`, `dragPreview`, `confirmed.snapshot`;
- UI строится от `deriveVisibleSnapshot(...)`;
- offline/retry/rebase/conflict handling централизованы.

Это и есть каноническая модель записи изменений проекта.

### 3.2 Что остаётся старым в Resource Planner

Resource Planner частично использует тот же `commitCommand`, но не живёт на той же модели UI:

- planner рендерится из отдельного `resourcePlannerCache`;
- date move использует локальный optimistic patch поверх planner data;
- reassignment делается прямым `POST /api/tasks/:taskId/assignments`;
- authoritative reconciliation часто делается через `reloadProjectSnapshot()` и `loadPlanner(...)`, а не через visible project state;
- часть локального pending поведения существует отдельно от общего pending pipeline.

Итог:

- экран задач и экран ресурсов могут временно показывать разное состояние;
- optimistic поведение не унифицировано;
- combined move даты + ресурс требует специальной ручной логики;
- сложнее гарантировать одинаковое поведение при retry, reconnect и version conflict.

## 4. Принципиальное решение

Resource Planner не должен быть отдельной state-машиной для project schedule.

Целевое правило:

- для schedule changes есть один source of truth и один write pipeline;
- Resource Planner является projection над тем же проектным состоянием, что и Gantt;
- различается renderer и interaction surface, но не принцип сохранения.

Это не означает, что resource screen должен “идти через компонент ганты”.

Это означает, что оба экрана должны идти через одну и ту же базу:

- `confirmed.snapshot`;
- `pending`;
- `dragPreview`;
- общий command commit flow;
- единые правила optimistic, retry, rebase и conflict resolution.

## 5. Scope рефакторинга

### In Scope

- Выравнивание schedule mutations resource screen с общим command/outbox/store pipeline.
- Уменьшение роли `resourcePlannerCache` как primary optimistic source для текущего проекта.
- Формирование resource timeline как projection от project-visible state там, где это возможно.
- Унификация saving/pending UX между Gantt и Resource Planner.
- Сохранение текущего product scope: только `current-project`.

### Out of Scope

- Возврат режима `all-projects`.
- Новый group-level screen в этой задаче.
- Полный backend redesign assignment model.
- Переезд всех resource endpoints на новые API в рамках этого рефакторинга.

## 6. Ограничения и продуктовые рамки

- Текущий экран ресурсов остаётся экраном текущего проекта.
- Следующий крупный scope для развития — отдельный resource screen по группе проектов.
- Group-level planner не должен протаскиваться скрыто внутрь текущего экрана.
- Если появится общий экран группы проектов, у него может быть отдельный transport contract и отдельная projection model.

## 7. Целевая архитектура

## 7.1 Schedule source of truth

Для всех изменений дат задач:

- команда создаётся так же, как в Gantt;
- команда попадает в тот же outbox;
- visible state считается через `deriveVisibleSnapshot(...)`;
- Resource Planner должен уметь отображать это visible state как resource projection.

## 7.2 Resource projection layer

Нужен явный projection layer:

- вход: visible project state + resources + assignments;
- выход: `ResourceTimelineResource[]` для `gantt-lib`.

Этот слой должен быть детерминированным и чистым:

- без сетевых вызовов;
- без локального optimistic патчинга поверх resource timeline;
- без отдельной бизнес-логики сохранения.

## 7.3 Assignment mutation layer

Пока `reassignment` и другие assignment-операции могут оставаться отдельной backend-веткой, но на клиенте их поведение должно быть ближе к общему pipeline:

- единый saving indicator;
- единые error semantics;
- единый authoritative refresh contract;
- отсутствие скрытого рассинхрона между task view и resource view.

Целевое дальнейшее улучшение:

- если backend добавит command-level assignment mutations, resource screen должен перейти и на них.

## 8. Что нельзя оставлять после рефакторинга

- Отдельную optimistic schedule truth только внутри resource screen.
- Ситуацию, когда Gantt показывает visible pending state, а resource screen ждёт отдельный reload и показывает старые даты.
- Логику, в которой combined move фактически является двумя несвязанными мирами без общего UX-контракта.
- Зависимость основных UX-сценариев от случайного порядка `reloadProjectSnapshot()` и `loadPlanner()`.

## 9. Целевое поведение по сценариям

### 9.1 Перенос назначения по датам

Ожидаемое поведение:

- пользователь двигает bar в resource planner;
- client формирует те же schedule commands, что и Gantt;
- команда записывается в общий pipeline;
- resource screen и gantt screen показывают согласованное pending state;
- после authoritative ответа оба экрана сходятся без ручной синхронизации.

### 9.2 Перенос назначения на другой ресурс

Ожидаемое поведение:

- пользователь меняет resource assignment;
- client выполняет assignment mutation;
- после ответа store assignments обновляется единообразно;
- resource projection пересчитывается из store, а не из отдельного локального timeline patch.

### 9.3 Комбинированный перенос

Ожидаемое поведение:

- date move и resource reassignment выглядят для пользователя как одно действие;
- если один шаг успешен, а второй нет, UI явно показывает authoritative результат;
- система не оставляет ложного optimistic состояния.

## 10. Этапы рефакторинга

### Phase 1 — Freeze current model and define boundaries

- Зафиксировать текущие write paths Resource Planner.
- Выделить, какие schedule mutations уже можно перевести на общие helper-ы без смены API.
- Зафиксировать projection boundary: что берётся из project store, что из resources/assignments, что из backend reload.

### Phase 1 findings — current write paths and boundaries

Ниже фиксируется текущее состояние кода в `packages/web/src/components/workspace/ResourcePlannerWorkspace.tsx`, чтобы следующие фазы шли не по ощущениям, а от конкретных write-paths.

#### 10.1 Текущие write-paths внутри `ResourcePlannerWorkspace`

1. Planner hydration и reload:
   - `loadPlanner(...)` пишет в локальный `state` экрана и в `resourcePlannerCache`.
   - `reloadProjectSnapshot()` пишет в `confirmed`, `resources`, `assignments`.
   - auto-refresh по visibility делает оба вызова подряд: сначала project reload, затем planner reload.

2. Resource catalog mutations:
   - `handleAddResource`, `handleCreateResource` пишут в `resources` через `upsertResource(...)` и затем инвалидируют `resourcePlannerCache`.
   - `patchCatalogResource` пишет в `resources` и локально патчит planner cache/state.
   - `handleDeleteResource` пишет в `resources`, `assignments`, локальный planner cache/state.

3. Schedule move внутри planner:
   - `persistPlannerMove(...)` ставит локальный UI guard через `pendingMoveIds`.
   - Затем локально патчит `state.data` и `resourcePlannerCache` через `applyOptimisticPlannerMove(...)`.
   - Для date changes вызывает `commitCommand(...)` и попадает в общий outbox/pending pipeline.
   - Для resource reassignment отдельно вызывает `POST /api/tasks/:taskId/assignments`.
   - При ошибке или partial failure возвращается к authoritative state через `loadPlanner(...)`, а иногда через `reloadProjectSnapshot() + loadPlanner(...)`.

4. Assignment add/remove вне drag:
   - `handleAddAssignment(...)` и `handleRemoveResource(...)` тоже используют локальный `pendingMoveIds`.
   - Assignment store обновляется через `replaceAssignmentsForTask(...)`.
   - Planner UI потом либо локально патчится, либо полностью reconcile-ится через reload.

#### 10.2 Где именно сейчас архитектурный разрыв

- Schedule commit уже идёт через общий `useCommandCommit`, но visible resource timeline строится не из `confirmed/pending/dragPreview`, а из отдельного planner payload/cache.
- `pendingMoveIds` допустим как локальный guard, но сейчас рядом с ним живёт и отдельная optimistic schedule truth.
- `resourcePlannerCache` совмещает две роли сразу:
  - hydration/reconciliation snapshot от `/api/resources/planner`;
  - primary UI source во время optimistic schedule changes.
- Combined move (`date + resource`) остаётся составным сценарием, где первая половина идёт через outbox, а вторая через отдельный assignment endpoint.

#### 10.3 Projection boundary для следующих фаз

- Из `project store` должны приходить:
  - `confirmed.snapshot`;
  - `pending`;
  - `dragPreview`;
  - visible schedule state через `deriveVisibleSnapshot(...)`.

- Из resource/assignment store должны приходить:
  - `resources`;
  - `assignments`;
  - их authoritative обновления после catalog и assignment mutations.

- Из backend reload допустимо брать:
  - hydration для `/api/resources/planner`;
  - authoritative conflict metadata;
  - reconciliation после assignment mutations и partial failures.

- Из backend reload не должен приходить primary optimistic schedule source для `current-project`.

#### 10.4 Общий helper для schedule mutations

На Phase 1 фиксируем минимальный общий helper, который можно использовать без смены API:

- один pure helper для преобразования `originalStart/originalEnd -> nextStart/nextEnd` в канонический набор project commands;
- helper не знает про Resource Planner UI, `localStorage`, reload и assignments;
- helper должен переиспользоваться:
  - в Gantt task diff flow;
  - в Resource Planner move classification;
- commit остаётся через существующий `commitCommand(...)`, то есть общий pipeline уже не дублируется, дублировалась именно логика построения schedule command sequence.

Практический контракт helper-а:

```ts
buildScheduleDateCommands({
  taskId,
  originalStartDate,
  originalEndDate,
  nextStartDate,
  nextEndDate,
}) => FrontendProjectCommand[]
```

Правила helper-а:

- если сдвиг без изменения длительности: `move_task`;
- если меняется только один край: один `resize_task`;
- если меняются оба края и длительность тоже меняется: deterministic sequence из двух `resize_task`;
- no-op возвращает пустой массив.

Это и есть граница между текущим Phase 1 и следующим Phase 2:

- Phase 1: фиксируем write-paths и выносим общий command builder;
- Phase 2: переводим Resource Planner date moves на visible project state и убираем отдельную optimistic schedule truth как primary source.

### Phase 2 — Shared schedule mutation path

- Вынести или переиспользовать общий helper schedule mutations из Gantt flow.
- Подключить Resource Planner date move к тому же helper-у.
- Исключить отдельную optimistic schedule truth внутри planner для date-only moves.

### Status on 2026-05-01

Текущий статус нужно читать как фактический прогресс по коду, а не как декларацию полной готовности refactor PRD.

#### Done

- Phase 1 зафиксирован:
  - текущие write-paths выписаны;
  - projection boundary зафиксирован;
  - общий helper для schedule date commands выделен.
- Общий helper уже используется и в Gantt diff flow, и в Resource Planner move classification.
- Для `current-project` date-visible часть Resource Planner больше не берётся из planner cache как primary source.
- Для `date-only` moves Resource Planner больше не должен опираться на отдельный локальный optimistic planner patch как на primary source дат.
- Внутри `ResourcePlannerWorkspace` отделены:
  - schedule command path;
  - assignment mutation path;
  - reconciliation path.
- Для `current-project` собран явный projection builder `visible tasks + resources + assignments -> timeline`.
- Assignment success-path больше не обязан локально патчить planner timeline для UI; UI строится от store-driven projection.
- Resource Planner statusbar по поведению выровнен с Gantt:
  - delayed `Синхронизация...`;
  - delayed `Сохранение...`;
  - `Конфликт версии` из shared pending command state.
- Optimistic reassignment больше не живёт на planner-local overlay:
  - reassignment preview пишет в `assignments` store;
  - projection перестраивается из store-driven state;
  - rollback для reassignment делается через restore task assignments, а не через старый planner patch source.
- Для schedule moves в Resource Planner добавлен атомарный preview на весь command batch:
  - planner использует `dragPreview` snapshot на время commit loop;
  - intermediate pending-step state больше не должен быть primary visible source для date move внутри planner.
- Projection builder сохраняет planner rows как fallback topology source даже для пустых строк после optimistic move.
- Добавлены targeted tests на:
  - delayed sync status в planner footer;
  - optimistic reassignment между ресурсами до ответа backend;
  - стабильный lag-aware drag preview до завершения schedule save.

#### Partial

- Phase 2 в основном закрыт по текущему `current-project` scope, но ещё не доведён до полного hardening.
- Phase 3 и Phase 4 существенно продвинуты, но ещё не завершены.
- `resourcePlannerCache` всё ещё участвует в экране как источник:
  - conflict metadata;
  - planner hydration/reconciliation;
  - fallback topology/details в тех местах, где store пока не несёт полный authoritative contract.

#### Not done yet

- Не завершён Phase 3 полностью:
  - `resourcePlannerCache` ещё не сведен только к hydration/reconciliation роли;
  - conflict/topology fallback всё ещё частично читается из planner payload.
- Не завершён Phase 4 полностью:
  - assignment add/remove/reassign всё ещё идут по отдельной backend-ветке;
  - saving/error semantics ещё не сведены к полностью одинаковому поведению с command pipeline.
- Не завершён Phase 5:
  - нет полного hardening по retry/offline/conflict/combined partial failure.
  - нет отдельного набора integration-level tests на store/projection/reload invariants поверх текущего refactor.
- Отдельно вне этого PRD восстановлен ожидаемый контракт в `gantt-lib`:
  - `FS` снова допускает отрицательный lag;
  - нижняя граница снова ограничена длительностью predecessor;
  - логика удаления менее жёсткого ограничения при противоречии не менялась.

#### Next implementation step

- Идти в hardening:
  - добавить тесты на согласованность Gantt visible state и Resource Planner projection после pending schedule mutations;
  - добавить тесты на assignment mutation reconciliation без локального planner patch source;
  - проверить partial failure и reload semantics после combined move.

### Phase 3 — Resource projection from visible state

- Собрать projection `visible project state -> resource timeline`.
- Перевести `current-project` planner на эту projection model.
- Свести `resourcePlannerCache` к роли hydration/reconciliation, а не primary UI source.

### Phase 4 — Assignment alignment

- Упорядочить reassignment/add/remove flows.
- Обновлять assignments store так, чтобы planner projection перестраивалась из store.
- Согласовать saving/error UX с общим pipeline.

### Phase 5 — Hardening

- Добавить тесты на согласованность Gantt и Resource Planner после pending mutations.
- Проверить offline/retry behavior.
- Проверить version conflict behavior.
- Проверить combined move partial failure semantics.

## 11. Acceptance criteria для рефакторинга

- Date changes из Resource Planner используют тот же mutation pipeline, что и Gantt.
- Resource Planner в `current-project` не хранит отдельную primary optimistic schedule truth.
- После pending schedule mutation Gantt и Resource Planner показывают согласованное видимое состояние.
- Resource reassignment не оставляет долгоживущего локального timeline state, который живёт отдельно от store.
- Reload planner остаётся reconciliation-механизмом, а не единственным способом увидеть актуальные изменения.
- Кодовая структура явно разделяет:
  - mutation pipeline
  - projection layer
  - renderer layer

## 12. Риски

- Самый большой риск — попытаться сделать всё за один проход и смешать refactor pipeline, projection и product polish.
- Второй риск — слишком рано тащить в текущий экран будущий group-level scope.
- Третий риск — оставить assignment-ветку отдельной без минимального UX-выравнивания и получить частично унифицированную систему.

## 13. Решение по документам

- `RESOURCE-MANAGEMENT-SCREEN-PRD.md` остаётся продуктовым PRD экрана ресурсов.
- `RESOURCE-PLANNER-REFACTOR-PRD.md` является рабочим документом для архитектурного рефакторинга.
- Реализацию нужно сверять с обоими документами:
  - продуктовые требования берём из product PRD;
  - техническую последовательность и критерии завершения берём из refactor PRD.
