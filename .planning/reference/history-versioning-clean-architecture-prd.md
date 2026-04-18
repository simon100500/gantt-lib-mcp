# PRD: Clean Architecture Refactor for History Version Viewing and Restore

## 1. Контекст

Phase 44 доставил технически консистентную v1-модель истории:

- `MutationGroup` как user-visible unit
- `ProjectEvent` с `groupId`, `ordinal`, `inverseCommand`, `requestContextId`
- authoritative commit path через `CommandService.commitCommand`
- append-only undo/redo через новые группы
- grouped history API
- history panel и hotkeys на web

Это был правильный инженерный фундамент.

Но продуктово и архитектурно эта модель остаётся слишком близкой к внутреннему event log:

- undo/redo остаются центральными UX-концепциями
- пользователь работает с “операциями rollback/replay”, а не с понятными версиями документа
- UI и API отражают внутреннюю механику больше, чем продуктовую модель

Цель этого refactor PRD:

**спроектировать чистую архитектуру истории как просмотра и восстановления версий документа поверх Phase 44 foundation**

Этот документ следует читать так, как будто реализация начинается заново после [`44-CONTEXT.md`](/D:/Projects/gantt-lib-mcp/.planning/phases/44-undo-redo/44-CONTEXT.md), без обязательств перед текущей remediation-реализацией.

## 2. Продуктовая проблема

Пользователю нужен не “undo/redo журнал”, а простая модель версий, близкая к Google Sheets:

- есть список версий
- можно кликнуть по версии и посмотреть, как документ выглядел тогда
- можно вернуться к текущей версии
- можно отдельно выбрать `Восстановить эту версию`

То есть пользовательская ментальная модель должна быть:

- `view old version`
- `restore old version`

а не:

- `undo`
- `redo`
- `diverged redo branch`

## 3. Главная цель

Построить history architecture, где:

1. история в UI выглядит как список версий документа
2. клик по записи открывает preview этой версии
3. восстановление версии является отдельным явным действием
4. preview и restore вычисляются authoritative backend-логикой
5. frontend не исполняет history semantics самостоятельно
6. append-only Phase 44 foundation сохраняется как внутренняя реализация

## 4. Что сохраняем из Phase 44

Следующие решения из Phase 44 считаются правильной основой и не пересматриваются:

- `Project.version`
- authoritative mutation boundary через `CommandService.commitCommand`
- `MutationGroup` как единица пользовательского действия
- `ProjectEvent.groupId`
- `ordinal`
- `inverseCommand`
- `requestContextId`
- правило `one agent turn = one MutationGroup`
- optimistic concurrency и versioned pipeline
- append-only event/history foundation

То есть этот refactor не отменяет Phase 44.

Он меняет **продуктовый и архитектурный слой поверх него**.

## 5. Что считаем неверной моделью для дальнейшего развития

После этого refactor продукт и архитектура не должны строиться вокруг:

- `undo` как основной пользовательской операции карточки
- `redo` как обязательного публичного UX
- client-side replay inverse-команд для показа версии
- смешивания current editing state и history preview state
- API, который заставляет UI понимать rollback mechanics

Это может оставаться глубоко внутри реализации, но не должно быть основным контрактом системы.

## 6. Целевая продуктовая модель

## 6.1 Лента версий

История в UI представляет собой линейный список версий.

Каждая запись показывает:

- время
- автора
- понятный заголовок
- признак текущей версии
- меню действий

Основные пользовательские действия:

- клик по записи: `Показать эту версию`
- меню `...`:
  - `Показать эту версию`
  - `Восстановить эту версию`

## 6.2 Preview версии

Когда пользователь выбирает прошлую версию:

- документ переключается в режим просмотра этой версии
- редактирование отключается
- пользователь явно видит, что он смотрит старую версию
- текущая project version не меняется
- никакой rollback не пишется в БД

## 6.3 Restore версии

Когда пользователь выбирает `Восстановить эту версию`:

- система выполняет authoritative rollback активного хвоста
- текущая версия проекта реально меняется
- после восстановления выбранная версия становится текущей активной точкой

## 6.4 Возврат к текущей версии

Из режима preview пользователь должен иметь явный выход:

- `Вернуться к текущей версии`

Если пользователь выбирает в истории уже текущую версию:

- preview mode завершается
- UI показывает normal editing state

## 7. Архитектурное решение верхнего уровня

Система должна разделять три разные сущности:

