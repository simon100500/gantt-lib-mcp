# PRD: MCP Mutation Refactor for Reliable Conversational Edits

## Status

Proposed

## Owner

GetGantt core platform

## Problem

Первичное создание графика стало заметно лучше после отдельного `initial_generation` pipeline, но обычные последующие правки через MCP mutation flow остаются ненадёжными.

Симптом в продукте:

- пользователь даёт короткое естественное указание вроде `добавь сдачу технадзору`, `сдвинь задачу`, `перенеси на 2026-05-10`, `покраску обоев на каждый этаж`, `сделай пункт подробнее`
- агент либо ничего не меняет
- либо возвращается серверное сообщение:
  - `Изменение не применилось: модель не выполнила ни одного валидного mutation tool call, поэтому проект не изменился.`

Это не локальный баг одной формулировки. Это признак того, что текущий execution contract для mutation-запросов слишком хрупкий.

## Observed Diagnosis

По текущей реализации проблема состоит из нескольких слоёв сразу.

### 1. Один свободный LLM-run должен сделать слишком много за раз

Сейчас обычный mutation flow в [packages/server/src/agent.ts](/D:/Projects/gantt-lib-mcp/packages/server/src/agent.ts) фактически требует от модели в одном заходе:

- определить, что запрос mutation
- выбрать минимальный read
- по косвенному контексту догадаться, куда именно вставлять изменение
- самостоятельно вывести даты, контейнер и связи
- собрать валидный payload normalized tool
- выполнить mutation tool call
- не ошибиться в формате

Для коротких пользовательских запросов это слишком много когнитивной и форматной нагрузки на один cheap-model run.

### 2. MCP read surface плохо подходит для коротких естественных правок

Текущие read tools:

- `get_project_summary`
- `get_task_context`
- `get_schedule_slice`

Этого достаточно для inspection, но недостаточно для надёжного resolution.

Слабые места:

- нет поиска по имени/синониму задачи
- нет tool для поиска подходящего контейнера
- нет tool для выбора ближайшей фазы/ветки по смыслу
- `get_task_context` требует точный `taskId`
- `get_schedule_slice` без параметров даёт широкий scan, а не целевой resolution

В результате модель часто понимает общий смысл правки, но не знает, как безопасно получить конкретный anchor для мутации.

### 3. Mutation tools требуют слишком готовый payload

Ключевой пример: `create_tasks` требует уже готовые:

- `name`
- `startDate`
- `endDate`

Опционально ещё:

- `parentId`
- `dependencies`
- `sortOrder`

То есть tool surface требует почти готовую серверную команду, хотя пользователь даёт намного более высокоуровневое намерение.

Для запроса вроде `добавь сдачу технадзору` или `добавь покраску обоев на каждый этаж` пользователю не нужно формулировать:

- в какой контейнер вставить задачу
- от какой работы она зависит
- какие у неё даты

Но текущая MCP-поверхность фактически заставляет модель выводить всё это заранее.

### 4. Prompt вынуждает модель действовать, но не даёт достаточного механизма resolution

Системный prompt в [packages/mcp/agent/prompts/system.md](/D:/Projects/gantt-lib-mcp/packages/mcp/agent/prompts/system.md) правильно требует:

- брать минимальный targeted read
- находить container
- делать smallest valid mutation

Но сами tools не дают хорошего механического способа:

- найти container по естественной формулировке
- вывести schedule placement без ручного расчёта
- превратить краткий intent в deterministic mutation plan

### 5. Simple mutation path уходит на cheap model

Для обычного mutation routing сейчас выбирается cheap model. Это оправдано по cost, но только если остальная система:

- хорошо разрешает сущности
- хорошо подсказывает container
- умеет детерминированно достраивать недостающие поля

Сейчас этого нет, поэтому дешёвая модель получает слишком сложную orchestration-задачу.

### 6. Сервер уже честно детектит провал, но не предотвращает его

Плюс текущей архитектуры в том, что сервер не врёт про успех:

- если не было валидного mutation tool call, проект действительно считается неизменённым
- если tool был rejected, это видно
- если changed set не подтвердился, это тоже видно

Но сегодня verification работает как post-factum защита, а не как надёжный execution framework.

