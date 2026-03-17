# MCP Server Refactoring Plan

## Context

MCP-сервер (`packages/mcp/src/index.ts`) работает, но имеет четыре проблемы:
1. **Нет истории диалога** — модель не видит предыдущие сообщения (MessageService готов, но не подключён)
2. **Инструменты не адаптированы** — `parentId` есть в БД/сервисах, но отсутствует в MCP-схемах
3. **Расточительность токенов** — `get_tasks` без пагинации, история диалога отправляется целиком
4. **Слабые гарантии** — нет лимита ходов агента, нет таймаута, нет ограничения инструментов

**Архитектурный вывод**: переход MCP → REST API нецелесообразен. Статья допускает "через internal service layer". Текущий код уже использует сервисный слой без произвольного SQL — это приемлемо.

---

## Phase 1 — Token Economy (экономия токенов)

**Цель**: уменьшить размер ответов MCP и контекст, который занимает история диалога.

### 1.1 Compact mode в `get_tasks`
**Файл**: `packages/mcp/src/index.ts`

- Добавить параметр `compact: boolean` (default: `true`)
- Compact-формат: `{ id, name, startDate, endDate, parentId, progress }`
- Full-формат (compact=false): полный объект с dependencies
- Добавить `limit` (default: 100) и `offset` (default: 0)
- Ответ: `{ tasks: [...], total: N, hasMore: boolean }`

### 1.2 Compact mode в `get_task`
- Добавить `includeChildren: boolean` (default: false) — не подгружать детей без запроса

### 1.3 Ограничение истории диалога
**Файл**: `packages/server/src/agent.ts`

```typescript
const HISTORY_LIMIT = 20;
const recentMessages = messages.slice(-HISTORY_LIMIT);
const historyNote = messages.length > HISTORY_LIMIT
  ? `[История обрезана: последние ${HISTORY_LIMIT} из ${messages.length}]\n\n`
  : '';
```

**Эффект**: для больших проектов экономия 50-90% токенов на историю.

---

## Phase 2 — Qwen SDK Hardening

**Цель**: сделать агента надёжным — не зависает, не уходит в бесконечный цикл, работает только через MCP.

**Файл**: `packages/server/src/agent.ts`

### 2.1 Лимит ходов
```typescript
maxSessionTurns: 20,
```

### 2.2 Таймаут через AbortController
```typescript
const abortController = new AbortController();
const timeout = setTimeout(() => abortController.abort(), 120_000); // 2 мин
try {
  const result = query({ ..., options: { abortController } });
  // ...
} finally {
  clearTimeout(timeout);
}
```

### 2.3 Ограничение инструментов Qwen Code
Агент должен работать только через MCP, без прямого доступа к файловой системе и терминалу:
```typescript
excludeTools: ['write_file', 'edit_file', 'run_terminal_cmd', 'run_python_code'],
```

---

## Phase 3 — Иерархия задач (parentId в MCP)

**Цель**: дать агенту возможность работать с вложенными задачами.

**Файл**: `packages/mcp/src/index.ts`
**Сервисы**: уже поддерживают `parentId` — пробросить в схемы инструментов.

### 3.1 `create_task` — добавить `parentId?: string`
```
parentId: ID родительской задачи. Родитель автоматически получит
даты из диапазона дочерних. Нельзя создать циклическую иерархию.
```

### 3.2 `update_task` — добавить `parentId?: string | null`
- `null` = убрать из родительской задачи (на верхний уровень)
- Строка = переместить под другого родителя

### 3.3 `get_tasks` — фильтр по `parentId?: string | null`
- `null` = только корневые задачи (без родителя)
- `"id"` = только прямые дети конкретного родителя
- Не передан = все задачи (текущее поведение)

---

## Phase 4 — История диалога в MCP

**Цель**: дать агенту доступ к контексту предыдущих сессий через MCP-инструменты.

**Файл**: `packages/mcp/src/index.ts`
**Сервис**: `messageService` из `packages/mcp/src/services/message.service.ts`

### 4.1 Новый инструмент `get_conversation_history`
```typescript
{
  name: 'get_conversation_history',
  description: `Возвращает историю чата проекта (последние N сообщений).
    Используй в начале сессии чтобы понять контекст предыдущих запросов.`,
  inputSchema: {
    projectId?: string,
    limit: number (default: 20, max: 50)
  }
}
```

### 4.2 Новый инструмент `add_message`
```typescript
{
  name: 'add_message',
  description: `Записывает сообщение в историю чата проекта.
    Используй чтобы зафиксировать итог действий для следующей сессии.`,
  inputSchema: {
    projectId?: string,
    content: string
  }
  // role всегда 'assistant' — фиксируем только действия AI
}
```

---

## Phase 5 — Качество инструментов

**Цель**: улучшить описания и сообщения об ошибках по принципам из статьи.

### 5.1 Описания инструментов (семантически плотные)

| Инструмент | Что добавить в description |
|-----------|---------------------------|
| `create_task` | "Для нескольких взаимосвязанных задач — используй create_tasks_batch. Зависимые даты пересчитываются автоматически." |
| `update_task` | "После обновления дат все зависимые задачи пересчитываются каскадно." |
| `get_tasks` | "По умолчанию compact-формат. Используй compact=false для получения dependencies." |
| `delete_task` | "Необратимо. Дочерние задачи (если есть) НЕ удаляются — parentId обнуляется." |

### 5.2 Сообщения об ошибках (что + почему + что делать)

Вместо `"Task not found"`:
```
Задача с ID 'abc123' не найдена.
Убедись что ID корректный, или вызови get_tasks чтобы получить актуальные ID.
```

Вместо `"Invalid date range"`:
```
Дата начала (2026-05-01) позже даты конца (2026-04-30).
startDate должна быть <= endDate.
```

---

## Критические файлы

| Файл | Фазы |
|------|------|
| `packages/mcp/src/index.ts` | 1, 3, 4, 5 |
| `packages/server/src/agent.ts` | 1.3, 2 |
| `packages/mcp/src/services/message.service.ts` | 4 (только читаем) |
| `packages/mcp/src/services/task.service.ts` | 3 (только проверяем) |

## Повторное использование
- `taskService.create()` / `update()` — уже принимают `parentId` (Phase 3)
- `messageService.list()` / `add()` — готовы к использованию (Phase 4)

---

## Верификация

1. **Phase 1**: Создать 200 задач → `get_tasks` compact=true → ответ компактный. `limit=5, offset=5` → следующие 5 задач.
2. **Phase 2**: Запустить агента, дать ему бесконечный цикл → срабатывает AbortController через 2 мин.
3. **Phase 3**: Создать задачу с `parentId` → родитель получает правильные даты. Фильтр `parentId=null` → только корневые.
4. **Phase 4**: `add_message` → `get_conversation_history` → сообщение отображается.
5. **Phase 5**: `get_task("несуществующий-id")` → ответ с инструкцией что делать.
