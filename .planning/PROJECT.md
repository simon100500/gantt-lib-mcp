# gantt-lib MCP Server

## What This Is

Полноценный веб-редактор диаграмм Ганта с AI-ассистентом. MCP-сервер на TypeScript для программного управления задачами, React UI с интерактивным редактированием и WebSocket real-time sync. Деплой в один контейнер на CapRover с PostgreSQL персистентностью.

## Core Value

AI может программно управлять диаграммами Ганта: создавать задачи, устанавливать зависимости и автоматически пересчитывать сроки при изменениях. Пользователи могут редактировать диаграмму интерактивно (drag-to-edit) или через AI-чат.

## Current Milestone: v5.0 Plan Constraints

**Goal:** Внедрить масштабируемую систему enforcement лимитов по тарифам — backend guards + frontend UX + upsell flow

**Target features:**
- Constraint engine (centralized, configurable, extensible)
- Backend enforcement на MCP tools и API endpoints
- Frontend proactive checks (disable buttons, show limits, usage counters)
- AI query tracking (daily reset для paid, lifetime counter для free)
- Project count limits (create block + upsell modal)
- Feature gates (archive, resource pool, export — готовность к будущим фазам)
- Usage dashboard/indicators (сколько использовано/осталось)

---

## Current State (Phase 30 Complete)

**Status:** ✅ Phase 30 Constraint Engine verified passed (2026-04-03)

**Tech Stack:**
- Monorepo (npm workspaces): packages/mcp, packages/server, packages/web, packages/site
- MCP Server: @modelcontextprotocol/sdk with stdio transport
- Web Server: Fastify + WebSocket + Prisma + PostgreSQL
- Frontend: React + Vite + Zustand + gantt-lib (drag-to-edit Gantt chart)
- Marketing Site: Astro 5.0 + React + Tailwind
- Auth: OTP email + JWT tokens
- Billing: YooKassa embedded widget
- Deployment: Docker multi-stage build + Nginx + CapRover

**Features Shipped (v1.0 MVP):**
- ✅ MCP tool API (create_task, update_task, delete_task, batch_create)
- ✅ Auto-schedule engine with FS/SS/FF/SF dependencies
- ✅ AI chat interface with streaming responses
- ✅ Interactive drag-to-edit Gantt chart
- ✅ Multi-user project isolation
- ✅ OTP email authentication
- ✅ Real-time WebSocket sync
- ✅ Production Docker deployment

**Features Shipped (v2.0 PostgreSQL):**
- ✅ PostgreSQL + Prisma ORM with connection pooling
- ✅ 10-table schema with proper relationships and cascades
- ✅ Prisma Client Singleton (hot-reload safe)
- ✅ Shared services layer (TaskService, ProjectService, AuthService, etc.)

**Features Shipped (v3.0 Hardening):**
- ✅ Token economy (compact mode, pagination, history limit)
- ✅ Agent hardening (max turns, timeout, tool restrictions)
- ✅ Task hierarchy (parentId support)
- ✅ Conversation history (cross-session context)
- ✅ Tool quality (semantic descriptions, actionable errors)
- ✅ Zustand state management
- ✅ Task filtering UI

**Features Shipped (v4.0 Astro Landing):**
- ✅ Astro 5.0 marketing site (getgantt.ru)
- ✅ Header, Footer, Layout with responsive navigation
- ✅ Hero section with rotating words, typewriter demo, gantt preview
- ✅ Custom 404 page
- ✅ Features, FAQ, Pricing, Privacy, Terms pages
- ✅ SEO: sitemap.xml, robots.txt, OG metadata
- ✅ Domain separation: getgantt.ru + ai.getgantt.ru
- ✅ Interactive gantt preview with drag-to-edit demo
- ✅ YooKassa billing, subscription management, plan enforcement
- ✅ Paywall CRO: feature gate modal, savings badges, social proof

**Features Shipped (Phase 35 Scheduling Core Adoption):**
- ✅ Headless scheduling core aligned with current gantt-lib behavior
- ✅ MCP schedule command surface (`move_task`, `resize_task`, `recalculate_schedule`)
- ✅ Authoritative changed-set persistence from TaskService/server APIs
- ✅ Agent verification that rejects partial or stale changed-task results
- ✅ Web save flow that applies server-returned changed tasks for linked edits

**Features Shipped (Phase 30 Constraint Engine):**
- ✅ Shared canonical constraint catalog in `@gantt/mcp/constraints`
- ✅ Prisma `UsageCounter` persistence with lifetime/day bucket semantics
- ✅ `ConstraintService` normalized checks for tracked, unlimited, and not-applicable limits
- ✅ Billing subscription payload with canonical `limits`, `usage`, and `remaining`
- ✅ Current billing UI consumers render explicit unlimited states without `-1`

**Known Gaps:**
- Phase 9 Plan 6: Auth UI (OTP modal, project switcher) — backend complete, UI pending

---

## Next Milestone Goals

**v5.0 Plan Constraints** — в разработке
Phase 30 is complete: the canonical constraint engine, shared tariff catalog, and normalized billing payload are in place. Next up is Phase 31 (Usage Tracking) to expose broader usage APIs and counters across enforcement surfaces.

---

## Requirements

### Validated (v1.0)