## Evidence from Current Logs

В debug log уже есть характерный кейс.

Запрос:

- `2026-04-13 17:57:58` — `добавь сдачу технадзору`

По логам видно:

- route выбран корректно: `mutation`
- запрос классифицирован как `targeted_existing_schedule_edit`
- проект не пустой: `taskCount=34`
- запрос признан `simpleMutationRequested=true`
- mutation path ушёл на cheap model

При этом успешного зафиксированного mutation execution после этого run не видно. Это значит, что поломка происходит уже внутри mutation orchestration: между intent recognition и валидным normalized tool call.

## Product Goal

Сделать обычные MCP-правки такими же надёжными по execution contract, как мы сделали initial generation по architecture contract.

Целевой outcome:

> пользователь пишет естественную правку любого обычного типа -> сервер определяет mutation class -> сервер собирает недостающий context и anchors -> LLM интерпретирует только недетерминированные вводные и semantic choices -> сервер формирует typed mutation plan -> сервер исполняет mutation алгоритмически -> в проекте появляется подтверждённый результат или понятный controlled failure

Новая цель не в том, чтобы "улучшить prompt".

Новая цель в том, чтобы перестать заставлять одну модель одновременно быть:

- классификатором
- entity resolver
- scheduler
- container selector
- payload formatter
- mutation executor

## Core Design Principle

Эта фаза должна сохранить тот же архитектурный принцип, который уже выбран для `initial_generation`.

### Required split of responsibilities

- LLM отвечает за интерпретацию естественного языка
- LLM отвечает за недетерминированные понятия:
  - что именно хотел пользователь
  - к какому типу изменения относится запрос
  - как трактовать расплывчатые слова вроде `сделай подробнее`, `распиши`, `по группам`, `каждой секции`, `сдача`
  - какой semantic placement или expansion strategy выглядит наиболее уместным
- серверные алгоритмы отвечают за исполнение:
  - resolution anchors
  - построение конечного `MutationPlan`
  - вычисление placement и дат
  - fan-out по группам
  - commit typed commands
  - verification changed set

### Explicit anti-goal

Нельзя решать эту фазу за счёт:

- regexp-маршрутизации как основной архитектуры
- phrase-matching таблиц как главного механизма понимания
- prompt-only костылей без нового execution contract

Regex и phrase hints допустимы только как вторичный safety/helper слой, но не как источник продуктовой корректности.

## Non-Goals

- не переделывать заново `initial_generation`
- не заменять `commandService` как authoritative mutation path
- не возвращаться к legacy low-level scheduling tools
- не добавлять неограниченный набор новых пользовательских MCP tools без строгого контракта
- не решать в этой фазе богатую domain generation для новых отраслей
- не переводить всю систему на полностью deterministic NLP без модели
- не заменять LLM-классификацию и semantic interpretation на regexp-ветки

## Product Principles

1. Server owns mutation orchestration truth.
2. Backend command commit remains the only mutation authority.
3. The model should resolve ambiguity, not synthesize low-level payloads from scratch when the server can do it better.
4. Deterministic field completion is preferred over model hallucination.
5. Every mutation run must pass through explicit stages.
6. A short user command must not require a broad project scan in the common path.
7. If the system cannot resolve an anchor confidently, it must fail explicitly with a controlled reason.
8. Cost optimization is allowed only after reliability is structurally guaranteed.
9. LLM interprets; algorithms execute.
10. No regex-first architecture for mutation understanding.

## Proposed Architecture

Нужен новый mutation lifecycle из четырёх этапов.

## Supported Mutation Families

Фаза должна охватывать не один сценарий `add task`, а полноценный набор обычных conversational edits.

### Primary mutation families for v1

- `add_single_task`
  - пример: `добавь сдачу технадзору`
- `add_fragment_or_template_to_each_group`
  - пример: `добавь покраску обоев на каждый этаж`
- `shift_relative`
  - пример: `сдвинь штукатурку на 2 дня`
- `move_to_explicit_date`
  - пример: `перенеси фундамент на 2026-05-10`
- `move_in_hierarchy`
  - пример: `перенеси электрику внутрь этапа MEP`
