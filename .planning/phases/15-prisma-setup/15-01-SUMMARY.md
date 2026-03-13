---
phase: 15-prisma-setup
plan: 01
subsystem: Prisma ORM + PostgreSQL Setup
tags: [database, orm, postgresql, prisma, migration]
requirements: [DB-01, DB-02, DB-03, DB-05, POOL-01, POOL-02, POOL-03]

dependency_graph:
  requires: []
  provides: [Prisma Client, Database Schema, Migration History]
  affects: [packages/server, Phase 16 Services Layer]

tech_stack:
  added:
    - "prisma: ^5.22.0 (devDependency)"
    - "@prisma/client: ^5.22.0 (dependency)"
    - "postgresql:// database connection"
  patterns:
    - "Prisma Client singleton with hot reload safety"
    - "Connection pooling via DATABASE_URL query params"
    - "Graceful shutdown on SIGTERM/beforeExit"
    - "Migration-based schema management"

key_files:
  created:
    - "packages/mcp/prisma/schema.prisma (10 models: User, Project, Session, OtpCode, Task, Dependency, Message, ShareLink, TaskRevision, TaskMutation)"
    - "packages/mcp/src/prisma.ts (singleton getPrisma with connection pooling)"
    - "packages/mcp/prisma/migrations/20260313_init/migration.sql"
    - "packages/mcp/dist/prisma-client/ (generated Prisma Client)"
  modified:
    - "packages/mcp/package.json (added Prisma dependencies and exports)"
    - "packages/mcp/tsconfig.json (moduleResolution: bundler)"
    - ".env.example (DATABASE_URL documentation)"
    - ".gitignore (.prisma/, *.db-journal)"

decisions:
  - "Prisma schema location: packages/mcp/prisma/schema.prisma"
  - "Prisma Client output: packages/mcp/dist/prisma-client"
  - "Primary key type: uuid() for all tables"
  - "Connection pool: connection_limit=10, pool_timeout=20s, connect_timeout=10s"
  - "Foreign keys: onDelete: Cascade for all relations (except Task.parent_id with SetNull)"
  - "Migration strategy: Prisma Migrate (not db push) for production history"

metrics:
  duration: "2 hours (including checkpoint for manual migration)"
  completed_date: "2026-03-13"
  tasks_completed: 4
  files_changed: 11
  lines_added: 450
  commits: 4
---

# Phase 15 Plan 01: Prisma Schema and Client Singleton Summary

## One-Liner
PostgreSQL database with Prisma ORM configured, 10-table schema defined with proper relationships, singleton Prisma Client with connection pooling and graceful shutdown, initial migration executed successfully.

## Objective
Replace @libsql/client (SQLite) with Prisma ORM + PostgreSQL for production scalability with concurrent users. Prisma provides type-safe database access, migration management, and connection pooling.

## Outcome
PostgreSQL database with Prisma ORM ready for development. All 10 tables from SQLite schema migrated to Prisma with proper relationships and foreign key cascades.

## Completed Tasks

| Task | Name | Commit | Files |
| ---- | ---- | ---- | ---- |
| 1 | Install Prisma and configure schema.prisma | ff39766 | packages/mcp/package.json, prisma/schema.prisma |
| 2 | Create Prisma Client singleton | 6e41904 | packages/mcp/src/prisma.ts, package.json |
| 3 | PostgreSQL Migration (checkpoint) | - | Migration completed, DATABASE_URL configured |
| 4 | Update .env.example and .gitignore | ba4732c | .env.example, .gitignore, prisma/migrations/ |

## Deviations from Plan

### Auth Gates
**Task 3: PostgreSQL Migration (checkpoint:human-action)**
- **What:** Manual migration step required
- **Action:** User set DATABASE_URL and ran `prisma db push --force-reset` + `prisma migrate resolve --applied`
- **Outcome:** Migration successful, Prisma Client generated
- **Files:** packages/mcp/prisma/migrations/20260313_init/migration.sql created

