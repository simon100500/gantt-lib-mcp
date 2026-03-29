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

**Archived:**
- [.planning/milestones/v1.0-ROADMAP.md](.planning/milestones/v1.0-ROADMAP.md)
- [.planning/milestones/v1.0-REQUIREMENTS.md](.planning/milestones/v1.0-REQUIREMENTS.md)

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

**Known gaps:** None

**Archived:**
- [.planning/milestones/v2.0-ROADMAP.md](.planning/milestones/v2.0-ROADMAP.md)
- [.planning/milestones/v2.0-REQUIREMENTS.md](.planning/milestones/v2.0-REQUIREMENTS.md)

---

## v3.0 Hardening (Shipped: 2026-03-22)

**Phases:** 17-23 | **Plans:** 13 | **Timeline:** 9 days (2026-03-13 → 2026-03-22)

**Git range:** 8a00c5a (token economy) → fb7594e (filters)

**Stats:**
- Commits: 112
- Files changed: 143 TypeScript files
- Lines added: ~28,500

**Key accomplishments:**
1. **Token Economy** — Compact mode for get_tasks, pagination, conversation history limit — 50-90% token reduction
2. **Agent Hardening** — Max 20 turns, 2-min timeout, tool restrictions preventing hangs and infinite loops
3. **Task Hierarchy** — parentId support in MCP tools for nested task structures
4. **Conversation History** — get_conversation_history + add_message for cross-session context
5. **Tool Quality** — Semantic descriptions and actionable error messages across all MCP tools
6. **Zustand Refactor** — Unified frontend state management replacing scattered local state
7. **Task Filtering UI** — Interactive filters for managing large project views

**Known gaps:** None

**Archived:**
- [.planning/milestones/v3.0-ROADMAP.md](.planning/milestones/v3.0-ROADMAP.md)
- [.planning/milestones/v3.0-REQUIREMENTS.md](.planning/milestones/v3.0-REQUIREMENTS.md)

---

## v4.0 Astro Landing (Shipped: 2026-03-29)

**Phases:** 24-29 | **Plans:** 13 | **Timeline:** 6 days (2026-03-23 → 2026-03-29)

**Git range:** 6e6903d (Astro workspace init) → 3d95732 (PROJECT.md evolution)

**Stats:**
- Commits: 173
- Files changed: 156
- Lines: +21,265 / -25,244

**Key accomplishments:**
1. **Astro Marketing Site** — Astro 5.0 + React + Tailwind site with hero, header, footer, responsive navigation, and custom 404
2. **Interactive Gantt Preview** — Live gantt-lib demo with drag-to-edit, collapse/expand, hierarchical tasks, and CRUD handlers
3. **Content + SEO** — Features, FAQ, Pricing, Privacy, Terms pages with sitemap.xml, robots.txt, and OG metadata
4. **Domain Separation** — Multi-domain deployment: getgantt.ru (marketing) + ai.getgantt.ru (app) with CORS headers
5. **YooKassa Billing** — Subscription management, embedded payment widget, AI generation limits, read-only enforcement
6. **Paywall CRO** — LimitReachedModal feature gate, savings badges, upsell flows in billing pages

**Known gaps:**
- Phase 25 plans unchecked in ROADMAP (executed but not marked)
- Phase 27 had no formal plans (completed via config/infra changes)

**Archived:**
- [.planning/milestones/v4.0-ROADMAP.md](.planning/milestones/v4.0-ROADMAP.md)
- [.planning/milestones/v4.0-REQUIREMENTS.md](.planning/milestones/v4.0-REQUIREMENTS.md)

---
