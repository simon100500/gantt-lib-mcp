# Milestones

## v1.0 MVP (Shipped: 2026-03-13)

**Phases:** 1-14 | **Plans:** 26 | **Timeline:** 18 days (2026-02-23 → 2026-03-12)

**Git range:** bd7e0a0 (MCP server foundation) → 24f1c5c (reassess-roadmap)

**Stats:**
- Commits: 178
- Files changed: 258
- Lines added: 42,493
- Total LOC: ~116,000 (TypeScript/JavaScript)

**Key accomplishments:**
1. **MCP Server Foundation** — TypeScript server with stdio transport and @modelcontextprotocol/sdk for Claude Code CLI integration
2. **Task CRUD + Auto-schedule** — Full task management with cascading date recalculation, FS/SS/FF/SF dependencies, cycle detection
3. **Web UI with AI Chat** — React + Fastify + WebSocket monorepo with real-time Gantt editing and AI-driven task creation
4. **gantt-lib Integration** — Interactive drag-to-edit with functional updater pattern and WebSocket sync
5. **Multi-user Auth** — OTP email authentication, JWT tokens, project-scoped data isolation with SQLite
6. **Production Deployment** — Docker multi-stage build with Nginx reverse proxy and CapRover one-click deployment

**Known gaps:**
- Phase 9 Plan 6 (Auth UI) — OTP modal and project switcher not implemented (backend auth complete, UI pending)

---

## v2.0 PostgreSQL Migration (Shipped: 2026-03-17)

**Phases:** 15-16 | **Plans:** 6 | **Timeline:** 4 days (2026-03-13 → 2026-03-17)

**Git range:** ff39766 (Prisma schema) → 8ecdc71 (task save refactor)

**Stats:**
- Commits: 64
- Files changed: 80 TypeScript files
- Lines added: ~32,870
- Database: PostgreSQL + Prisma ORM (10 tables)

**Key accomplishments:**
1. **Prisma ORM + PostgreSQL** — 10-table schema with proper relationships, foreign key cascades, and connection pooling
2. **Prisma Client Singleton** — Hot-reload safe with graceful shutdown, accessible from both packages/mcp and packages/server
3. **Migration System** — Prisma Migrate for schema version control and production deployments (20260313_init)
4. **Services Layer** — TaskService, ProjectService, AuthService, MessageService, DependencyService all using Prisma
5. **Shared Services** — No duplicate database code between packages/mcp and packages/server
6. **Type-Safe Access** — Generated TypeScript types from Prisma schema throughout codebase

**Archived:**
- [.planning/milestones/v2.0-ROADMAP.md](.planning/milestones/v2.0-ROADMAP.md)
- [.planning/milestones/v2.0-REQUIREMENTS.md](.planning/milestones/v2.0-REQUIREMENTS.md)

**Known gaps:** None

---

