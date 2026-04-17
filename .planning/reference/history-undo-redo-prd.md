# PRD: История действий и Undo/Redo для графика GetGantt

## 1. Цель

Сделать безопасную историю изменений графика, чтобы пользователь мог:

- отменять и повторять последние действия
- откатывать целиком действия агента
- видеть понятную ленту изменений
- не бояться AI-мутаций и массовых операций

Главный принцип v1:

**История строится поверх уже существующего versioned command pipeline, а не через отдельную сложную snapshot-first систему.**

## 2. Что уже есть

В текущей системе уже реализован хороший фундамент:

- `Project.version` как линейная версия проекта
- optimistic concurrency через `baseVersion`
- единый authoritative commit path через `CommandService.commitCommand`
- `ProjectEvent` с логированием:
  - `baseVersion`
  - `version`
  - `actorType`
  - `actorId`
  - `command`
  - `result`
  - `patches`
- agent и web уже проходят через один command pipeline
- клиент уже умеет переживать `version_conflict` и подтягивать актуальный snapshot

Это значит, что v1 не нужно строить с нуля.

## 3. Проблема

Сейчас система хранит **события коммитов**, но не хранит **осмысленные пользовательские действия**.

Из-за этого:

- один ход агента может распасться на несколько `ProjectEvent`
- нельзя корректно отменить “то, что только что сделал агент”
- нет undo/redo
- нет панели истории действий
- `patches` недостаточны для надёжного отката
- нет сущности “операция”, которая объединяет несколько commit-команд

## 4. Продуктовая цель v1

После реализации v1 пользователь должен уметь:

- нажать `Ctrl+Z` и отменить последнее действие
- нажать redo и вернуть отменённое действие
- отменить **целый ход агента** одной операцией
- увидеть историю действий в UI
- понимать, кто именно изменил график:
  - пользователь
  - AI
  - система
- безопасно откатывать массовые изменения без разрушения истории

## 5. Что входит в v1

### 5.1 Undo/Redo на уровне действия

Undo/redo работает не по отдельным низкоуровневым полям и не по raw DB-изменениям, а по **MutationGroup**.

**MutationGroup** = одна осмысленная операция:

- ручной перенос задачи
- удаление нескольких задач
- AI-добавление ветки работ
- AI-перестройка нескольких связей

### 5.2 История действий

Появляется история действий проекта как список MutationGroup.

Каждая запись истории показывает:

- время
- автора
- заголовок действия
- статус:
  - применено
  - отменено
- возможность undo/redo, если допустимо

### 5.3 Undo для действий агента

Для v1 принимается правило:

**один agent turn = одна undoable операция**

То есть если агент за один запрос выполнил 5 commit-команд, пользователь должен иметь возможность откатить это **одним действием**.

### 5.4 Линейная история

История в v1 остаётся линейной:

- без веток
- без git-like branching
- без merge UI
- без произвольного time travel

## 6. Что не входит в v1

Не входит:

- checkpoints
- restore к произвольной старой версии
- materialized snapshots по версиям
- time travel preview
- ветки сценариев
- diff UI между версиями

Это можно добавить позже поверх той же архитектуры.

## 7. Функциональные требования

## 7.1 MutationGroup

Нужна новая сущность `MutationGroup`.

### Назначение

Объединяет несколько `ProjectEvent` в одну пользовательскую операцию.

### Поля

```ts
MutationGroup {
  id
  projectId
  baseVersion
  newVersion
  actorType: 'user' | 'agent' | 'system'
  actorId
  origin: 'user_ui' | 'agent_run' | 'system' | 'undo' | 'redo'
  title
  status: 'applied' | 'undone'
  undoneByGroupId?
  redoOfGroupId?
  createdAt
}
```

### Требования

- каждая undoable операция должна принадлежать одной группе
- один `ProjectEvent` должен ссылаться на `groupId`
- agent workflow должен передавать один `groupId` на весь run
- `MutationGroup.baseVersion` = версия до первого события группы
- `MutationGroup.newVersion` = версия после последнего события группы

## 7.2 ProjectEvent

Существующую таблицу `ProjectEvent` нужно расширить.

