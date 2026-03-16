---
status: awaiting_human_verify
trigger: "Ничего не сохраняется в PostgreSQL БД. Нет ошибок, данные просто не попадают в БД. Никогда не работало."
created: 2026-03-13T00:00:00Z
updated: 2026-03-13T00:01:00Z
---

## Current Focus

hypothesis: CONFIRMED AND FIXED — server was using SQLite stores instead of Prisma services
test: built both packages (no TS errors), ran live write test to PostgreSQL — data appeared
expecting: awaiting user confirmation that the fix works end-to-end in real workflow
next_action: user verifies login + task creation persists in PostgreSQL

## Symptoms

expected: Данные (tasks, projects, messages, etc.) должны сохраняться в PostgreSQL через Prisma
actual: Код выполняется без ошибок, но в БД ничего нет
errors: Нет ошибок
reproduction: Любая операция записи через сервисный слой
started: Никогда не работало — новая интеграция Postgres (ветка postgres2)

## Eliminated

- hypothesis: PrismaClient not initialized / no DATABASE_URL
  evidence: DATABASE_URL is set in .env, getPrisma() singleton works, prisma client generated
  timestamp: 2026-03-13T00:01:00Z

- hypothesis: Migrations not applied
  evidence: `prisma migrate status` shows "Database schema is up to date!" with 1 migration applied
  timestamp: 2026-03-13T00:01:00Z

- hypothesis: Services not implemented
  evidence: All 5 services exist (task, project, auth, message, dependency) and use getPrisma()
  timestamp: 2026-03-13T00:01:00Z

## Evidence

- timestamp: 2026-03-13T00:01:00Z
  checked: packages/server/src/index.ts
  found: imports taskStore from '@gantt/mcp/store' — uses SQLite for ALL task/message operations
  implication: all writes go to gantt.db (SQLite), not PostgreSQL

- timestamp: 2026-03-13T00:01:00Z
  checked: packages/server/src/routes/auth-routes.ts
  found: imports authStore from '@gantt/mcp/auth-store' and taskStore from '@gantt/mcp/store'
  implication: auth (users/projects/sessions/OTP) also writes to SQLite, not PostgreSQL

- timestamp: 2026-03-13T00:01:00Z
  checked: packages/server/src/agent.ts
  found: imports taskStore from '@gantt/mcp/store'
  implication: agent task operations go to SQLite

- timestamp: 2026-03-13T00:01:00Z
  checked: packages/server/src/middleware/auth-middleware.ts
  found: imports authStore from '@gantt/mcp/auth-store'
  implication: session lookup goes to SQLite

- timestamp: 2026-03-13T00:01:00Z
  checked: packages/mcp/src/index.ts
  found: imports taskStore from './store.js' — MCP tool handlers also use SQLite
  implication: MCP tool operations (create_task, etc.) go to SQLite

- timestamp: 2026-03-13T00:01:00Z
  checked: packages/mcp/src/services/ — all 5 services exist and use getPrisma()
  found: services are fully implemented but NEVER CALLED anywhere in the running code
  implication: The entire services layer was built but never wired up

- timestamp: 2026-03-13T00:01:00Z
  checked: DATABASE_URL in .env, prisma migrate status
  found: PostgreSQL is reachable, schema is migrated, Prisma client is generated
  implication: Infrastructure is ready, only the wiring is missing

## Resolution

root_cause: The Prisma services layer (packages/mcp/src/services/) was built but never wired
  into the server. packages/server/src/ (index.ts, agent.ts, auth-routes.ts, auth-middleware.ts)
  all imported from the OLD SQLite-backed taskStore and authStore. All writes silently succeeded
  to the local SQLite file gantt.db, with zero interaction with PostgreSQL.

fix: |
  1. packages/server/src/middleware/auth-middleware.ts: authStore → authService
  2. packages/server/src/routes/auth-routes.ts: authStore → authService, taskStore → taskService
  3. packages/server/src/index.ts: taskStore → taskService + messageService
  4. packages/server/src/agent.ts: taskStore → taskService + messageService
  5. packages/mcp/src/services/task.service.ts: added getTaskRevision(), getMutationEventsByRun(),
     getMutationEventsSince() methods using Prisma (needed by agent.ts)

verification: |
  - Both packages build with zero TypeScript errors
  - Live test: authService.findOrCreateUser() + taskService.create() + taskService.list()
    all executed against real PostgreSQL and returned correct data
  - User/project/task row confirmed written to PostgreSQL (gantt-db.cap.agenerator.ru)

files_changed:
  - packages/server/src/middleware/auth-middleware.ts
  - packages/server/src/routes/auth-routes.ts
  - packages/server/src/index.ts
  - packages/server/src/agent.ts
  - packages/mcp/src/services/task.service.ts
