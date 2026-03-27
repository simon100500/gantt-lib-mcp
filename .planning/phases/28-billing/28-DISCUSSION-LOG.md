# Phase 28: Billing - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-27
**Phase:** 28-billing
**Areas discussed:** Тарифы и модель подписки, Лимиты и enforcement, Покупка UI и флоу

---

## Payment Model

| Option | Description | Selected |
|--------|-------------|----------|
| Recurring подписка | Автопродление через YooKassa recurring | |
| Разовые платежи | Каждый платёж разовый, без автосписаний | ✓ |
| Гибрид | Месяц recurring, год разовый | |

**User's choice:** Разовые платежи
**Notes:** Пользователь вручную продлевает при истечении

---

## Corporate Plan

| Option | Description | Selected |
|--------|-------------|----------|
| По запросу (без виджета) | Кнопка "Напишите нам", ручной activate | ✓ |
| Тоже через виджет | Стандартная оплата через YooKassa | |

**User's choice:** По запросу, без виджета

---

## Limits Enforcement

| Option | Description | Selected |
|--------|-------------|----------|
| Strict (на каждом запросе) | Блокировать при превышении | ✓ |
| Soft (только создание) | Не блокировать редактирование | |
| Show only | Только показывать, не ограничивать | |

**User's choice:** Strict, но только при открытии проекта. Если подписка истекла — read-only. НЕ на каждом редактировании графика.
**Notes:** "Ты именно при открытии графика должен проверить его права. И если подписка кончилась, то ридонли."

---

## AI Limit Counting

| Option | Description | Selected |
|--------|-------------|----------|
| Per chat message | 1 вызов /api/chat = 1 генерация | ✓ |
| Только AI-генерации | Без уточнений | |

**User's choice:** Per chat message

---

## Counter Reset

| Option | Description | Selected |
|--------|-------------|----------|
| Сброс при новой оплате | Сброс счётчиков при покупке нового периода | ✓ |
| Накопительный | Без сброса | |

**User's choice:** Сброс при новой оплате

---

## Payment Widget

| Option | Description | Selected |
|--------|-------------|----------|
| Embedded виджет на app | Бесшовный, как в homeopapa | ✓ |
| Redirect на YooKassa | Хостed форма на yookassa.ru | |

**User's choice:** Embedded виджет на app

---

## Billing Flow

| Option | Description | Selected |
|--------|-------------|----------|
| Pricing → redirect на app | Отдельная billing page на ai.getgantt.ru | ✓ |
| Pricing → модал | Виджет прямо в pricing.astro | |
| На ai.getgantt.ru | Полностью в app | |

**User's choice:** Отдельная billing page на app

---

## Billing Page

| Option | Description | Selected |
|--------|-------------|----------|
| Полноценная billing page | Текущий план, лимиты, история, upgrade | ✓ |
| Только модал оплаты | Минимум | |

**User's choice:** Полноценная billing page

---

## Payment Periods

| Option | Description | Selected |
|--------|-------------|----------|
| 31/365 дней | Месяц = 31 дней, год = 365 дней | ✓ |
| Другие периоды | Указать свои | |

**User's choice:** 31/365 дней

---

## Claude's Discretion

- Конкретная структура таблиц (payments vs subscriptions vs user fields)
- REST API naming
- Polling стратегия для widget

## Deferred Ideas

None
