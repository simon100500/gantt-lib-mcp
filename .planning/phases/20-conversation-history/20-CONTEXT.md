# Phase 20: Conversation History - Context

**Gathered:** 2026-03-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Give agent access to previous session context via MCP tools. Add two new tools: `get_conversation_history` for reading previous messages and `add_message` for recording assistant responses.

**Что входит:**
- Новый MCP tool `get_conversation_history` — возвращает последние N сообщений
- Новый MCP tool `add_message` — записывает сообщение ассистента в историю проекта
- Интеграция с существующим MessageService

**Что НЕ входит:**
- Типизация сообщений (success/info_request/error) — будущая фаза
- Пагинация через offset — достаточно limit
- Параметр order — фиксированный хронологический порядок

</domain>

<decisions>
## Implementation Decisions

### Tool Names (LOCKED)
- Чтение: `get_conversation_history`
- Запись: `add_message`

### get_conversation_history Parameters (LOCKED)

```typescript
{
  name: 'get_conversation_history',
  inputSchema: {
    type: 'object',
    properties: {
      projectId: {type: 'string'},
      limit: {
        type: 'number',
        description: 'Maximum number of messages to return (default: 20, max: 50)',
        minimum: 0,
        maximum: 50
      }
    },
    required: ['projectId']
  }
}
```

**Логика limit:**
- `0` или не указан → 20 сообщений (по умолчанию)
- Положительное N → N сообщений
- Максимум: 50 (валидация в handler)

### get_conversation_history Return Format (LOCKED)
```typescript
// Возвращает просто массив сообщений
Message[]  // {id, projectId, role, content, createdAt}[]
```
Без метаданных типа hasMore/total — агенту достаточно истории.

### add_message Parameters (LOCKED)

```typescript
{
  name: 'add_message',
  inputSchema: {
    type: 'object',
    properties: {
      projectId: {type: 'string'},
      content: {type: 'string'}
    },
    required: ['projectId', 'content']
  }
}
```

**Role фиксирован как 'assistant'** — агент не может записывать от имени пользователя.

### add_message Return Format (LOCKED)
```typescript
// При успехе
Message  // Созданное сообщение

// При ошибке
throw Error с описанием
```

### Message Order (LOCKED)
- Фиксированный хронологический порядок: старые → новые
- Без параметра order
- Соответствует текущему поведению MessageService.list()

### Filtering (LOCKED)
- **Без фильтрации по роли** — возвращаются все сообщения (user и assistant)
- Агент сам фильтрует если нужно

### Claude's Discretion
- Точная валидация limit (тип, диапазон)
- Форматирование сообщений об ошибках

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — HIST-01, HIST-02 (get_conversation_history, add_message)

### MCP Implementation
- `packages/mcp/src/index.ts` — MCP tools registration (6 existing tools: ping, create_task, get_tasks, get_task, update_task, delete_task, create_tasks_batch)
- `packages/mcp/src/services/message.service.ts` — MessageService с методами add() и list(limit)

### Types
- `packages/mcp/src/types.ts` — Message type definition

### Database Schema
- `packages/mcp/prisma/schema.prisma` — Message table definition

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `MessageService.add(role, content, projectId)` — создаёт сообщение (lines 35-46)
- `MessageService.list(projectId, limit)` — возвращает сообщения в хронологическом порядке (lines 54-64)
- `Message` type: `{id, projectId, role, content, createdAt}`

### Established Patterns
- MCP tools: inputSchema + handler → JSON.stringify(result)
- Параметры по умолчанию в handler, не в inputSchema
- Валидация параметров в handler перед вызовом service
- Date format: ISO strings (createdAt)

### Integration Points
- `packages/mcp/src/index.ts` — Добавить два новых инструмента в массив tools
- `packages/mcp/src/services/message.service.ts` — Использовать существующие методы

### Current State
```typescript
// MessageService.list() — готов к использованию
async list(projectId: string, limit: number = 20): Promise<Message[]> {
  const messages = await this.prisma.message.findMany({
    where: { projectId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  return messages.reverse().map(m => this.messageToDomain(m));
}

// MessageService.add() — готов к использованию
async add(role: 'user' | 'assistant', content: string, projectId: string): Promise<Message> {
  const message = await this.prisma.message.create({
    data: { id: randomUUID(), projectId, role, content },
  });
  return this.messageToDomain(message);
}
```

</code_context>

<specifics>
## Specific Ideas

### Типичный сценарий использования

```javascript
// 1. Агент читает историю контекста
const history = get_conversation_history(projectId="abc", limit=20)
// → [{id: "1", role: "user", content: "..."}, ...]

// 2. Агент анализирует и отвечает

// 3. Агент записывает свой ответ
add_message(projectId="abc", content="Вот ваш план задач...")
// → {id: "2", role: "assistant", content: "...", createdAt: "..."}
```

### Взаимодействие с существующим кодом
- `packages/server/src/agent.ts` (строка 375) уже использует `messageService.list(projectId, 20)`
- Новые MCP инструменты позволяют агенту напрямую обращаться к истории
- MessageService не требует изменений

</specifics>

<deferred>
## Deferred Ideas

- **Типизация сообщений** — добавить поле `type: 'success' | 'info_request' | 'error' | 'normal'` для better UX
- **Пагинация offset** — для очень больших историй (достаточно limit для v3.0)
- **Параметр order** — фиксируем хронологический порядок, достаточно для текущих нужд

</deferred>

---

*Phase: 20-conversation-history*
*Context gathered: 2026-03-18*
