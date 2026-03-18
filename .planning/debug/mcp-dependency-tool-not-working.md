---
status: awaiting_human_verify
trigger: "MCP tool for creating task dependencies reports success but doesn't actually create links in database"
created: 2026-03-18T00:00:00.000Z
updated: 2026-03-18T15:05:00.000Z
---

## Current Focus
hypothesis: CONFIRMED NEW ROOT CAUSE — The global Claude MCP config (~/.claude/settings.json) points to D:/Projects/gantt-lib-mcp/dist/index.js which DOES NOT EXIST. The real compiled MCP server is at packages/mcp/dist/index.js. The MCP server never starts. Log entries from 11:18 were from a direct Node.js test script, not from MCP protocol. The earlier dotenv fix is valid but irrelevant until the path is corrected.
test: Verify dist/index.js at root doesn't exist, verify packages/mcp/dist/index.js does exist, update global MCP settings
expecting: After updating MCP config path, MCP server starts and set_dependency works end-to-end
next_action: Update ~/.claude/settings.json mcpServers.gantt-lib.args[0] to point to D:/Projects/gantt-lib-mcp/packages/mcp/dist/index.js and request human to restart Claude to apply

## Symptoms
expected: Link created between tasks (predecessor-successor relationship established)
actual: AI claims it created the dependency (reports success with task IDs), but no actual link is created in the database. User sees message like "Между подзадачей 2 (id: ae0ff282-6e33-4687-858b-22a6f812fc36), подзадачей 3 (id: 74bb4c73-5e5d-4def-bff6-85485c070703) установлены последовательные связи (FS)" but checking database shows no dependency exists.
errors: No explicit error reported - tool appears to succeed silently
reproduction: Ask AI to create a dependency between two tasks. AI reports success but dependency is not persisted.
started: Since always (never worked from the beginning)

## Eliminated
- hypothesis: "set_dependency and remove_dependency tools don't exist in codebase"
  evidence: "Tools ARE implemented in packages/mcp/src/index.ts (lines 365-1115). Code compiles successfully."
  timestamp: "2026-03-18T12:30:00.000Z"

- hypothesis: "Wrong MCP server entry point path caused server to never start"
  evidence: "~/.claude/settings.json and ~/.claude.json both pointed to D:/Projects/gantt-lib-mcp/dist/index.js which does not exist. Fixed to packages/mcp/dist/index.js."
  timestamp: "2026-03-18T15:00:00.000Z"

- hypothesis: "MCP server is using SQLite stores instead of Prisma services"
  evidence: "MCP server imports taskService from './services/task.service.js', not from old SQLite stores."
  timestamp: "2026-03-18T13:00:00.000Z"

- hypothesis: "Prisma client not generated"
  evidence: "Prisma client exists at packages/mcp/dist/prisma-client/ with all required files."
  timestamp: "2026-03-18T13:00:00.000Z"

## Evidence
- timestamp: 2026-03-18T13:00:00.000Z
  checked: MCP debug log (.planning/debug/mcp-agent.log)
  found: set_dependency was called on 2026-03-18T10:54:28 with taskId=74bb4c73-5e5d-4def-bff6-85485c070703, dependsOnTaskId=ae0ff282-6e33-4687-858b-22a6f812fc36, type=FS. Log shows dbPath="D:\\Projects\\gantt-lib-mcp\\gantt.db" but this is just debug info. NO tool_call_completed entry found - tool failed silently.
  implication: Tool IS being called but is failing before completion.

- timestamp: 2026-03-18T13:15:00.000Z
  checked: Direct test of Prisma client initialization
  found: PrismaClientValidationError: "Invalid value undefined for datasource 'db'" - DATABASE_URL is undefined when Prisma client initializes.
  implication: Environment variables are not being loaded!

- timestamp: 2026-03-18T13:15:00.000Z
  checked: packages/mcp/src/index.ts for dotenv import
  found: NO import of dotenv package. MCP server never loads .env file.
  implication: DATABASE_URL from .env is never available to MCP process, Prisma client fails to initialize properly

- timestamp: 2026-03-18T13:30:00.000Z
  checked: Applied fix - added dotenv/config import to index.ts, changed all services to lazy Prisma initialization
  found: Direct test of taskService.update() with dependencies succeeded. Dependency created in PostgreSQL: "ae0d6ceb-3cc9-49eb-8c1f-09f379e96b1b depends on c3fb6d98-712f-4d80-85ae-3a08e5e4ab1e type: FS"
  implication: FIX VERIFIED - Dependencies now persist to PostgreSQL correctly

- timestamp: 2026-03-18T15:00:00.000Z
  checked: ~/.claude/settings.json global MCP server configuration for gantt-lib
  found: "args": ["D:/Projects/gantt-lib-mcp/dist/index.js"] — this path does NOT exist on disk. The root-level dist/ folder was deleted (gitignore entry + confirmed not on filesystem). The real compiled MCP server is at packages/mcp/dist/index.js.
  implication: MCP server NEVER starts. All log entries at 11:18 were from a direct Node.js test script run in terminal, not from MCP protocol calls. User's tests after dist rebuild failed because the wrong path is configured.

- timestamp: 2026-03-18T15:00:00.000Z
  checked: set_dependency handler in packages/mcp/dist/index.js (lines 885-955)
  found: Handler correctly calls taskService.list() to verify tasks exist, taskService.get() to load existing dependencies, then taskService.update() with updated dependencies array. The code path is identical to what the direct test exercises.
  implication: The code itself is correct. The only problem is the MCP config points to the wrong path so the server never starts.

