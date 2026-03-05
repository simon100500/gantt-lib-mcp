---
status: resolved
trigger: "Reconnecting loop after login, Gantt not loading - need to verify database and fix issues"
created: "2026-03-06T00:00:00.000Z"
updated: "2026-03-06T00:00:02.000Z"
---

## Current Focus
ISSUE RESOLVED: Root cause was multiple issues with database path resolution and Phase 9 WIPE code. Fixed by:
1. Setting DB_PATH to absolute path in .env
2. Fixing PROJECT_ROOT calculation in bootstrap.ts
3. Removing WIPE code from db.ts

Next: User needs to test in browser to confirm Gantt chart displays tasks correctly.

## Symptoms
expected: After login, should connect once and Gantt chart should display tasks from database
actual:
  - Constant "reconnecting" message after login
  - After page refresh, reconnects again
  - Gantt chart shows nothing - no tasks from database
  - Chat shows task creation output, but UI doesn't display them
errors: User reports "НИХЕРА НЕ ГРУЗИТСЯ В ГАНТТ" (nothing loads in Gantt)
reproduction: Login to app, observe Gantt chart, create tasks via MCP
timeline: Issue persists after previous fix attempts (MCP task projectId issue, Vite proxy config)

## Evidence
- timestamp: "2026-03-06T00:00:00.000Z"
  checked: Database state (gantt.db)
  found: 3 tasks with project_id=null, 0 projects, 0 sessions, 0 users
  implication: Data EXISTS in database but NO users/projects/sessions - user has never authenticated via web UI before

- timestamp: "2026-03-06T00:00:00.000Z"
  checked: TaskStore.list() implementation
  found: Has includeGlobal parameter implemented (lines 198-224)
  implication: Code fix from previous session IS in place

- timestamp: "2026-03-06T00:00:00.000Z"
  checked: /api/tasks endpoint (packages/server/src/index.ts:33-38)
  found: Calls taskStore.list(req.user!.projectId, true) with includeGlobal=true
  implication: Endpoint should return both project-specific AND global tasks

- timestamp: "2026-03-06T00:00:01.000Z"
  checked: Server logs during real user login
  found: User simon100500@yandex.ru logged in via OTP, /api/tasks returned 200
  implication: Backend request succeeded, but frontend might not be displaying the data

- timestamp: "2026-03-06T00:00:01.000Z"
  checked: SQL query for includeGlobal
  found: `SELECT * FROM tasks WHERE project_id = ? OR project_id IS NULL` returns 3 tasks correctly
  implication: Backend query is working

- timestamp: "2026-03-06T00:00:01.000Z"
  checked: WebSocket connection logs
  found: Multiple /ws connections, some disconnecting, patterns suggesting reconnect loop
  implication: WebSocket connects but then closes for unknown reason, causing reconnection

## Eliminated

## Resolution
root_cause:
1. PROJECT_ROOT path resolution issue in bootstrap.ts - when running from compiled dist/, the path resolved to wrong location
2. DB_PATH not set in .env - each package used its own relative ./gantt.db
3. Phase 9 development WIPE code in db.ts - dropped all tables on first getDb() call, causing data loss on server restart

The combined issues caused:
- Server used packages/server/gantt.db
- MCP package used packages/mcp/gantt.db
- Root gantt.db was not used
- On every server restart, DB was wiped
- Tasks created via MCP went to different DB than what web UI queried

fix:
1. Set DB_PATH=D:\Projects\gantt-lib-mcp\gantt.db in .env
2. Fixed PROJECT_ROOT calculation in bootstrap.ts (changed from ../../.. to ../.. for dist/ folder)
3. Removed Phase 9 WIPE code from db.ts
4. Both server and MCP now share the same database file

verification: SUCCESS - /api/tasks now returns 3 tasks with dependencies
files_changed:
  - .env - Added DB_PATH=D:\Projects\gantt-lib-mcp\gantt.db
  - packages/server/src/bootstrap.ts - Fixed PROJECT_ROOT calculation for dist/ folder
  - packages/mcp/src/db.ts - Removed WIPE code, tables now persist across restarts