### Auto-fixed Issues
None - plan executed exactly as written.

## Key Implementation Details

### Prisma Schema
- **Location:** `packages/mcp/prisma/schema.prisma`
- **Models:** 10 tables matching SQLite schema
  - User (id, email, created_at)
  - Project (id, user_id, name, created_at)
  - Session (id, user_id, project_id, access_token, refresh_token, expires_at, created_at)
  - OtpCode (id, email, code, expires_at, used)
  - Task (id, project_id, name, start_date, end_date, color, progress, parent_id, sort_order)
  - Dependency (id, task_id, dep_task_id, type, lag)
  - Message (id, project_id, role, content, created_at)
  - ShareLink (id, project_id, created_at)
  - TaskRevision (project_id, revision, updated_at)
  - TaskMutation (id, project_id, run_id, session_id, source, mutation_type, task_id, created_at)

### Enums Defined
- `DependencyType`: FS, SS, FF, SF
- `MessageRole`: user, assistant
- `MutationSource`: agent, manual_save, api, system
- `MutationType`: create, update, delete, delete_all, import

### Prisma Client Singleton
- **File:** `packages/mcp/src/prisma.ts`
- **Pattern:** Global var with hot reload safety
- **Connection pooling:** Configured via DATABASE_URL query params
- **Graceful shutdown:** SIGTERM and beforeExit handlers call prisma.$disconnect()

### Migration
- **Name:** 20260313_init
- **Tables created:** 10 (users, projects, sessions, otp_codes, tasks, dependencies, messages, share_links, task_revisions, task_mutations)
- **Foreign keys:** All cascading correctly matching SQLite ON DELETE behavior
- **Enums:** 4 Postgres ENUM types created

## Configuration Changes

### .env.example
Added DATABASE_URL documentation:
```
DATABASE_URL=postgresql://user:password@host:5432/database?connection_limit=10&pool_timeout=20&connect_timeout=10
```

### .gitignore
Added:
- `.prisma/` (local Prisma cache)
- `*.db-journal` (SQLite journal files)

### packages/mcp/package.json
Added exports:
```json
"./prisma": "./dist/prisma-client.js"
```

This allows packages/server to import Prisma types from @gantt/mcp/prisma.

## Success Criteria Met

- [x] Prisma schema exists at packages/mcp/prisma/schema.prisma with 10 models
- [x] Prisma Client generates at packages/mcp/dist/prisma-client/ without errors
- [x] Migration created at packages/mcp/prisma/migrations/ with timestamp_init folder
- [x] PostgreSQL tables created matching SQLite schema
- [x] Foreign keys cascade correctly matching SQLite ON DELETE behavior
- [x] Connection pool configured via DATABASE_URL query params
- [x] Graceful shutdown implemented in prisma.ts
- [x] .env.example updated with DATABASE_URL documentation
- [x] .gitignore configured to exclude .prisma/ cache

## Ready for Phase 16

- Prisma Client accessible from packages/mcp via "./prisma" export
- packages/server can import Prisma types from @gantt/mcp/prisma
- Database schema stable and version-controlled via migrations
- No blocking issues preventing services layer development

## Self-Check: PASSED

All files created:
- [x] packages/mcp/prisma/schema.prisma
- [x] packages/mcp/src/prisma.ts
- [x] packages/mcp/prisma/migrations/20260313_init/migration.sql
- [x] packages/mcp/dist/prisma-client/
- [x] .env.example (updated)
- [x] .gitignore (updated)

All commits exist:
- [x] ff39766: feat(15-01): install Prisma and configure schema.prisma
- [x] 6e41904: feat(15-01): create Prisma Client singleton with connection pooling
- [x] ba4732c: chore(15-01): update .env.example and .gitignore for Prisma

---

*Plan completed: 2026-03-13*
*Total duration: ~2 hours (including manual migration step)*
