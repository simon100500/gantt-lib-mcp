# Phase 24: Astro Site Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-23
**Phase:** 24-astro-site-foundation
**Mode:** discuss
**Areas discussed:** Hero Layout, Rotating Value Props, AI Demo Animation, Social Proof, Design System Colors, Design System Components, Header Layout, Footer Structure, CTA Buttons, Responsive Strategy, Mobile Navigation

---

## Hero Layout

| Option | Description | Selected |
|--------|-------------|----------|
| Two-column (слева текст, справа demo) | Заголовок слева, AI demo справа. Классический паттерн SaaS лендингов. Хорошо работает на desktop. | |
| Stacked (заголовок сверху, demo внизу) | Заголовок сверху по центру, AI demo на всю ширину ниже. Максимум внимания на demo. | ✓ |
| Full-screen overlay | Full-screen hero с заголовком поверх анимированного gantt preview. Смелее, но сложнее в реализации. | |

**User's choice:** Stacked (заголовок сверху, demo внизу)

---

## Hero: Rotating Value Props

| Option | Description | Selected |
|--------|-------------|----------|
| Да, все 6 вариантов | 6 вариантов: "Из текста/сметы/брифа/ТЗ/письма/таблицы → Гантт за 30 секунд". Анимация typewriter effect. | |
| Да, но сокращённый список (3 варианта) | 3 основных: "Из текста/сметы/ТЗ → Гантт за 30 секунд". Меньше текста, быстрее цикл. | ✓ |
| Нет, статичный заголовок | Фиксированный заголовок без ротации. Проще, но менее динамично. | |

**User's choice:** Да, но сокращённый список (3 варианта)

---

## Hero: AI Demo Animation

| Option | Description | Selected |
|--------|-------------|----------|
| Typewriter → fade-in | Текст печатается letter-by-letter, затем gantt chart появляется с fade-in. Простая, понятная анимация. | ✓ |
| Typewriter + growing gantt | Текст печатается, gantt growing в реальном времени. Более динамично, но сложнее. | |
| Pre-recorded animation loop | Заготовленный loop видео/анимация. Максимум визуально, но не живой. | |

**User's choice:** Typewriter → fade-in

---

## Hero: Social Proof

| Option | Description | Selected |
|--------|-------------|----------|
| Компактный (в одну строку) | Аватарки (3-4 шт.), "★★★★★ 4.9", "12,000+ teams" на одной строке под заголовком. Компактно. | |
| Балансированный (в две части) | Аватарки слева, рейтинг и count справа. Чуть больше пространства, больше фокуса. | |
| Минимум (только "Попробовать бесплатно" CTA) | Социальное_proof внизу hero секции отдельным блоком. Максимальный акцент на CTA. | ✓ |

**User's choice:** Минимум (только "Попробовать бесплатно" CTA)

---

## Design System: Colors

| Option | Description | Selected |
|--------|-------------|----------|
| Переиспользовать из packages/web | Indigo-violet primary (#6158e0), slate neutral, те же accent/muted цвета. Консистентно между app и site. | ✓ |
| Свежая палитра для site | Новая цветовая палитра для marketing — более яркий primary, другие accent цвета. Позволяет сайту выделиться. | |

**User's choice:** Переиспользовать из packages/web

---

## Design System: Components

| Option | Description | Selected |
|--------|-------------|----------|
| Переиспользовать существующие UI компоненты | Скопировать Button, Card из packages/web/src/components/ui/ и адаптировать. Быстрее, но возможны ненужные зависимости. | ✓ |
| Новые компоненты для site | Создать новые Button, Card для packages/site. Чище dependency graph, но больше кода. | |
| Astro/shadcn из коробки | Использовать Astro UI компоненты или minimal shadcn. Просто, но другая дизайн-система. | |

**User's choice:** Переиспользовать существующие UI компоненты

---

## Navigation: Header Layout

| Option | Description | Selected |
|--------|-------------|----------|
| Центрированный (logo — links — CTA) | Логотип слева, центр - ссылки Features/FAQ, справа - CTA "Попробовать бесплатно". Классический SaaS header. | ✓ |
| Сжатый (logo слева, links+CTA справа) | Логотип слева, справа - ссылки + CTA. Больше фокуса на CTA. | |
| Центральный акцент | Logo слева, Features/FAQ/CTA по центру, мобильное меню справа. Уникальный паттерн. | |

**User's choice:** Центрированный (logo — links — CTA)

---

## CTA Buttons Style

| Option | Description | Selected |
|--------|-------------|----------|
| Primary + secondary (разные стили) | Главная CTA — primary (indigo). Вторичная CTA — outline/ghost. Чёткий визуальный приоритет. | ✓ |
| Обе primary | Обе кнопки primary с разным текстом. Меньше контраста, но оба варианта заметны. | |
| Одна главная CTA | Только одна главная CTA "Попробовать бесплатно". Вторичная — текстовая ссылка. | |

**User's choice:** Primary + secondary (разные стили)

---

## Footer Structure

| Option | Description | Selected |
|--------|-------------|----------|
| Простой (3 колонки) | 3 колонки: Product (Features), Company (About, Contact), Legal (Privacy, Terms). Минимум для v1. | ✓ |
| Расширенный (4-5 колонок) | 4-5 колонок: Product, Templates, Company, Legal, Social. Более полное для SEO. | |
| Минимальный (одна строка) | Одна строка с логотипом и ключевыми ссылками. Минималистично. | |

**User's choice:** Простой (3 колонки)

---

## Responsive Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Mobile-first (768/1024) | Mobile-first стили, breakpoints: 768px (tablet), 1024px (desktop). Стандартный подход Tailwind. | ✓ |
| Desktop-first | Desktop-first стили, mobile override. Быстрее для desktop-heavy продукта. | |
| Adaptive (разные layout паттерны) | Adaptive — разные layout паттерны для mobile vs desktop. Больше контроля, больше кода. | |

**User's choice:** Mobile-first (768/1024)

---

## Mobile Navigation

| Option | Description | Selected |
|--------|-------------|----------|
| Hamburger menu | Hamburger menu (три полоски) → drawer/sheet справа. Стандартный паттерн. | ✓ |
| Упрощённый (только CTA) | Скрыть второстепенные ссылки на mobile, оставить только CTA кнопку. Максимально просто. | |
| Bottom nav | Bottom navigation bar для key links. Mobile-app feel. | |

**User's choice:** Hamburger menu

---

## Claude's Discretion

Areas where user confirmed Claude has flexibility:
- Exact timing для typewriter анимации
- Конкретный text content для rotating value props (формат)
- Drawer/sheet компонент выбор для mobile menu
- Footer spacing и typography детали

## Deferred Ideas

None — discussion stayed within phase scope.
