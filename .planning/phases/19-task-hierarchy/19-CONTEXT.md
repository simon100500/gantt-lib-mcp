# Phase 19: Task Hierarchy - Context

**Gathered:** 2026-03-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Enable AI agent to work with nested tasks via `parentId` parameter in MCP tools. Most functionality already exists — this phase adds missing `parentId` filter to `get_tasks` (HIER-03).

**Что входит:**
- `get_tasks` принимает `parentId?: string | null` для фильтрации
- `null` = только корневые задачи (parentId IS NULL)
- `string` = только прямые дети указанного родителя
- `undefined` = все задачи (текущее поведение)

**Что НЕ входит:**
- HIER-01, HIER-02 уже реализованы (`create_task` и `update_task` принимают `parentId`)
- Изменение логики пересчёта дат (уже работает)
- Глубокая детекция циклов (текущей проверки достаточно)

</domain>

<decisions>
## Implementation Decisions

### get_tasks parentId Filter (LOCKED)

**Параметр `parentId` в `get_tasks`:**
- Тип: `string | null | undefined`
- `undefined` (или не указан) → все задачи, текущее поведение
- `null` → только корневые задачи (`WHERE parentId IS NULL`)
- `"task-id"` → только прямые дети указанного родителя (`WHERE parentId = 'task-id'`)

**Описание для inputSchema:**
```
Optional filter by parent task ID.
- null = root tasks only (tasks without a parent)
- string = direct children of that parent task
- undefined/not provided = all tasks (default behavior)
```

**Взаимодействие с пагинацией:**
- Фильтр `parentId` применяется ДО пагинации
- `limit`/`offset` ограничивают отфильтрованный результат
- Пример: `get_tasks(parentId="abc", limit=50)` → максимум 50 детей задачи abc

**Примеры использования:**
```typescript
// Получить все корневые задачи
get_tasks(parentId=null, limit=100)

// Получить детей конкретного родителя
get_tasks(parentId="task-123", limit=50)

// Получить все задачи (текущее поведение)
get_tasks(limit=100) // или get_tasks(parentId=undefined, limit=100)
```

### Circular Reference Detection (LOCKED)
- Текущая проверка достаточна: запрещает только `parentId === id` (сам себе родитель)
- Глубокая детекция (A→B→C→A) не требуется — редкий кейс, усложняет код

### Orphan Handling (LOCKED)
- Текущее поведение: `onDelete: SetNull` в Prisma схеме
- При удалении родителя дети становятся корневыми задачами
- Данные не теряются, пользователь может восстановить иерархию

### Parent Date Behavior (LOCKED)
- **Родитель без детей** = обычная задача с любыми датами
- **При добавлении первого ребёнка** → даты родителя становятся равны датам ребёнка
- **При наличии детей** → даты родителя = min(startDate) и max(endDate) от детей
- **При удалении всех детей** → родитель сохраняет последние вычисленные даты

### Claude's Discretion
- Порядок параметров в функции `TaskService.list()` — можно добавить `parentId` после `projectId`
- Тип параметра в TypeScript — `string | null | undefined` или использовать отдельный флаг?

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — HIER-01, HIER-02, HIER-03 (task hierarchy via parentId)

### MCP Implementation
- `packages/mcp/src/index.ts` — MCP tool handlers (create_task lines 76-139, update_task lines 188-251, get_tasks lines 141-167)
- `packages/mcp/src/services/task.service.ts` — TaskService с полной поддержкой иерархии
- `packages/mcp/src/types.ts` — CreateTaskInput, UpdateTaskInput с `parentId?: string`

### Database Schema
- `packages/mcp/prisma/schema.prisma` — Task model с parentId и TaskHierarchy relation (lines 107-128)

### Agent Documentation
- `packages/mcp/agent/prompts/system.md` — System prompt documenting parentId workflow (lines 17-21)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `TaskService.computeParentDates()` (lines 20-36) — Вычисляет даты родителя от детей
- `TaskService.create()` (lines 132-210) — Валидация parentId, проверка существования родителя, запрет A→A
- `TaskService.update()` (lines 317-453) — Обновление parentId, пересчёт дат старого и нового родителя
- `TaskService.get()` (lines 262-311) — Поддержка includeChildren: false | 'shallow' | 'deep'

### Established Patterns
- Prisma where clause для nullable полей: `where: { parentId: null }` для фильтрации корневых задач
- Параметры MCP tools передаются в service методы без изменений типов
- Дата пересчитывается автоматически через `runScheduler()` и `computeParentDates()`

### Integration Points
- `packages/mcp/src/index.ts` — Update get_tasks inputSchema (add parentId property) and handler (pass to TaskService.list)
- `packages/mcp/src/services/task.service.ts` — Update `list()` method signature to accept `parentId?: string | null`

### Current State
```typescript
// get_tasks сейчас (index.ts lines 141-167)
{
  name: 'get_tasks',
  description: '...',
  inputSchema: {
    type: 'object',
    properties: {
      projectId: {...},
      limit: {...},
      offset: {...},
      full: {...}
      // ← parentId нужно добавить здесь
    }
  }
}

// TaskService.list() сейчас (task.service.ts lines 215-257)
async list(
  projectId?: string,
  limit: number = 100,
  offset: number = 0,
  full: boolean = false
): Promise<{ tasks: Task[]; hasMore: boolean; total: number }>
// ← parentId нужно добавить сюда
```

</code_context>

<specifics>
## Specific Ideas

### User Workflow (из обсуждения)
```
1. Создать "Каркас здания" как обычную задачу с датами
2. Добавить подзадачи с parentId="g4"
3. Даты родителя автоматически пересчитываются от детей
```

### Типичный сценарий агента
```javascript
// 1. Получить корневые задачи
const roots = get_tasks(parentId=null, limit=100)

// 2. Для каждой корневой — получить детей
const children = get_tasks(parentId=roots[0].id, limit=50)

// 3. Агент создаёт подзадачу
create_task({name: "Фундамент", parentId: parent.id, startDate: "...", endDate: "..."})

// 4. Даты родителя автоматически обновились
```

### Group Task Pattern (из gantt-lib)
```typescript
// Родитель-контейнер сначала существует сам по себе
{
  id: 'g4',
  name: 'Каркас здания',
  startDate: '2026-03-29',
  endDate: '2026-05-10',
  // parentId отсутствует
}

// Потом добавляются дети
{
  id: 'g4-1',
  name: 'Монтаж колонн 1 этажа',
  parentId: 'g4',
  // ...
}
```

</specifics>

<deferred>
## Deferred Ideas

- Глубокая детекция циклических ссылок (A→B→C→A) — отложено, текущей проверки достаточно
- Каскадное удаление потомков при удалении родителя — текущее SetNull безопаснее для данных
- Рекурсивная фильтрация `get_tasks(parentId)` (все потомки) — сложнее с пагинацией, достаточно прямых детей

</deferred>

---

*Phase: 19-task-hierarchy*
*Context gathered: 2026-03-18*
