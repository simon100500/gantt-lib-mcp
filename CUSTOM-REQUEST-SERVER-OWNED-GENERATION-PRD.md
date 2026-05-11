# GENERATION-MUST-LIVE-ON-THE-SERVER-PRD

## Название
Server-owned generation для любого generation flow в GetGantt

## Статус
Draft

## Для кого этот документ
Внутренний продуктовый и backend/frontend документ для команды, которая будет переводить generation lifecycle с client-owned модели на server-owned.

После прочтения читатель должен понимать:

- какой архитектурный инвариант теперь обязателен для любой generation;
- какие flow входят в первую волну migration;
- какой backend/frontend/data contract должен появиться;
- как staged rollout сделать без повторного проектирования под каждый новый generation flow.

## Кратко
Любая generation, которая:

- строит стартовый график;
- делает AI-driven изменение графика;
- компилирует план в persisted project result;
- занимает дольше обычного sync request;
- зависит от stream/status/progress;

должна жить как серверная job.

Клиент может:

- создать job;
- читать её статус;
- подписаться на live updates;
- показать persisted result или persisted failure.

Клиент не должен быть владельцем generation lifecycle.

## Контекст
Сейчас в продукте уже есть несколько generation-подобных сценариев с разной степенью связности с UI:

1. custom request при создании нового проекта;
2. initial generation для пустого проекта;
3. возможные последующие AI-driven generation/mutation flow;
4. другие долгие generation pipeline, где UI ждёт stream, preview или финальный commit.

Текущая проблема не в одном конкретном custom request flow. Проблема системная:

- generation стартует из UI-контекста;
- визуальное состояние живёт в chat/session/local refs;
- WS часто становится единственным наблюдаемым источником прогресса;
- refresh/reconnect/dev-restart ломают понимание, что реально происходит;
- preview может выглядеть как уже сохранённый результат;
- финальный commit и пользовательский UX разъезжаются.

Из-за этого пользователь не знает:

- generation ещё идёт или уже умерла;
- preview это черновик или итог;
- результат уже сохранён в проект или ещё нет;
- можно ли безопасно перезагрузить страницу.

## Проблема
Пока generation считается частью живой клиентской сессии, продукт остаётся хрупким.

Симптомы:

- loader исчезает раньше времени;
- preview переживает reload хуже, чем сама серверная работа;
- финальное состояние job не восстанавливается прозрачно;
- retry/idempotency не формализованы;
- один и тот же generation flow приходится каждый раз отдельно "докручивать" под refresh, WS и local state.

Главный дефект:

источник истины о generation размазан между сервером, сокетом и клиентской памятью.

## Цель
Сделать любой generation flow server-owned по общему контракту.

Это означает:

1. каждый generation run существует как persisted job на сервере;
2. сервер является единственным владельцем lifecycle job;
3. generation продолжает жить без открытого чата и без активной вкладки;
4. клиент в любой момент может восстановиться из persisted job state;
5. preview, live stream и финальный persisted result строго разведены;
6. результат проекта никогда не зависит от локального chat state.

## Не-цели

- не переписывать весь AI runtime за один шаг;
- не строить сразу универсальный distributed queue framework для всех background задач продукта;
- не менять алгоритмическую основу `runInitialGeneration(...)` только ради этого PRD;
- не переводить всё на generic external agent path;
- не обещать cross-process durability уровня отдельного worker cluster в первой итерации;
- не требовать, чтобы любой generation flow сразу поддержал preview.

## Product Principle
Любая generation, которая меняет или создаёт project result, должна быть серверной задачей с persisted lifecycle.

WS, чат, loader, preview, optimistic UI и локальные refs могут ускорять UX, но не могут быть source of truth.

## Инвариант платформы
Новый обязательный контракт:

`generation = persisted server job + optional live transport + authoritative persisted result`

Не допускается архитектура вида:

- клиент держит единственное состояние generation;
- финальный результат существует только в памяти до закрытия сокета;
- refresh обнуляет понимание того, что происходит;
- preview визуально неотличим от committed project state.

## Какие flow покрывает этот PRD

### Первая волна migration