1. `History Timeline`
2. `Historical Snapshot Preview`
3. `Restore Operation`

Это разные сценарии и они не должны быть слеплены в один undo/redo API.

## 8. Целевая backend-архитектура

## 8.1 Публичный history contract

Backend должен предоставлять три product-oriented операции.

### A. `GET /api/history`

Возвращает user-visible linear history.

Пример контракта:

```ts
{
  items: Array<{
    id: string;
    actorType: 'user' | 'agent' | 'system';
    title: string;
    createdAt: string;
    baseVersion: number;
    newVersion: number | null;
    commandCount: number;
    isCurrent: boolean;
    canRestore: boolean;
  }>;
  nextCursor?: string;
}
```

### B. `GET /api/history/:groupId/snapshot`

Возвращает готовый authoritative snapshot проекта на выбранной версии.

Пример контракта:

```ts
{
  groupId: string;
  isCurrent: boolean;
  currentVersion: number;
  snapshot: ProjectSnapshot;
}
```

### C. `POST /api/history/:groupId/restore`

Восстанавливает выбранную версию как текущую.

Пример контракта:

```ts
{
  groupId: string;        // rollback technical group
  targetGroupId: string;  // requested visible version
  version: number;
  snapshot: ProjectSnapshot;
}
```

## 8.2 HistoryService responsibilities

HistoryService должен иметь отдельные domain операции:

1. `listHistoryGroups(projectId, cursor, limit)`
2. `getHistorySnapshot(projectId, groupId)`
3. `restoreToGroup(projectId, groupId, actor, requestContextId)`

Они должны использовать общий внутренний history domain model, но разные execution paths.

## 8.3 Общая внутренняя логика

И `getHistorySnapshot`, и `restoreToGroup` должны:

1. найти активную линейную пользовательскую историю
2. найти target group внутри этой линии
3. определить хвост групп после target
4. валидировать, что этот хвост можно откатить
5. взять inverse-команды хвоста в правильном порядке

Различие:

- `getHistorySnapshot` применяет этот откат в memory-only режиме
- `restoreToGroup` применяет этот откат через authoritative commit path с записью rollback-группы

## 8.4 Ключевой принцип

**Preview и restore должны использовать одну и ту же domain semantics, но не один и тот же side effect path.**

То есть:

- одна логика определения, что именно нужно откатить
- один порядок inverse-команд
- два режима исполнения:
  - pure preview
  - persisted restore

## 8.5 Как вычислять snapshot preview

Сервер не должен просить клиента replay-ить команды.

`GET /api/history/:groupId/snapshot` должен сам:

1. загрузить текущий authoritative snapshot проекта
2. вычислить rollback tail до target group
3. применить inverse-команды хвоста к snapshot в memory-only режиме
4. вернуть готовый `ProjectSnapshot`

## 8.6 Ограничения preview path

Preview path:

- не должен менять `Project.version`
- не должен создавать `ProjectEvent`
- не должен создавать `MutationGroup`
- не должен писать никаких side effects в БД

## 8.7 Ограничения restore path

Restore path:

- должен использовать существующий authoritative command pipeline
- должен откатывать только активный хвост
- не должен replay-ить всю историю проекта с нуля
- может создавать техническую rollback group, если это нужно для append-only consistency

## 9. Shared command execution layer

## 9.1 Требование

Чтобы preview и restore не расходились, нужен чистый shared execution layer для typed commands.

Система должна иметь **pure command application capability**, которая умеет:

- взять `ProjectSnapshot`
- применить typed `ProjectCommand`
- вернуть новый `ProjectSnapshot`

без persistence и version bump.

## 9.2 Допустимые варианты реализации

### Вариант A. Shared pure replay module

Выделить отдельный модуль чистого применения `ProjectCommand` к snapshot.

Это предпочтительный вариант.

### Вариант B. CommandService non-persist execution mode

Если reuse проще внутри `CommandService`, допустимо вынести non-persist path из него.

Но результат должен быть тот же:

- preview не зависит от client replay
- restore и preview используют одну execution semantics

## 9.3 Недопустимый вариант

Недопустимо оставлять ситуацию, где:

- backend знает restore semantics
- frontend отдельно знает preview semantics

Это создаёт архитектурный split-brain.

## 10. Целевая frontend-архитектура

## 10.1 Отдельный History Viewer Mode

Frontend должен явно хранить отдельный state machine для просмотра истории.

Пример:

