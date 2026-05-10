# CUSTOM-REQUEST-SERVER-OWNED-GENERATION-PRD

## Название
Server-owned generation для custom request flow в GetGantt

## Статус
Draft

## Контекст
Сейчас custom request flow уже умеет:

1. принять свободное описание проекта на site
2. создать `ProjectCreationIntent`
3. открыть app
4. создать новый проект
5. запустить `runInitialGeneration(...)`

Но фактическая генерация всё ещё слишком сильно завязана на живую клиентскую сессию, текущее WS-соединение и локальное chat/UI state.

Это приводит к нестабильному UX:

- в чате может пропадать loader
- preview задач может показываться до финального сохранения
- после refresh пользователь может увидеть пустой проект
- при проблемах с WS или dev-restart generation выглядит зависшей
- источник истины о состоянии generation размазан между сервером, WS и локальным состоянием клиента

## Проблема
Для сценария `создать новый график по описанию` generation должна быть серверной задачей, а не хрупким клиентским процессом.

Текущий поток допускает ситуации, когда:

- generation уже стартовала, но клиент теряет визуальное состояние
- клиент видит временный preview как будто это уже результат
- финал generation не переживает refresh прозрачно
- пользователь не может надёжно восстановить прогресс после перезагрузки страницы

Главный продуктовый дефект:

пользователь не понимает, идёт ли generation сейчас, завершилась ли она, сломалась ли она, и сохранён ли результат в проекте.

## Цель
Сделать generation в custom request flow полностью server-owned:

1. generation job создаётся и хранится на сервере
2. generation продолжает жить независимо от открытого чата
3. refresh страницы не ломает generation
4. клиент может заново прочитать состояние job и восстановить UX
5. preview и финальный результат имеют чётко разные статусы
6. итоговый проект никогда не зависит от локального chat state

## Не-цель

- не переводить generation на generic agent path
- не отдавать построение проекта внешнему агенту
- не менять алгоритмическую основу `runInitialGeneration(...)`
- не переписывать весь чат целиком
- не делать универсальную job-систему для всех AI-фич на первом этапе

## Product Principle
Генерация стартового графика должна быть алгоритмической и серверной. Клиент может только:

- создать job
- показать её состояние
- получить финальный результат

Но клиент не должен быть владельцем жизненного цикла generation.

## User Story
Как пользователь, который создаёт новый проект по свободному описанию, я хочу чтобы генерация шла надёжно и продолжалась даже после refresh, чтобы я всегда видел понятный статус и не терял результат.

## JTBD
When I describe a new project and ask GetGantt to generate a starting schedule, I want the server to own the generation lifecycle so that progress and final results survive reconnects, refreshes, and transient UI failures.

## Симптомы текущей версии

- loader в чате может появляться и исчезать не в тот момент
- stream preview-задач может показать структуру до коммита
- после refresh проект может выглядеть пустым
- пользователь не понимает, это preview, pending commit или уже сохранённый график
- WS сейчас ускоряет UX, но фактически стал критичным для понимания состояния generation

## Целевой UX

### После создания нового проекта из intent
Пользователь попадает в новый проект и видит не пустой чат, а серверный статус generation.

Например:

- `Подготавливаем структуру графика`
- `Рассчитываем календарь и связи`
- `Сохраняем итоговый график в проект`
- `График готов`

### При refresh

- проект снова открывается
- клиент читает active generation job для этого проекта
- если job ещё `queued/running`, UI восстанавливает loader и статус
- если job `succeeded`, UI показывает сохранённый результат
- если job `failed`, UI показывает понятную ошибку и возможность повторить

### Важное правило UX
Preview не должен выглядеть как уже сохранённый результат.

Если preview остаётся:

- он должен быть явно помечен как временный
- после refresh пользователь должен понимать, что финальный commit ещё не завершён

Если preview мешает надёжности:

- для этого flow допустимо вовсе отказаться от него и оставить только stage/status stream

