# Phase 21: Tool Quality - Context

**Gathered:** 2026-03-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Улучшение описаний MCP-инструментов и сообщений об ошибках согласно лучшим практикам MCP. Инструмент уже функционален (Phases 17-20 завершены) — эта фаза улучшает UX для AI агента через более качественные описания и ошибки.

**Что входит:**
- Улучшить описания 9 активных инструментов (compact, семантически плотно)
- Переписать все сообщения об ошибках по шаблону "Что + Почему + Fix"
- Удалить legacy инструменты (set_autosave_path, export_tasks, import_tasks)
- Добавить перекрёстные ссылки между инструментами

**Что НЕ входит:**
- Исправление бага с dependencies (отдельная задача — см. Deferred)
- Новые инструменты или изменение функционала
- Изменение логики валидации (только улучшение сообщений)

</domain>

<decisions>
## Implementation Decisions

### 1. Описания инструментов

**Формат: Одно предложение резюме**
- Compact, семантически плотно — всё самое важное в начале
- Структура: что делает + ключевые параметры + результат
- Пример: "Create a Gantt task with name, dates, dependencies. Returns created task with cascade info. Supports parentId for hierarchy."

**Перекрёстные ссылки**
- Добавлять ссылки между связанными инструментами
- create_task → get_tasks (для списка задач)
- add_message → get_conversation_history (для чтения истории)
- create_tasks_batch → create_task (альтернатива для одной задачи)
- Формат: интегрированный в естественный текст
  - "Use get_tasks to list existing tasks before creating."
  - "Alternative: use create_task for single tasks."

**Инструменты для обновления (9 активных)**
1. ping (connectivity test)
2. create_task (core)
3. get_tasks (core)
4. get_task (core)
5. update_task (core)
6. delete_task (core)
7. create_tasks_batch (batch operations)
8. get_conversation_history (conversation context)
9. add_message (conversation recording)

**Инструменты для удаления (3 legacy)**
- `set_autosave_path` — No-op, SQLite persistence работает автоматически
- `export_tasks` — Legacy от CLI agent без Web UI (Phase 6)
- `import_tasks` — Legacy от CLI agent state reset

**Порядок обновления: по частоте использования**
1. create_task (самый частый)
2. get_tasks
3. update_task
4. get_task, delete_task
5. create_tasks_batch, get_conversation_history, add_message

### 2. Сообщения об ошибках

**Шаблон: Что + Почему + Fix**
```
[Permanent/Temporary] Что сломалось.
Причина: почему это произошло.
Fix: что сделать для исправления.
```

**Примеры:**
```
[Permanent] Invalid startDate format: 2026/03/18.
Expected: YYYY-MM-DD (ISO date format).
Fix: Use format like 2026-03-18.

[Permanent] Task not found: abc123.
Reason: No task with this ID exists in the project.
Fix: Call get_tasks to list available task IDs.

[Permanent] Invalid date range: startDate (2026-03-20) must be ≤ endDate (2026-03-15).
Reason: End date cannot be before start date.
Fix: Adjust dates so startDate ≤ endDate.

[Permanent] Invalid dependency type: XX.
Must be one of: FS, SS, FF, SF.
Fix: Use valid dependency type.
```

**Маркеры ошибок**
- `[Permanent]` — Ошибка не исправится retry (валидация, not found)
- `[Temporary]` — Временная ошибка, можно retry (connection failed, etc.)

**Примеры в Fix**
- Всегда показывать конкретный пример правильного формата
- "Use format like 2026-03-18" — модель видит паттерн и повторяет

**Охват: все ошибки**
- Переписать **все** `throw new Error()` по шаблону
- Включая: Task not found, Date range invalid, Dependency type invalid, Parent not found, etc.
- Консистентность важнее быстрого wins

### 3. Стандарты валидации

**Приоритеты валидации**
1. **Priority #1:** Даты (формат YYYY-MM-DD, порядок start ≤ end)
2. **Priority #2:** projectId resolution
3. **Остальное:** Dependencies, parentId, required fields — потом

**Мягкая валидация где возможно**
- startDate: "2026-3-5" → принять как 2026-03-05 (если легко парсится)
- Модель меньше сталкивается с ошибками, учится быстрее
- Строгая валидация только для критичных случаев (формат дат)

**Обобщённые ошибки типов**
- Универсальный подход: "Parameter X must be type Y"
- Меньше кода, проще поддерживать
- Пример: "progress must be a number (0-100)"

**Валидация dependencies**
- Только тип (FS/SS/FF/SF) в MCP handler
- TaskId existence, cascade checks — на сервисный слой
- Не валидировать слишком много в handler

### Claude's Discretion
- Точная формулировка описаний для каждого инструмента
- Форматирование сообщений об ошибках (одна строка или многострочные)
- Какие edge cases обрабатывать явно (пустые строки, null, etc.)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — QUAL-01, QUAL-02 (tool descriptions, error messages)

### MCP Best Practices
- `.planning/reference/MCP-recomendations.md` — Section 4: Tool descriptions as UI, Section 5: Error handling patterns
  - §4: "Описания инструментов — ваш единственный UI"
  - §5: "Обработка ошибок: модель должна знать, что делать"
  - Паттерн "что + почему + что делать"
  - Семантическая плотность описаний