- `link_or_unlink_dependencies`
  - пример: `свяжи исполнительную документацию и акт приемки`
- `metadata_update`
  - пример: `сделай эту задачу красной`
- `rename`
  - пример: `переименуй клининг`
- `delete`
  - пример: `удали этап меблировки`
- `expand_wbs`
  - пример: `распиши подробнее пункт "Инженерные системы"`
- `restructure_branch`
  - пример: `разбей этот раздел на черновые и чистовые работы`
- `validate_or_explain`
  - пример: `проверь зависимости` или `почему эта задача сдвинулась`

### Important note

Эти mutation families не должны реализовываться как отдельные regexp-фичи. Они нужны как taxonomy для LLM-classification, plan-building и execution routing.

## Stage 1. Intent Classification

Цель:

- определить тип mutation-задачи
- определить нужный execution strategy
- понять, нужен ли data collection

### Output

Внутренний объект `MutationIntent`:

- `intentType`
- `targetKind`
- `requiresResolution`
- `requiresSchedulingPlacement`
- `suggestedExecutionMode`
- `confidence`
- `rawUserNeed`

### Initial intent families for v1

- `add_single_task`
- `add_repeated_fragment`
- `shift_relative`
- `move_to_date`
- `move_in_hierarchy`
- `link_tasks`
- `unlink_tasks`
- `delete_task`
- `rename_task`
- `update_metadata`
- `expand_wbs`
- `restructure_branch`
- `validate_only`
- `unsupported_or_ambiguous`

### Important rule

`добавь сдачу технадзору` должно классифицироваться не как generic freeform mutation, а как:

- `intentType=add_single_task`
- `targetKind=task_or_fragment`
- `requiresResolution=true`
- `requiresSchedulingPlacement=true`

То есть система заранее понимает, что нужен resolution pipeline, а не прямой blind attempt на `create_tasks`.

Аналогично:

- `сдвинь штукатурку на 2 дня` -> `shift_relative`
- `перенеси фундамент на 2026-05-10` -> `move_to_date`
- `добавь покраску обоев на каждый этаж` -> `add_repeated_fragment`
- `сделай задачу красной` -> `update_metadata`
- `распиши подробнее пункт "Инженерные системы"` -> `expand_wbs`

## Stage 2. Data Collection and Resolution

Цель:

- превратить естественную формулировку в конкретный mutation anchor
- найти container, predecessor, insertion region, ближайший semantic branch
- собрать только минимально нужный context

### Why this stage is required

Именно этот этап сейчас отсутствует как отдельный контракт.

### Required outputs

Внутренний объект `ResolvedMutationContext`:

- `projectVersion`
- `matchedEntities`
- `candidateContainers`
- `selectedContainer`
- `candidatePredecessors`
- `selectedPredecessor`
- `selectedSuccessor`
- `placementStrategy`
- `dateAnchor`
- `groupingAnchors`
- `expansionAnchor`
- `resolutionConfidence`
- `resolutionWarnings`

### Required capabilities

Нужен не просто "ещё один read", а tools/contracts под resolution:

- поиск задач по имени и близким совпадениям
- поиск фазы/контейнера по смыслу или ключевым словам
- получение компактного branch summary для выбранного контейнера
- получение ближайших predecessor/successor вариантов
- получение insertion neighborhood без полного snapshot
- разрешение group scopes вроде `каждый этаж`, `каждая секция`, `по всем корпусам`
- разрешение expansion anchor для `распиши подробнее`

### Surface options

Возможны два допустимых варианта.

#### Option A. New internal-only resolver tools

Добавить internal resolver surface, недоступную как user-facing product API:

- `resolve_tasks_by_name`
- `resolve_container_for_intent`
- `get_branch_summary`
- `suggest_schedule_anchor`

Это предпочтительный вариант для надёжности.

#### Option B. Server-side resolver functions outside MCP

Сервер после Stage 1 сам вызывает локальные resolver-функции и передаёт модели уже структурированный resolution context.

Это тоже допустимо, если удаётся сохранить прозрачное логирование.

### Decision

Для этой фазы предпочтительнее **server-side resolution first**, а не расширение mutation burden на саму модель.

## Stage 3. Mutation Task Formation

Цель:

