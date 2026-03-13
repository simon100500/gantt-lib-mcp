# ROADMAP: gantt-lib MCP Server

**Created:** 2026-02-23
**Current milestone:** v2.0 PostgreSQL Migration
**Phase range:** 15-18

## Milestones

- ✅ **v1.0 MVP** — Phases 1-14 (shipped 2026-03-13)
- 🚧 **v2.0 PostgreSQL Migration** — Phases 15-18 (in progress)

## Progress

| Phase | Milestone | Plans | Status | Completed |
|-------|-----------|-------|--------|-----------|
| 1. MCP Server Foundation | v1.0 | 1 | Complete | 01-01 |
| 2. Task CRUD + Data Model | v1.0 | 1 | Complete | 02-01 |
| 3. Auto-schedule Engine | v1.0 | 2 | Complete | 03-01, 03-02 |
| 4. Testing & Validation | v1.0 | 0 | Complete | - |
| 5. Batch Tasks | v1.0 | 1 | Complete | 05-01 |
| 6. qwen-agent | v1.0 | 2 | Complete | 06-01, 06-02 |
| 7. Web UI | v1.0 | 6 | Complete | 07-01 through 07-06 |
| 8. Integrate gantt-lib | v1.0 | 2 | Complete | 08-01, 08-02 |
| 9. session-control | v1.0 | 6 | Complete* | 09-01 through 09-05 (* 09-06 pending) |
| 10. work-stability | v1.0 | 2 | Complete | 10-01, 10-02 |
| 11. complete-design-system | v1.0 | 0 | Complete | - |
| 12. fix-auto-save-infinite-loop | v1.0 | 1 | Complete | 12-01 |
| 13. start-screen | v1.0 | 1 | Complete | 13-01 |
| 14. redesign-project-flow | v1.0 | 1 | Complete | 14-01 |
| 15. Prisma Setup | v2.0 | 2 | Complete | 2026-03-13 | 15-01, 15-02 |
| 16. Services Layer | v2.0 | 4 | Not started | - |
| 17. Integration & Cleanup | v2.0 | 0 | Not started | - |
| 18. Deployment | v2.0 | 0 | Not started | - |

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-14) — SHIPPED 2026-03-13</summary>

**14 phases, 26 plans, 18 days**

Complete archive: [.planning/milestones/v1.0-ROADMAP.md](.planning/milestones/v1.0-ROADMAP.md)

- [x] Phase 1: MCP Server Foundation (1 plan)
- [x] Phase 2: Task CRUD + Data Model (1 plan)
- [x] Phase 3: Auto-schedule Engine (2 plans)
- [x] Phase 4: Testing & Validation (0 plans)
- [x] Phase 5: Batch Tasks (1 plan)
- [x] Phase 6: qwen-agent (2 plans)
- [x] Phase 7: Web UI with real-time Gantt editing (6 plans)
- [x] Phase 8: Integrate gantt-lib library (2 plans)
- [x] Phase 9: session-control (6 plans, 09-06 Auth UI pending)
- [x] Phase 10: work-stability (2 plans)
- [x] Phase 11: complete-design-system (0 plans)
- [x] Phase 12: fix-auto-save-infinite-loop (1 plan)
- [x] Phase 13: start-screen (1 plan)
- [x] Phase 14: redesign-project-flow (1 plan)

**Key accomplishments:**
1. MCP server with stdio transport and auto-schedule engine
2. Full-stack web app with AI chat and interactive Gantt chart
3. Multi-user auth with OTP email and project isolation
4. Production Docker deployment with CapRover

**Known gaps:**
- Phase 9 Plan 6: Auth UI (OTP modal, project switcher) — backend complete, UI pending

</details>

---

### 🚧 v2.0 PostgreSQL Migration (In Progress)

**Milestone Goal:** Replace SQLite with PostgreSQL + Prisma ORM for production scalability with multiple concurrent users.

#### Phase 15: Prisma Setup

**Goal:** PostgreSQL database with Prisma ORM is ready for development

**Depends on:** Nothing (first phase of v2.0)

**Requirements:** DB-01, DB-02, DB-03, DB-04, DB-05, POOL-01, POOL-02, POOL-03

