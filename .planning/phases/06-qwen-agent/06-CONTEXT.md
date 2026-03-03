# Phase 6: qwen-agent - Context

**Gathered:** 2026-03-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Создать агент на базе `@qwen-code/sdk` (TypeScript), который принимает текстовый промпт с описанием проекта и генерирует валидный Gantt JSON, вызывая инструменты существующего MCP-сервера.

**Запуск:** `node agent.js "задача"` (или ts-node) → tasks.json на диске + stdout
**Не входит в этот этап:** HTTP API, деплой на VPS, мультипользовательский доступ.

> **Ревизия:** изначально обсуждалась Python-библиотека `qwen-agent`, но пользователь прислал доки `@qwen-code/sdk` (TypeScript). Так как весь проект на TypeScript — это более естественный выбор.

</domain>

<decisions>
## Implementation Decisions

### Agent Framework
- Использовать `@qwen-code/sdk` (TypeScript, npm-пакет)
- SDK предоставляет функцию `query(config)` для запуска агента
- Модель: qwen-max или qwen-plus через конфиг (проверить совместимость с Z.AI GLM-4.7)
- `permissionMode: 'yolo'` — все инструменты выполняются автоматически без подтверждения

### MCP Integration
- SDK поддерживает MCP из коробки через параметр `mcpServers` в конфиге `query()`
- Конфигурация: `{ command: "node", args: ["dist/index.js"] }` — запускает TS MCP-сервер как subprocess
- Агент вызывает `import_tasks` с пустым массивом в начале каждого запуска для очистки состояния

### Interface
- CLI: `node agent.js "описание проекта"` (или через ts-node)
- Результат: итоговый tasks.json сохраняется на диск (результат вызова `export_tasks` или `get_tasks`)
- Прогресс (messages от агента) выводится в stdout

### System Prompt
- Генеральный промпт: агент умеет создавать Gantt-графики для любых проектов
- Системный промпт хранится в отдельном файле `agent/prompts/system.md` — легко менять без правки кода

### Структура проекта
- Новая директория `agent/` в корне репозитория
- `agent/agent.ts` (или `agent.js`) — основной скрипт
- `agent/prompts/system.md` — системный промпт
- Читает корневой `.env` для API ключей

### Claude's Discretion
- Формат аргументов CLI (process.argv vs minimist)
- Точное имя выходного файла (output.json vs tasks.json)
- Обработка ошибок если MCP-сервер не запустился
- Максимальное число итераций (`maxSessionTurns`)

</decisions>

<sdk_reference>
## @qwen-code/sdk — Ключевые детали

**Источник:** https://github.com/QwenLM/qwen-code/blob/main/packages/sdk-typescript/README.md

### Установка
```bash
npm install @qwen-code/sdk
# Требует Node.js >= 20.0.0
```

### Основной интерфейс
```typescript
import { query } from '@qwen-code/sdk';

const session = query({
  prompt: "создай график строительства",
  model: 'qwen-max',
  cwd: process.cwd(),
  permissionMode: 'yolo',          // все инструменты без подтверждения
  mcpServers: {
    gantt: {
      command: 'node',
      args: ['dist/index.js'],
    }
  },
  maxSessionTurns: 20,
});

for await (const message of session) {
  // message.type: 'user' | 'assistant' | 'system' | 'result'
  console.log(message);
}
```

### Ключевые параметры QueryOptions
| Параметр | Тип | Описание |
|----------|-----|----------|
| `prompt` | string \| AsyncIterable | Промпт (строка или multi-turn) |
| `model` | string | qwen-max, qwen-plus и др. |
| `cwd` | string | Рабочая директория |
| `permissionMode` | 'default'\|'plan'\|'auto-edit'\|'yolo' | Уровень разрешений |
| `mcpServers` | object | MCP-серверы (command/args или url) |
| `maxSessionTurns` | number | Лимит итераций агента |
| `abortController` | AbortController | Отмена сессии |

### Permission Modes
- `'yolo'` — всё выполняется автоматически (нужен для агента)
- `'default'` — write-инструменты требуют подтверждения
- `'plan'` — только чтение, без записи

### Message Types
```typescript
import { isSDKResultMessage, isSDKAssistantMessage } from '@qwen-code/sdk';

for await (const msg of session) {
  if (isSDKResultMessage(msg)) {
    // финальный результат сессии
    console.log(msg.result);
  }
}
```

### MCP Server конфигурация
```typescript
// Внешний MCP (subprocess через stdio):
mcpServers: {
  myServer: { command: 'node', args: ['server.js'] }
}

// HTTP MCP:
mcpServers: {
  myServer: { url: 'http://localhost:3000/mcp' }
}

// Встроенный MCP (in-process):
import { tool, createSdkMcpServer } from '@qwen-code/sdk';
const myTool = tool({ name, description, schema, handler });
mcpServers: { embedded: createSdkMcpServer([myTool]) }
```

### ⚠️ Важное: совместимость с Z.AI GLM-4.7
SDK разработан под Qwen-модели (qwen-max, qwen-plus). Z.AI использует Anthropic-совместимый формат. Нужно проверить, поддерживает ли `@qwen-code/sdk` кастомный base URL для Z.AI. Альтернатива — использовать OpenAI-endpoint Z.AI если он доступен по `api.z.ai/v1`.

</sdk_reference>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/index.ts` + `dist/index.js`: MCP-сервер, запускается как `node dist/index.js`
- `import_tasks` tool: принимает JSON строку — используется для очистки перед стартом (`import_tasks('[]')`)
- `export_tasks` tool: возвращает все задачи как JSON строку — для финального вывода
- `create_tasks_batch` tool: ключевой инструмент для генерации большого количества задач одним вызовом
- `.env`: содержит `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BASE_URL` (Z.AI proxy) и модели GLM-4.7

### Established Patterns
- TypeScript + Node.js (весь проект) — агент на том же стеке
- In-memory хранение: каждый запуск агента начинает с чистого состояния
- Формат задач: `{id, name, startDate, endDate, color, progress, dependencies[]}`
- Даты: ISO string `YYYY-MM-DD`

### Integration Points
- MCP-сервер запускается: `node dist/index.js` из корня репозитория
- SDK конфиг MCP: `{ command: "node", args: ["dist/index.js"] }`

</code_context>

<specifics>
## Specific Ideas

- Глобальная цель (не этого этапа): SaaS на VPS с мультипользовательским доступом, где каждый юзер — отдельный независимый процесс агента
- Прототип должен подтвердить, что `@qwen-code/sdk` + Z.AI умеет вызывать MCP-инструменты и строить реальный график
- **Ключевая проверка:** работает ли SDK с кастомным base URL / GLM-4.7 — это первое что нужно выяснить в ресёрче

</specifics>

<deferred>
## Deferred Ideas

- HTTP API (Express/Fastify): POST /generate → JSON — отдельный этап для SaaS
- Деплой на VPS + мультипользовательский доступ (отдельные процессы) — финальная цель
- Web UI для ввода промпта и отображения Gantt — отдельная фаза
- Стриминг ответа агента в реальном времени
- Переход на Python если qwen-code/sdk не подойдёт

</deferred>

---

*Phase: 06-qwen-agent*
*Context gathered: 2026-03-03*
*Updated: 2026-03-03 — добавлены доки @qwen-code/sdk, ревизия с Python на TypeScript*
