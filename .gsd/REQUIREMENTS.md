# Requirements

## Active

### TEST-01 — MCP-сервер можно подключить к Claude Code CLI

- Status: active
- Class: core-capability
- Source: inferred
- Primary Slice: none yet

MCP-сервер можно подключить к Claude Code CLI

### TEST-02 — Пример вызова каждого tool через MCP

- Status: active
- Class: core-capability
- Source: inferred
- Primary Slice: none yet

Пример вызова каждого tool через MCP

## Validated

### MCP-01 — MCP-сервер инициализируется с @modelcontextprotocol/sdk на TypeScript

- Status: validated
- Class: core-capability
- Source: inferred
- Primary Slice: none yet

MCP-сервер инициализируется с @modelcontextprotocol/sdk на TypeScript

### MCP-02 — Сервер запускается через stdio (стандартный MCP transport)

- Status: validated
- Class: core-capability
- Source: inferred
- Primary Slice: none yet

Сервер запускается через stdio (стандартный MCP transport)

### MCP-03 — Сервер регистрирует tools для операций с задачами

- Status: validated
- Class: core-capability
- Source: inferred
- Primary Slice: none yet

Сервер регистрирует tools для операций с задачами

### TASK-01 — Пользователь может создать задачу с name, startDate, endDate

- Status: validated
- Class: core-capability
- Source: inferred
- Primary Slice: none yet

Пользователь может создать задачу с name, startDate, endDate

### TASK-02 — Пользователь может создать задачу с dependencies (массив TaskDependency)

- Status: validated
- Class: core-capability
- Source: inferred
- Primary Slice: none yet

Пользователь может создать задачу с dependencies (массив TaskDependency)

### TASK-03 — Пользователь может получить список всех задач

- Status: validated
- Class: core-capability
- Source: inferred
- Primary Slice: none yet

Пользователь может получить список всех задач

### TASK-04 — Пользователь может получить задачу по ID

- Status: validated
- Class: core-capability
- Source: inferred
- Primary Slice: none yet

Пользователь может получить задачу по ID

### TASK-05 — Пользователь может обновить задачу (даты, название, цвет)

- Status: validated
- Class: core-capability
- Source: inferred
- Primary Slice: none yet

Пользователь может обновить задачу (даты, название, цвет)

### TASK-06 — Пользователь может удалить задачу по ID

- Status: validated
- Class: core-capability
- Source: inferred
- Primary Slice: none yet

Пользователь может удалить задачу по ID

### SCHED-01 — При изменении задачи пересчитываются даты зависимых задач

- Status: validated
- Class: core-capability
- Source: inferred
- Primary Slice: none yet

При изменении задачи пересчитываются даты зависимых задач

### SCHED-02 — Поддерживаются все типы зависимостей: FS, SS, FF, SF

- Status: validated
- Class: core-capability
- Source: inferred
- Primary Slice: none yet

Поддерживаются все типы зависимостей: FS, SS, FF, SF

### SCHED-03 — Валидация зависимостей обнаруживает циклы

- Status: validated
- Class: core-capability
- Source: inferred
- Primary Slice: none yet

Валидация зависимостей обнаруживает циклы

### SCHED-04 — Валидация зависимостей обнаруживает missing task references

- Status: validated
- Class: core-capability
- Source: inferred
- Primary Slice: none yet

Валидация зависимостей обнаруживает missing task references

### DATA-01 — Тип Task совместим с gantt-lib (id, name, startDate, endDate, color, progress, dependencies)

- Status: validated
- Class: core-capability
- Source: inferred
- Primary Slice: none yet

Тип Task совместим с gantt-lib (id, name, startDate, endDate, color, progress, dependencies)

### DATA-02 — Тип TaskDependency совместим с gantt-lib (taskId, type, lag)

- Status: validated
- Class: core-capability
- Source: inferred
- Primary Slice: none yet

Тип TaskDependency совместим с gantt-lib (taskId, type, lag)

### DATA-03 — Даты хранятся в формате ISO string ('YYYY-MM-DD')

- Status: validated
- Class: core-capability
- Source: inferred
- Primary Slice: none yet

Даты хранятся в формате ISO string ('YYYY-MM-DD')

### WEB-01 — Monorepo structure with npm workspaces (packages/web, packages/server, packages/mcp)

- Status: validated
- Class: core-capability
- Source: inferred
- Primary Slice: none yet

Monorepo structure with npm workspaces (packages/web, packages/server, packages/mcp)

### WEB-02 — SQLite database via @libsql/client for task persistence

- Status: validated
- Class: core-capability
- Source: inferred
- Primary Slice: none yet

SQLite database via @libsql/client for task persistence

### WEB-03 — Fastify server with WebSocket support for real-time updates

- Status: validated
- Class: core-capability
- Source: inferred
- Primary Slice: none yet

Fastify server with WebSocket support for real-time updates

### WEB-04 — React frontend with useTasks hook for data fetching

- Status: validated
- Class: core-capability
- Source: inferred
- Primary Slice: none yet

React frontend with useTasks hook for data fetching

### WEB-05 — Chat sidebar with AI agent integration via WebSocket

- Status: validated
- Class: core-capability
- Source: inferred
- Primary Slice: none yet

Chat sidebar with AI agent integration via WebSocket

### WEB-06 — CapRover deployment with Dockerfile and nginx configuration

- Status: validated
- Class: core-capability
- Source: inferred
- Primary Slice: none yet

CapRover deployment with Dockerfile and nginx configuration

### WEB-GANTT-01 — gantt-lib package (v0.1.1) installed in packages/web with CSS import

- Status: validated
- Class: core-capability
- Source: inferred
- Primary Slice: none yet

gantt-lib package (v0.1.1) installed in packages/web with CSS import

### WEB-GANTT-02 — GanttChart component replaced with gantt-lib's GanttChart component

- Status: validated
- Class: core-capability
- Source: inferred
- Primary Slice: none yet

GanttChart component replaced with gantt-lib's GanttChart component

### WEB-GANTT-03 — Drag-to-edit functionality (move and resize) with onChange handler persistence

- Status: validated
- Class: core-capability
- Source: inferred
- Primary Slice: none yet

Drag-to-edit functionality (move and resize) with onChange handler persistence

## Deferred

## Out of Scope