- из intent + resolved context собрать конкретное техническое задание на изменение
- отделить "что надо сделать" от "как именно коммитить"

### Output

Внутренний объект `MutationPlan`:

- `planType`
- `operations`
- `authoritativeReasoning`
- `expectedChangedEntities`
- `fallbackPolicy`

### Examples

#### Example A. `добавь сдачу технадзору`

Mutation plan должен уметь выразить:

- создать новую задачу `Сдача технадзору`
- положить её в контейнер `Меблировка и сдача объекта` или другой лучший branch
- привязать её после `Подготовка исполнительной документации`
- при наличии логичного closeout successor поставить её перед `Подписание акта приема-передачи объекта`
- длительность и даты вывести серверно по placement policy, а не угадывать с нуля в cheap model

#### Example B. `сдвинь штукатурку на 2 дня`

Mutation plan должен уметь выразить:

- найти целевую задачу или лучший match
- применить relative shift на `2` дня в нужном режиме календаря
- выполнить авторитетный cascade через scheduling rules

#### Example C. `перенеси фундамент на 2026-05-10`

Mutation plan должен уметь выразить:

- найти target task
- трактовать запрос как move-to-date intent, а не raw field patch
- вычислить конечный command для schedule engine с сохранением duration/cascade semantics

#### Example D. `добавь покраску обоев на каждый этаж`

Mutation plan должен уметь выразить:

- найти все группы типа `этаж`
- для каждой группы создать одинаковый fragment
- расположить fragment в правильном месте внутри каждой ветки
- выполнить fan-out алгоритмически, а не через серию слабо связанных agent guesses

#### Example E. `распиши подробнее пункт "Инженерные системы"`

Mutation plan должен уметь выразить:

- найти expansion anchor branch
- попросить LLM построить структурированный fragment plan/WBS-expansion
- затем алгоритмически скомпилировать этот fragment в реальные задачи, parent placement и зависимости

### Important rule

На этом этапе модель при необходимости может помочь выбрать лучший semantic placement, лучший fan-out strategy или лучший WBS-expansion, но она не должна быть обязательным источником:

- `startDate`
- `endDate`
- `parentId`
- dependency payload

если сервер может вычислить это из policy и resolved anchors.

## Stage 4. Deterministic Execution

Цель:

- выполнить `MutationPlan` через authoritative command path
- минимизировать зависимость от свободного MCP-agent formatting

### Preferred execution model

Для распространённых mutation classes сервер должен уметь исполнять план напрямую через `commandService`, без того чтобы LLM вручную собирал финальный normalized payload.

### Examples of deterministic execution classes

- add one task after resolved predecessor
- add one task into resolved container
- add one repeated fragment to every resolved group
- rename resolved task
- move resolved task under resolved parent
- move resolved task to explicit date through schedule command semantics
- add/remove one dependency between resolved tasks
- shift resolved task by relative delta
- update resolved task metadata
- expand one resolved branch from a structured fragment plan

### When normalized MCP tools remain appropriate

Normalized tools остаются нужны для:

- более сложных multi-step edits
- неочевидного broad restructuring
- кейсов, где нужен exploratory planning поверх уже существующей структуры

Но common-path простых правок должен перестать зависеть от "пусть cheap model сама соберёт идеальный tool payload".

## Target Execution Modes

Нужны явные режимы mutation execution.

### 1. Deterministic execution path

Используется, когда:

- intent узкий
- anchor resolved уверенно
- execution выражается одной-двумя typed commands

Примеры:

- `переименуй`
- `сдвинь на 2 дня`
- `добавь сдачу технадзору`
- `свяжи A с B`
- `сделай красной`
- `перенеси на 2026-05-10`

### 2. Hybrid plan-and-execute path

Используется, когда:

- intent понятен
- anchors resolved частично
- нужен небольшой semantic choice
- или нужен LLM-generated structured fragment перед deterministic compile

Flow:

- server resolves candidates
- модель выбирает лучший вариант из ограниченного набора
- либо модель возвращает structured fragment plan
- server commits deterministically

### 3. Full agent mutation path

Остаётся только для сложных кейсов:

- broad restructure
- multiple simultaneous operations
- underspecified edits without safe deterministic plan
- сложные branch-level преобразования, где одного fragment plan недостаточно