- ✓ MCP-01, MCP-02, MCP-03 — MCP server with stdio transport — v1.0
- ✓ TASK-01 through TASK-06 — Task CRUD operations — v1.0
- ✓ DATA-01, DATA-02, DATA-03 — gantt-lib compatible types — v1.0
- ✓ SCHED-01, SCHED-02, SCHED-03, SCHED-04 — Auto-schedule engine — v1.0
- ✓ TEST-01, TEST-02 — Claude Code CLI integration — v1.0
- ✓ WEB-01 through WEB-06 — Web UI with real-time editing — v1.0
- ✓ WEB-GANTT-01, WEB-GANTT-02, WEB-GANTT-03 — gantt-lib integration — v1.0
- ✓ SESSION-* — Multi-user auth and project isolation — v1.0

### Validated (v2.0)

- ✓ DB-01 through DB-05 — Prisma schema and migrations — v2.0
- ✓ SVC-01 through SVC-07 — Prisma services layer — v2.0
- ✓ POOL-01 through POOL-03 — Connection pooling — v2.0

### Validated (v3.0)

- ✓ TOKEN-01 through TOKEN-04 — Token Economy (compact mode, pagination, history limit) — v3.0
- ✓ HARD-01 through HARD-03 — Qwen SDK Hardening (max turns, timeout, tool restrictions) — v3.0
- ✓ HIER-01 through HIER-03 — Task Hierarchy (parentId in MCP tools) — v3.0
- ✓ HIST-01 through HIST-02 — Conversation History (get_conversation_history, add_message) — v3.0
- ✓ QUAL-01 through QUAL-02 — Tool Quality (descriptions, error messages) — v3.0
- ✓ WEB-ZUSTAND-01 through WEB-ZUSTAND-07 — Zustand Frontend Refactor — v3.0
- ✓ FILTER-01 through FILTER-04 — Task Filtering UI — v3.0

### Validated (v4.0)

- ✓ SITE-01 through SITE-05 — Astro site foundation — v4.0
- ✓ HERO-01, HERO-02, HERO-04, HERO-05 — Hero & Conversion — v4.0
- ✓ INTER-01 through INTER-05 — Interactive Gantt Preview — v4.0
- ✓ CONTENT-01 through CONTENT-07 — Content & SEO — v4.0
- ✓ DEPLOY-01 through DEPLOY-05 — Domain Separation — v4.0
- ✓ BILL-DB, BILL-BACKEND, BILL-YOOKASSA, BILL-ENFORCE, BILL-UI, BILL-CTA, BILL-NAV — Billing — v4.0

### Out of Scope

| Feature | Reason |
|---------|--------|
| Auth UI (OTP modal, project switcher) | Backend complete, UI deferred |
| Редактор в Astro | Editor остается в packages/web на ai.getgantt.ru |
| Blog | Требует ongoing контент |
| Multi-language | Russian-first, расширение позже |
| Export to PDF/PNG | Deferred to future milestone |

## Context

**Исходная библиотека:** [gantt-lib](https://github.com/simon100500/gantt-lib) — React-компонент для диаграмм Ганта

**Architecture:**
- Monorepo with npm workspaces
- MCP server exposes tools for AI agents
- Fastify server serves REST API + WebSocket
- React app consumes API + WebSocket
- PostgreSQL + Prisma ORM for data persistence
- Service layer for database operations
- Zustand for frontend state management
- OTP email + JWT for authentication
- Astro marketing site (getgantt.ru) separate from app (ai.getgantt.ru)

**Deployment:**
- getgantt.ru → packages/site (Astro static, Nginx)
- ai.getgantt.ru → packages/web + packages/server (React + Fastify + Nginx)
- Docker multi-stage build, CapRover one-click deployment
- External PostgreSQL database

## Constraints

- **Типизация:** Использовать типы из gantt-lib для совместимости (Task, TaskDependency)
- **Хранение:** PostgreSQL для production scaling
- **Язык:** TypeScript для соответствия gantt-lib экосистеме
- **Деплой:** Docker контейнер на CapRover с внешней PostgreSQL базой данных
- **State Management:** Zustand для всех frontend state

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| TypeScript вместо Python | gantt-lib написана на TS — естественная совместимость типов | ✓ Good |
| npm workspaces вместо lerna/turborepo | 3 packages — достаточно простого workspace | ✓ Good |
| Fastify + WebSocket вместо Express | Native WebSocket support, better performance | ✓ Good |
| PostgreSQL для production | Несколько контейнеров + concurrent users — SQLite bottleneck | ✓ Good |
| gantt-lib вместо dhtmlx-gantt | TypeScript-first, lighter, better React integration | ✓ Good |
| Multi-stage Docker build | Отдельные этапы сборки для web и server | ✓ Good |
| OTP email вместо OAuth | Проще для internal tool, нет External dependencies | ✓ Good |
| 127.0.0.1 вместо localhost в nginx | Alpine IPv6 DNS gotcha — localhost резолвится в ::1 | ✓ Good |
| Compact mode по умолчанию | Экономия токенов для больших проектов — 50-90% reduction | ✓ Good (v3.0) |
| Max 20 ходов агента + 2min timeout | Предотвращает infinite loops и hangs | ✓ Good (v3.0) |
| parentId вместо nested task API | Проще, использует существующую структуру БД | ✓ Good (v3.0) |
| Zustand для frontend state | Единый source of truth вместо scattered state | ✓ Good (v3.0) |
| Astro для marketing site | Разделение marketing/app — независимый деплой, SEO | ✓ Good (v4.0) |
| YooKassa для billing | Российский платежный шлюз, embedded widget | ✓ Good (v4.0) |
| Feature gate modal | CRO: показываем limits modal вместо скрытого ограничения | ✓ Good (v4.0) |
| Server-authoritative scheduling changed sets | Агент и web должны применять полный server cascade, а не локальные догадки | ✓ Good (Phase 35) |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-03 — phase 30 completed and PROJECT state evolved*