## Предлагаемое решение

### 1. Ввести persisted generation job
Новая серверная сущность:

- `project_generation_jobs`

Каждый запуск initial generation создаёт отдельную job.

### 2. Привязать generation к `jobId`, а не к локальному chat state
`runInitialGeneration(...)` должен запускаться как server-owned процесс с persisted metadata:

- `jobId`
- `projectId`
- `intentId`
- `userId`
- `sessionId` nullable

`sessionId` нужен только для live-push, но не как единственный носитель состояния.

### 3. Сделать БД источником истины
Источник истины о generation:

- не `aiThinking` в клиенте
- не наличие preview в памяти
- не открытый чат

Источник истины:

- запись job в БД
- её status/stage/progress metadata
- итоговый persisted result

### 4. Оставить WS как ускоритель, а не как единственный канал
WS по-прежнему нужен для live UX:

- статусы этапов
- preview wave, если сохранится
- финальный `tasks`
- `done`

Но если WS умер:

- job всё равно идёт
- клиент после reconnect/reload дочитывает состояние job по REST

## Data Model

### Новая таблица
`project_generation_jobs`

Поля:

- `id`
- `projectId`
- `intentId` nullable
- `userId`
- `source`
  Рекомендуемое значение: `project_creation_intent`
- `type`
  Рекомендуемое значение: `initial_generation`
- `status`
  `queued | running | succeeded | failed | canceled`
- `stage`
  `queued | interpreting | structure_planning | schedule_planning | compiling | committing | finalizing | succeeded | failed`
- `statusMessage` nullable
- `requestContextId` nullable
- `historyGroupId` nullable
- `previewAvailable` boolean default false
- `errorCode` nullable
- `errorMessage` nullable
- `startedAt` nullable
- `finishedAt` nullable
- `createdAt`
- `updatedAt`

### Опциональные persisted payloads

- `metadata` JSON
- `previewSummary` JSON nullable
- `resultSummary` JSON nullable

## Backend Requirements

### Новый lifecycle

#### `POST /api/project-intents/:intentId/start-generation`
Должен:

1. проверить prepared project
2. создать `project_generation_job`
3. вернуть `jobId`
4. асинхронно стартовать `runInitialGeneration(...)`

Важно:

- endpoint не должен быть владельцем long-running state
- даже если HTTP request уже завершился, job продолжает жить

### Новый endpoint
`GET /api/project-generation-jobs/:jobId`

Возвращает:

- `id`
- `projectId`
- `status`
- `stage`
- `statusMessage`
- `previewAvailable`
- `errorMessage`
- `startedAt`
- `finishedAt`

### Новый endpoint для текущего проекта
`GET /api/project-generation-jobs/active?projectId=:id`

Нужен чтобы после refresh клиент мог быстро понять:

- есть ли активная generation job для этого проекта
- в каком она состоянии

### Изменения в `runInitialGeneration(...)`
`runInitialGeneration(...)` должен уметь:

1. обновлять persisted stage в БД
2. писать `statusMessage`
3. сохранять `requestContextId/historyGroupId`
4. финализировать job как `succeeded` или `failed`
5. не зависеть от того, открыт ли чат

## Stage Model

Рекомендуемые этапы:

1. `queued`
2. `interpreting`
3. `structure_planning`
4. `schedule_planning`
5. `compiling`
6. `committing`
7. `finalizing`
8. `succeeded`
9. `failed`

Примеры `statusMessage`:

- `Понимаем запрос и состав проекта`
- `Строим структуру графика`
- `Рассчитываем сроки и зависимости`
- `Сохраняем график в проект`
- `Завершаем генерацию`

## Frontend Requirements

### App startup after intent project creation
После `create-project` клиент больше не должен полагаться на локальную магию вида:

- `pendingPreparedIntentStart`
- `queuedPromptRef`
- временный локальный chat-only lifecycle

