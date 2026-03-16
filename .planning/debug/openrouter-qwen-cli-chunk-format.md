# Debug: OpenRouter tool calls — "Model stream ended with empty response text"

**Status:** ROOT CAUSE FOUND + PATCHED (node_modules, не персистентно)
**Date:** 2026-03-16

---

## Симптом

С OpenRouter + `google/gemini-3.1-flash-lite-preview` SDK возвращает:
```
[API Error: Model stream ended with empty response text.]
turns: 1
```
С `api.z.ai` + `glm-4.7-flash` — всё работает.

---

## Архитектура (важно)

- `@qwen-code/sdk` v0.1.5 **не использует** глобальный `qwen` CLI
- `Ut()` → `qt()` → `at()` ищет bundled CLI в `node_modules/@qwen-code/sdk/dist/cli/cli.js`
- Глобальный `qwen` v0.12.0 (`AppData/Roaming/npm/qwen`) — **не причём**
- SDK с v0.1.1 бандлит CLI, отдельная установка не нужна

---

## Raw SSE от OpenRouter (из test-ai-raw.mjs)

```
chunk[0]  finish=null  tool_calls=false  content=false
chunk[1]  finish=null  tool_calls=true   TC[0] id=... name=ping args=""
chunk[2]  finish=null  tool_calls=true   TC[0] id=- name=- args={}
chunk[3]  finish=tool_calls  tool_calls=false  delta={content:"", role:"assistant"}
chunk[4]  finish=tool_calls  tool_calls=false  (дубль!)
```

**Ключевая проблема:** OpenRouter присылает ДВА chunk с `finish_reason=tool_calls`.
chunk[3] — содержательный (через него выдаются накопленные tool_calls).
chunk[4] — пустой дубль.

---

## Root Cause: баг в `handleChunkMerging` (cli.js ~142943)

### Цепочка событий

1. chunk[1]: `args=""` (falsy) → `addChunk(0, "", id, "ping")` — метаданные сохранены, буфер пуст
2. chunk[2]: `args="{}"` (truthy) → `addChunk(0, "{}", undefined, undefined)` — args накоплены, name="ping" сохранён
3. chunk[3]: `finish_reason=tool_calls`, нет tool_calls в delta →
   - `getCompletedToolCalls()` → `[{name:"ping", args:{}}]` ✓
   - добавляет `functionCall` part
   - `parser.reset()` — сброс!
   - `handleChunkMerging` → сохраняет как `pendingFinishResponse` ✓
4. chunk[4]: `finish_reason=tool_calls`, нет tool_calls →
   - `getCompletedToolCalls()` → `[]` (parser уже reset!)
   - parts = [], finishReason = STOP
   - `handleChunkMerging` → **ПЕРЕЗАПИСЫВАЕТ** `pendingFinishResponse` пустым chunk[4]! ❌
5. Цикл завершён → yield `pendingFinishResponse` = chunk[4] (пустой)
6. `processStreamResponse`: `hasToolCall=false`, `hasFinishReason=true`, `contentText=""` →
   throws `InvalidStreamError("Model stream ended with empty response text.", "NO_RESPONSE_TEXT")`

### Баг-код (строка 142946 до патча)

```javascript
if (isFinishChunk) {
  collectedGeminiResponses.push(response);
  setPendingFinish(response);  // ← всегда перезаписывает, даже пустым chunk[4]!
  return false;
}
```

---

## Применённый патч (node_modules/@qwen-code/sdk/dist/cli/cli.js, ~142946)

```javascript
// БЫЛО:
if (isFinishChunk) {
  collectedGeminiResponses.push(response);
  setPendingFinish(response);
  return false;
}

// СТАЛО:
if (isFinishChunk) {
  if (hasPendingFinish) {
    // Дублирующий finish chunk — только обновляем usageMetadata, candidates не трогаем
    const lastResponse = collectedGeminiResponses[collectedGeminiResponses.length - 1];
    if (response.usageMetadata) lastResponse.usageMetadata = response.usageMetadata;
    setPendingFinish(lastResponse);
  } else {
    collectedGeminiResponses.push(response);
    setPendingFinish(response);
  }
  return false;
}
```

**Логика:** если уже есть `pendingFinishResponse`, второй finish chunk только мёрджит `usageMetadata` — `candidates` (и `functionCall` parts) остаются от первого.

---

## Статус патча

⚠️ **Патч применён напрямую в node_modules — не персистентный!**

После `npm install` патч пропадёт. Для персистентности:

```bash
npx patch-package @qwen-code/sdk
# создаст: patches/@qwen-code+sdk+0.1.5.patch
# добавить в package.json scripts: "postinstall": "patch-package"
```

---

## Альтернативы (если патч не подходит)

1. **Использовать другую модель через OpenRouter** — `deepseek/deepseek-chat`, `qwen/qwen3-coder-plus`, etc. которые не присылают дублирующий finish chunk
2. **Использовать api.z.ai** — уже работает (`glm-4.7-flash`)
3. **Открыть issue** в репозитории `@qwen-code/sdk` с описанием бага

---

## Файлы проекта

- `packages/server/src/agent.ts` — вызов SDK, `authType: 'openai'`, `permissionMode: 'yolo'`
- `node_modules/@qwen-code/sdk/dist/cli/cli.js` — **патч применён** (~142946)
- `test-ai-raw.mjs` — raw SSE тест (показал дублирующий chunk)
- `test-qwen-tools.mjs` — SDK тест с tools