### MCP Implementation
- `packages/mcp/src/index.ts` — All 12 MCP tools with current descriptions and error handling (lines 66-400 for tools, 400-999 for handlers)
  - Current tool descriptions (lines 66-400)
  - Current error handling patterns (lines 400-999)
  - Legacy tools to remove: set_autosave_path (line 294), export_tasks (line 272), import_tasks (line 280)
  - Active tools to update: ping, create_task, get_tasks, get_task, update_task, delete_task, create_tasks_batch, get_conversation_history, add_message

### Types
- `packages/mcp/src/types.ts` — Type definitions (ImportTasksInput to remove after removing import_tasks)

### Code Context from Prior Phases
- Phase 17-20 CONTEXT.md files — Prior decisions on compact mode, pagination, parentId, conversation history

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/mcp/src/index.ts` — MCP tool definitions and handlers (lines 1-1013)
- Existing error validation functions (lines 25-63): `isValidDateFormat()`, `isValidDateRange()`, `isValidDependencyType()`
- Current error patterns: `throw new Error(message)` — нужно заменить на структурированный шаблон

### Established Patterns
- MCP tools: inputSchema + handler → JSON.stringify(result)
- Date validation: DATE_REGEX pattern for YYYY-MM-DD
- Dependency validation: VALID_DEPENDENCY_TYPES = ['FS', 'SS', 'FF', 'SF']
- Error handling: throw new Error() в handler для валидации

### Integration Points
- `packages/mcp/src/index.ts` — Update tool descriptions (lines 66-400) and error messages (lines 400-999)
- `packages/mcp/src/types.ts` — Remove ImportTasksInput type (lines ~109-115)
- Remove from tools array: set_autosave_path, export_tasks, import_tasks
- Remove handlers: set_autosave_path (line 755), export_tasks (line 695), import_tasks (line 712)

### Current State (examples)
```typescript
// Текущее описание create_task (line 77)
{
  name: 'create_task',
  description: 'Create a new Gantt chart task with name, dates, and optional properties',
  // Нужно: compact + semantic density + cross-references
}

// Текущая ошибка даты (line 445)
throw new Error(`Invalid startDate format: ${input.startDate}. Expected format: YYYY-MM-DD`);
// Нужно: [Permanent] + What + Why + Fix with example

// Legacy set_autosave_path (line 294)
{
  name: 'set_autosave_path',
  description: 'No-op (kept for backward compatibility)...'
  // Нужно: удалить совсем
}
```

</code_context>

<specifics>
## Specific Ideas

### Tool Description Pattern
```
[Verb] [object] with [key parameters]. Returns [result]. [Special features].

For [alternative action], use [related_tool].

Examples:
- create_task: "Create a Gantt task with name, dates, dependencies. Returns created task with cascade info. Use get_tasks to list existing tasks first."
- get_conversation_history: "Get recent messages for context awareness. Call before responding to understand previous dialogue. Use add_message to record your response."
```

### Error Message Pattern
```
[Permanent/Temporary] [What failed].
[Why it failed].
Fix: [Concrete action or example].

Examples:
- [Permanent] Invalid startDate format: 2026/03/18.
  Expected: YYYY-MM-DD.
  Fix: Use format like 2026-03-18.

- [Permanent] Task not found: abc123.
  Reason: No task with this ID exists.
  Fix: Call get_tasks to list available task IDs.
```

### Cross-Reference Examples
```
create_task → get_tasks: "Use get_tasks to list existing tasks before creating."
add_message → get_conversation_history: "Call get_conversation_history to read previous messages."
create_tasks_batch → create_task: "Alternative: use create_task for single tasks."
get_task → get_tasks: "For listing multiple tasks, use get_tasks."
```

</specifics>

<deferred>
## Deferred Ideas

### Critical Bug: Dependencies Not Working
**Issue:** update_task with dependencies parameter doesn't work — model reports success but no database mutation occurs.

**User Example:**
"все работы по кладке завяжи на окончание бетона +5 дней"
→ Model: "Задача обновлена"
→ Reality: Nothing changed, no dependencies created

**Impact:** Zero dependencies created in recent time despite explicit user requests.

**Investigation needed:**
1. Check update_task handler in packages/mcp/src/index.ts (lines ~559-666)
2. Check TaskService.update() in task.service.ts — dependencies handling
3. Verify dependencies are passed correctly from MCP handler to service
4. Check if there's a validation that rejects dependencies silently
5. Test: create task → add dependency → verify in DB

**Scope decision:** This is NOT part of Phase 21 (Tool Quality) — it's a broken functionality bug that needs separate debug session.

**Stored:** .planning/memory/feedback_dependencies_bug.md

---

### Other Deferred Ideas
- Cursor-based pagination — offset/limit sufficient for v3.0
- Advanced dependency validation (taskId exists check) — keep minimal in handler
- Date format auto-correction for "2026-3-5" → "2026-03-05" — future enhancement

</deferred>

---

*Phase: 21-tool-quality*
*Context gathered: 2026-03-18*