Но даже здесь model should consume structured resolution context, а не начинать с нуля.

## Required Internal Contracts

### `MutationIntent`

- `intentType`
- `confidence`
- `rawRequest`
- `normalizedRequest`
- `entitiesMentioned`
- `requiresResolution`
- `requiresSchedulingPlacement`
- `executionMode`

### `ResolvedMutationContext`

- `projectId`
- `projectVersion`
- `resolutionQuery`
- `containers`
- `tasks`
- `predecessors`
- `successors`
- `selectedContainerId`
- `selectedPredecessorTaskId`
- `selectedSuccessorTaskId`
- `placementPolicy`
- `confidence`

### `MutationPlan`

- `planType`
- `operations`
- `why`
- `expectedChangedTaskIds`
- `canExecuteDeterministically`
- `needsAgentExecution`

### `MutationExecutionResult`

- `status`
- `executionMode`
- `committedCommandTypes`
- `changedTaskIds`
- `verificationVerdict`
- `userFacingMessage`
- `failureReason`

## MCP Surface Changes

## Public read surface must become resolution-friendly

Минимум одно из двух должно появиться:

- либо новые resolver tools
- либо эквивалентные server-side resolvers с таким же contract quality

### Recommended additions

- `find_tasks`
  - search by exact, prefix, fuzzy, and normalized name
  - returns compact matches with score, parent path, dates, and ids
- `find_containers`
  - search likely parent branches for insertion
  - returns phase/task branch candidates with score and child count
- `get_branch_summary`
  - compact subtree context for one candidate branch
- `get_insertion_points`
  - returns likely predecessor/successor anchors around a branch end or within a closeout block
- `find_group_scopes`
  - returns repeated structural groups like floors, sections, blocks, buildings
- `get_expansion_anchor`
  - returns one branch plus compact local WBS context for `expand_wbs`

### Important note

Если эти capabilities реализуются внутри server instead of MCP, продуктово это тоже годится. Но по контракту они должны существовать как first-class stage, а не как ad-hoc heuristics in prompt text.

## Mutation surface should accept higher-level plans

Ключевая проблема `create_tasks` в том, что он требует полностью расписанную задачу.

Для conversational edits нужен набор более высоких semantic contracts.

### Recommended semantic commands

- `append_task_after`
  - inputs: `title`, `predecessorTaskId`, optional `parentId`, optional `durationDays`
- `append_task_before`
  - inputs: `title`, `successorTaskId`, optional `parentId`, optional `durationDays`
- `append_task_to_container`
  - inputs: `title`, `containerId`, optional `placement=tail|head|afterTaskId|beforeTaskId`
- `fanout_fragment_to_groups`
  - inputs: `groupIds`, `fragmentPlan`, `placementPolicy`
- `shift_task_by_delta`
  - inputs: `taskId`, `delta`, `mode`
- `move_task_to_date`
  - inputs: `taskId`, `targetDate`, `anchorPolicy`
- `update_task_metadata`
  - inputs: `taskId`, `fields`
- `expand_branch_from_plan`
  - inputs: `anchorTaskId`, `fragmentPlan`, `placementPolicy`
- `create_fragment_from_plan`
  - inputs: compact fragment plan, resolved anchors, optional scheduling policy

Эти команды могут быть:

- internal server commands
- internal MCP tools

Но не обязательно user-visible public tools.

## Scheduling Placement Policy

Чтобы обычные mutation requests не зависели от ручной генерации дат и структуры, нужен server-side placement policy.

### Required rules for v1

- если есть `selectedPredecessorTaskId`, новая задача стартует после predecessor по project calendar rules
- если есть `selectedSuccessorTaskId`, задача должна уместиться перед successor или связаться с ним, в зависимости от policy
- если есть только container, новая задача ставится в хвост container branch
- если длительность не задана пользователем, используется domain default по intent type
- если точные даты вычислить нельзя без конфликта, задача создаётся с dependency-based placement и затем выполняется recalculation

### Domain defaults

Для closeout/handover-intents и типовых edit-сценариев нужен компактный справочник defaults:

