# TEMPLATE-CUSTOM-REQUEST-FLOW-PRD

## Название
Custom Request Flow с template pages в GetGantt

## Статус
Draft

## Контекст
На страницах шаблонов пользователь может не найти подходящий вариант. Сейчас у него есть только путь "взять готовый шаблон за основу". Нужен второй сценарий: пользователь описывает свой проект в свободной форме и попадает в app с уже подготовленным запросом на генерацию плана.

Ключевое ограничение продукта: все реальные действия, создание проекта и редактирование происходят только внутри app. Site не должен пытаться генерировать, редактировать или хранить рабочее состояние проекта локально.

## Проблема
Если подходящего шаблона нет:

- пользователь упирается в тупик
- site не даёт мягкий переход в product-led flow
- нельзя использовать сильную сторону GetGantt: генерацию плана по описанию проекта

Если просто передавать текст через URL:

- длинные query string
- плохой UX при login redirect
- риск потери текста
- неудобно для аналитики и серверной обработки

## Цель
Дать пользователю на странице шаблона простой путь:

1. описать свой проект в свободной форме
2. войти в GetGantt при необходимости
3. создать новый проект
4. автоматически получить предзаполненный стартовый запрос в app
5. продолжить работу уже в рабочем пространстве

## Не-цель

- не генерировать проект прямо на site
- не редактировать график на site
- не хранить большой prompt в query string
- не запускать AI без создания проекта
- не добавлять сложный многошаговый wizard на первом этапе

## User Story
Как пользователь, который не нашёл нужный шаблон, я хочу кратко описать свой проект прямо на странице шаблона, чтобы после входа в GetGantt сразу продолжить с генерацией плана, а не начинать всё с пустого экрана.

## JTBD
When I don't see a suitable template, I want to describe my project in plain language so that GetGantt can create a starting plan for me without forcing me to rebuild context manually after login.

## Предлагаемый UX

### На странице шаблона
Внизу страницы после основного контента показывается секция:

`Не нашли нужный шаблон?`  
`Опишите проект и получите готовый план проекта`

Элементы:

- textarea
- placeholder с примером запроса
- CTA `Получить план`

Пример placeholder:

`Например: нужен график ремонта офиса 250 м2 в 2 этапа, с демонтажом, инженерией, чистовой отделкой и запуском за 90 дней`

## Main Flow

1. Пользователь открывает `/templates/:slug`.
2. Не находит подходящий шаблон.
3. Вводит описание проекта в textarea.
4. Нажимает `Получить план`.
5. Site отправляет текст на backend для создания временного intent.
6. Backend возвращает `intentId`.
7. Если пользователь не залогинен:
   - redirect на `/login?next=/app/new?intent=:intentId`
8. Если пользователь залогинен:
   - redirect на `/app/new?intent=:intentId`
9. В app открывается normal create-project flow:
   - модалка создания проекта
   - поле названия проекта
   - выбор группы/workspace при необходимости
10. После подтверждения создаётся новый проект.
11. App загружает текст intent и передаёт его как `firstPrompt` в стартовый экран / чат.
12. Пользователь видит уже подготовленный стартовый запрос и продолжает генерацию плана в проекте.

## Почему через intent
Intent нужен как временная серверная запись с пользовательским намерением.

Он решает:

- не хранить длинный текст в URL
- не терять текст после login redirect
- не зависеть от localStorage
- одинаково поддержать anonymous и authenticated flow
- дать backend-контроль, TTL и аналитику

## Data Model
Новая сущность: `project_creation_intents`

Поля:

- `id`
- `source`
  Рекомендуемое значение: `site_custom_request`
- `text`
- `userId` nullable
- `templateSlug` nullable
- `createdAt`
- `expiresAt`
- `consumedAt` nullable

Правила:

- intent временный
- TTL по умолчанию: 24 часа
- intent можно использовать один раз
- после успешного создания проекта intent помечается consumed

## Backend Requirements

### Новый endpoint
- `POST /api/public/project-intents`
- body:
  - `text`
  - `source`
  - `templateSlug` optional

Ответ:

- `intentId`

### Новый endpoint для app
- `GET /api/project-intents/:intentId`
- доступ:
  - только после auth
- возвращает:
  - `text`
  - metadata

### Поведение

- validate text length
- trim input
- reject empty payload
- store intent in DB
- support TTL expiration
- support single-use semantics

## Frontend Requirements

### Site
Добавить новую CTA-секцию на template page:

- textarea
- submit button
- loading state
- error state

Поведение:

- submit создаёт intent
- redirect зависит от auth state
- не сохранять текст локально как рабочее состояние проекта

### App
Добавить route/state:

- `/app/new?intent=:intentId`

Поведение:

- если пользователь anonymous, route должен вести через login
- после auth app читает intent
- открывает существующий create project modal
- после создания проекта прокидывает `firstPrompt` в существующий flow стартового экрана

## Copy

### Section title
- `Не нашли нужный шаблон?`

### Section subtitle
- `Опишите проект и получите готовый план проекта`

### Button
- `Получить план`

### Validation error
- `Опишите проект, чтобы мы могли подготовить стартовый план.`

### Expired intent
- `Черновик запроса устарел. Опишите проект ещё раз.`

### Load error
- `Не удалось подготовить запрос. Попробуйте ещё раз.`

## Validation Rules

- minimum length: 10-20 chars
- maximum length: 2000-4000 chars
- trim spaces
- empty input blocked
- optional basic spam protection later

## Analytics
События:

- `site_custom_request_viewed`
- `site_custom_request_submitted`
- `site_custom_request_login_redirected`
- `site_custom_request_app_opened`
- `site_custom_request_project_created`
- `site_custom_request_consumed`

Поля:

- `templateSlug`
- `isAuthenticated`
- `intentSource`

## Risks

- пользователь может ожидать мгновенную генерацию без создания проекта
- intent может истечь до завершения login flow
- если auto-send сделать слишком агрессивным, пользователь потеряет контроль

Снижение рисков:

- явно показывать, что следующий шаг ведёт в рабочее пространство
- использовать create-project-before-generate
- не автоотправлять prompt без подтверждения проекта на первом этапе

## Open Questions

1. Нужно ли после создания проекта сразу автоматически отправлять prompt, или только предзаполнять стартовый экран?
   Рекомендация: сначала только предзаполнение.
2. Нужно ли сохранять связь с template slug для аналитики?
   Рекомендация: да.
3. Нужен ли такой же блок на страницах `/blocks/:slug`?
   Рекомендация: можно вторым этапом.

## Acceptance Criteria

- На странице шаблона есть секция custom request с textarea и CTA.
- Пользователь может отправить свободное описание проекта.
- Backend создаёт временный intent и возвращает `intentId`.
- Anonymous user после login попадает в app flow с этим intent.
- Logged-in user попадает туда сразу.
- Создание проекта остаётся обязательным шагом.
- После создания проекта стартовый запрос появляется в app как предзаполненный `firstPrompt`.
- Site не генерирует проект сам и не хранит рабочее состояние проекта.
- Длинный prompt не передаётся через query string.
- Просроченный intent обрабатывается корректно.
