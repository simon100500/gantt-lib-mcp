# gantt-lib MCP Server

## What This Is

Полноценный веб-редактор диаграмм Ганта с AI-ассистентом. MCP-сервер на TypeScript для программного управления задачами, React UI с интерактивным редактированием и WebSocket real-time sync. Деплой в один контейнер на CapRover с PostgreSQL персистентностью.

## Core Value

AI может программно управлять диаграммами Ганта: создавать задачи, устанавливать зависимости и автоматически пересчитывать сроки при изменениях. Пользователи могут редактировать диаграмму интерактивно (drag-to-edit) или через AI-чат.

## Current State (v4.0 In Progress)

**Status:** ✅ v3.0 Shipped (2026-03-22) | 🚀 v4.0 Phase 1/4 Complete

**Tech Stack:**
- Monorepo (npm workspaces): packages/mcp, packages/server, packages/web, packages/site
- MCP Server: @modelcontextprotocol/sdk with stdio transport
- Web Server: Fastify + WebSocket + Prisma + PostgreSQL
- Frontend: React + Vite + Zustand + gantt-lib (drag-to-edit Gantt chart)
- Marketing Site: Astro 5.0 + React + Tailwind
- Auth: OTP email + JWT tokens
- Deployment: Docker multi-stage build + Nginx + CapRover

**Features Shipped (v3.0):**
- ✅ MCP tool API (create_task, update_task, delete_task, batch_create)
- ✅ Auto-schedule engine with FS/SS/FF/SF dependencies
- ✅ AI chat interface with streaming responses
- ✅ Interactive drag-to-edit Gantt chart
- ✅ Multi-user project isolation
- ✅ OTP email authentication
- ✅ Real-time WebSocket sync
- ✅ PostgreSQL + Prisma ORM with connection pooling
- ✅ Production Docker deployment
- ✅ Token economy (compact mode, pagination)
- ✅ Agent hardening (max turns, timeout, tool restrictions)
- ✅ Task hierarchy (parentId support)
- ✅ Conversation history (cross-session context)
- ✅ Tool quality (semantic descriptions, actionable errors)
- ✅ Zustand state management
- ✅ Task filtering UI

**Features Shipped (v4.0 Phase 24):**
- ✅ Astro 5.0 marketing site foundation
- ✅ Header, Footer, Layout with responsive navigation
- ✅ Hero section with rotating words, typewriter demo, gantt preview
- ✅ Custom 404 page

**Known Gaps:**
- Phase 9 Plan 6: Auth UI (OTP modal, project switcher) — backend complete, UI pending
- Phase 24 HERO-03: Social proof section — deferred to Phase 26 per D-04

---

## Next Milestone Goals

**Use `/gsd:new-milestone` to define the next milestone**

---

## Current Milestone: v4.0 Astro Landing

**Goal:** Разделить marketing и app — создать Astro сайт на getgantt.ru, оставить редактор на ai.getgantt.ru

**Target features:**
- packages/site — Astro для marketing/SEO
- Информационная архитектура: /, /templates, /features, /faq, /privacy, /terms
- SEO-фундамент: sitemap, robots, OG, canonical, schema.org
- Раздельный деплой: site отдельно от web+server+mcp
- Домены: getgantt.ru → site, ai.getgantt.ru → app

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

### Active (v4.0 Astro Landing)

*Requirements will be defined in REQUIREMENTS.md*

### Out of Scope (v4.0)

| Feature | Reason |
|---------|--------|
| Редактор в Astro | Editor остается в packages/web на ai.getgantt.ru |
| Share pages на getgantt.ru | Share остается на ai.getgantt.ru |
| Auth UI переделка | Не трогаем auth в этом milestone |
| Backend изменения | Fastify остаётся как есть |

### Out of Scope

| Feature | Reason |
|---------|--------|
| Визуализация диаграммы (MCP-only) | Реализована через Web UI |
| In-memory хранение | PostgreSQL persistence implemented |
| Экспорт в PDF/PNG | Deferred to future milestone |
| Mobile app | Web-first approach, PWA works well |

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

**Deployment:**
- Docker multi-stage build
- Nginx reverse proxy
- CapRover one-click deployment
- External PostgreSQL database (recommended)

## Constraints

- **Типизация:** Использовать типы из gantt-lib для совместимости (Task, TaskDependency)
- **Хранение:** PostgreSQL для production scaling
- **Язык:** TypeScript для соответствия gantt-lib экосистеме
- **Деплой:** Docker контейнер на CapRover с внешней PostgreSQL базой данных
- **State Management:** Zustand для всех frontend state (v3.0+)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| TypeScript вместо Python | gantt-lib написана на TS — естественная совместимость типов | ✓ Good |
| npm workspaces вместо lerna/turborepo | 3 packages — достаточно простого workspace | ✓ Good |
| Fastify + WebSocket вместо Express | Native WebSocket support, better performance | ✓ Good |
| PostgreSQL для production | Несколько контейнеров + concurrent users — SQLite bottleneck | ✓ Complete (v2.0) |
| gantt-lib вместо dhtmlx-gantt | TypeScript-first, lighter, better React integration | ✓ Good |
| Multi-stage Docker build | Отдельные этапы сборки для web и server | ✓ Good |
| OTP email вместо OAuth | Проще для internal tool, нет External dependencies | ✓ Good |
| 127.0.0.1 вместо localhost в nginx | Alpine IPv6 DNS gotcha — localhost резолвится в ::1 | ✓ Good |
| Compact mode по умолчанию | Экономия токенов для больших проектов — 50-90% reduction | ✓ Good (v3.0) |
| Max 20 ходов агента + 2min timeout | Предотвращает infinite loops и hangs | ✓ Good (v3.0) |
| parentId вместо nested task API | Проще, использует существующую структуру БД | ✓ Good (v3.0) |
| Zustand для frontend state | Единый source of truth вместо scattered state | ✓ Good (v3.0) |
| Astro для marketing site | Разделение marketing/app — независимый деплой, SEO | TBD (v4.0) |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-03-23 after v4.0 milestone start*