- `сдача`
- `технадзор`
- `исполнительная документация`
- `приёмка`
- `пусконаладка`
- `покраска обоев`
- `чистовая отделка`

Не как template generation, а как duration/placement hints для обычных правок.

## Model Routing Policy

Текущий policy "обычные mutation-запросы идут на cheap model" недостаточен сам по себе.

Нужен новый routing:

- Stage 1 classification: cheap model or deterministic classifier
- Stage 2 resolution: mostly server-side, optional cheap model ranking
- Stage 3 mutation plan formation:
  - cheap model for simple ranked-choice cases
  - strong model only when semantic placement remains ambiguous
- Stage 4 execution: deterministic server path

### Rule

Strong model должна использоваться не "для всех mutation", а только там, где ambiguity survives resolution или где нужен качественный structured fragment/WBS expansion.

## Failure Model

Нужны контролируемые причины отказа.

### User-facing failure families

- `anchor_not_found`
- `multiple_low_confidence_targets`
- `container_not_resolved`
- `placement_not_resolved`
- `unsupported_mutation_shape`
- `deterministic_execution_failed`
- `verification_failed`

### Important rule

Сообщение `модель не выполнила ни одного валидного mutation tool call` должно перестать быть типовым продуктовым исходом для common-path пользовательских запросов любого обычного типа.

Оно допустимо как debug/internal fallback, но не как основной UX для простого add/edit intent.

## Logging and Observability

По одному run должно быть видно:

- `intent_classified`
- `resolution_started`
- `resolution_result`
- `mutation_plan_built`
- `execution_mode_selected`
- `deterministic_execution_started`
- `execution_committed`
- `verification_result`
- `final_outcome`

### Additional debug payloads

- какие candidates были найдены по имени
- почему выбран именно этот container
- какой placement policy сработал
- какой fan-out/expansion policy сработал
- какие server defaults были подставлены
- почему run ушёл в full agent path, если не удалось отработать детерминированно

## Scope

### In Scope

- явный staged mutation lifecycle
- entity/container resolution contract
- server-side mutation plan object
- deterministic execution path для common ordinary mutations
- stricter routing between deterministic, hybrid, and full-agent paths
- typed failure reasons
- regression tests на короткие естественные запросы
- улучшение MCP/read surface или эквивалентных server-side resolvers

### Out of Scope

- redesign initial-generation pipeline
- arbitrary domain expansion for all industries
- large frontend redesign
- full natural-language parser without model
- complete removal of full agent mutation mode

## Acceptance Criteria

### Core reliability

- Запрос `добавь сдачу технадзору` в существующем графике с closeout-фазой приводит к подтверждённому изменению проекта или к controlled failure `container_not_resolved`, но не к silent no-op.
- Запрос `сдвинь штукатурку на 2 дня` приводит к verified shift execution или typed failure `anchor_not_found`.
- Запрос `перенеси фундамент на 2026-05-10` трактуется как scheduling intent, а не как raw field rewrite.
- Запрос `добавь покраску обоев на каждый этаж` приводит к algorithmic fan-out по найденным группам или к typed failure `group_scope_not_resolved`.
- Запрос `сделай эту задачу красной` проходит через resolved target и deterministic metadata update.
- Запрос `распиши подробнее пункт "Инженерные системы"` проходит через LLM-generated structured fragment и deterministic compile, а не через freeform mutation guesses.

### Execution architecture

- Common ordinary mutations не требуют свободного final payload synthesis для normalized tools.
- Для add/edit/link/move/shift/date-move/fan-out/metadata requests сервер может выполнить изменение без full agent mutation run, если intent и anchors resolved достаточно уверенно.
- Full agent path вызывается только когда intent действительно сложный или неоднозначный.
- LLM остаётся слоем интерпретации и structured planning, но не слоем final command execution.

### Verification

- Финальный success всегда основан на authoritative changed set.
- Типовой провал simple mutation не заканчивается сообщением про отсутствие валидного tool call, если resolution вообще не был выполнен.

## Test Requirements

### Intent tests

