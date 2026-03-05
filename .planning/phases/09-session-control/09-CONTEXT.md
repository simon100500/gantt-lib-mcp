# Phase 9: session-control - Context

**Gathered:** 2026-03-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Система авторизации и мультитенантности для multi-user Gantt приложения. Пользователи входят через OTP по email, создают изолированные проекты, работают с задачами в рамках проекта. Каждая сессия видит только свои данные.

**Что входит:**
- Auth: OTP (6 цифр) по email
- Users, Projects, Sessions таблицы в БД
- JWT токены (Access + Refresh)
- WebSocket targeted broadcast по session_id
- UI: модальное окно для OTP, кнопка смены проекта

**Не входит:**
- OAuth провайдеры (Google, GitHub)
- Шаринг проектов между пользователями
- RBX/роли
- Админка

</domain>

<decisions>
## Implementation Decisions

### Auth: OTP вход
- Регистрация и вход через OTP (6 цифр) по email
- Без паролей — только email + код
- Минимум auth scope: только вход/выход

### Projects: изолированные
- Каждый пользователь создаёт проекты
- Задачи (tasks) изолированы по project_id (foreign key)
- AI сообщения (messages) изолированы по project_id
- При первом входе создаётся один проект по умолчанию
- Переключение между проектами через явную кнопку

### Session: JWT + Access/Refresh
- Сессия бессрочная (до явного logout)
- JWT или API токен в Authorization header
- Access токен (короткий, ~15 мин) + Refresh токен (долгий)
- Logout удаляет токен на клиенте + инвалидирует в БД

### WebSocket: targeted broadcast
- Server отслеживает session_id для каждого WebSocket соединения
- Broadcast отправляет события только в нужную сессию
- Не роутим по разным endpoints — один /ws с фильтрацией

### Конфликты: last write wins
- При одновременном редактировании — последний перезаписывает
- Без версионности или optimistic locking

### Миграция: WIPE
- Существующие данные очищаются
- Чистый старт с новой схемой БД

### UI: модальное окно для OTP
- Модальное окно при попытке доступа без токена
- Gantt на фоне, OTP поверх

### Claude's Discretion
- Точный формат JWT payload
- Длительность Access токена (15 мин или другая)
- Механизм генерации OTP (какой сервис)
- Хранение refresh токена (localStorage vs httpOnly cookie)
- UI дизайна модального окна
- Текст/описание одного проекта по умолчанию

</decisions>

<specifics>
## Specific Ideas

**Таблицы БД:**
```
users: id, email, created_at
projects: id, user_id, name, created_at
sessions: id, user_id, project_id, access_token, refresh_token, expires_at
```

**Миграция tasks и messages:**
```
ALTER TABLE tasks ADD COLUMN project_id TEXT;
ALTER TABLE messages ADD COLUMN project_id TEXT;
```

**WebSocket handshake:**
Клиент отправляет session_id в Authorization header (Bearer token).

**OTP поток:**
1. Пользователь вводит email
2. Backend генерирует 6-digit код
3. Отправляет email (какой сервис — TBD)
4. Пользователь вводит код
5. Backend верифицирует → создаёт JWT → возвращает токены

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/server/src/ws.ts`: Set<WebSocket> connections, broadcast() function — нужен рефактор для targeted broadcast
- `packages/mcp/src/store.ts`: TaskStore с SQLite CRUD — нужен рефактор для project_id фильтрации
- `packages/server/src/agent.ts`: runAgentWithHistory() загружает getMessages() — нужен фильтр по project_id
- `packages/web/src/hooks/useWebSocket.ts`: WebSocket connect с retry — нужно добавить Authorization header

### Established Patterns
- SQLite через @libsql/client
- WebSocket message types: { type: 'token' | 'tasks' | 'error' | 'done' | 'connected' }
- Fastify сервер с websocket plugin

### Integration Points
- WebSocket: `/ws` endpoint
- REST: `/api/tasks` (GET, POST, PUT, DELETE)
- DB: `tasks`, `dependencies`, `messages` таблицы

### Что менять
- `ws.ts`: Map<session_id, Set<WebSocket>> вместо Set<WebSocket>
- `store.ts`: все методы add project_id фильтр
- `agent.ts`: загружать сообщения только для текущего project_id
- `useWebSocket.ts`: передавать Authorization header

</code_context>

<deferred>
## Deferred Ideas

- OAuth провайдеры (Google, GitHub) — future phase
- Шаринг проектов между юзерами (collaboration) — future phase
- RBX/роли (admin, viewer, editor) — future phase
- Админка для управления юзерами — future phase
- Версионность задач для конфликтов — future phase

</deferred>

---

*Phase: 09-session-control*
*Context gathered: 2026-03-05*
