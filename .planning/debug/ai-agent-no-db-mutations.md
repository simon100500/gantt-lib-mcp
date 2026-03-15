---
status: awaiting_human_verify
trigger: "AI агент отвечает как будто создал/изменил данные, но в БД нет мутаций"
created: 2026-03-15T00:00:00Z
updated: 2026-03-15T01:00:00Z
---

## Current Focus

hypothesis: CONFIRMED — model google/gemini-3.1-flash-lite-preview via routerai.ru returns empty streaming responses that the @qwen-code/sdk cannot parse as tool calls
test: Verified via debug log: sdk_text_delta shows "[API Error: Model stream ended with empty response text.]", turns=1 means no MCP tools were called
expecting: Fix = switch OPENAI_MODEL in .env to z-ai/glm-4.7-flash which was the previous working model
next_action: Update .env OPENAI_MODEL from google/gemini-3.1-flash-lite-preview to z-ai/glm-4.7-flash

## Symptoms

expected: AI agent calls MCP tools (create_task / batch_create), data saves to PostgreSQL
actual: Model responds as if task was completed, but no mutations in DB
errors: "Изменение не применилось: модель ответила как будто задача изменена, но в базе не было ни одной реальной мутации"
reproduction: Open chat, write "Создай график строительства загородного дома: фундамент, стены, кровля, отделка, ландшафт"
started: Current branch postgres2 — model changed from glm-4.7-flash to google/gemini-3.1-flash-lite-preview

## Eliminated

- hypothesis: Server uses SQLite TaskStore instead of Prisma (Phase 17 not done)
  evidence: packages/server/src/agent.ts and index.ts both import from @gantt/mcp/services (Prisma). dist files built 2026-03-15 confirm Prisma usage.
  timestamp: 2026-03-15T01:00:00Z

- hypothesis: DATABASE_URL not passed to MCP child process
  evidence: agent.ts line 203 explicitly passes DATABASE_URL to mcpServers env; SDK merges with process.env (SDK line 213494)
  timestamp: 2026-03-15T01:00:00Z

- hypothesis: MCP child process fails to start or connect to PostgreSQL
  evidence: Direct stdio test of packages/mcp/dist/index.js with DATABASE_URL confirmed it starts and get_tasks returns data from PostgreSQL correctly
  timestamp: 2026-03-15T01:00:00Z

- hypothesis: Prisma schema migration not run
  evidence: Direct Prisma connection test returned 3 existing tasks successfully
  timestamp: 2026-03-15T01:00:00Z

## Evidence

- timestamp: 2026-03-15T01:00:00Z
  checked: packages/server/.planning/debug/server-agent.log (latest run at 2026-03-15T19:27:33Z)
  found: sdk_result_message turns=1, result="[API Error: Model stream ended with empty response text.]", is_error=false; mutation_verification shows runMutationCount=0, revisionBefore=0=revisionAfter
  implication: AI model never called any MCP tools — session terminated with 1 turn and empty content

- timestamp: 2026-03-15T01:00:00Z
  checked: @qwen-code/sdk/dist/cli/cli.js lines 159126-159195
  found: hasToolCall is set by checking chunk.candidates[0].content.parts[].functionCall (Google Gemini native format). OpenAIContentGenerator converts OpenAI streaming chunks to Gemini format via convertOpenAIChunkToGemini. Error "Model stream ended with empty response text." thrown when !hasToolCall && !contentText
  implication: If the streaming conversion of tool_calls from OpenAI format to Gemini format fails or produces empty functionCall parts, the SDK errors and returns the error text as result

- timestamp: 2026-03-15T01:00:00Z
  checked: .env current model config
  found: OPENAI_MODEL=google/gemini-3.1-flash-lite-preview via https://routerai.ru/api/v1; previous working config was glm-4.7-flash (commented out)
  implication: Model was changed from glm-4.7-flash (working) to google/gemini-3.1-flash-lite-preview (not working with this SDK)

- timestamp: 2026-03-15T01:00:00Z
  checked: Direct API test of z-ai/glm-4.7-flash with tool calls
  found: Returns finish_reason=tool_calls WITH non-empty content text (SDK needs contentText OR hasToolCall to pass the empty-check). Model is available at routerai.ru.
  implication: z-ai/glm-4.7-flash is a compatible replacement that will work with current SDK

## Resolution

root_cause: The model google/gemini-3.1-flash-lite-preview via routerai.ru produces streaming responses that the @qwen-code/sdk OpenAI content generator cannot process as tool calls. The SDK's empty-response guard (no contentText + no recognized functionCall parts in converted Gemini format) triggers an InvalidStreamError. The SDK catches this, returns the error text as the result, and no MCP tools are ever executed. Zero mutations reach PostgreSQL.

fix: Change OPENAI_MODEL in .env from google/gemini-3.1-flash-lite-preview to z-ai/glm-4.7-flash. This model was the previously working configuration (found in commented .env lines) and confirmed to return compatible responses (non-null content text alongside tool_calls).

verification: Run agent with "Создай задачу Тест" and verify: (1) MCP log shows tool_call_received events, (2) PostgreSQL has new rows, (3) server log shows runMutationCount > 0

files_changed:
  - .env (OPENAI_MODEL value)
