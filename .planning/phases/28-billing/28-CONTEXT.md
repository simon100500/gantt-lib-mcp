# Phase 28: Billing - Context

**Gathered:** 2026-03-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Интеграция YooKassa для оплаты тарифов на getgantt. Создание платежа (embedded widget), webhook-подтверждение, история покупок, проверка лимитов по плану. Полная billing page в app. Read-only при истечении подписки.

</domain>

<decisions>
## Implementation Decisions

### Payment Model
- **D-01:** Разовые платежи (не recurring). Пользователь вручную продлевает при истечении периода. Месячный = 31 день, годовой = 365 дней.
- **D-02:** Корпоративный тариф — "по запросу", без виджета оплаты. Кнопка "Напишите нам" вместо покупки.
- **D-03:** YooKassa embedded widget (бесшовный, как в homeopapa). Не redirect на yookassa.ru.
- **D-04:** Флоу оплаты: pricing.astro (getgantt.ru) → CTA редирект на ai.getgantt.ru/billing?plan=xxx → embedded widget.

### Limits & Enforcement
- **D-05:** Strict enforcement. При открытии проекта проверять подписку — если истекла, переводить в read-only (просмотр без редактирования).
- **D-06:** НЕ проверять лимиты на каждом редактировании (drag-to-edit). Только при открытии проекта и при AI-запросах.
- **D-07:** AI-лимиты считать по вызовам /api/chat. 1 сообщение = 1 генерация.
- **D-08:** Счётчики AI-генераций сбрасываются при покупке нового периода.

### Tariffs (from pricing.astro)
- **D-09:** Тарифы и цены хранятся в env (как в homeopapa PLAN_CONFIG). Четыре тарифа:

| Тариф | Ключ | Месяц | Год | Проекты | AI | Уточнения | Ресурсы | Команда |
|-------|------|-------|-----|---------|-----|-----------|---------|---------|
| Бесплатный | free | 0 ₽ | 0 ₽ | 2 | 3 | 5/график | 1 | 1 |
| Старт | start | 1 490 ₽ | 12 000 ₽ | 5 | 10 | 20/проект | 20 | 1 |
| Команда | team | 4 990 ₽ | 59 880 ₽ | 20 | безлимит | безлимит | безлимит | 5 |
| Корпоративный | enterprise | 12 900 ₽ | 154 800 ₽ | безлимит | безлимит | безлимит | безлимит | 20+ |

### UI & Flow
- **D-10:** Полноценная billing page в app (ai.getgantt.ru): текущий план, оставшиеся лимиты, история платежей, кнопка улучшить.
- **D-11:** Отдельная billing page, не встроена в pricing.astro. Pricing — маркетинг, billing — функционал.

### Database
- **D-12:** Новые таблицы в SQLite:
  - `payments` — история платежей (paymentId, userId, plan, period, amount, yookassaPaymentId, status, createdAt)
  - Поля подписки в таблице `users` (или отдельная `subscriptions`): plan, periodStart, periodEnd, aiUsed, aiLimit
- **D-13:** Тарифы через env переменные (PLAN_START_PRICE_MONTHLY, PLAN_START_PRICE_YEARLY, etc.)

### Claude's Discretion
- Конкретная структура таблиц (payments vs subscriptions vs user fields) — на усмотрение
- REST API эндпоинты naming
- Детали polling стратегии для widget

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Reference Implementation (homeopapa)
- `d:/Projects/homeopapa/homeopapa-back/app/routers/payments.py` — Полный бэкенд YooKassa: create payment, webhook, status polling, plan application, PaymentLog
- `d:/Projects/homeopapa/homeopapa-next/src/app/purchase/PurchaseClient.tsx` — Фронтенд: embedded widget, polling, plan cards

### Current Pricing
- `packages/site/src/pages/pricing.astro` — Тарифы с ценами, квотами и compare table

### Database Schema
- `packages/mcp/src/db.ts` — SQLite schema (users, projects, sessions, tasks tables)

### Auth System
- `packages/server/src/middleware/auth-middleware.ts` — JWT auth middleware, req.user shape
- `packages/server/src/auth.ts` — JWT signing/verification, OTP generation
- `packages/server/src/routes/auth-routes.ts` — Auth endpoints

### Server Entry
- `packages/server/src/index.ts` — Fastify routes registration pattern

### Environment
- `.env` — Current env vars (DATABASE_URL, EMAIL_*, JWT_SECRET, OPENAI_*)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Auth middleware** (`auth-middleware.ts`): Already extracts userId, email, projectId from JWT. Billing checks can be added here.
- **Auth routes** (`auth-routes.ts`): Pattern for registering Fastify routes.
- **Email service** (`email.ts`): Can send payment confirmation emails.
- **DB singleton** (`packages/mcp/src/db.ts`): `getDb()` returns SQLite connection, pattern for adding tables.

### Established Patterns
- **Route registration**: `registerXxxRoutes(fastify)` pattern in server/src/index.ts
- **Service layer**: `@gantt/mcp/services` — taskService, messageService, authService
- **Auth flow**: OTP email → JWT (access + refresh) → session in DB
- **Env config**: dotenv loaded in bootstrap.ts before everything else

### Integration Points
- **authMiddleware**: Add plan/limit checks after JWT verification
- **POST /api/chat**: Add AI counter increment + limit check before agent run
- **GET /api/tasks**: Add read-only check for expired subscriptions
- **Fastify plugin system**: Register billing routes alongside auth routes
- **YooKassa npm**: Need to install `yookassa` SDK (Python SDK used in reference, need TypeScript equivalent or raw HTTP)

</code_context>

<specifics>
## Specific Ideas

- Паттерн YooKassa из homeopapa: embedded widget с confirmation_token, polling каждые 2 сек, webhook для надёжности
- Паттерн PLAN_CONFIG через env с дефолтами — цены/квоты можно менять без деплоя
- Webhook идемпотентность через проверку PaymentLog (уже обработан — skip)
- Receipt с VAT code 1 (без НДС), payment_subject: service
- Read-only при истёкшей подписке: chart виден, drag/edit отключены, AI чат заблокирован

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---
*Phase: 28-billing*
*Context gathered: 2026-03-27*