**Success Criteria** (what must be TRUE):
1. Prisma schema defines all existing tables (users, projects, sessions, otp_codes, tasks, dependencies, messages) with proper relationships
2. Prisma client generates successfully and is accessible from both packages/mcp and packages/server
3. DATABASE_URL environment variable connects to PostgreSQL with connection pooling configured
4. Prisma migrations run successfully on target database without errors
5. Connection pool settings (connection_limit, timeout) are appropriate for container constraints

**Plans:** 2/2 plans complete
- [x] 15-01-PLAN.md — Prisma schema and client singleton with connection pooling (completed 2026-03-13)
- [x] 15-02-PLAN.md — Initial migration execution and database verification (completed 2026-03-13)

---

#### Phase 16: Services Layer

**Goal:** All database operations use Prisma-backed services instead of direct SQL

**Depends on:** Phase 15 (Prisma client and schema must exist)

**Requirements:** SVC-01, SVC-02, SVC-03, SVC-04, SVC-05, SVC-06, SVC-07

**Success Criteria** (what must be TRUE):
1. TaskService provides all CRUD operations (create, update, delete, list, recalculateDates) using Prisma
2. ProjectService, AuthService, MessageService, and DependencyService exist and use Prisma client
3. Services are shared between packages/mcp and packages/server (no duplicate database code)
4. No raw SQL queries remain in service implementations
5. TypeScript types match Prisma-generated types

**Plans:** 4 plans
- [ ] 16-01-PLAN.md — TaskService and DependencyService with Prisma CRUD operations
- [ ] 16-02-PLAN.md — AuthService and ProjectService with Prisma CRUD operations
- [ ] 16-03-PLAN.md — MessageService and service exports (barrel, package.json)
- [ ] 16-04-PLAN.md — End-to-end verification and testing

**Wave structure:**
- Wave 1 (parallel): 16-01, 16-02
- Wave 2: 16-03 (depends on 16-01, 16-02)
- Wave 3: 16-04 (verification, depends on all previous)

---

#### Phase 17: Integration & Cleanup

**Goal:** Application runs end-to-end with Prisma services, SQLite code removed

**Depends on:** Phase 16 (services must exist before integration)

**Requirements:** INT-01, INT-02, INT-03, INT-04, INT-05, CLN-01, CLN-02, CLN-03, CLN-04

**Success Criteria** (what must be TRUE):
1. MCP tools use TaskService instead of TaskStore for all task operations
2. Server API routes use services instead of direct database access
3. Agent can create, update, and delete tasks through Prisma-backed services
4. WebSocket broadcasts work correctly with new service layer
5. Auto-schedule engine works with Prisma data (date recalculation, dependency handling)
6. @libsql/client dependency is removed from package.json
7. SQLite bootstrap code (packages/mcp/src/db.ts) is removed
8. All raw SQL queries are replaced with service calls

**Plans:** TBD

---

#### Phase 18: Deployment

**Goal:** Application deploys to production with PostgreSQL database

**Depends on:** Phase 17 (code must work before deployment)

**Requirements:** DEP-01, DEP-02, DEP-03, DEP-04

**Success Criteria** (what must be TRUE):
1. Docker image includes Prisma client and migrations
2. DATABASE_URL environment variable is documented in deployment guide
3. Prisma migrations run automatically on container startup if needed
4. Connection pool size is appropriate for container resource limits
5. Application connects to external PostgreSQL database successfully in production

**Plans:** TBD

---

## Dependencies

```
Phase 15 (Prisma Setup)
    ↓
Phase 16 (Services Layer)
    ↓
Phase 17 (Integration & Cleanup)
    ↓
Phase 18 (Deployment)
```

---

## Coverage

**v1 Requirements:** 17 total — 100% mapped (Phases 1-14)
**v2 Requirements:** 23 total — 100% mapped (Phases 15-18)

| Category | Requirements | Phase |
|----------|--------------|-------|
| Database (DB) | DB-01 through DB-05 | 15 |
| Connection Pooling (POOL) | POOL-01 through POOL-03 | 15 |
| Services (SVC) | SVC-01 through SVC-07 | 16 |
| Integration (INT) | INT-01 through INT-05 | 17 |
| Cleanup (CLN) | CLN-01 through CLN-04 | 17 |
| Deployment (DEP) | DEP-01 through DEP-04 | 18 |

**No orphaned requirements.**
**No duplicates.**

---
*Roadmap created: 2026-02-23*
*Last updated: 2026-03-13 with Phase 16 plans*
