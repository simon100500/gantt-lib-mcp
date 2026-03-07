# Phase 10: work-stability - Context

**Gathered:** 2026-03-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Глубокая проверка работы Phase 9 (session-control) и устранение всех выявленных ошибок.
Цель: приложение работает стабильно без перезагрузки страниц.

**Что входит:**
- Фикс 401-ошибок при перезагрузке и смене проекта (протухший access-токен)
- Фикс WS "reconnecting..." после первого входа через OTP
- Фикс: задачи не появляются в Ганте без перезагрузки после команды AI
- Фикс: дублирование AI-сообщений в чате
- Фикс: AI пишет сырой JSON в чат — нужен лаконичный ответ
- Фикс: история чата пропадает после перезагрузки

**Не входит:**
- Новые фичи аутентификации (OAuth и т.д.)
- Новые возможности Ганта
- Редизайн UI

</domain>

<decisions>
## Implementation Decisions

### Баг 1: 401 на перезагрузке и смене проекта

**Root cause:** `useTasks` не обрабатывает истечение 15-минутного access-токена.
При перезагрузке страницы из localStorage берётся протухший токен → HTTP 401 → отображается ошибка.

**Fix:** В `useTasks` при получении HTTP 401 вызывать `refreshAccessToken()` и повторить запрос.
Если refresh-токен тоже протух → `logout()`.
Передавать `refreshAccessToken` в `useTasks` как параметр.

### Баг 2: WebSocket "reconnecting..." после первого OTP-входа

**Root cause:** `useWebSocket` вызывает `connect()` при монтировании когда `accessToken = null`.
WS открывается, auth-сообщение не отправляется (токена нет).
После OTP-входа `accessToken` меняется в state, но WS не переаутентифицируется.

**Fix:** `useWebSocket` должен реагировать на изменение `accessToken`.
Когда токен меняется с `null` на значение: закрыть текущий WS и переподключиться.
Реализация: добавить `accessToken` как зависимость — при изменении закрыть WS, установить новое соединение.

### Баг 3: Гант пустеет после команды AI (без перезагрузки)

**Root cause:** MCP child process запускается без `PROJECT_ID` env var.
Задачи создаются с `project_id = NULL` (глобальные).
В `agent.ts` шаг 9: `taskStore.list(projectId)` — возвращает пустой массив (у пользователя project_id ≠ NULL).
HTTP `GET /api/tasks` использует `includeGlobal: true` → после перезагрузки задачи видны.
WS-трансляция не включает глобальные задачи → Гант пустеет.

**Fix (два изменения):**
1. В `agent.ts` передавать `PROJECT_ID` в env MCP child process:
   ```
   env: { DB_PATH: dbPath, PROJECT_ID: projectId }
   ```
2. В `packages/mcp/src` при создании задачи использовать `process.env.PROJECT_ID` как default для `project_id`.
3. В `agent.ts` шаг 9: использовать `taskStore.list(projectId, true)` (includeGlobal=true) для broadcast — чтобы клиент видел все задачи как при HTTP-запросе.

### Баг 4: Дублирование AI-сообщений в чате

**Root cause:** `isSDKAssistantMessage(event)` срабатывает на несколько событий в `for await` цикле.
Вероятно, SDK emit-ит как streaming-блоки, так и финальный AssistantMessage с полным текстом.
Результат: `broadcastToSession(token)` вызывается дважды для одного текста.

**Fix:** Отслеживать уже отправленный контент.
Вариант: использовать только streaming-события (частичные блоки), игнорировать финальный AssistantMessage если `assistantResponse` уже не пустой.
Или: накапливать только из streaming events, определить какой тип события является финальным summary и пропускать его.
Конкретный подход — на усмотрение плановщика после изучения SDK events.

### Баг 5: AI пишет сырой JSON и дублирует ответ в чате

**Root cause:** Системный промпт не ограничивает формат ответа.
AI выводит полный JSON-экспорт всех задач после каждого действия.
Также сообщение дублируется в чате (два полных ответа).