- `добавь сдачу технадзору` -> `add_single_task`
- `добавь пусконаладку` -> `add_single_task`
- `добавь покраску обоев на каждый этаж` -> `add_repeated_fragment`
- `переименуй клининг` -> `rename_task`
- `свяжи A и B` -> `link_tasks`
- `перенеси штукатурку на 2 дня` -> `shift_relative`
- `перенеси фундамент на 2026-05-10` -> `move_to_date`
- `сделай эту задачу красной` -> `update_metadata`
- `распиши подробнее пункт "Инженерные системы"` -> `expand_wbs`

### Resolution tests

- поиск по имени находит точный task match
- поиск по имени находит близкие русскоязычные варианты
- resolution находит closeout container для handover-like request
- resolution корректно возвращает ambiguity при двух равноценных ветках
- resolution находит group scopes вроде `каждый этаж`
- resolution находит expansion anchor для `распиши подробнее`

### Plan formation tests

- resolved add intent превращается в `MutationPlan` без missing required fields
- plan для repeated fragment содержит group fan-out policy
- plan для simple append содержит container/predecessor policy
- plan для move-to-date содержит schedule command semantics
- plan для rename не требует scheduling placement
- plan для `expand_wbs` содержит structured fragment contract

### Deterministic execution tests

- `append_task_after` создаёт задачу после predecessor
- `append_task_to_container` создаёт задачу в хвосте ветки
- `fanout_fragment_to_groups` создаёт fragment во всех найденных группах
- `move_task_to_date` сохраняет command semantics scheduling engine
- link/unlink deterministic commands возвращают authoritative changed set
- shift deterministic command не использует free-form payload generation
- metadata deterministic command не использует full agent execution
- branch expansion compile создаёт child tasks из structured fragment plan

### End-to-end tests

- существующий график ремонта офиса + `добавь сдачу технадзору`
- существующий график дома + `добавь техприсоединение`
- существующий график + `сдвинь X на 2 дня`
- существующий график + `перенеси X на 2026-05-10`
- существующий график + `добавь покраску обоев на каждый этаж`
- существующий график + `свяжи X и Y`
- существующий график + `переименуй X`
- существующий график + `сделай X красным`
- существующий график + `удали Y`
- существующий график + `распиши подробнее пункт Z`

### Regression test for current failure class

- если resolver не нашёл container, run завершается explicit `container_not_resolved`
- если resolver не нашёл group scope, run завершается explicit `group_scope_not_resolved`
- если resolver не нашёл expansion anchor, run завершается explicit `expansion_anchor_not_resolved`
- если resolver нашёл container и predecessor, run создаёт задачу без перехода в no-valid-tool-call outcome
- если shift/date-move target найден, run исполняется без freeform final payload generation

## Rollout Plan

### Phase 42. MCP Mutation Refactor

#### Track 1. Intent and routing

- ввести `MutationIntent`
- разнести deterministic / hybrid / full-agent routing
- добавить test coverage на короткие mutation requests

#### Track 2. Resolution layer

- добавить resolver contracts
- научить сервер искать container/task anchors без полного scan
- логировать resolution confidence

#### Track 3. Mutation planning and deterministic execution

- ввести `MutationPlan`
- реализовать server-side execution для common ordinary mutations
- отделить semantic plan от final command commit

#### Track 4. Failure semantics and telemetry

- заменить generic no-op outcomes на typed failure reasons
- обновить debug logs и user-facing messages
- добавить regression suite по реальным русскоязычным запросам

## Risks

- плохой resolver даст ложную уверенность и неправильный container
- слишком агрессивный deterministic path может ломать сложные запросы, если routing будет слишком широким
- расширение MCP surface без ясного ownership может снова увеличить хаос tool contracts
- если оставить create/update surface как есть и не ввести semantic execution layer, refactor сведётся к очередному prompt tweak

## Key Decision

Эта фаза должна быть **не prompt refactor, а execution refactor**.

Главная смена мышления:

- было: `user request -> LLM -> normalized tool payload -> verify`
- должно стать: `user request -> LLM intent interpretation -> resolution -> mutation plan -> deterministic commit or constrained agent execution -> verify`

Именно это даст надёжность для запросов класса `добавь X`, `сдвинь Y`, `перенеси Z на дату`, `добавь по всем группам`, `измени метаданные`, `распиши подробнее ветку`, а не ещё один набор инструкций в системном prompt.
