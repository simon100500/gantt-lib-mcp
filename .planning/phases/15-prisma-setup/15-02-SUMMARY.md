---
phase: 15-prisma-setup
plan: 02
subsystem: Prisma ORM
tags: [prisma, postgresql, migration, database]
requirements: [DB-04, POOL-03]

dependency_graph:
  requires:
    - "15-01 (Prisma schema and singleton must exist)"
  provides:
    - "PostgreSQL database with 10 tables"
    - "Migration history for schema version control"
    - "Generated Prisma Client with TypeScript types"
  affects:
    - "16 (Services Layer needs Prisma Client)"

tech_stack:
  added:
    - "Prisma Migrate (migration history tracking)"
  patterns:
    - "Schema-first ORM with generated TypeScript types"
    - "Migration-based schema evolution (not db push)"
    - "Connection pooling via DATABASE_URL parameters"

key_files:
  created:
    - "packages/mcp/prisma/migrations/20260313_init/migration.sql (PostgreSQL DDL)"
    - "packages/mcp/prisma/migrations/migration_lock.toml (Prisma migration lock)"
    - "packages/mcp/dist/prisma-client/* (generated Prisma Client)"
  modified:
    - "packages/mcp/prisma/schema.prisma (source of truth)"
    - "packages/mcp/src/prisma.ts (singleton with connection pooling)"

decisions:
  - "Prisma Migrate over db push for migration history"
  - "Generated Prisma Client committed for stable builds"
  - "Connection pooling configured via DATABASE_URL query parameters"

metrics:
  duration: "2 hours"
  completed_date: "2026-03-13"
  tasks_completed: "6/6"
  files_changed: 20
  lines_added: 21423
  commits: 5

---

# Phase 15 Plan 02: Initial Prisma Migration Summary

**One-liner:** PostgreSQL database initialized with Prisma Migrate, 10 tables created with CASCADE/SET NULL constraints matching SQLite schema.

**Status:** COMPLETED

**Tasks:** 6/6 complete

**Commits:**
- `ff39766`: feat(15-01): install Prisma and configure schema.prisma
- `6e41904`: feat(15-01): create Prisma Client singleton with connection pooling
- `ba4732c`: chore(15-01): update .env.example and .gitignore for Prisma
- `ecbe768`: docs(15-01): complete Prisma schema and client singleton plan
- `a6e7378`: feat(15-02): initialize Prisma schema and PostgreSQL migration

---

## Completed Tasks

| Task | Name | Status | Commit |
| ---- | ---- | ------ | ------ |
| 1 | Verify prerequisites | Complete | - |
| 2 | Generate Prisma Client before migration | Complete | - |
| 3 | Execute initial Prisma migration | Complete | - |
| 4 | Verify database schema and foreign keys | Complete | - |
| 5 | Manual verification via Prisma Studio | Complete | - |
| 6 | Commit migration files and generated Prisma Client | Complete | a6e7378 |

---

## What Was Built

### PostgreSQL Database Schema

**Migration:** `20260313_init` executed successfully

**Tables created (10):**
1. `users` (id, email, created_at) - User accounts
2. `projects` (id, user_id, name, created_at) - User projects
3. `sessions` (id, user_id, project_id, access_token, refresh_token, expires_at, created_at) - Auth sessions
4. `otp_codes` (id, email, code, expires_at, used) - One-time passwords
5. `tasks` (id, project_id, name, start_date, end_date, color, progress, parent_id, sort_order) - Gantt tasks
6. `dependencies` (id, task_id, dep_task_id, type, lag) - Task dependencies
7. `messages` (id, project_id, role, content, created_at) - AI chat messages
8. `share_links` (id, project_id, created_at) - Project sharing
9. `task_revisions` (project_id, revision, updated_at) - Task version tracking
10. `task_mutations` (id, project_id, run_id, session_id, source, mutation_type, task_id, created_at) - Audit log

**Enums created (4):**
- `DependencyType`: FS, SS, FF, SF (Gantt dependency types)
- `MessageRole`: user, assistant (Chat roles)
- `MutationSource`: agent, manual_save, api, system (Change sources)
- `MutationType`: create, update, delete, delete_all, import (Operation types)

### Foreign Key Constraints

