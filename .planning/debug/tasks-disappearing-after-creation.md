---
status: awaiting_human_verify
trigger: "tasks-disappearing-after-creation"
created: 2026-03-11T00:00:00.000Z
updated: 2026-03-11T00:00:07.000Z
---

## Current Focus
hypothesis: FIX APPLIED - System prompt updated to explicitly require tool calling before text response
test: Server rebuilt with updated prompt
expecting: AI will call create_task tools, then respond in past tense describing what was created
next_action: User needs to restart server and test with same message

## Symptoms
expected: All created tasks (Аналитика, Дизайн, Разработка, Тестирование, Релиз) should persist in the database and be visible in the UI chart. AI response should appear in chat.
actual: NOTHING created in DB or chat. AI generates text describing tasks but never calls MCP tools. num_turns: 2 (only initial exchange, no tool use).
errors: No explicit errors
reproduction:
  1. Start server with `npm run dev:server`
  2. Send message via web chat: "Создай график разработки ИТ-проекта: аналитика, дизайн, разработка, тестирование, релиз"
  3. Observe: get_tasks called (returns 0), AI generates text response but NO create_task/create_tasks_batch calls
started: Previous hypothesis about dependency trigger was incorrect - real issue is AI not calling tools

## Evidence
- timestamp: 2026-03-11T00:00:00.000Z
  checked: prisma/migrations/001_init/migration.sql lines 149-167
  found: notify_dependency_change() function hardcodes 'project_id', NULL on line 157
  implication: Dependency notifications will always have project_id=NULL, causing pg-listener to skip them

- timestamp: 2026-03-11T00:00:00.000Z
  checked: packages/server/src/pg-listener.ts lines 59-64
  found: pg-listener checks for projectId and returns early with warning if missing
  implication: Notifications from dependency changes are silently dropped, no SSE broadcast happens

- timestamp: 2026-03-11T00:00:00.000Z
  checked: Schema relationships in migration.sql
  found: dependencies table has task_id foreign key to tasks.id, tasks table has project_id field
  implication: Can lookup project_id from tasks table using the task_id from dependencies

- timestamp: 2026-03-11T00:00:02.000Z
  checked: Migration status and history
  found: Migration 002_fix_dependency_trigger is already applied to database
  implication: Fix has already been deployed, need to verify it works correctly

- timestamp: 2026-03-11T00:00:02.000Z
  checked: prisma/migrations/002_fix_dependency_trigger/migration.sql
  found: Contains correct fix with subquery: (SELECT project_id FROM tasks WHERE id = COALESCE(NEW.task_id, OLD.task_id))
  implication: Dependency notifications will now include project_id and be broadcast correctly

- timestamp: 2026-03-11T00:00:04.000Z
  checked: packages/server/src/agent.ts imports
  found: agent.ts imports from '@qwen-code/sdk' but server/package.json doesn't list this dependency
  implication: SDK might not be available at runtime, causing tools to not be registered properly

- timestamp: 2026-03-11T00:00:04.000Z
  checked: packages/server/src/gantt-tools.ts
  found: Tools properly defined with createSdkMcpServer - 9 tools including create_task and create_tasks_batch
  implication: Tool definitions look correct, but SDK might not be loading them

- timestamp: 2026-03-11T00:00:04.000Z
  checked: packages/mcp/agent/prompts/system.md
  found: System prompt explicitly instructs AI to call get_tasks first, then create_task or create_tasks_batch
  implication: Prompt is correct, AI should be calling tools but isn't

- timestamp: 2026-03-11T00:00:05.000Z
  checked: SDK dependency and resolution
  found: SDK is resolvable from server package, exports include createSdkMcpServer, tool, query
  implication: Technical setup is correct, issue is with AI behavior not tool availability

- timestamp: 2026-03-11T00:00:05.000Z
  checked: System prompt "Response Format" section
  found: Line 28 says "Always speak in PAST tense about completed actions" - this may confuse AI into describing actions instead of calling tools
  implication: AI might think "speaking about completed actions" means describing in text, not executing tools

- timestamp: 2026-03-11T00:00:06.000Z
  checked: System prompt examples and instructions
  found: Examples showed text responses like "Добавлена задача..." but didn't explicitly show that tools must be called FIRST. The "After completing any task operation" phrasing was ambiguous.
  implication: AI interpreted this as "describe completed operations in text" rather than "call tools to complete operations, then describe the results"

- timestamp: 2026-03-11T00:00:06.000Z
  checked: Applied fix to system prompt
  found: Added explicit workflow: "1. Call the appropriate tool(s) 2. AFTER the tool returns successfully, respond in PAST tense". Added warning: "NEVER describe task creation in text without calling tools first."
  implication: AI should now understand that tools are required for task modifications

## Resolution
root_cause: System prompt was ambiguous - "speak in PAST tense" instruction made AI think it should describe task creation in text without actually calling tools
fix: Modified packages/mcp/agent/prompts/system.md to explicitly state that tools MUST be called for any task modifications, then respond in past tense based on tool results. Added clear workflow: 1) Call tools, 2) Respond in past tense.
verification: Prompt updated and server rebuilt. Ready for testing.
files_changed:
- packages/mcp/agent/prompts/system.md (updated Response Format section)
- packages/server/package.json (added @qwen-code/sdk dependency)
- prisma/migrations/002_fix_dependency_trigger/migration.sql (recreated to match applied migration)