- custom request -> создание нового проекта -> initial generation;
- initial generation в пустом проекте;
- любой новый flow, который строит schedule дольше одного обычного sync roundtrip.

### Вторая волна migration

- long-running in-project AI generation/mutation;
- generation flow с repair loop;
- flow с persisted preview или стадийным compiler pipeline.

### Вне scope первой реализации

- мелкие синхронные операции, где generation фактически не существует как отдельный lifecycle;
- не-AI background задачи, если им не нужен такой же UX/state contract;
- полный re-platforming всех существующих automation jobs в продукте.

## User Stories
Как пользователь, я хочу чтобы любая генерация графика жила на сервере и не терялась после refresh, чтобы я всегда видел понятный статус и не терял результат.

Как пользователь, я хочу чтобы черновой preview не маскировался под уже сохранённый график.

Как пользователь, я хочу чтобы при ошибке generation сервер сохранил понятный failure state, который можно увидеть даже после перезахода.

## JTBD
When I ask GetGantt to generate or substantially transform a schedule, I want the server to own the entire generation lifecycle so that progress, failure, and final results survive reconnects, refreshes, and transient UI issues.

## Целевой UX

### Во время любой generation
Пользователь видит server-backed status:

- `queued`
- `running`
- текущий `stage`
- понятный `statusMessage`

Если доступен live transport, UI получает быстрые обновления. Если transport пропал, пользователь не теряет generation.

### После refresh

- проект или экран открывается заново;
- клиент запрашивает active generation jobs для текущего контекста;
- если job активна, UI восстанавливает loader/stage;
- если job завершена, UI показывает persisted result или persisted failure;
- пользователь не должен угадывать состояние по косвенным признакам.

### Preview rule
Если preview существует, он обязан быть одним из двух типов:

1. `persisted preview`
2. `ephemeral preview`, явно помеченный как provisional и не authoritative

Запрещён третий вариант:

- ephemeral preview, который выглядит как уже сохранённый график и после reload оставляет пользователя в неясности.

## Предлагаемое решение

### 1. Ввести единый persisted generation job
Новая серверная сущность:

- `project_generation_jobs`

Каждый значимый generation run создаёт или переиспользует job.

### 2. Отвязать generation от локального chat/UI state
Любой generation pipeline должен запускаться по `jobId`, а не по временному состоянию вкладки.

Важное следствие:

- чат отображает generation;
- чат не владеет generation.

### 3. Сделать БД источником истины
Истина о generation живёт в persisted job record:

- `status`
- `stage`
- `statusMessage`
- `progress`
- `preview metadata`
- `error state`
- `result linkage`

### 4. Оставить live transport ускорителем
WS/SSE могут доставлять:

- смену stage;
- progress;
- preview;
- финальные уведомления;

но отсутствие live transport не должно ломать job lifecycle.

### 5. Развести orchestration и projection
Сервер делает две разные вещи:

1. исполняет generation lifecycle;
2. проецирует его состояние в удобный для UI read model

Это позволит не перепридумывать UX contract для каждого нового generation flow.

## Domain Model

### Таблица
`project_generation_jobs`

### Базовые поля

- `id`
- `projectId` nullable
- `intentId` nullable
- `userId`
- `organizationId` nullable
- `source`
- `type`
- `status`
- `stage`
- `statusMessage` nullable
- `requestContextId` nullable
- `historyGroupId` nullable
- `progressPercent` nullable
- `previewMode`
- `previewAvailable` boolean default false
- `resultRefType` nullable
- `resultRefId` nullable
- `errorCode` nullable
- `errorMessage` nullable
- `createdAt`
- `startedAt` nullable
- `finishedAt` nullable
- `updatedAt`

### Рекомендуемые enum

#### `status`
`queued | running | succeeded | failed | canceled`

#### `previewMode`
`none | ephemeral | persisted`

#### `type`
Минимально:

- `initial_generation`
- `project_mutation_generation`
- `custom_request_generation`

Допускается расширение без смены базового контракта.

#### `source`
Примеры:

- `project_creation_intent`
- `project_chat`
- `template_request`
- `system_retry`

### Опциональные payloads

- `metadata` JSON
- `stageDetails` JSON
- `previewSummary` JSON nullable
- `resultSummary` JSON nullable