**CASCADE deletions (matching SQLite ON DELETE CASCADE):**
- projects.user_id -> users.id
- sessions.user_id -> users.id
- sessions.project_id -> projects.id
- tasks.project_id -> projects.id
- dependencies.task_id -> tasks.id
- dependencies.dep_task_id -> tasks.id
- messages.project_id -> projects.id
- share_links.project_id -> projects.id
- task_revisions.project_id -> projects.id

**SET NULL deletion (matching SQLite ON DELETE SET NULL):**
- tasks.parent_id -> tasks.id

### Prisma Client

**Generated at:** `packages/mcp/dist/prisma-client/`

**Exports:**
- `PrismaClient` - Database client class
- `* as models` - All generated TypeScript models
- Connection pooling configured via DATABASE_URL

**Singleton:** `packages/mcp/src/prisma.ts` provides `getPrisma()` function with:
- Hot module reload safety (global singleton)
- Graceful shutdown handlers (SIGTERM, beforeExit)
- Connection pooling from DATABASE_URL

---

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Generated Prisma Client in .gitignore**
- **Found during:** Task 6
- **Issue:** `packages/mcp/dist/` is in .gitignore, but generated Prisma Client must be committed for stable builds
- **Fix:** Used `git add -f` to force-add prisma-client directory
- **Files modified:** packages/mcp/dist/prisma-client/* (20 files)
- **Commit:** a6e7378

### Known Issues

**1. Prisma Studio read-only mode**
- **Found during:** Task 5 (manual verification)
- **Issue:** User verified schema in Prisma Studio but noted that data doesn't write to database when attempting to insert records
- **Potential causes:**
  - PostgreSQL database permissions issue
  - Read-only connection string configuration
  - Prisma Studio configuration issue
- **Status:** Documented for Phase 16 investigation
- **Action:** Services layer implementation should verify write permissions and connection string format

---

## Success Criteria

- [x] Migration executed: `20260313_init` migration exists in packages/mcp/prisma/migrations/
- [x] Tables created: All 10 tables exist in PostgreSQL database
- [x] Foreign keys correct: CASCADE/SET NULL rules match SQLite schema
- [x] Prisma Client generated: packages/mcp/dist/prisma-client/ exists with index.js and index.d.ts
- [x] Prisma Studio works: Web UI opens showing all models
- [x] Migration tracked: _prisma_migrations table records the init migration
- [x] Graceful shutdown: SIGTERM handler disconnects Prisma connections
- [x] Committed to git: Migration files and Prisma Client in repository

---

## Ready for Phase 16

**Phase 16: Services Layer**

**Prerequisites met:**
- [x] Database schema stable and version-controlled
- [x] Prisma Client accessible to both packages/mcp and packages/server
- [x] Migration history established for future schema changes

**Known blockers:**
- Prisma Studio write issue needs investigation during services layer development
- Connection pooling has not been load-tested yet

**Next actions:**
1. Create TaskService using Prisma Client for all task CRUD operations
2. Create ProjectService, AuthService, MessageService, DependencyService
3. Replace SQLite store.ts and auth-store.ts with Prisma-backed services
4. Verify write permissions and correct connection string format
5. Test connection pooling under load

---

## Verification

### Migration Status
```bash
cd packages/mcp && npx prisma migrate status
# Expected: "No pending migrations"
```

### Table Count
```bash
psql $DATABASE_URL -c "SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'public';"
# Expected: 10
```

### Foreign Keys
```bash
psql $DATABASE_URL -c "
SELECT tc.table_name, kcu.column_name, ccu.table_name AS foreign_table_name, rc.delete_rule
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu ON ccu.constraint_name = tc.constraint_name
JOIN information_schema.referential_constraints AS rc ON tc.constraint_name = rc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
ORDER BY tc.table_name;
"
# Expected: 10 foreign keys with CASCADE/SET NULL
```

### Prisma Client Import
```bash
node -e "import('@gantt/mcp/prisma').then(m => console.log('PrismaClient:', typeof m.PrismaClient))"
# Expected: "PrismaClient: function"
```

---

*Plan completed: 2026-03-13*
*Migration executed: 20260313_init*
*Database: PostgreSQL with Prisma ORM*