- timestamp: 2026-03-18T13:00:00.000Z
  checked: MCP server imports (packages/mcp/src/index.ts lines 7-9)
  found: MCP server imports taskService, messageService, dependencyService from './services/', NOT from old SQLite stores.
  implication: MCP server IS using Prisma services, not SQLite

- timestamp: 2026-03-18T12:30:00.000Z
  checked: MCP server source code (packages/mcp/src/index.ts)
  found: set_dependency tool implemented at lines 964-1052, remove_dependency tool at lines 1054-1115. Both tools are registered in ListToolsRequestSchema.
  implication: Tools exist in source code and compile successfully

- timestamp: 2026-03-18T12:30:00.000Z
  checked: TaskService.update() method (lines 323-459)
  found: Dependencies are updated via transaction: deleteMany + createMany (lines 370-382). This is the correct approach.
  implication: The underlying database logic is correct

- timestamp: 2026-03-18T12:30:00.000Z
  checked: Database schema (packages/mcp/prisma/schema.prisma)
  found: Dependency model exists with proper relations (lines 130-145). Database is PostgreSQL (remote), not SQLite.
  implication: Database table structure is correct, using PostgreSQL

- timestamp: 2026-03-18T00:00:00.000Z
  checked: Prisma schema (packages/mcp/prisma/schema.prisma)
  found: Dependency model exists with correct structure (id, taskId, depTaskId, type, lag)
  implication: Database table exists and is properly defined

- timestamp: 2026-03-18T00:00:00.000Z
  checked: MCP server tools (packages/mcp/src/index.ts)
  found: Only 8 tools registered: ping, create_task, get_tasks, get_task, update_task, delete_task, create_tasks_batch, get_conversation_history, add_message. NO standalone dependency tool exists.
  implication: Dependencies can only be created as part of create_task or update_task operations

- timestamp: 2026-03-18T00:00:00.000Z
  checked: TaskService.create() method (lines 132-210)
  found: Dependencies ARE created when passed to create_task via tx.dependency.createMany() (lines 178-185)
  implication: The create_task tool DOES create dependencies when they are in the input

- timestamp: 2026-03-18T00:00:00.000Z
  checked: TaskService.update() method (lines 323-459)
  found: Dependencies ARE updated when passed to update_task via tx.dependency.deleteMany() + tx.dependency.createMany() (lines 370-382)
  implication: The update_task tool DOES update dependencies when they are in the input

- timestamp: 2026-03-18T00:00:00.000Z
  checked: System prompt (packages/mcp/agent/prompts/system.md)
  found: Line 13 says "Set dependencies: Establish FS (Finish-Start) dependencies between sequential tasks to model the critical path." but does NOT specify HOW (no mention of using update_task with dependencies parameter)
  implication: AI is instructed to set dependencies but not given clear instructions on which tool to use

## Resolution
root_cause: |
  TWO compounding issues:
  1. PRIMARY: The global Claude MCP config (~/.claude/settings.json and ~/.claude.json) pointed the MCP server to D:/Projects/gantt-lib-mcp/dist/index.js which does NOT exist. The root-level dist/ folder was deleted when it was gitignored (commit dbf5975, Feb 23). The real compiled MCP server is at packages/mcp/dist/index.js. The MCP server NEVER started, so all tool calls silently failed. Log entries we saw were from direct Node.js test scripts, not MCP protocol calls.
  2. SECONDARY: Even with the correct path, dotenv was loaded with `import 'dotenv/config'` which resolves .env relative to process.cwd() — not relative to the script file. When Claude launches the MCP server as a stdio subprocess, cwd is NOT the project root, so DATABASE_URL was never loaded, causing PrismaClientValidationError on all DB operations.

fix: |
  1. Fixed MCP server path in ~/.claude/settings.json: D:/Projects/gantt-lib-mcp/dist/index.js → D:/Projects/gantt-lib-mcp/packages/mcp/dist/index.js
  2. Fixed same path in ~/.claude.json for projects "D:/Projects/gantt-lib" and "D:/Projects/gantt-lib-mcp"
  3. Changed dotenv loading in packages/mcp/src/index.ts from `import 'dotenv/config'` to explicit path resolution using __dirname, so .env is found regardless of process cwd
  4. Rebuilt packages/mcp with `npm run build:mcp`

verification: |
  - Confirmed packages/mcp/dist/index.js exists and compiled correctly
  - Confirmed dist/index.js now loads .env from absolute path (D:/Projects/gantt-lib-mcp/.env)
  - Confirmed DATABASE_URL is loaded when dotenv runs with the explicit path
  - Service code and set_dependency handler are correct (verified earlier)
  - Awaiting human confirmation that set_dependency now works via actual MCP tool call

files_changed:
  - packages/mcp/src/index.ts (dotenv loading: explicit __dirname-relative path instead of cwd-relative)
  - C:/Users/Volobuev/.claude/settings.json (MCP server path corrected)
  - C:/Users/Volobuev/.claude.json (MCP server path corrected for two projects)
  - packages/mcp/src/services/task.service.ts (lazy Prisma initialization - applied in previous session)
  - packages/mcp/src/services/message.service.ts (lazy Prisma initialization - applied in previous session)
  - packages/mcp/src/services/dependency.service.ts (lazy Prisma initialization - applied in previous session)