```ts
type HistoryViewerState =
  | { mode: 'inactive' }
  | {
      mode: 'preview';
      groupId: string;
      snapshot: ProjectSnapshot;
      isCurrent: boolean;
    };
```

## 10.2 Что не должно происходить

Исторический preview не должен быть встроен как ещё один слой в authoritative project state.

Не нужно смешивать в одном абстрактном контейнере:

- confirmed current state
- optimistic pending
- drag preview
- historical preview

Это разные режимы системы.

## 10.3 Правило visible snapshot

UI должен вычислять видимое состояние так:

1. если активен `historyViewer.mode === 'preview'`, показываем `historyViewer.snapshot`
2. иначе если активен drag preview, показываем drag preview
3. иначе показываем current project editing snapshot

Но эти режимы должны быть структурно разнесены.

## 10.4 Editing policy

Во время history preview:

- task mutations disabled
- AI mutations disabled
- command hotkeys disabled
- optimistic state не должен накапливаться

Исторический просмотр должен быть строго read-only.

## 10.5 UI behavior

History panel должен:

- показывать selected version
- показывать current version
- разрешать click-to-preview
- содержать меню `...`

Workspace должен:

- ясно показывать `Просмотр версии`
- иметь action `Вернуться к текущей версии`
- блокировать editing while previewing

## 11. Agent and title semantics

История по-прежнему должна уважать решения Phase 44:

- один agent turn = одна user-visible history version
- agent-created versions должны иметь понятные titles
- если группа не может быть безопасно restored, это должно быть выражено явно

## 12. API contract principles

## 12.1 Product contract, not mechanism contract

Публичный API должен описывать:

- version list
- version snapshot
- restore version

а не:

- undo group
- redo group
- divergence branch handling

## 12.2 Hidden internals

Следующие поля/концепции не должны быть частью основного UI contract:

- `origin='undo'`
- `origin='redo'`
- `undoneByGroupId`
- `redoOfGroupId`
- internal redo availability semantics

Они остаются внутренними деталями модели.

## 13. Data model policy

Новая миграция не требуется, если текущих Phase 44 полей достаточно.

Предполагается reuse следующих сущностей:

- `MutationGroup`
- `ProjectEvent`
- `inverseCommand`
- `ordinal`
- `requestContextId`
- `Project.version`

Этот refactor должен быть:

- domain/API/UI refactor
- а не schema rewrite

## 14. Out of scope

Этот refactor не включает:

- branching history
- compare view / diff mode
- arbitrary restore by raw version number
- materialized snapshots for every version
- checkpoint system
- git-like timeline

## 15. Success criteria

Refactor успешен, если одновременно выполняются все условия:

1. `GET /api/history` возвращает user-visible линейную историю версий.
2. Клик по записи истории открывает preview выбранной версии.
3. Preview версии возвращается с сервера как готовый snapshot.
4. Frontend не replay-ит inverse-команды для history preview.
5. `Восстановить эту версию` остаётся отдельной action, не эквивалентной preview.
6. Preview mode архитектурно отделён от основного project editing state.
7. Restore по-прежнему откатывает только активный хвост.
8. Restore использует existing authoritative command path.
9. В server/web integration нет `as any` и скрытых type workarounds на history path.

## 16. План реализации

### Step 1. Domain refactor

- выделить shared history-tail resolution logic
- выделить shared pure command application path
- реализовать `getHistorySnapshot`
- реализовать `restoreToGroup`

### Step 2. API refactor

- `GET /api/history`
- `GET /api/history/:groupId/snapshot`
- `POST /api/history/:groupId/restore`
- убрать публичную зависимость UI от undo/redo endpoints

### Step 3. Frontend state refactor

- ввести отдельный `HistoryViewerState`
- убрать history preview из основного project state
- обновить visible snapshot selector

### Step 4. UI refactor

- click row = preview version
- menu `...` = restore action
- add `Вернуться к текущей версии`
- блокировать edit actions during preview

### Step 5. Type/package cleanup

- синхронизировать package contracts
- убрать type workarounds
- обновить tests

## 17. Ключевое решение

**После Phase 44 правильная следующая архитектура истории — это не “лучший undo/redo UI”, а “version preview + version restore” поверх существующего append-only history foundation.**

Правильный раздел:

- Phase 44 foundation:
  - event log
  - mutation groups
  - inverse commands
  - append-only restore mechanics

- New product architecture:
  - version list
  - version snapshot preview
  - version restore
  - isolated history viewer mode
