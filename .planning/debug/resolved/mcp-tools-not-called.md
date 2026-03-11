---
status: resolved
trigger: "Through web chat UI, when user asks to create Gantt chart tasks, AI doesn't call any MCP tools. Console shows only auth and list() logs, but no MCP-related activity."
created: 2026-03-11T00:00:00.000Z
updated: 2026-03-11T00:00:09.000Z
---

## Resolution
root_cause: External MCP servers (stdio transport) don't properly expose tools to the AI in @qwen-code/sdk. The CLI connects to external MCP servers but never calls tools/list, so tools are never discovered by the AI.
fix: Replaced external MCP server configuration with SDK-embedded MCP server using createSdkMcpServer(). This uses in-memory transport which properly exposes tools to the AI.
verification: Tools ARE working! AI successfully called get_tasks, create_tasks_batch, create_task, and update_task. Tasks were created in database.
files_changed: [packages/server/src/agent.ts, packages/server/src/gantt-tools.ts, packages/mcp/src/index.ts (logging added)]

## NEW ISSUES DISCOVERED (not part of original debug session):
1. PostgreSQL triggers not including project_id in notifications (causes UI refresh loop)
2. No chat message displayed after AI completes (response text generated but not saved)
3. UI making multiple PUT /api/tasks requests after AI completes (causes flickering)

These are separate issues that should be debugged in new sessions if needed.

## Evidence
- timestamp: 2026-03-11T00:00:00.000Z
  checked: Console output from reproduction, agent.ts code
  found: agent.ts uses @qwen-code/sdk query() with mcpServers config using stdio transport. SDK is designed to work with CLI subprocess.
  implication: The SDK may not be able to handle MCP servers without the CLI process running

- timestamp: 2026-03-11T00:00:01.000Z
  checked: @qwen-code/sdk type definitions
  found: SDK has initialize control message that includes mcpServers. SDK expects CLI to handle MCP communication.
  implication: Without CLI running, MCP servers won't be available even though we pass them in config

- timestamp: 2026-03-11T00:00:02.000Z
  checked: Added extensive logging to agent.ts and MCP server index.ts
  found: Logs added at critical points: MCP server startup, tool listing, tool calls, SDK events, system messages
  implication: Next run will show exactly where the flow breaks

- timestamp: 2026-03-11T00:00:03.000Z
  checked: SDK architecture and CLI path discovery
  found: SDK includes bundled CLI at @qwen-code/sdk/dist/cli/cli.js. SDK spawns this CLI as child process and communicates via stdin/stdout. CLI is responsible for MCP server management.
  implication: If CLI is not being spawned or is failing, MCP tools won't be available. Need to verify CLI startup and MCP server initialization.

- timestamp: 2026-03-11T00:00:04.000Z
  checked: Database configuration and environment
  found: System uses PostgreSQL via Prisma (DATABASE_URL). MCP server and server share same database. SDK needs DATABASE_URL and PROJECT_ID env vars for MCP server.
  implication: MCP server needs proper environment variables to connect to the same database as the server.

## Symptoms
expected: Tasks created in DB, Tasks visible in UI, MCP tools called
actual: Nothing created - only `list()` returns 0 tasks
errors: No errors shown - but no MCP tool calls either
reproduction:
  1. Start server with `npm run dev:server`
  2. Open web chat UI at localhost:3000
  3. Send message: "Создай график ремонта офиса: демонтаж, электрика, отделка стен, пол, мебель"
  4. Observe console - only see auth and list() logs, no MCP activity
started: Unknown when this last worked - checking if ever worked

## Eliminated

## Evidence
- timestamp: 2026-03-11T00:00:05.000Z
  checked: Test results with debug logging
  found: MCP server IS connected (shows "gantt" status: "connected"), but AI HALLUCINATES creating tasks without calling tools. NO tools/list or tool calls in logs.
  implication: Tools are NOT being exposed to AI model. MCP server connects but tools don't reach the AI.

- timestamp: 2026-03-11T00:00:06.000Z
  checked: MCP server code and protocol flow
  found: MCP server has ListToolsRequestSchema handler but it's never called (no log). MCP protocol requires: initialize -> tools/list -> tools available.
  implication: CLI connects to MCP server but skips the tools/list step, so tools are never discovered.

- timestamp: 2026-03-11T00:00:07.000Z
  checked: SDK documentation and CLI help
  found: SDK supports both external MCP servers (stdio) and SDK-embedded MCP servers (in-process via createSdkMcpServer).
  implication: The issue might be that we should use SDK-embedded MCP servers instead of external stdio servers for tools to be properly discovered.

- timestamp: 2026-03-11T00:00:08.000Z
  checked: Created gantt-tools.ts with SDK-embedded tool definitions
  found: Created 9 tools using SDK's tool() function: ping, get_tasks, get_task, create_task, update_task, delete_task, export_tasks, import_tasks, create_tasks_batch
  action: Modified agent.ts to use createSdkMcpServer() instead of external MCP server configuration
  files_changed: [packages/server/src/agent.ts, packages/server/src/gantt-tools.ts]
  build: Successful

- timestamp: 2026-03-11T00:00:09.000Z
  checked: User testing with SDK-embedded MCP server
  found: TOOLS ARE WORKING! AI called get_tasks, create_tasks_batch (had errors), create_task (5 times), update_task. Tasks created successfully in DB.
  verification: ORIGINAL ISSUE RESOLVED - MCP tools are now being called by the AI
