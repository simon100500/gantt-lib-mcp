# PRD: Нормальный экран управления ресурсами на базе `gantt-lib`

## 1. Контекст

В `gantt-lib-mcp` уже есть базовая ресурсная область: `ResourcePlannerWorkspace` загружает `/api/resources/planner`, работает в рамках текущего проекта, даёт создать ресурс и рендерит интервалы через `gantt-lib`. Экран уже полезен как рабочий planner, но его архитектура всё ещё расходится с основным Gantt screen: для части операций он живёт на отдельном optimistic state и reload flow, а не на общем command/outbox/store pipeline проекта. Из-за этого ресурсный экран и экран задач могут показывать разное промежуточное состояние, хотя опираются на одну и ту же project base.

В `gantt-lib` уже реализован `Resource Planner Mode`: `GanttChart mode="resource-planner"` и прямой `ResourceTimelineChart` рендерят строки ресурсов, интервалы назначений, lanes для пересечений, controlled drag по датам и опциональный перенос между ресурсами через `onResourceItemMove`. Это должно стать визуальной основой нового экрана.

## 2. Цель продукта

Сделать единый экран управления ресурсами, где пользователь может:

- видеть загрузку людей, техники, материалов и прочих ресурсов на календарной шкале;
- работать с ресурсами текущего проекта через тот же source of truth, что и основной Gantt;
- создавать, переименовывать, активировать/деактивировать ресурсы;
- назначать ресурсы на задачи и менять назначение прямо из planner;
- переносить назначение по датам и между ресурсами через возможности `gantt-lib`;
- быстро находить и исправлять конфликты пересечения назначений;
- после каждого изменения видеть авторитетные данные backend, а не локальную догадку UI.

Следующий верхний scope для развития продукта — не возврат к `all-projects`, а отдельный экран загрузки общих ресурсов на уровне группы проектов.

## 3. Пользователи и Jobs To Be Done

### Основной пользователь

Пользователь проекта или workspace, который отвечает за планирование работ и распределение ресурсов между задачами.

### JTBD

- Когда я планирую работы, я хочу видеть все занятые ресурсы на временной шкале, чтобы понять, кто или что свободно.
- Когда задача конфликтует с другой задачей у того же ресурса, я хочу быстро перейти к исправлению, чтобы снять перегрузку.
- Когда сроки задачи меняются, я хочу перетащить её назначение на новые даты, чтобы не открывать отдельную форму.
- Когда работу нужно передать другому ресурсу, я хочу перетащить bar в другую строку, чтобы быстро перераспределить загрузку.
- Когда мне нужен новый ресурс, я хочу создать его на этом же экране и сразу использовать в назначениях.

## 4. Scope

### In Scope

- Замена локального `ResourceTimelineGrid` на `gantt-lib` resource planner renderer.
- Адаптер `ResourcePlannerResult` → `ResourceTimelineResource[]`.
- Controlled move flow для `onResourceItemMove`.
- Сохранение изменения дат через существующий command flow проекта.
- Сохранение переназначения ресурса через assignment endpoint.
- Панель каталога ресурсов: создание, редактирование имени, scope/type/status.
- Панель деталей выбранного назначения: задача, проект, ресурс, даты, конфликты, быстрые действия.
- Фильтры: тип ресурса, текстовый поиск, только конфликты, активные/архивные ресурсы.
- Состояния загрузки, ошибки, empty state, readonly/locked state.
- Тесты на адаптер данных, основной UI, drag callback и сохранение.
- Выравнивание resource screen с общим command/outbox/store pipeline, который уже используется в основном Gantt.

### Out of Scope

- Новый dependency engine для resource planner.
- Рисование dependency lines в resource view.
- Использование `parentId/children` для моделирования ресурсов.
- Автоматическое разрешение конфликтов без подтверждения пользователя.
- Новые backend-алгоритмы capacity planning, если они не нужны для отображения текущих конфликтов.
- Почасовое планирование: первая версия работает в дневной шкале `gantt-lib`.
- Возврат screen-level scope `all-projects`.
- Мультипроектный resource planner по группе проектов внутри текущего экрана. Для этого будет отдельный экран и отдельный transport contract.

