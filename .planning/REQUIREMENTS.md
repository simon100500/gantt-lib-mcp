# Requirements: gantt-lib MCP Server

**Defined:** 2026-02-23
**Core Value:** AI может программно управлять диаграммами Ганта: создавать задачи, устанавливать зависимости и автоматически пересчитывать сроки при изменениях.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### MCP Core

- [x] **MCP-01**: MCP-сервер инициализируется с @modelcontextprotocol/sdk на TypeScript
- [x] **MCP-02**: Сервер запускается через stdio (стандартный MCP transport)
- [x] **MCP-03**: Сервер регистрирует tools для операций с задачами

### Task Management

- [x] **TASK-01**: Пользователь может создать задачу с name, startDate, endDate
- [x] **TASK-02**: Пользователь может создать задачу с dependencies (массив TaskDependency)
- [x] **TASK-03**: Пользователь может получить список всех задач
- [x] **TASK-04**: Пользователь может получить задачу по ID
- [x] **TASK-05**: Пользователь может обновить задачу (даты, название, цвет)
- [x] **TASK-06**: Пользователь может удалить задачу по ID

### Auto-schedule

- [x] **SCHED-01**: При изменении задачи пересчитываются даты зависимых задач
- [x] **SCHED-02**: Поддерживаются все типы зависимостей: FS, SS, FF, SF
- [x] **SCHED-03**: Валидация зависимостей обнаруживает циклы
- [x] **SCHED-04**: Валидация зависимостей обнаруживает missing task references

### Data Model

- [x] **DATA-01**: Тип Task совместим с gantt-lib (id, name, startDate, endDate, color, progress, dependencies)
- [x] **DATA-02**: Тип TaskDependency совместим с gantt-lib (taskId, type, lag)
- [x] **DATA-03**: Даты хранятся в формате ISO string ('YYYY-MM-DD')

### Testing

- [ ] **TEST-01**: MCP-сервер можно подключить к Claude Code CLI
- [ ] **TEST-02**: Пример вызова каждого tool через MCP

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Persistence

- **PERS-01**: Сохранение задач в файл JSON
- **PERS-02**: Загрузка задач из файла JSON

### Export

- **EXP-01**: Экспорт диаграммы в Markdown
- **EXP-02**: Экспорт диаграммы в CSV

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Визуализация диаграммы | Пользователь указал "только данные" |
| Веб-интерфейс | MCP-протокол достаточен для управления |
| Персистентное хранение | Для локального тестирования достаточно in-memory |
| Авторизация | Локальный сервер без сетевого доступа |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| MCP-01 | Phase 1 | Complete |
| MCP-02 | Phase 1 | Complete |
| MCP-03 | Phase 1 | Complete |
| TASK-01 | Phase 2 | Complete |
| TASK-02 | Phase 2 | Complete |
| TASK-03 | Phase 2 | Complete |
| TASK-04 | Phase 2 | Complete |
| TASK-05 | Phase 2 | Complete |
| TASK-06 | Phase 2 | Complete |
| SCHED-01 | Phase 3 | Complete |
| SCHED-02 | Phase 3 | Complete |
| SCHED-03 | Phase 3 | Complete |
| SCHED-04 | Phase 3 | Complete |
| DATA-01 | Phase 2 | Complete |
| DATA-02 | Phase 2 | Complete |
| DATA-03 | Phase 2 | Complete |
| TEST-01 | Phase 4 | Pending |
| TEST-02 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 17 total
- Mapped to phases: 17 (100%)
- Unmapped: 0

---
*Requirements defined: 2026-02-23*
*Last updated: 2026-02-23 after completing Phase 3 Plan 1*