## Lifecycle Contract

### Job creation
Сервер при старте generation обязан:

1. определить idempotency scope;
2. найти существующую активную job, если запуск повторный;
3. создать новую job, если активной нет;
4. зафиксировать initial status/stage;
5. вернуть `jobId` сразу, не дожидаясь финала.

### Job execution
Pipeline обязан:

1. обновлять persisted `stage`;
2. писать `statusMessage`;
3. фиксировать runtime references;
4. отдельно отмечать preview state;
5. завершать job как `succeeded | failed | canceled`;
6. связывать job с persisted result.

### Job restoration
Любой клиент должен мочь:

1. запросить active job по project/context;
2. получить её текущее состояние;
3. восстановить UX без скрытых локальных флагов;
4. дочитать финальный результат после reconnect/reload.

## Backend Requirements

### Общий контракт старта generation
У каждого generation flow должен быть server endpoint или server action, который:

1. валидирует вход;
2. определяет `type/source`;
3. создаёт или переиспользует job;
4. запускает orchestration асинхронно;
5. возвращает `jobId` и первичный snapshot job.

Важно:

- HTTP request не является носителем long-running state;
- завершение HTTP request не должно влиять на жизнь job.

### Read endpoints
Нужны как минимум:

- `GET /api/project-generation-jobs/:jobId`
- `GET /api/project-generation-jobs/active?projectId=:id`

Опционально позже:

- list endpoint по пользователю;
- list endpoint по проекту;
- admin endpoint по stuck/failed jobs.

### Изменения в generation pipeline
Любой pipeline, включая `runInitialGeneration(...)`, должен уметь работать в server-owned режиме:

1. принять `jobId` и context;
2. обновлять persisted state по этапам;
3. не зависеть от открытого чата;
4. переживать потерю live transport на уровне UX contract;
5. финализировать authoritative result отдельно от preview.

### Idempotency
Повторный старт одного и того же логического generation scope не должен плодить параллельные job без явного решения сервера.

Минимальные требования:

- один prepared intent -> одна активная initial generation job;
- один project + один mutually-exclusive generation type -> не больше одной активной job, если не разрешено иное;
- повторный `start-generation` возвращает существующую активную job, а не создаёт новую.

### Concurrency guard
Сервер должен явно проверять:

- не идёт ли уже generation для этого project;
- не пытается ли новый flow писать в тот же project в конфликтующем режиме;
- не применится ли результат одной job в чужой project.

## Stage Model
Нужна маленькая и жёсткая стадийная модель, общая для платформы, с возможностью type-specific детализации.

### Базовые стадии

1. `queued`
2. `interpreting`
3. `planning`
4. `compiling`
5. `committing`
6. `finalizing`
7. `succeeded`
8. `failed`

### Расширение
Отдельные flow могут вводить подэтапы в `stageDetails`, но внешний read model должен оставаться маленьким и стабильным.

### Примеры `statusMessage`

- `Понимаем запрос`
- `Строим план графика`
- `Рассчитываем календарь и связи`
- `Сохраняем график в проект`
- `Завершаем генерацию`

## Frontend Requirements

### Что запрещено как архитектура

- локальные флаги вида `pendingPreparedIntentStart` как единственный lifecycle;
- chat-only generation state;
- assumption, что если WS молчит, generation завершилась;
- показ preview как confirmed project state без маркировки.

### Что обязано делать приложение

1. запускать generation через server-owned start endpoint;
2. сохранять `jobId` в runtime state экрана;
3. подписываться на live updates, если доступны;
4. уметь полностью восстановиться по REST;
5. читать active job при открытии project screen;
6. показывать persisted failure, а не только transient toast.

### Chat behavior
Чат может быть UX-поверхностью для:

- статусов;
- assistant messages;
- next steps;
- ошибок;

но generation state не должен жить только в чате.

## Preview Policy

### Вариант A. Preview нет
Для самых хрупких flow допустимо начать без preview и оставить только:

- stage/status stream;
- финальный persisted result.

### Вариант B. Preview ephemeral
Разрешено только если UI явно показывает, что это черновик и не authoritative.

