---
status: verifying
trigger: "tasks-disappear-on-page-refresh"
created: 2026-03-13T00:00:00Z
updated: 2026-03-13T01:00:00Z
---

## Current Focus

hypothesis: CONFIRMED — three root causes identified; applying fixes
test: N/A — causes confirmed via static analysis
expecting: N/A
next_action: Fix useAutoSave race condition, useTasks StrictMode guard, MCP/Prisma split

## Symptoms

expected: Задачи сохранены в PostgreSQL и остаются после перезагрузки страницы
actual: После refresh все tasks для проекта исчезают из БД (таблица tasks пустая для этого project_id)
errors: Нет видимых ошибок
reproduction: Обновить страницу в любой момент — задачи пропадают
started: Совпадает с фиксом сегодня (подключение Prisma-сервисов к packages/server)

## Eliminated

- hypothesis: Cascade delete on project load (auth routes or GET /api/tasks triggers deleteAll)
  evidence: GET /api/tasks only calls taskService.list(), auth routes have no delete calls
  timestamp: 2026-03-13T00:30:00Z

- hypothesis: adminRoutes.ts resets tasks on startup
  evidence: admin routes do not contain any deleteAll/deleteMany calls on load
  timestamp: 2026-03-13T00:30:00Z

## Evidence

- timestamp: 2026-03-13T00:00:00Z
  checked: symptoms and investigation hints
  found: Bug coincides with today's change connecting taskService/authService to packages/server instead of old SQLite stores
  implication: The new Prisma-based services introduced a code path that wipes tasks on page load

- timestamp: 2026-03-13T00:30:00Z
  checked: packages/server/src/index.ts, routes/auth-routes.ts, TaskService
  found: PUT /api/tasks calls taskService.importTasks() which DELETES ALL tasks for projectId before reinserting. If called with tasks=[], result is full DB wipe for that project.
  implication: Any autosave with an empty tasks array is destructive

- timestamp: 2026-03-13T00:40:00Z
  checked: packages/web/src/hooks/useAutoSave.ts
  found: Race condition — when skipVersion fires (sets lastSavedHash=hash([])), a concurrent in-progress save completion overwrites lastSavedHash with hash(previousTasks). This leaves tasks=[] with lastSavedHash≠hash([]), so the NEXT render triggers a save with tasks=[].
  implication: Root Cause 1 — race condition in save completion callback vs skipVersion branch

- timestamp: 2026-03-13T00:45:00Z
  checked: packages/web/src/hooks/useTasks.ts
  found: lastProcessedToken guard (line 32-34) blocks re-fetch if accessToken hasn't changed. In React StrictMode, effects fire twice (mount→unmount→mount). First mount processes token T, second mount is blocked. App.tsx line 552 fires replaceTasksFromSystem([]) on second mount → tasks stay [] permanently until user interaction.
  implication: Root Cause 2 — StrictMode double-invoke leaves tasks=[] in UI; user interaction then triggers autosave that wipes DB

- timestamp: 2026-03-13T00:50:00Z
  checked: packages/mcp/src/index.ts
  found: MCP tool handlers (create_task, update_task, import_tasks, delete_task, list_tasks) ALL use taskStore (SQLite), not taskService (Prisma/PostgreSQL). REST GET /api/tasks reads from PostgreSQL. Agent-created tasks in SQLite are invisible to the REST API and vice versa.
  implication: Root Cause 3 — dual-DB split; agent writes go to SQLite, REST reads from PostgreSQL

- timestamp: 2026-03-13T00:55:00Z
  checked: App.tsx line 552 effect dependencies
  found: Effect runs on auth.project?.id change. On initial page load, project.id is always set from JWT → effect fires → replaceTasksFromSystem([]) sets tasks=[] and increments skipVersion. In StrictMode this fires twice; second firing leaves tasks=[] after useTasks is already blocked.
  implication: Confirms Root Cause 2; the effect is correct for project-switch but causes StrictMode issue

## Resolution

root_cause: |
  Three root causes:
  1. useAutoSave race condition: concurrent save completion (line 152: lastSavedHashRef.current = currentHash)
     overwrites the skipVersion-set hash([])-protection, exposing tasks=[] to the hash check on the next
     render → triggers PUT /api/tasks with [] → taskService.importTasks([]) wipes DB.
  2. useTasks StrictMode guard: lastProcessedToken ref blocks re-fetch on StrictMode second mount,
     leaving tasks=[] in state after App.tsx line 552 fires replaceTasksFromSystem([]) a second time.
  3. MCP/PostgreSQL split: packages/mcp/src/index.ts uses taskStore (SQLite) while REST uses
     taskService (Prisma/PostgreSQL) — agent tool writes are invisible to REST API.

fix: |
  1. useAutoSave: Capture the hash BEFORE the async fetch and only update lastSavedHashRef if
     the ref hasn't been changed by another branch (skipVersion/token-change) during the save.
     Use a "save epoch" (integer counter) — increment before save, check it still matches on completion.
  2. useTasks: Change lastProcessedToken guard to also re-fetch when tasks.length === 0 after
     having previously loaded, OR (simpler and correct) clear lastProcessedToken.current when
     replaceTasksFromSystem is called from App.tsx so useTasks can re-fetch.
     Simplest fix: expose a resetFetchGuard callback from useTasks and call it from replaceTasksFromSystem.
     Alternative: in useTasks, don't guard re-fetches at all — instead rely on the cancelled=true
     cleanup to prevent duplicate state updates. The guard was added to prevent infinite loops but
     those are already prevented by the cancellation pattern.
  3. MCP/src/index.ts: Replace taskStore imports with taskService from @gantt/mcp/services.
     The MCP server runs in the same process as the Fastify server (via runAgentWithHistory in agent.ts
     calling the tools) — both share the same Prisma instance.

verification: TypeScript compilation passes for all 3 packages (mcp, web, server). Awaiting runtime verification.
files_changed:
  - packages/web/src/hooks/useAutoSave.ts
  - packages/web/src/hooks/useTasks.ts
  - packages/mcp/src/index.ts
  - packages/server/src/agent.ts
