# Phase 29: paywall-enhance - Context

**Gathered:** 2026-03-29
**Status:** Ready for planning
**Source:** PRD Express Path (.agents/billing-upgrade-plan.md)

<domain>
## Phase Boundary

Синхронизация биллинга с тарифной сеткой v5 + CRO-улучшения upgrade flow.
Всё — чистый фронтенд ( PurchasePage, AccountBillingPage, billing.ts ) кроме feature gate modal (B1), который требует интеграции в AI/project flow + серверный отклик 403.
</domain>

<decisions>
## Implementation Decisions

### A1: PLAN_PRICES — годовые цены
- start yearly: 12 000 → 11 900 ₽
- team yearly: 59 880 → 47 900 ₽
- enterprise yearly: 154 800 → 129 000 ₽
- Месячные без изменений (1 490 / 4 990 / 12 900)

### A2: PLAN_FEATURES — полный rewrite
**Старт:** 3 активных проекта, 25 AI-запросов в день, Архив проектов, Пул ресурсов, Экспорт в PDF, Гостевые ссылки
**Команда:** 7 активных проектов, 50 AI-запросов в день, Архив проектов, Пул ресурсов, 5 участников команды, Экспорт PDF + Excel, Гостевые ссылки
**Корпоративный:** Безлимит проектов, 100 AI-запросов в день, 20 участников команды, Экспорт PDF + Excel + API, Приоритетная поддержка

### A3: FREE_FEATURES в PurchasePage
- Заменить: `['2 графика', '3 AI-генерации графика', '5 AI-уточнений на каждый график', '1 ресурс']`
- На: `['1 проект', '20 AI-запросов (навсегда)', 'Гостевые ссылки']`

### A4: Скидка — убрать единый бейдж "-33%" с переключателя
- Показывать экономию на каждой карточке рядом с годовой ценой: "Экономия X ₽ в год"
- Расчёт: Старт 5 980, Команда 11 980, Корпоративный 25 800

### A5: Лейбл в AccountBillingPage
- `"AI-генерации"` → `"AI-запросы"` (строка 91)

### A6: Счётчик AI-запросов
- Оставить progress bar на billing page (AccountBillingPage) — это страница управления подпиской
- Убрать из основного UI (редактор, sidebar) — принцип "скрыты" относится к рабочему экрану

### B1: Feature gate modal при достижении лимита (HIGH IMPACT)
- Новый компонент `LimitReachedModal.tsx`
- 3 сценария: free AI-лимит исчерпан, платный дневной лимит, лимит проектов
- Формулировки мягкие, без "лимит исчерпан" — апсейл через ценность
- Точки интеграции: `POST /api/chat` (App.tsx ~line 320), `POST /api/projects` (useAuthStore.ts ~line 435)
- Сервер уже возвращает 403 с `AI_LIMIT_REACHED` при превышении лимита

### B2: Контекстный апсейл в AccountBillingPage при высоком usage
- Alert-блок при AI usage >= 80% и при 100%
- Ссылка на следующий тариф с ценой

### B3: Персонализация кнопки "Расширить"
- free → "Перейти на Старт — 1 490 ₽/мес"
- start → "Расширить до Команды — больше проектов и участников"
- team → "Корпоративный — безлимит проектов"
- enterprise → скрыть или "Связаться с нами"

### B4: Social proof на PurchasePage
- Один `<blockquote>` с цитатой прораба между карточками тарифов и блоком "Корпоративный"
- Текст: "Бомба, такого на рынке нет!" — прораб, ранний доступ

### B5: Годовая экономия в абсолютных числах
- Под годовой ценой на каждой карточке: "Экономия X ₽ в год" (при выборе "Год")

### B6: Мелкие текстовые правки PurchasePage
- Кнопка free-плана: "Остаться на free" → "Продолжить бесплатно"
- Заголовок страницы: "Расширить тариф" → "Тарифы"

### B7: Состав free-плана в AccountBillingPage
- Для `plan === 'free'` показать что входит + мягкий nudge
- Текст: Бесплатный тариф, 1 проект, 20 AI-запросов (навсегда), Гостевые ссылки

### Серверный plan-config.ts — тоже обновить
- Лимиты и цены на сервере должны совпадать с v5
- Текущие серверные лимиты: free 2 проекта/3 AI, start 5 проектов/10 AI — устарели

### Claude's Discretion
- Порядок задач внутри планов (PRD предлагает порядок реализации)
- Стилизация feature gate modal (в рамках существующего design system)
- Форматирование цен и экономии на карточках
- Структура LimitReachedModal (inline или отдельный файл — PRD предлагает отдельный файл)
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Billing constants & types
- `packages/web/src/lib/billing.ts` — PLAN_PRICES, PLAN_FEATURES, PLAN_LABELS, BillingPeriod, PlanId
- `packages/server/src/services/plan-config.ts` — серверные лимиты и цены (должны совпадать)

### Pages to modify
- `packages/web/src/components/PurchasePage.tsx` — FREE_FEATURES, заголовок, кнопки, скидки, social proof
- `packages/web/src/components/AccountBillingPage.tsx` — лейбл, progress bar, апсейл, кнопка, free-план состав

### Integration points for feature gate
- `packages/web/src/App.tsx` — submitChatMessage (POST /api/chat, ~line 320), activateDraftWorkspace (POST /api/projects, ~line 373)
- `packages/web/src/stores/useAuthStore.ts` — createProject (~line 435)
- `packages/web/src/stores/useBillingStore.ts` — subscription state, fetchSubscription

### Server enforcement
- `packages/server/src/middleware/subscription-middleware.ts` — 403 AI_LIMIT_REACHED response
- `packages/server/src/services/billing-service.ts` — incrementAiUsage, applyPlan
</canonical_refs>

<specifics>
## Specific Ideas

### Порядок реализации из PRD
1. A1-A3: цены + фичи + free features (низкая сложность, критично)
2. A4: скидка per-card (средняя сложность)
3. A5: лейбл AI-запросы (низкая сложность)
4. B3: персонализация кнопки (низкая сложность)
5. B6: текстовые правки (низкая сложность)
6. B5: годовая экономия (низкая сложность)
7. B7: состав free на billing (низкая сложность)
8. B2: апсейл при высоком usage (низкая сложность)
9. B4: social proof (низкая сложность)
10. B1: feature gate modal (высокая сложность, высокий импакт)

Задачи 1-9 — чистый фронтенд, можно сделать за один проход.
Задача 10 требует интеграции с бэкенд-логикой лимитов.

### Текущие значения (для сравнения)
- billing.ts: start yearly=12000, team yearly=59880, enterprise yearly=154800
- plan-config.ts: free 2 projects/3 AI gen, start 5 projects/10 AI gen/20 refinements/20 resources
- PurchasePage FREE_FEATURES: 2 графика, 3 AI-генерации, 5 AI-уточнений, 1 ресурс
- AccountBillingPage label: "AI-генерации", button: "Расширить"
- PurchasePage title: "Расширить тариф", free button: "Остаться на free"
</specifics>

<deferred>
## Deferred Ideas

- "Первый день без ограничений" UI-индикатор (вопрос 4 из PRD — открытый)
- Предупреждение перед стопом за N запросов до лимита (фаза 2 из pricing-context)
- Больше 1 цитаты для social proof — подождать больше данных
</deferred>

---
*Phase: 29-paywall-enhance*
*Context gathered: 2026-03-29 via PRD Express Path*