## 5. Возможности `gantt-lib`, которые нужно использовать

- `GanttChart mode="resource-planner"` или `ResourceTimelineChart` как основной timeline renderer.
- `ResourceTimelineResource`: строка ресурса с `id`, `name`, `items`.
- `ResourceTimelineItem`: bar назначения с `id`, `resourceId`, `taskId`, `title`, `subtitle`, `startDate`, `endDate`, `color`, `locked`, `metadata`.
- `onResourceItemMove(move)` как controlled событие, которое срабатывает один раз на mouseup.
- `disableResourceReassignment`, если в текущем состоянии проекта перенос между ресурсами запрещён.
- `readonly` для гостевого/недоступного режима.
- `renderItem` для внутреннего содержимого bar: задача, проект, даты, conflict badge, locked marker.
- `getItemClassName` для конфликтных, выбранных, locked и pending интервалов.
- `dayWidth`, `rowHeaderWidth`, `laneHeight`, `headerHeight` для плотного planner layout.
- Встроенные lanes: пересекающиеся интервалы одного ресурса складываются в несколько lane, а не накладываются друг на друга.

## 6. UX-концепция экрана

### 6.1 Верхняя панель

- Заголовок: `Ресурсы`.
- Подзаголовок: `Текущий проект`.
- Основные действия: `Создать ресурс`, `Обновить`, `Вернуться в проект`.
- Индикатор состояния: `Загружается`, `Сохранение...`, `Есть несохранённая операция`, `Ошибка`.

### 6.2 Фильтры и summary

- Поиск по названию ресурса, задаче и проекту.
- Фильтр типа ресурса: `human`, `equipment`, `material`, `other`.
- Toggle `Только конфликты`.
- Toggle `Показывать неактивные`.
- Summary cards: ресурсы, назначения, ресурсы с конфликтами, конфликтные интервалы.

### 6.3 Каталог ресурсов

- Список ресурсов слева или в collapsible panel.
- Для каждого ресурса: имя, тип, scope, active/inactive, количество назначений, количество конфликтов.
- Действия: переименовать, изменить тип, деактивировать/активировать.
- Создание ресурса должно поддерживать scope `shared` и `project`, а не только фиксированный `human`.

### 6.4 Timeline

- Основная область строится на `gantt-lib` resource planner.
- Строка = ресурс.
- Bar = назначение задачи на ресурс.
- Bar показывает минимум: название задачи, проект, диапазон дат.
- Конфликтный bar визуально отличается и содержит компактный badge.
- Клик по bar открывает панель деталей.
- Drag по X меняет даты задачи.
- Drag по Y переносит назначение на другой ресурс, если разрешено.
- Empty resource rows должны оставаться видимыми, чтобы пользователь мог перетащить назначение на свободный ресурс.

### 6.5 Детали назначения

- Открываются справа или в drawer.
- Поля: задача, проект, текущий ресурс, даты, assignment id, conflict assignment ids.
- Действия: `Открыть задачу`, `Исправить конфликт`, `Сменить ресурс`, `Убрать ресурс с задачи`.
- Внутри текущего экрана доступны только интервалы текущего проекта; cross-project group planning в эту версию не входит.

### 6.6 Исправление конфликтов

- Нажатие `Исправить` сохраняет текущий flow `onCorrectConflict` и `PlannerCorrectionTarget`.
- Конфликтные интервалы не скрываются и не блокируют drag автоматически.
- Если пользователь перетаскивает bar так, что конфликт должен исчезнуть, UI сохраняет операцию и затем перезагружает planner, чтобы конфликтный статус пришёл с backend.

## 7. Данные и маппинг

### 7.1 Входной backend contract

Экран продолжает использовать текущие типы:

```ts
type PlannerScope = 'current-project';

interface ResourcePlannerResult {
  projectId: string;
  scope: PlannerScope;
  workspaceUserId: string;
  resources: ResourcePlannerResource[];
}

interface ResourcePlannerResource {
  resourceId: string;
  resourceName: string;
  hasConflicts: boolean;
  conflictCount: number;
  intervals: ResourcePlannerInterval[];
}
```

### 7.2 Маппинг в `gantt-lib`