**Fix системного промпта** (`packages/mcp/agent/prompts/system.md`):
- Запретить JSON-экспорт в ответах
- Инструкция: "After completing a task operation, confirm briefly in 1-2 sentences. Do NOT include JSON exports, code blocks with task data, or full task listings in your response."
- Ответы должны быть на языке пользователя (русский если спрашивают по-русски)

### Баг 6: История чата пропадает после перезагрузки

**Root cause:** Клиент инициализирует `messages: []` и никогда не загружает историю из БД.
Сервер хранит сообщения в таблице `messages`, но нет API-эндпоинта для их получения.

**Fix:**
1. Добавить эндпоинт `GET /api/messages` (защищённый, project-scoped) возвращающий последние N сообщений
2. В `App.tsx` при изменении `auth.isAuthenticated` + `auth.project.id` загружать историю через fetch
3. Конвертировать DB-формат в `ChatMessage[]` для отображения

### Claude's Discretion
- Точный способ определить "финальный" vs "streaming" события в qwen-code SDK
- Количество сообщений для загрузки истории (последние 50 или все)
- Порядок применения фиксов (что тестировать первым)

</decisions>

<specifics>
## Specific Ideas

**Пользователь описал конкретные сценарии воспроизведения:**

1. "Открываю сервер после перезагрузки → HTTP 401" — токен протух
2. "При первом входе → reconnecting.. только после перезагрузки страницы connected" — WS не переаутентифицируется
3. "AI добавил задачу → Гант пишет No tasks yet → после перезагрузки задача появляется, но история чата пропадает"
4. Ответ AI появляется дважды и содержит полный JSON экспорт

**Ожидаемое поведение после Phase 10:**
- Открыть приложение → задачи загрузились, WS connected (без перезагрузки)
- После OTP-входа → WS сразу connected (без перезагрузки)
- AI добавил задачу → Гант обновился в real-time
- AI отвечает коротко: "Добавлена 5-я работа: Подготовка документации (29–31 марта)"
- Перезагрузка → история чата сохранена

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/web/src/hooks/useAuth.ts`: `refreshAccessToken()` уже реализован — нужно использовать в `useTasks`
- `packages/server/src/agent.ts`: env vars для MCP child process уже есть — добавить `PROJECT_ID`
- `packages/mcp/src/store.ts`: `list(projectId, includeGlobal?)` — проверить сигнатуру, использовать в agent broadcast
- `packages/mcp/agent/prompts/system.md`: обновить системный промпт

### Established Patterns
- WebSocket message types: `connected | token | tasks | error | done`
- Auth token: JWT в localStorage, передаётся в Authorization header
- DB: SQLite через @libsql/client, таблица `messages` с `project_id`

### Integration Points

**Bug 1 fix** касается:
- `packages/web/src/hooks/useTasks.ts` — добавить refresh логику
- `packages/web/src/App.tsx` — передать `refreshAccessToken` в `useTasks`

**Bug 2 fix** касается:
- `packages/web/src/hooks/useWebSocket.ts` — добавить `accessToken` как триггер reconnect

**Bug 3 fix** касается:
- `packages/server/src/agent.ts` — передать PROJECT_ID в MCP env; исправить `list(projectId, true)` в broadcast
- `packages/mcp/src` — использовать `process.env.PROJECT_ID` при создании задач

**Bug 4 fix** касается:
- `packages/server/src/agent.ts` — исправить логику streaming events

**Bug 5 fix** касается:
- `packages/mcp/agent/prompts/system.md` — обновить инструкции

**Bug 6 fix** касается:
- `packages/server/src/index.ts` — добавить `GET /api/messages`
- `packages/web/src/App.tsx` — загружать историю при auth

</code_context>

<deferred>
## Deferred Ideas

- Оптимистичные обновления (показывать задачу до подтверждения сервера) — future phase
- Toast-уведомления об ошибках (вместо console.error) — future phase
- Индикатор "AI думает..." с возможностью отмены — future phase

</deferred>

---

*Phase: 10-work-stability*
*Context gathered: 2026-03-07*
