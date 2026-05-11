 Работаем над flow передачи prompt с лендинга в app. Текущая фронтовая orchestration оказалась хрупкой: были баги с автоархивацией старого проекта, незапуском генерации, пропажей
  групп в sidebar, отсутствием prompt в чате и loop после stop generation.

  Уже создан PRD:
  /D:/Projects/gantt-lib-mcp/EXTERNAL-SITE-PROMPT-SERVER-FLOW-PRD.md

  Что уже поменяно локально:

  - в App.tsx были временные фронтовые фиксы для auto-create flow
  - prompt теперь оптимистично показывается в чате
  - пустые project groups больше не скрываются в ProjectSwitcher.tsx
  - fallback для landing URL переведён на VITE_LANDING_SITE_URL
  - Dockerfile и docker-compose.yml уже прокинуты под VITE_LANDING_SITE_URL

  Но стратегическое решение другое:
  нужно убрать frontend-orchestrated flow и перенести весь сценарий на сервер.

  Что нужно делать в новой сессии:

  - в packages/server/src/routes/project-intent-routes.ts сделать единый endpoint, условно POST /api/project-intents/:intentId/launch
  - endpoint должен сам:
      - валидировать intent
      - при необходимости архивировать текущий активный проект
      - создать/подготовить новый проект
      - записать стартовое user message
      - переключить session/access token на новый проект
      - стартовать initial generation
      - вернуть готовый payload для фронта
  - после этого упростить packages/web/src/App.tsx, чтобы фронт делал один mutation call и только применял результат

  Ожидаемый итог:

  - вход с лендинга по prompt работает одним надёжным серверным flow
  - старый проект архивируется сервером
  - новый проект создаётся и generation reliably стартует
  - prompt сразу виден в чате
  - нет race conditions и loop между wizard/chat after cancel




  



# External Site Prompt Server Flow PRD

## Context

Сейчас flow перехода с лендинга (`site`) в приложение (`web`) с внешним prompt работает нестабильно.

На текущий момент уже были попытки улучшить UX:

- автоматическое создание нового проекта по `intent`;
- автоматическая архивация предыдущего активного проекта;
- toast об автоархивации;
- мгновенное отображение prompt в чате;
- fallback URL лендинга через `VITE_LANDING_SITE_URL`.

Но сама orchestration-цепочка по-прежнему хрупкая, потому что ключевые шаги исполняются на фронтенде в несколько запросов и зависят от промежуточных `auth/project/chat/workspace` состояний.

## Problem

Текущая реализация разбита между несколькими фронтовыми шагами:

1. загрузить `project intent`;
2. при необходимости архивировать текущий проект;
3. создать новый проект по `intent`;
4. переключить активную сессию на новый проект;
5. стартовать initial generation;
6. синхронизировать локальный чат, sidebar, стартовый экран и preview state.

Из-за этого появляются race conditions и промежуточные сломанные состояния:

- старый проект архивировался, а новый не создавался;
- генерация не стартовала после успешного архивирования;
- группа проектов визуально исчезала из sidebar при пустом промежуточном состоянии;
- prompt не сразу попадал в чат;
- при остановке генерации происходил loop между wizard/start screen и chat view;
- UX выглядит как набор фронтовых костылей, а не как единый надёжный сценарий.

## Product Goal

Сделать переход с лендинга по внешнему prompt надёжным и серверно-управляемым:

- один пользовательский action;
- один серверный orchestration endpoint;
- предсказуемый UX;
- отсутствие зависимости от промежуточных фронтовых перерендеров.

## Non-Goals

- не перерабатывать весь pipeline initial generation;
- не менять модель авторизации целиком;
- не переписывать общую логику `project creation intent`, если её можно расширить серверным endpoint;
- не менять поведение обычного ручного создания проекта вне сценария лендинга.

## Desired User Flow

### Scenario: user comes from landing page with prompt

1. Пользователь вводит prompt на лендинге.
2. Лендинг создаёт `project intent`.
3. Пользователь открывает app по `intent`.
4. App делает один запрос на backend: `launch prompt flow`.
5. Backend сам:
   - валидирует `intent`;
   - привязывает его к пользователю;
   - архивирует текущий активный проект пользователя, если это требуется;
   - создаёт или переиспользует подготовленный пустой проект;
   - сохраняет стартовое user message в проект;
   - переключает session/access token на новый проект;
   - стартует initial generation job;
   - возвращает готовый payload для UI.
6. Frontend только:
   - принимает новый access token;
   - обновляет auth/project lists;
   - показывает новый проект;
   - показывает user prompt в чате;
   - показывает toast про автоархивацию, если backend это сделал;
   - показывает status initial generation.

## Core Product Requirements

### 1. Server-owned orchestration

Нужен единый backend endpoint для запуска flow, условно:

- `POST /api/project-intents/:intentId/launch`

Этот endpoint должен быть единственной entry point для сценария лендинга.

Frontend не должен отдельно вызывать:

- `GET /api/project-intents/:intentId`
- `POST /api/projects/:id/archive`
- `POST /api/project-intents/:intentId/create-project`
- `POST /api/project-intents/:intentId/start-generation`

в рамках этого сценария.

### 2. Atomic business behavior

Server endpoint должен последовательно и надёжно выполнять:

- validate intent;
- resolve current session and active project;
- archive current active project when required;
- create/prep target project;
- persist initial user message into target project;
- switch session project/token;
- start initial generation job;
- return consistent response payload.

