# Phase 25: Interactive Preview - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-24
**Phase:** 25-interactive-preview
**Areas discussed:** Интеграция gantt-lib, Демо-данные, Scope взаимодействия, Размещение

---

## Интеграция gantt-lib

| Option | Description | Selected |
|--------|-------------|----------|
| Astro island напрямую | Простой npm install, используем как React компонент в Astro island. Меньше кода, но gantt-lib будет в bundle сайта. | ✓ |
| iframe | Загружаем ai.getgantt.ru в iframe. Изоляция bundle, но сложнее communication и styling. | |

**User's choice:** Astro island напрямую — "мне надо чтобы грузилось сразу. боюсь что iframe будет хуже?"
**Notes:** Пользователь мотивирован скоростью загрузки. Прямой import обеспечивает быструю инициализацию как часть страницы, тогда как iframe грузит весь app (React + Zustand + WebSocket + auth) и имеет отдельный lifecycle.

---

## Демо-данные

| Option | Description | Selected |
|--------|-------------|----------|
| Повторить текущие | Те же 5 этапов что в GanttPreview.tsx (Исследование, Дизайн, Разработка, Тестирование, Релиз). Консистентно с текущим preview. | ✓ |
| Новый сценарий | Другой сценарий — строительный проект, event планирование, что-то более наглядное для drag-to-edit. | |

**User's choice:** Повторить текущие
**Notes:** Консистентность с существующим preview упрощает переход от анимации к интерактиву.

---

## Scope взаимодействия

| Option | Description | Selected |
|--------|-------------|----------|
| Включить всё | Пользователь может двигать задачи, менять duration, collapse/expand. Полный опыт drag-to-edit как в настоящем app. | ✓ |
| Только drag задач | Только drag задач (перенос по timeline). Stretch и collapse отключены для простоты. | |
| You decide | Claude решит based on best practices для демо preview. | |

**User's choice:** Включить всё
**Notes:** Полный опыт позволяет пользователям максимально "почувствовать" продукт перед регистрацией.

---

## Размещение

| Option | Description | Selected |
|--------|-------------|----------|
| Заменить GanttPreview | Интерактивный график заменяет анимированный GanttPreview.tsx на главной странице. Плавный переход от анимации к интерактиву. | ✓ |
| Отдельная секция | Анимированный preview остаётся сверху, интерактивный — ниже в отдельном разделе 'Попробуйте сами'. | |
| You decide | Claude решит based on UX best practices для product landing pages. | |

**User's choice:** Заменить GanttPreview
**Notes:** Единая секция обеспечивает плавный UX — пользователь видит AI demo, затем может сам попробовать.

---

## Claude's Discretion

None — user provided explicit choices for all gray areas.

## Deferred Ideas

None — discussion stayed within phase scope.
