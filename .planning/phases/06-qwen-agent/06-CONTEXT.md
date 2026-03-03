# Phase 6: qwen-agent - Context

**Gathered:** 2026-03-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Создать Python-агент (qwen-agent SDK) который принимает текстовый промпт с описанием проекта и генерирует валидный Gantt JSON, вызывая инструменты существующего TS MCP-сервера через stdio.

**Запуск:** `python agent.py "задача"` → tasks.json на диске + stdout
**Не входит в этот этап:** HTTP API, деплой на VPS, мультипользовательский доступ.

</domain>

<decisions>
## Implementation Decisions

### Agent Framework
- Использовать `qwen-agent` Python library
- Подключаться к Z.AI через OpenAI-совместимый endpoint (api.z.ai/v1)
- Модель: GLM-4.7 (API ключ берётся из `.env` — поле `ANTHROPIC_AUTH_TOKEN`)

### MCP Integration
- TS MCP-сервер остаётся как есть (stdio transport)
- Python агент запускает `node dist/index.js` как subprocess через qwen-agent MCP client
- Агент вызывает `import_tasks([])` (или `import_tasks` с пустым массивом) в начале каждого запуска для очистки состояния

### Interface
- CLI: `python agent.py "описание проекта"`
- Результат: итоговый tasks.json сохраняется на диск (результат вызова get_tasks или export_tasks)
- Прогресс работы агента выводится в stdout

### System Prompt
- Генеральный промпт (не специфика строительства): агент умеет создавать Gantt-графики для любых проектов
- Системный промпт хранится в отдельном файле `agent/prompts/system.md` — легко менять без правки кода

### Структура проекта
- Новая директория `agent/` в корне репозитория
- `agent/agent.py` — основной скрипт
- `agent/prompts/system.md` — системный промпт
- `agent/requirements.txt` — зависимости
- `agent/.env` (или читает корневой `.env`) — конфигурация

### Claude's Discretion
- Формат аргументов командной строки (argparse vs просто sys.argv)
- Точное имя выходного файла (output.json vs tasks.json)
- Обработка ошибок если MCP-сервер не запустился
- Максимальное количество итераций агента

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/index.ts` + `dist/index.js`: MCP-сервер, запускается как `node dist/index.js`
- `import_tasks` tool: принимает JSON строку — используется для очистки перед стартом (`import_tasks('[]')`)
- `export_tasks` tool: возвращает все задачи как JSON строку — используется для финального вывода
- `create_tasks_batch` tool: ключевой инструмент для генерации большого количества задач
- `.env`: содержит `ANTHROPIC_AUTH_TOKEN` и `ANTHROPIC_BASE_URL` — будут переиспользованы

### Established Patterns
- In-memory хранение: каждый запуск агента начинает с чистого состояния
- Формат задач: `{id, name, startDate, endDate, color, progress, dependencies[]}`
- Даты: ISO string `YYYY-MM-DD`

### Integration Points
- MCP-сервер запускается командой: `node dist/index.js` из корня репозитория
- qwen-agent MCP client ожидает конфигурацию: `{"command": "node", "args": ["dist/index.js"]}`

</code_context>

<specifics>
## Specific Ideas

- Глобальная цель (не этого этапа): SaaS на VPS с мультипользовательским доступом, где каждый юзер — отдельный независимый процесс
- Прототип должен подтвердить, что qwen-agent + Z.AI GLM-4.7 умеет правильно вызывать MCP-инструменты и строить реальный график
- Проверить, что Z.AI api.z.ai поддерживает OpenAI-совместимый endpoint (нужно для qwen-agent)

</specifics>

<deferred>
## Deferred Ideas

- HTTP API (FastAPI): POST /generate → JSON — отдельный этап для SaaS
- Деплой на VPS + мультипользовательский доступ (отдельные процессы) — финальная цель
- Переписать MCP-сервер с TS на Python (fastmcp) — только если нужно для VPS деплоя
- Web UI для ввода промпта и отображения Gantt — отдельная фаза
- Стриминг ответа агента в реальном времени

</deferred>

---

*Phase: 06-qwen-agent*
*Context gathered: 2026-03-03*