Если шаг проваливается, backend должен вернуть контролируемую ошибку без полуразваленного UX.

### 3. Archive behavior

Если у пользователя уже есть активный проект, backend должен:

- архивировать его автоматически перед запуском нового flow;
- вернуть в response признак, что архивирование произошло;
- вернуть имя/ID архивированного проекта для toast.

Frontend не должен сам решать, архивировать ли проект, и не должен делать это отдельным запросом.

### 4. Chat UX

После входа в новый проект пользователь должен сразу видеть:

- своё исходное сообщение в чате;
- состояние “AI готовит график”;
- без ожидания повторной синхронизации истории.

Если generation started successfully, UI не должен выглядеть “пустым”.

### 5. Stable empty-project behavior

Если generation остановлена или не стартовала:

- UI не должен уходить в loop между start screen и chat;
- поведение пустого проекта должно быть строго определено;
- source of truth для пустого проекта должен быть устойчив к временным скачкам `taskCount`.

### 6. Project groups visibility

Даже если в группе временно нет активных проектов:

- группа не должна исчезать из sidebar;
- она должна отображаться как пустая группа (`Нет проектов`).

## Proposed Backend Response Shape

Response у нового orchestration endpoint должен покрывать всё, что нужно фронту для одного commit состояния.

Минимально:

```ts
type LaunchProjectIntentResponse = {
  accessToken: string;
  refreshToken: string;
  project: AuthProject;
  archivedProject?: {
    id: string;
    name: string;
  } | null;
  prompt: string;
  job: SerializedProjectGenerationJob | null;
  generationStarted: boolean;
};
```

Опционально:

- `alreadyStarted`
- `generationPrepared`
- `toastMessage`

## Frontend Simplification Requirements

После внедрения server-owned flow фронтенд должен:

- делать один mutation call;
- обновлять auth state через returned tokens/project;
- добавлять prompt в chat store один раз;
- показывать toast из response;
- не orchestrate архивирование/создание/старт генерации вручную;
- не зависеть от промежуточных `useEffect` для перехода между шагами.

Нужно удалить или максимально упростить текущую fragile logic в `packages/web/src/App.tsx`, связанную с:

- `projectCreationIntentId`
- `projectIntentFlowRef`
- ручным архивированием
- раздельным `create-project` и `start-generation`
- частично дублирующей optimistic chat logic

## Failure Handling

### Expected failure cases

- `intent not found`
- `intent expired`
- `intent already consumed / already started`
- `current project cannot be archived`
- `project limit reached`
- `group access denied`
- `generation start failed after project creation`
- `session/token update failed`

### UX requirements for failures

- если новый проект не был создан, старый UX/state не должен ломаться;
- если старый проект уже архивирован, а новый flow не завершился, backend должен вернуть чёткое error contract;
- frontend должен показывать human-readable ошибку, без loop и без пустого битого workspace.

## Technical Guidance

### Backend

Рекомендуется расширить `packages/server/src/routes/project-intent-routes.ts`:

- добавить новый orchestration route;
- вынести общие куски из `create-project` и `start-generation` в shared helpers;
- минимизировать дублирование логики подготовки intent;
- по возможности обеспечить “transaction-like” порядок действий.

### Frontend

Рекомендуется упростить `packages/web/src/App.tsx`:

- один effect для route `/app/new?intent=...`;
- один mutation call;
- один commit auth/chat/workspace state;
- убрать фронтовую orchestration-цепочку из нескольких запросов.

## Acceptance Criteria

### Functional

1. Переход с лендинга по prompt создаёт новый проект без ручного modal-confirmation.
2. Если был активный проект, он архивируется автоматически.
3. После перехода пользователь сразу видит:
   - новый проект;
   - своё сообщение в чате;
   - состояние генерации.
4. Генерация reliably стартует из того же server-owned flow.
5. Группы проектов не исчезают из sidebar.
6. При stop generation не возникает loop между wizard и chat.

### Reliability

1. Frontend не делает 3-4 последовательных orchestration calls для этого сценария.
2. Основная бизнес-цепочка выполняется сервером.
3. Повторный вход по тому же `intent` обрабатывается предсказуемо.

### UX

1. Есть toast про автоархивацию.
2. Есть видимый user prompt в чате сразу после входа в проект.
3. Нет “немого” пустого экрана, пока generation уже идёт.

## Verification Plan

### Manual

1. Пользователь с одним активным проектом открывает app по `intent`.
2. Проверить:
   - старый проект ушёл в архив;
   - новый проект создан;
   - prompt виден в чате сразу;
   - generation started;
   - sidebar groups на месте.
3. Нажать stop generation в пустом проекте.
4. Проверить:
   - нет loop между wizard и chat;
   - UI стабилен.
5. Повторно открыть тот же `intent`.
6. Проверить controlled behavior without corruption.

### Suggested automated coverage

- route-level tests for new launch endpoint;
- tests for archive + create + token switch + start-generation sequence;
- frontend tests for:
  - optimistic prompt rendering;
  - empty group visibility;
  - cancel-generation stable view mode.

## Summary

Ключевая идея: этот сценарий нельзя больше держать как frontend-orchestrated flow.  
Нужно перевести его в server-owned orchestration, а фронт оставить только как thin client, который принимает уже согласованный результат.