```ts
ResourcePlannerResource.resourceId      -> ResourceTimelineResource.id
ResourcePlannerResource.resourceName    -> ResourceTimelineResource.name
ResourcePlannerResource.intervals       -> ResourceTimelineResource.items

ResourcePlannerInterval.assignmentId    -> ResourceTimelineItem.id
ResourcePlannerInterval.resourceId      -> ResourceTimelineItem.resourceId
ResourcePlannerInterval.taskId          -> ResourceTimelineItem.taskId
ResourcePlannerInterval.taskName        -> ResourceTimelineItem.title
ResourcePlannerInterval.projectName     -> ResourceTimelineItem.subtitle
ResourcePlannerInterval.startDate       -> ResourceTimelineItem.startDate
ResourcePlannerInterval.endDate         -> ResourceTimelineItem.endDate
ResourcePlannerInterval.hasConflict     -> ResourceTimelineItem.metadata.hasConflict
ResourcePlannerInterval.conflictCount   -> ResourceTimelineItem.metadata.conflictCount
ResourcePlannerInterval.conflictAssignmentIds -> ResourceTimelineItem.metadata.conflictAssignmentIds
```

### 7.3 Metadata shape

```ts
interface ResourcePlannerItemMetadata {
  projectId: string;
  projectName: string;
  taskId: string;
  assignmentId: string;
  resourceId: string;
  resourceName: string;
  hasConflict: boolean;
  conflictCount: number;
  conflictAssignmentIds: string[];
  assignmentCreatedAt: string;
  source: 'resource-planner-result';
}
```

## 8. Interaction requirements

### 8.1 Перенос по датам

При `onResourceItemMove`, если `fromResourceId === toResourceId`, но даты изменились:

1. UI переводит item в pending state.
2. Находит `taskId` из `move.item.taskId` или metadata.
3. Если изменилась дата начала и длительность сохранена — отправляет `move_task` с новой `startDate`.
4. Если изменилась длительность или только один край — отправляет `resize_task` для нужного anchor; если изменились оба края и длительность тоже изменилась, выполняет согласованный sequence команд или использует существующий helper, который уже поддерживает такую операцию.
5. После успешного command response обновляет project store из snapshot, если response его содержит.
6. Всегда перезагружает `/api/resources/planner?scope=current-project`.
7. При ошибке показывает toast/inline alert, снимает pending state и оставляет данные из последней успешной загрузки.

### 8.2 Перенос между ресурсами

При `fromResourceId !== toResourceId`:

1. UI проверяет, что `disableResourceReassignment` не активен и item не locked.
2. Берёт текущие assignments задачи из project store или дозагружает их из backend.
3. Формирует полный новый `resourceIds[]`: заменяет только `fromResourceId` на `toResourceId`, сохраняя остальные ресурсы задачи.
4. Отправляет `POST /api/tasks/:taskId/assignments`.
5. Обновляет project store assignments из ответа или reload project snapshot, если текущий store не может быть безопасно обновлён.
6. Перезагружает planner.

### 8.3 Комбинированный перенос

Если одновременно изменились даты и ресурс:

1. Выполнить изменение дат.
2. Затем выполнить замену assignment resource.
3. Если второй шаг упал, UI показывает частично применённое состояние как backend-authoritative после reload, а не пытается вручную откатить дату.
4. В истории/уведомлении действие показывается как одно пользовательское намерение: `Перенос назначения`.

### 8.4 Readonly и permissions

- Без `accessToken` экран readonly и показывает сообщение авторизации.
- Locked items не начинают drag и не показывают destructive actions.
- Неактивные ресурсы видимы только при включённом фильтре; назначения на них можно показывать readonly, если backend запрещает изменение.

## 9. API requirements

### Existing endpoints to reuse

- `GET /api/resources/planner?scope=current-project` — авторитетные planner данные для текущего экрана.
- `GET /api/resources?projectId=...` — каталог ресурсов.
- `POST /api/resources` — создание ресурса.
- `PATCH /api/resources/:resourceId` — редактирование ресурса.
- `POST /api/tasks/:taskId/assignments` — полная замена ресурсов задачи.
- Существующий endpoint command commit для `move_task` / `resize_task` — изменение дат задачи.

