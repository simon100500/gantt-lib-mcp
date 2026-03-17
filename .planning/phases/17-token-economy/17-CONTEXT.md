# Phase 17: Token Economy - Context

**Gathered:** 2026-03-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Снижение размера ответов MCP сервера для экономии токенов при работе AI агента. Оптимизация формата данных задач, пагинация, ограничение истории диалога.

**Что входит:**
- `get_tasks` возвращает компактный формат по умолчанию (только основные поля)
- `get_tasks` поддерживает пагинацию с `limit` (100) и `offset` (0)
- `get_task` поддерживает `includeChildren: false | 'shallow' | 'deep'` для контроля глубины иерархии
- История диалога ограничена до 20 последних сообщений в MessageService

**Что НЕ входит:**
- Новые MCP инструменты для conversation history (это Phase 20)
- Изменения в родительских задачах через parentId (это Phase 19)
- Agent hardening (это Phase 18)

</domain>

<decisions>
## Implementation Decisions

### Compact Response Format

**Поля в compact режиме (по умолчанию):**
- `id` — идентификатор задачи
- `name` — название задачи
- `startDate` — дата начала (YYYY-MM-DD)
- `endDate` — дата окончания (YYYY-MM-DD)
- `parentId` — id родительской задачи (если есть)
- `progress` — прогресс 0-100
- `color` — цвет для отображения
- `dependencies` — полный массив зависимостей `[{taskId, type, lag}]`

**Флаг `full: boolean`:**
- `false` (default) — компактный формат (поля выше)
- `true` — все поля как сейчас (без изменений)

### Pagination

**Параметры `get_tasks`:**
- `limit: number = 100` — сколько задач вернуть
- `offset: number = 0` — пропустить N задач
- `full: boolean = false` — compact или full формат

**Метаданные в ответе:**
```typescript
{
  tasks: [...],
  hasMore: boolean,  // есть ли ещё задачи
  total: number      // общее количество задач
}
```

**Схема дозапроса:**
```javascript
// 1-й запрос
get_tasks(limit=100, offset=0) → {tasks: [...100], hasMore: true, total: 300}
// 2-й запрос
get_tasks(limit=100, offset=100) → {tasks: [...100], hasMore: true, total: 300}
// 3-й запрос
get_tasks(limit=100, offset=200) → {tasks: [...100], hasMore: false, total: 300}
```

### Child Task Loading

**Параметр `includeChildren` в `get_task`:**
- `false` (default) — без дочерних задач
- `'shallow'` — только прямые дети (1 уровень)
- `'deep'` — рекурсивно всех потомков

**Структура ответа при `includeChildren`:**
```typescript
{
  id: "1",
  name: "Строить дом",
  startDate: "2026-03-01",
  endDate: "2026-06-01",
  children: [
    {
      id: "2",
      name: "Фундамент",
      startDate: "2026-03-01",
      endDate: "2026-03-15",
      children: [  // только при 'deep'
        {id: "5", name: "Копать", children: []}
      ]
    }
  ]
}
```

**Вложенный массив** — дети внутри родителя, иерархия наглядна для LLM.

### Conversation History Truncation

**Изменения в MessageService:**
- Метод: `list(projectId: string, limit: number = 20)`
- Возвращает последние `limit` сообщений (сортировка по createdAt DESC или взять последние)
- Молча обрезать без notice агенту

**Где применяется:**
- `packages/server/src/agent.ts` — строка 375: `messageService.list(projectId)` → `messageService.list(projectId, 20)`
- agent.ts больше не меняется (логика усечения в сервисе)

### Claude's Discretion
- Максимальное значение `limit` для пагинации (выбрать разумное, например 1000)
- Тип `limit` в MessageService — number или добавить enum?
- Обрабатывать ли `limit` в `get_tasks` больше 0 (валидация)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — TOKEN-01 through TOKEN-04 (compact mode, pagination, includeChildren, history limit)

### MCP Implementation
- `packages/mcp/src/index.ts` — Current MCP tools (get_tasks, get_task)
- `packages/mcp/src/services/task.service.ts` — TaskService for database operations
- `packages/mcp/src/services/message.service.ts` — MessageService.list() to add limit parameter
- `packages/server/src/agent.ts` — Agent runner that uses MessageService (line 375)

### Types
- `packages/mcp/src/types.ts` — Task, TaskDependency types

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/mcp/src/index.ts` — MCP tool handlers (lines 141-151 for get_tasks, 154-166 for get_task)
- `packages/mcp/src/services/message.service.ts` — MessageService with list() method (line 53)
- `packages/mcp/src/services/task.service.ts` — TaskService with list() method
- `packages/server/src/agent.ts` — Agent that calls messageService.list() (line 375)

### Established Patterns
- MCP tools return JSON.stringify(result) — добавить метаданные hasMore/total
- Service methods accept optional parameters — добавим limit, offset, includeChildren
- Date format: YYYY-MM-DD strings throughout domain layer

### Integration Points
- `packages/mcp/src/index.ts` — Update get_tasks and get_task inputSchema and handlers
- `packages/mcp/src/services/message.service.ts` — Add limit parameter to list()
- `packages/mcp/src/services/task.service.ts` — Add limit/offset/full parameters to list()
- `packages/server/src/agent.ts` — Update messageService.list() call to pass limit=20

### Current State
```typescript
// get_tasks сейчас (line 141-151)
{
  name: 'get_tasks',
  description: 'Get a list of Gantt chart tasks...',
  inputSchema: {
    type: 'object',
    properties: {
      projectId: {type: 'string', description: '...'}
    }
  }
}

// MessageService.list() сейчас (line 53)
async list(projectId: string): Promise<Message[]> {
  const messages = await this.prisma.message.findMany({
    where: {projectId},
    orderBy: {createdAt: 'asc'}
  });
  return messages.map(m => this.messageToDomain(m));
}
```

</code_context>

<specifics>
## Specific Ideas

**Типичный сценарий "Разбей задачу на 10 этапов по 5 дней":**

1. `get_tasks(limit=100, offset=0, full=false)` → компактный список задач
2. Агент видит задачу "Строить дом", решает разбить
3. `get_task(id="1", includeChildren='shallow')` → полная задача с детьми
4. `create_task({name: "Фундамент", parentId: "1", ...})` → создать подзадачу

**Метаданные пагинации:**
```
{tasks: [...], hasMore: true, total: 300}
```
Агент видит `hasMore=true`, делает следующий запрос с `offset=100`.

</specifics>

<deferred>
## Deferred Ideas

- Новый MCP tool `get_conversation_history` — Phase 20 (Conversation History)
- Cursor-based пагинация — offset/limit достаточно для v3.0
- Сжатие истории диалога (summarization) — отложено на будущее

</deferred>

---

*Phase: 17-token-economy*
*Context gathered: 2026-03-17*