Вместо этого:

1. вызвать `start-generation`
2. получить `jobId`
3. сохранить `jobId` в состоянии проекта
4. подписаться на live updates
5. параллельно уметь восстанавливаться по REST

### После refresh
При открытии проекта app должна:

1. запросить `active generation job` для текущего проекта
2. если job `queued/running`, включить loader и stage UI
3. если job `succeeded`, загрузить обычный persisted проект
4. если job `failed`, показать ошибку

### Chat behavior
Чат в этом сценарии должен быть только UI-поверхностью для отображения generation status и итоговых assistant messages.

Чат не должен быть единственным местом, где живёт state generation.

## Preview Policy

Есть два допустимых варианта:

### Вариант A. Persisted preview
Если preview нужен продуктово, он должен быть persisted как часть job-state.

Тогда после refresh клиент понимает:

- preview есть
- final commit ещё не завершён

### Вариант B. No preview for this flow
Если preview остаётся слишком рискованным, для custom request flow можно отключить именно preview задач, но оставить:

- server-owned stage stream
- финальный persisted результат

Рекомендация на первый надёжный релиз:

- не делать preview источником истины
- либо persist preview
- либо убрать его именно из этого flow

## Надёжность

### Обязательные гарантии

- generation не должна теряться после refresh
- generation не должна зависеть от открытого чата
- один intent не должен запускать несколько параллельных initial generations для одного проекта
- один project не должен случайно принять generation другого проекта
- финальный persisted result должен быть проверяемым через job status

### Idempotency

- если `start-generation` вызван повторно для того же prepared project
- и активная job уже существует
- сервер должен вернуть существующую job, а не запускать вторую

## Error Handling

Если generation падает:

- job status = `failed`
- в БД фиксируется `errorMessage`
- UI после refresh всё равно видит, что generation завершилась ошибкой
- пользователь получает понятный next step

Важно:

- ошибка не должна теряться только потому, что WS-сокет уже закрыт

## Analytics

Новые события:

- `project_generation_job_created`
- `project_generation_job_started`
- `project_generation_job_stage_changed`
- `project_generation_job_succeeded`
- `project_generation_job_failed`
- `project_generation_job_restored_after_refresh`

Поля:

- `jobId`
- `projectId`
- `intentId`
- `source`
- `stage`
- `status`

## Risks

- усложнение backend lifecycle
- понадобится persisted job-state и cleanup policy
- preview logic может конфликтовать с persisted final state
- dev-mode `node --watch` всё ещё может убивать процесс посреди job

## Risk Mitigation

- хранить job-state в БД
- сделать stage model маленькой и жёсткой
- запускать generation независимо от chat state
- не считать preview финальным результатом
- в dev явно принимать, что live process может умереть, но job architecture должна быть готова к продовой стабильности

## Open Questions

1. Сохраняем ли preview для этого flow или убираем полностью?
   Рекомендация: сначала убрать как источник истины.

2. Нужен ли отдельный polling fallback, если WS не подключён?
   Рекомендация: да, короткий polling для active job.

3. Нужен ли retry failed job?
   Рекомендация: не в первом этапе. Сначала read-only failure visibility.

4. Должна ли новая job-system позже переиспользоваться для других AI flows?
   Рекомендация: да, но не раздувать первый scope.

## Acceptance Criteria

- После запуска generation создаётся persisted `project_generation_job`.
- Generation продолжает жить независимо от открытого чата.
- После refresh клиент восстанавливает состояние active generation job.
- Пользователь видит понятный persisted status generation.
- Если generation завершилась успешно, итоговый график доступен после refresh.
- Если generation завершилась с ошибкой, ошибка видна после refresh.
- Повторный вызов `start-generation` не создаёт дубликат job для того же prepared project.
- Генерация стартового графика остаётся алгоритмической через `runInitialGeneration(...)`.
- Текущий активный соседний проект не может стать accidental target этой generation.