### Backend gaps to verify before implementation

- Возвращает ли `PATCH /api/resources/:resourceId` обновлённый ресурс в форме, удобной для web store.
- Есть ли в web layer единый helper для commit project command, который можно безопасно использовать вне основного Gantt экрана.
- Достаточно ли `/api/project` snapshot для восстановления assignments после изменения, или нужен отдельный reload assignments.
- Нужен ли endpoint `GET /api/tasks/:taskId/assignments`, если store не всегда содержит достаточные assignment metadata для resource reassignment.

## 10. State management and source of truth

### 10.1 Канонический источник истины

- Ресурсный экран не должен жить на отдельной модели optimistic schedule state.
- Канонический источник для дат задач — тот же, что и у основного Gantt: `confirmed.snapshot` + `pending` outbox commands + `dragPreview`.
- Ресурсный экран должен отображать projection от этого состояния, а не параллельную локальную копию графика.
- Для изменений по датам ресурсный экран обязан использовать тот же command pipeline, что и `useBatchTaskUpdate`.

### 10.2 Допустимые отдельные client-state слои

- `plannerState`: loading/error/ready + последняя успешная backend data для resource projection.
- `catalogState`: loading/error + resources из project store.
- `pendingMoveIds: Set<string>` только как локальный UI-guard для bars, но не как замена общему pending command state.
- `selectedItemId` и `selectedResourceId` для деталей.
- `filters`: query, resourceTypes, conflictOnly, includeInactive.
- Planner reload должен поддерживать `keepData`, чтобы экран не мигал при сохранении.

### 10.3 Архитектурное выравнивание с Gantt

- Изменение дат из resource screen должно читать и отражать `deriveVisibleSnapshot`, а не отдельный schedule cache.
- Отдельные reload вызовы допустимы как authoritative reconciliation layer, но не как primary state model.
- Перенос ресурса через assignments пока может оставаться отдельной mutation-веткой, но её UI-состояние должно быть согласовано с общим pending/saving flow проекта.
- Целевое состояние: resource screen и Gantt screen различаются renderer-ом и interaction surface, но не принципом записи project mutations.

## 11. Error handling

- Malformed planner payload → error state с кнопкой retry.
- Ошибка сохранения move → toast/alert + reload planner с `keepData`.
- Version conflict при command commit → reload project + reload planner + сообщение `Данные проекта изменились, повторите действие`.
- Validation error assignment → показать backend error рядом с timeline и не менять локальные resources.
- Partial failure комбинированного переноса → показать, какой шаг применился, и привести UI к backend state reload.

## 12. Accessibility

- Все фильтры имеют label и keyboard focus state.
- Timeline container имеет доступное имя: `Ресурсный календарь`.
- Bar имеет `aria-label` с задачей, ресурсом, датами и conflict status.
- Drawer деталей открывается по Enter/Space на bar, закрывается Esc.
- Критические действия имеют текстовое подтверждение, не только цвет.
- Drag не обязан иметь полноценный keyboard DnD в первой версии, но должны быть альтернативные действия в details drawer: сменить даты и сменить ресурс через форму.

## 13. Visual requirements

- Использовать CSS импорт `gantt-lib/styles.css` и не дублировать календарную геометрию.
- Resource bars должны визуально отличать: normal, conflict, selected, pending, locked.
- Header и side panels должны оставаться в стиле текущего workspace UI на Tailwind.
- Для плотного расписания стартовые параметры: `dayWidth=36`, `laneHeight=40`, `rowHeaderWidth=220`, `headerHeight=40`.
- При большом количестве ресурсов экран должен скроллиться без поломки header/row alignment.

## 14. Acceptance criteria

