# Debug Context: AI Agent не сохраняет данные в БД

## Статус
Активное расследование. Частично решено.

## Что работает
- С api.z.ai + glm-4.7 — всё работает (tasks создаются в PostgreSQL)
- Logging: `server-agent.log` и `mcp-agent.log` пишутся
- PostgreSQL подключение через Prisma работает
- MCP tools вызываются и пишут в правильную БД (не SQLite)

## Текущая проблема
С OpenRouter (`https://openrouter.ai/api/v1`) и моделью `google/gemini-3.1-flash-lite-preview` SDK возвращает:
```
[API Error: Model stream ended with empty response text.]
turns: 1
```

## Архитектура SDK (ключевой факт)
`@qwen-code/sdk` НЕ делает HTTP запросы сам. Он **запускает `qwen` CLI как subprocess**.

- Глобально установлен: `/c/Users/Volobuev/AppData/Roaming/npm/qwen` v0.12.0
- SDK автоматически находит и запускает его
- `qwen` CLI делает реальные HTTP запросы к AI API

## Что выяснено про SSE чанки
Raw SSE от OpenRouter (тест `test-ai-raw.mjs`):
```
chunk[0]  finish=null  tool_calls=false  content=false
chunk[1]  finish=null  tool_calls=true   TC[0] id=... name=ping args=""
chunk[2]  finish=null  tool_calls=true   TC[0] id=- name=- args={}
chunk[3]  finish=tool_calls  tool_calls=false  delta={content:"", role:"assistant"}
chunk[4]  finish=tool_calls  tool_calls=false  (дубль)
```

finish_reason=tool_calls приходит, но в финальном chunk нет tool_calls в delta.

## Код convertOpenAIChunkToGemini (SDK)
В `node_modules/@qwen-code/sdk/dist/cli/cli.js` строки ~132524:
- Накапливает tool_calls через `streamingToolCallParser`
- Эмитирует `functionCall` только когда chunk имеет `finish_reason`
- Должно работать с OpenRouter... но не работает

## Попытки исправления

### 1. pathToQwenExecutable (последняя попытка, прервана)
```typescript
pathToQwenExecutable: `node:${sdkCliPath}`
// sdkCliPath = .../node_modules/@qwen-code/sdk/dist/cli/cli.js
```
Использовать bundled CLI вместо глобального qwen 0.12.0.
**Статус**: тест запущен, прерван пользователем. Нужно проверить.

### 2. DB_PATH убран из MCP env (сделано)
Было: `DB_PATH` передавался в MCP subprocess → путаница в логах
Исправлено: убрали, теперь MCP логирует `databaseUrl` (хост БД)

### 3. HTTP logging (сделано, не тестировалось с новым сервером)
`installFetchLogger()` в agent.ts — перехватывает globalThis.fetch
Но: qwen CLI делает запросы в своём процессе, патч не работает

## Файлы изменённые
- `packages/server/src/agent.ts` — fetchLogger, pathToQwenExecutable, убран dbPath
- `packages/mcp/src/index.ts` — логирует databaseUrl вместо dbPath
- `test-ai-raw.mjs` — raw SSE тест (рабочий)
- `test-qwen-minimal.mjs` — SDK тест без MCP (работает для text)
- `test-qwen-tools.mjs` — SDK тест с inline MCP (не работает)

## Следующий шаг
1. Запустить `node test-qwen-tools.mjs` с `pathToQwenExecutable` и проверить результат
2. Если не поможет — попробовать другие модели через openrouter (qwen3, deepseek-v3)
3. Проверить настройки qwen 0.12.0: `~/.qwen/settings.json` — нет ли там override модели

## Конфигурация .env (рабочая)
```
# РАБОТАЕТ:
OPENAI_API_KEY=d2786f1a180f46a6b434a8588c1445a8.DZNmPp9hyPX7GNyK
OPENAI_BASE_URL=https://api.z.ai/api/coding/paas/v4
OPENAI_MODEL=glm-4.7-flash

# НЕ РАБОТАЕТ (openrouter):
OPENAI_API_KEY=sk-or-v1-...
OPENAI_BASE_URL=https://openrouter.ai/api/v1
OPENAI_MODEL=google/gemini-3.1-flash-lite-preview
```
