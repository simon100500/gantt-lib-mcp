# Phase 30: Constraint Engine - Context

**Gathered:** 2026-04-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Создать единый source of truth для тарифных ограничений: канонический plan config, каталог limitKey, `ConstraintService` с методами `checkLimit()`, `getRemaining()` и `getUsage()`, а также PostgreSQL persistence для usage counters. Эта фаза задаёт ядро модели ограничений, но не реализует все enforcement-точки и не решает весь frontend UX следующих фаз.

</domain>

<decisions>
## Implementation Decisions

### Каталог лимитов
- В Phase 30 в ядро входят канонические limit key: `projects`, `ai_queries`, `archive`, `resource_pool`, `export`.
- `export` моделируется как один limit key с уровневым значением доступа, а не как набор независимых флагов по форматам.
- `archive` и `resource_pool` моделируются как boolean feature gates.
- `team_members` пока не включается в ядро Phase 30 и остаётся для будущей отдельной фазы.

### Семантика лимитов и usage
- `ai_queries` остаётся единым каноническим ключом для всех тарифов.
- Разница между free и paid задаётся семантикой лимита: у `free` период `lifetime`, у paid-планов период `daily`.
- Безлимитные значения должны быть представлены явно как `unlimited`, а не магическим числом вроде `-1`.
- Для boolean feature gates usage не трекается; методы чтения должны возвращать специальное состояние `not_applicable`, а не имитировать count-лимит.
- Daily-лимиты сбрасываются по календарному дню сервера.

### Контракт ConstraintService
- `checkLimit()` возвращает структурированный объект, а не просто boolean.
- Ответ `checkLimit()` должен включать allow/deny, limit metadata, текущий usage и machine-readable reason code, чтобы этот результат одинаково подходил для backend enforcement, API error payload и frontend UX.
- `getUsage()` и `getRemaining()` оба остаются публичными методами; downstream-код не должен вручную собирать одно из другого.
- Неизвестный или неописанный `limitKey` считается конфигурационной ошибкой, а не silently allow/deny.
- Даже для `boolean`, `unlimited` и `not_applicable` методы чтения возвращают нормализованный объект единой формы, а не `null` и не исключения по типу лимита.

### Модель plan config
- Каждый тариф должен явно перечислять все свои ограничения; скрытое наследование между тарифами не использовать.
- Канонический plan config и типы должны жить в shared-модуле, который доступен нескольким пакетам, а не только серверу.
- В одном plan catalog хранятся и pricing-данные, и constraint-данные, чтобы тариф был описан целиком в одном source of truth.
- Метаданные limit key (`kind`, `period`, display-описание и подобные общие свойства) определяются один раз в каталоге ключей.
- Конкретный тариф задаёт для каждого ключа уже фактическое значение или уровень доступа.

### Claude's Discretion
- Точное имя shared-модуля и его размещение в монорепе.
- Финальная форма TypeScript-типов для нормализованного ответа `ConstraintService`.
- Точная Prisma-структура для persistence usage counters, если она удовлетворяет принятым семантикам.

</decisions>

<specifics>
## Specific Ideas

- Ядро должно заменить ad-hoc billing vocabulary на единый движок ограничений, а не добавить ещё один параллельный слой рядом с `BillingService`.
- Для `export` нужен именно уровневый доступ (`none` / `pdf` / `pdf_excel` / `pdf_excel_api`), а не набор разрозненных булевых флагов.
- Shared source of truth нужен сразу, потому что pricing, enforcement и frontend upsell уже существуют в коде и не должны разойтись ещё сильнее.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/server/src/services/plan-config.ts`: уже содержит server-side каталог тарифов, который можно использовать как отправную точку для нового shared plan catalog.
- `packages/server/src/services/billing-service.ts`: уже работает с подпиской пользователя и Prisma persistence, значит новый `ConstraintService` должен встраиваться рядом, а не дублировать слой подписок.
- `packages/web/src/components/LimitReachedModal.tsx`: уже есть базовый UX для limit reached сценариев; следующий phases смогут использовать единый reason code из `ConstraintService`.
- `packages/web/src/components/layout/ProjectMenu.tsx` и `packages/web/src/stores/useBillingStore.ts`: уже показывают текущий план и project usage, значит frontend позже сможет читать унифицированные ответы и plan metadata.

### Established Patterns
- Billing и subscription логика уже живут в `packages/server` как сервисный слой поверх Prisma.
- В коде уже существует `plan-config.ts`, но он использует старые технические приёмы вроде `-1` для unlimited; новый engine должен это нормализовать.
- Web и server уже зависят от согласованных plan labels, prices и limits; дальнейшее дублирование конфигов нежелательно.

### Integration Points
- Новый shared plan catalog должен стать базой для server-side enforcement, billing API и будущих frontend usage surfaces.
- `BillingService` и subscription persistence задают существующую точку входа к активному тарифу пользователя.
- Future phases смогут использовать reason codes и limit metadata из `ConstraintService` для `403` responses, proactive guards и upsell UI.

</code_context>

<deferred>
## Deferred Ideas

- `team_members` и его enforcement не входят в ядро этой фазы и должны планироваться отдельно.
- Полная реализация enforcement-точек по API, MCP tools и frontend UI относится к следующим фазам milestone.

</deferred>

---

*Phase: 30-constraint-engine*
*Context gathered: 2026-04-02*