- Экран ресурсов использует `GanttChart mode="resource-planner"` или `ResourceTimelineChart`, а локальная календарная сетка больше не является основным renderer.
- `current-project` показывает shared + project ресурсы текущего проекта.
- Пустые ресурсы отображаются в timeline и доступны как drop target.
- Конфликтные назначения отображаются с badge и кнопкой/действием `Исправить`.
- Drag assignment по датам сохраняет изменение через project command flow и после успеха перезагружает planner.
- Drag assignment на другой ресурс сохраняет полный список `resourceIds` задачи и после успеха перезагружает planner.
- При ошибке сохранения UI не оставляет ложное optimistic состояние.
- Создание, редактирование и деактивация ресурса обновляют каталог и planner без ручного refresh страницы.
- Фильтры работают без повторного запроса.
- Readonly/locked states прокинуты в `gantt-lib` и не эмитят изменение.
- Тесты покрывают mapper, фильтры, renderItem metadata, conflict action, move date flow, reassignment flow и error rollback.
- Resource screen и Gantt screen используют один и тот же mutation pipeline для schedule changes.

## 15. Implementation plan

### Phase 1 — Pipeline alignment for schedule changes

- Зафиксировать правило source of truth: schedule changes идут только через общий command/outbox/store pipeline.
- Вынести общий helper для schedule mutations, чтобы его использовали и Gantt, и resource screen.
- Перестать опираться на отдельный optimistic schedule cache как на primary UI state в resource screen.
- Привязать timeline projection к visible project state там, где это возможно без потери текущего UX.

### Phase 2 — Adapter and renderer hardening

- Добавить mapper `ResourcePlannerResult` → `ResourceTimelineResource[]`.
- Добавить typed metadata и helpers `getPlannerItemMetadata`.
- Держать `gantt-lib` renderer как единственный основной timeline renderer.
- Сохранить существующие summary cards и `onCorrectConflict`.

### Phase 3 — Details and filters

- Добавить поиск, type filter, conflict-only и include-inactive.
- Добавить selected item/resource state.
- Реализовать details drawer с действиями и fallback формами для accessibility.

### Phase 4 — Resource catalog management

- Расширить форму создания: type + scope/project.
- Добавить edit resource name/type/status.
- Синхронизировать catalog reload и planner reload после изменений.

### Phase 5 — Assignment mutation alignment

- Подключить `onResourceItemMove`.
- Держать date move строго через общий command commit flow.
- Реализовать reassignment через `POST /api/tasks/:taskId/assignments`, но выровнять saving/pending UX с общим project pipeline.
- Добавить pending/error handling и reload strategy.
- Подготовить интерфейс для будущей унификации assignment mutations в тот же commit pipeline, если backend добавит соответствующие команды.

### Phase 6 — Hardening and future group scope prep

- Добавить tests.
- Проверить keyboard доступность details actions.
- Проверить large data performance на десятках ресурсов и сотнях интервалов.
- Зафиксировать, какие части текущего planner state можно переиспользовать для будущего group-level resource screen.

## 16. Open questions

- Должен ли drag по датам менять только `startDate` с сохранением длительности или поддерживать resize через отдельные handles в future версии?
- Требуется ли показывать capacity/availability ресурса, или на первой версии достаточно conflict overlap?
- Нужен ли отдельный audit/history label для операций, инициированных из resource screen?
- Нужен ли для будущего group-level screen отдельный planner endpoint или можно собирать projection по группе проектов из существующих transport contracts?
- Нужно ли сохранять filters в URL query, чтобы экран можно было шарить ссылкой?

## 17. References

- `RESOURCE-PLANNER-REFACTOR-PRD.md` — рабочий документ для архитектурного рефакторинга и выравнивания с Gantt pipeline.
- `RESOURCE-PLANNER-MODE-PRD.md` — исходный PRD миграции resource planner mode в `gantt-lib`.
- `D:\Projects\gantt-lib\docs\reference\15-resource-planner.md` — публичный contract resource planner mode.
- `D:\Projects\gantt-lib\docs\reference\04-props.md` — общие props `GanttChart`.
- `D:\Projects\gantt-lib\docs\reference\10-drag-interactions.md` — drag behavior и controlled update expectations.
- `D:\Projects\gantt-lib\docs\reference\12-validation.md` — validation model.
- `packages/web/src/components/workspace/ResourcePlannerWorkspace.tsx` — текущий экран planner.
- `packages/web/src/components/workspace/ResourceTimelineGrid.tsx` — текущий локальный renderer, который должен быть заменён.
- `packages/runtime-core/src/types.ts` — текущие resource/planner/assignment transport types.
