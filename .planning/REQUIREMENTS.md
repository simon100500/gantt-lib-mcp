# Requirements: gantt-lib MCP Server

**Defined:** 2026-03-13
**Core Value:** AI может программно управлять диаграммами Ганта: создавать задачи, устанавливать зависимости и автоматически пересчитывать сроки при изменениях.

**Milestone:** v2.0 — PostgreSQL Migration with Prisma

---

## v2.0 Requirements

PostgreSQL migration with Prisma ORM. Fresh database start (no data migration from SQLite).

### Database (DB)

- [ ] **DB-01**: Prisma schema defined for all existing tables (users, projects, sessions, otp_codes, tasks, dependencies, messages)
- [ ] **DB-02**: Prisma client generated and accessible from packages/mcp and packages/server
- [ ] **DB-03**: DATABASE_URL configured for PostgreSQL connection pooling
- [ ] **DB-04**: Prisma migrations run successfully on target database
- [ ] **DB-05**: Foreign key constraints match current SQLite schema

### Services (SVC)

- [ ] **SVC-01**: TaskService replaces TaskStore (create, update, delete, list, recalculateDates)
- [ ] **SVC-02**: ProjectService replaces raw project queries (create, get, update, delete)
- [ ] **SVC-03**: AuthService replaces auth-store (OTP, sessions, JWT validation)
- [ ] **SVC-04**: MessageService replaces raw message queries
- [ ] **SVC-05**: DependencyService for task dependency CRUD
- [ ] **SVC-06**: All services use Prisma client (no raw SQL)
- [ ] **SVC-07**: Services are shared between packages/mcp and packages/server

### Connection Pooling (POOL)

- [ ] **POOL-01**: Prisma connection pool configured (connection_limit)
- [ ] **POOL-02**: Timeout settings for database connections
- [ ] **POOL-03**: Proper handling of connection lifecycle (dispose on shutdown)

### Integration (INT)

- [ ] **INT-01**: MCP tools use TaskService instead of TaskStore
- [ ] **INT-02**: Server API routes use services instead of direct SQL
- [ ] **INT-03**: Agent runs with Prisma-backed task operations
- [ ] **INT-04**: WebSocket broadcasts work with new services
- [ ] **INT-05**: Auto-schedule engine works with Prisma data

### Cleanup (CLN)

- [ ] **CLN-01**: Remove @libsql/client dependency
- [ ] **CLN-02**: Remove SQLite bootstrap code (packages/mcp/src/db.ts)
- [ ] **CLN-03**: Remove raw SQL queries scattered across codebase
- [ ] **CLN-04**: Update TypeScript types to match Prisma-generated types

### Deployment (DEP)

- [ ] **DEP-01**: Docker image includes Prisma client
- [ ] **DEP-02**: DATABASE_URL environment variable documented
- [ ] **DEP-03**: Prisma migrations run on container startup if needed
- [ ] **DEP-04**: Connection pool size appropriate for container limits

---

## v1.0 Features (Validated — Keep Working)

These features shipped in v1.0 and must continue working after PostgreSQL migration:

- ✓ MCP tool API (create_task, update_task, delete_task, batch_create)
- ✓ Auto-schedule engine with FS/SS/FF/SF dependencies
- ✓ AI chat interface with streaming responses
- ✓ Interactive drag-to-edit Gantt chart
- ✓ Multi-user project isolation
- ✓ OTP email authentication
- ✓ Real-time WebSocket sync
- ✓ Production Docker deployment

---

## Out of Scope

| Feature | Reason |
|---------|--------|
| Multiple chats per project | Keep current structure (messages → project) |
| Soft delete | Not required for v2.0, simple delete sufficient |
| Task change events | Operational telemetry, defer to future |
| Data migration from SQLite | Fresh start per user decision |
| Audit/replay history | Not required for current functionality |
| Undo/redo | Feature enhancement, not part of DB migration |

---

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DB-01 through DB-05 | Phase 15 | Pending |
| SVC-01 through SVC-07 | Phase 16 | Pending |
| POOL-01 through POOL-03 | Phase 15 | Pending |
| INT-01 through INT-05 | Phase 17 | Pending |
| CLN-01 through CLN-04 | Phase 17 | Pending |
| DEP-01 through DEP-04 | Phase 18 | Pending |

**Coverage:**
- v2.0 requirements: 23 total
- Mapped to phases: 23
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-13*
*Last updated: 2026-03-13 after initial definition*
