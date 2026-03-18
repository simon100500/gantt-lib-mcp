---
status: awaiting_human_verify
trigger: "MCP tool for creating task dependencies reports success but doesn't actually create links in database"
created: 2026-03-18T00:00:00.000Z
updated: 2026-03-18T13:30:00.000Z
---

## Current Focus
hypothesis: FIX APPLIED - Added dotenv/config import to MCP server and changed all services to lazy Prisma initialization
test: Direct test of taskService.update() with dependencies array
expecting: Dependency is created in PostgreSQL database
next_action: Request human verification - test set_dependency tool in real environment

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
root_cause: MCP server (packages/mcp/src/index.ts) did not import or configure dotenv. Additionally, all service classes (TaskService, MessageService, DependencyService) initialized Prisma client at class instantiation time using class field `private prisma = getPrisma()`. This caused Prisma client to be initialized before dotenv could load environment variables, resulting in DATABASE_URL being undefined. All database operations failed silently with PrismaClientValidationError.

fix: |
  1. Added `import 'dotenv/config'` as the first import in packages/mcp/src/index.ts
  2. Changed all service classes to use lazy Prisma initialization:
     - TaskService: Changed `private prisma = getPrisma()` to lazy getter pattern
     - MessageService: Same change
     - DependencyService: Same change
  This ensures Prisma client is only initialized on first use, after dotenv has loaded DATABASE_URL.

verification: |
  Direct test via Node.js script confirmed fix works:
  - DATABASE_URL is now loaded correctly
  - taskService.update() with dependencies array succeeded
  - Dependency created and persisted to PostgreSQL: "ae0d6ceb-3cc9-49eb-8c1f-09f379e96b1b depends on c3fb6d98-712f-4d80-85ae-3a08e5e4ab1e type: FS"
  - Direct Prisma query confirmed dependency exists in database

files_changed:
  - packages/mcp/src/index.ts (added dotenv/config import)
  - packages/mcp/src/services/task.service.ts (lazy Prisma initialization)
  - packages/mcp/src/services/message.service.ts (lazy Prisma initialization)
  - packages/mcp/src/services/dependency.service.ts (lazy Prisma initialization)