### Вариант C. Preview persisted
Предпочтительный вариант для зрелого UX, если preview реально нужен после refresh.

### Рекомендация для первой волны

- не делать preview источником истины;
- не делать product behavior зависимым от preview;
- для custom request и initial generation приоритетнее надёжный stage/status, чем красивый, но хрупкий stream задач.

## Reliability Requirements

### Обязательные гарантии

- generation не теряется после refresh;
- generation не зависит от открытого чата;
- отсутствие WS не убивает job lifecycle;
- итоговый persisted result проверяем через job status;
- failure state не теряется вместе с сокетом;
- один project не принимает результат чужой job.

### Что считается допустимым в первой итерации

- live updates могут теряться, если reconnect случился посередине;
- dev-process restart всё ещё может убить process-local execution;
- но даже в dev архитектурный контракт должен быть server-owned, а не client-owned.

### Что желательно следующим этапом

- stuck job detection;
- heartbeat/lease;
- retry policy;
- reaper/cleanup для старых job;
- перенос execution в отдельный durable worker, если latency и устойчивость этого потребуют.

## Error Handling
При любой ошибке generation сервер обязан:

1. записать `status = failed`;
2. сохранить `errorCode/errorMessage`;
3. закончить lifecycle в БД;
4. отдать failure через read endpoint;
5. позволить UI восстановить понятное состояние после refresh.

Ошибка не должна быть observable только в live stream.

## Analytics
Новые события:

- `project_generation_job_created`
- `project_generation_job_started`
- `project_generation_job_stage_changed`
- `project_generation_job_succeeded`
- `project_generation_job_failed`
- `project_generation_job_restored_after_refresh`
- `project_generation_job_reused_via_idempotency`

Минимальные поля:

- `jobId`
- `projectId`
- `intentId`
- `source`
- `type`
- `stage`
- `status`

## Rollout Plan

### Phase 1
Сделать общий job model и read API.

### Phase 2
Перевести custom request creation flow на server-owned generation.

### Phase 3
Перевести initial generation в пустом проекте на тот же lifecycle contract.

### Phase 4
Расширить контракт на long-running in-project generation/mutation flows.

### Phase 5
Решить, где нужен persisted preview, а где он должен быть отключён.

## Risks

- backend lifecycle станет сложнее;
- появится новая persisted state machine, которую нужно поддерживать;
- preview может конфликтовать с authoritative result;
- часть старых UI shortcut-ов придётся удалить, а не "сохранить для удобства";
- без отдельного worker process durability всё ещё будет ограничена жизнью server process.

## Risk Mitigation

- держать stage model маленькой;
- сделать БД единственным source of truth;
- вводить migration flow-by-flow, но по одному контракту;
- не смешивать preview и committed result;
- жёстко ввести idempotency и concurrency guard;
- сначала решить restoration/read model, потом наращивать live UX.

## Open Questions

1. Должен ли polling fallback быть обязательным, если live transport не подключён?
   Рекомендация: да.

2. Нужен ли persisted preview в первой волне?
   Рекомендация: нет, сначала persisted status/stage.

3. Нужен ли retry failed job в первой итерации?
   Рекомендация: нет, сначала failure visibility и manual restart.

4. Когда выносить execution в отдельный worker?
   Рекомендация: после стабилизации общего job contract и первой волны migration.

5. Нужен ли единый job contract только для project generation или шире для любых AI jobs?
   Рекомендация: сейчас проектировать под project generation, но не закрывать путь к расширению.

## Acceptance Criteria

- Любой новый существенный generation flow проектируется как persisted server job.
- Custom request generation больше не зависит от client-owned lifecycle.
- Initial generation в пустом проекте восстанавливается после refresh через active job read model.
- Клиент может восстановить состояние generation без скрытых локальных флагов и без открытого чата.
- `status`, `stage`, `error`, `result linkage` читаются из persisted job state.
- Повторный старт в том же logical scope не создаёт дубликат активной job.
- Preview, если существует, не считается authoritative result.
- Итоговый persisted project result не зависит от локального chat state.
- Failure state виден после refresh.
- Общий контракт подходит не только для custom request, но и для следующих generation flow без нового архитектурного разворота.