### Добавить поля

```ts
ProjectEvent {
  groupId
  ordinal
  inverseCommand
  metadata?
  requestContextId?
}
```

### Значение полей

- `groupId` — ссылка на MutationGroup
- `ordinal` — порядок события внутри группы
- `inverseCommand` — команда для отката этого события
- `metadata` — дополнительные сведения для UI/history
- `requestContextId` — связка нескольких событий одного agent run

### Требования

- каждый accepted command должен сохранять `inverseCommand`, если он undoable
- `ordinal` должен обеспечивать точный порядок undo в обратной последовательности
- для действий без корректного inverse такой event/group не считается undoable

## 7.3 Commit flow

Существующий `commitCommand` остаётся основным способом применения изменений.

### Новый flow

1. Клиент/агент начинает MutationGroup
2. Каждая commit-команда передаётся с `groupId`
3. Сервер:
   - проверяет `baseVersion`
   - применяет команду
   - вычисляет `inverseCommand`
   - сохраняет `ProjectEvent`
   - обновляет проектную версию
4. После последнего commit группы фиксируется `MutationGroup.newVersion`

### Принцип

История не хранится как “снапшоты действий”, а как:

- текущий state
- линейные версии
- события команд
- inverse-команды для undo

## 7.4 Undo

Undo создаёт **новую MutationGroup**, а не переписывает историю.

### Поведение

Если была группа `A`, то undo создаёт группу `B`, которая применяет inverse-команды группы `A`.

```text
Group A applied
Undo A
=> Group B(origin=undo)
```

### Алгоритм

1. Выбрать target group
2. Проверить, что она undoable и ещё не undone
3. Взять все её `ProjectEvent`
4. Пройти их в обратном порядке
5. Выполнить `inverseCommand` для каждого события
6. Создать новую `MutationGroup(origin='undo')`
7. Пометить исходную группу как `undone`

### Ограничения

- undo не должен ломать линейную историю
- undo не должен удалять записи из лога
- undo должен выполняться через тот же authoritative command pipeline

## 7.5 Redo

Redo тоже создаёт новую MutationGroup.

### Поведение

Redo повторяет исходные команды undone-группы в прямом порядке.

### Условие доступности

Redo допустим только если после undo не было новых обычных изменений, которые делают повтор небезопасным.

### Typed reason при отказе

Если redo невозможен, сервер должен вернуть контролируемую причину, например:

- `redo_not_available`
- `history_diverged`
- `target_not_undone`

## 7.6 History API

Нужен отдельный API для истории.

### Эндпоинты

#### `GET /api/history`

Возвращает список MutationGroup с агрегированными данными.

Пример ответа:

```ts
{
  items: Array<{
    id: string;
    actorType: 'user' | 'agent' | 'system';
    title: string;
    status: 'applied' | 'undone';
    baseVersion: number;
    newVersion: number;
    commandCount: number;
    createdAt: string;
    undoable: boolean;
    redoable: boolean;
  }>;
  nextCursor?: string;
}
```

#### `POST /api/history/undo`

Undo последней undoable группы.

#### `POST /api/history/:groupId/undo`

Undo конкретной группы.

#### `POST /api/history/:groupId/redo`

Redo конкретной группы.

### Требования

- история выдаётся по группам, не по сырым event-ам
- пагинация обязательна
- API должен возвращать новый snapshot и версию после undo/redo
- при `version_conflict` должен возвращаться актуальный snapshot

## 7.7 UI

### History panel

В UI появляется панель истории.

Каждая запись показывает:

- время
- автора
- заголовок действия
- статус
- кнопки undo/redo, если доступны

Пример:

```text
[12:01] Дмитрий — Сдвинул фундамент
[12:03] AI — Добавил этапы монолита
[12:06] System — Отменено: Добавил этапы монолита
```

### Горячие клавиши

- `Ctrl+Z` → undo последней undoable группы
- `Ctrl+Shift+Z` → redo последней redoable группы

### Требования UX

- undo/redo должны ощущаться мгновенно
- после undo/redo график обновляется authoritative snapshot-ом сервера
- история не должна путать optimistic pending state и persisted actions

