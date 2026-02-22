# gantt-lib MCP Server

## What This Is

MCP-сервер на TypeScript для работы с диаграммами Ганта. Позволяет AI-ассистентам управлять задачами, зависимостями и автоматически пересчитывать даты — всё в памяти. Для локального тестирования через Claude Code CLI.

## Core Value

AI может программно управлять диаграммами Ганта: создавать задачи, устанавливать зависимости и автоматически пересчитывать сроки при изменениях.

## Requirements

### Validated

(Нет — проект с нуля)

### Active

- [ ] MCP-сервер на TypeScript с @modelcontextprotocol/sdk
- [ ] CRUD операции для задач (создание, чтение, обновление, удаление)
- [ ] Auto-schedule: каскадный пересчёт дат при изменении зависимых задач
- [ ] Хранение задач в памяти (in-memory)
- [ ] Интеграция с gantt-lib типами (Task, TaskDependency)
- [ ] Тестирование через Claude Code CLI

### Out of Scope

- Визуализация диаграммы — только работа с данными
- персистентное хранение — только в памяти
- Экспорт в PDF/PNG — не требуется для v1
- веб-интерфейс — MCP-протокол достаточен

## Context

**Исходная библиотека:** [gantt-lib](https://github.com/simon100500/gantt-lib) — React-компонент для диаграмм Ганта

**Ключевые типы из gantt-lib:**
- `Task`: id, name, startDate, endDate, color, progress, dependencies[]
- `TaskDependency`: taskId, type ('FS'|'SS'|'FF'|'SF'), lag
- Валидация: циклы, missing tasks, constraint violations

**MCP Model Context Protocol:** открытый протокол для подключения AI-ассистентов к внешним инструментам. Официальный SDK: `@modelcontextprotocol/sdk`

**Целевой клиент:** Claude Code CLI — пользователь будет тестировать локально

## Constraints

- **Типизация:** Использовать типы из gantt-lib для совместимости (Task, TaskDependency)
- **Хранение:** In-memory только — персистентность не требуется
- **Язык:** TypeScript для соответствия gantt-lib экосистеме
- **Документация:** gantt-lib REFERENCE.md содержит все необходимые детали API

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| TypeScript вместо Python | gantt-lib написана на TS — естественная совместимость типов | — Pending |
| In-memory хранение | Для локального тестирования достаточно, проще реализация | — Pending |
| Без визуализации | Пользователь указал "только данные" | — Pending |

---
*Last updated: 2026-02-23 after initialization*
