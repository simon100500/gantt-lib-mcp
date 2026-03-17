# ROADMAP: gantt-lib MCP Server

**Created:** 2026-02-23
**Current milestone:** None — planning next milestone

## Milestones

- ✅ **v1.0 MVP** — Phases 1-14 (shipped 2026-03-13)
- ✅ **v2.0 PostgreSQL Migration** — Phases 15-16 (shipped 2026-03-17)

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
| 16. Services Layer | v2.0 | 4 | Complete | 2026-03-13 | 16-01 through 16-04 |

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

<details>
<summary>✅ v2.0 PostgreSQL Migration (Phases 15-16) — SHIPPED 2026-03-17</summary>

**2 phases, 6 plans, 4 days**

Complete archive: [.planning/milestones/v2.0-ROADMAP.md](.planning/milestones/v2.0-ROADMAP.md)

**Milestone Goal:** Replace SQLite with PostgreSQL + Prisma ORM for production scalability.

- [x] Phase 15: Prisma Setup (2 plans)
- [x] Phase 16: Services Layer (4 plans)

**Key accomplishments:**
1. Prisma schema defines all tables with proper relationships
2. Prisma client singleton with connection pooling
3. TaskService, ProjectService, AuthService, MessageService, DependencyService
4. All services use Prisma (no raw SQL)
5. Services shared between packages/mcp and packages/server

</details>

---

## Dependencies

```
Phase 15 (Prisma Setup)
    ↓
Phase 16 (Services Layer)
```

---

## Coverage

**v1 Requirements:** 17 total — 100% complete
**v2 Requirements:** 15 total — 100% complete

| Category | Requirements | Phase |
|----------|--------------|-------|
| Database (DB) | DB-01 through DB-05 | 15 |
| Connection Pooling (POOL) | POOL-01 through POOL-03 | 15 |
| Services (SVC) | SVC-01 through SVC-07 | 16 |

**All requirements complete.**

---
*Roadmap created: 2026-02-23*
*Last updated: 2026-03-17 — v2.0 shipped*