## 8. Требования к inverse-командам

Undo должен строиться не по `patches`, а по сохранённым inverse-командам.

### Поддерживаемые в v1 команды

Для следующих команд должен быть реализован inverse:

- `move_task`
- `resize_task`
- `set_task_start`
- `set_task_end`
- `change_duration`
- `update_task_fields`
- `update_tasks_fields_batch`
- `create_task`
- `create_tasks_batch`
- `delete_task`
- `delete_tasks`
- `create_dependency`
- `remove_dependency`
- `change_dependency_lag`
- `reparent_task`
- `reorder_tasks`

### Общие правила

- изменение даты/длительности → inverse через старые значения
- update fields → inverse через previous fields
- create → inverse через delete
- delete → inverse через recreate удалённых сущностей
- dependency create/remove/change → симметричный inverse
- reorder → inverse через предыдущий `sortOrder`
- reparent → inverse через предыдущий `parentId`

### Особый случай delete

Для `delete_task` / `delete_tasks` before-context должен включать:

- сами задачи
- иерархию
- sortOrder
- зависимости

Иначе корректный undo удаления невозможен.

## 9. Требования к агенту

### Главная цель

Undo после действий агента должен работать на уровне **одного user-visible хода**.

### Требования

- staged mutation flow должен начинать одну MutationGroup на весь запрос
- deterministic/hybrid execution должен прокидывать один и тот же `groupId`
- full-agent path тоже должен писать события в ту же группу
- если агентский run завершился частично и не собрал валидную undoable группу, это должно явно маркироваться

### Заголовок истории

Для agent group нужен нормальный title, пригодный для UI.

Примеры:

- `AI — Добавил этапы отделки`
- `AI — Перестроил зависимости бетонных работ`
- `AI — Расширил ветку подземной части`

## 10. Нефункциональные требования

### Надёжность

- undo должен возвращать график в идентичное состояние до группы
- redo должен возвращать график в идентичное состояние после исходной группы
- не допускается silent partial undo

### Производительность

- commit path не должен существенно деградировать
- history API должен быть пагинируемым
- opening project не должен зависеть от полного replay истории

### Совместимость

- текущий command pipeline остаётся authoritative
- текущий `Project.version` сохраняется
- текущий `ProjectEvent` не заменяется, а расширяется

## 11. Ограничения v1

- история линейная
- undo unit = MutationGroup
- частичный undo внутри группы запрещён
- redo доступен только при неразошедшейся истории
- checkpoints и restore отсутствуют

## 12. Критерии успеха

Фича считается успешной, если:

- пользователь может отменить последнее ручное действие без ошибок
- пользователь может отменить целый ход агента одной операцией
- redo работает предсказуемо
- история в UI понятна без чтения сырых событий
- не возникает потери данных при version conflict
- undo/redo работают через существующий authoritative server path

## 13. Этапы реализации

### Phase 1. Серверная модель истории

- добавить `MutationGroup`
- расширить `ProjectEvent`
- научить commit path принимать `groupId`
- сохранять `ordinal` и `inverseCommand`

### Phase 2. Undo/Redo backend

- реализовать undo service
- реализовать redo service
- добавить history API
- typed failure reasons

### Phase 3. Agent integration

- объединить agent turn в одну группу
- прокинуть `groupId/requestContextId` через staged mutation flow
- нормализовать title для agent groups

### Phase 4. Web UI

- history panel
- undo/redo actions
- hotkeys
- authoritative refresh and state sync

## 14. Будущие расширения

### v2

- checkpoints
- restore к выбранной группе/версии
- diff истории
- фильтры по авторам и типам действий

### v3

- time travel preview
- scenario branches
- named snapshots

## 15. Ключевое решение

**В v1 проблему возврата решает не snapshot-архитектура сама по себе, а связка:**

- `Project.version`
- authoritative command pipeline
- `ProjectEvent`
- `MutationGroup`
- `inverseCommand`

Это минимально достаточная архитектура, чтобы получить надёжный undo/redo, включая откат действий агента, без лишнего усложнения системы на первом этапе.
