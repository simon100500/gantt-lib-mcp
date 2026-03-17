# gantt-lib MCP Server

## What This Is

Полноценный веб-редактор диаграмм Ганта с AI-ассистентом. MCP-сервер на TypeScript для программного управления задачами, React UI с интерактивным редактированием и WebSocket real-time sync. Деплой в один контейнер на CapRover с SQLite персистентностью.

## Core Value

AI может программно управлять диаграммами Ганта: создавать задачи, устанавливать зависимости и автоматически пересчитывать сроки при изменениях. Пользователи могут редактировать диаграмму интерактивно (drag-to-edit) или через AI-чат.

## Current State (v2.0 Shipped)

**Status:** ✅ v2.0 Complete (2026-03-17)

**Tech Stack:**
- Monorepo (npm workspaces): packages/mcp, packages/server, packages/web
- MCP Server: @modelcontextprotocol/sdk with stdio transport
- Web Server: Fastify + WebSocket + Prisma + PostgreSQL
- Frontend: React + Vite + gantt-lib (drag-to-edit Gantt chart)
- Auth: OTP email + JWT tokens
- Deployment: Docker multi-stage build + Nginx + CapRover

**Features Shipped:**
- ✅ MCP tool API (create_task, update_task, delete_task, batch_create)
- ✅ Auto-schedule engine with FS/SS/FF/SF dependencies
- ✅ AI chat interface with streaming responses
- ✅ Interactive drag-to-edit Gantt chart
- ✅ Multi-user project isolation
- ✅ OTP email authentication
- ✅ Real-time WebSocket sync
- ✅ PostgreSQL + Prisma ORM with connection pooling
- ✅ Production Docker deployment

**Known Gaps:**
- Phase 9 Plan 6: Auth UI (OTP modal, project switcher) — backend complete, UI pending

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

### Out of Scope

| Feature | Reason |
|---------|--------|
| Визуализация диаграммы (MCP-only) | Реализована через Web UI |
| In-memory хранение | SQLite persistence implemented |
| Экспорт в PDF/PNG | Deferred to v1.1 |
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
- OTP email + JWT for authentication

**Deployment:**
- Docker multi-stage build
- Nginx reverse proxy
- CapRover one-click deployment
- External PostgreSQL database (recommended)

## Constraints

- **Типизация:** Использовать типы из gantt-lib для совместимости (Task, TaskDependency)
- **Хранение:** PostgreSQL для production scaling (v2.0)
- **Язык:** TypeScript для соответствия gantt-lib экосистеме
- **Деплой:** Docker контейнер на CapRover с внешней PostgreSQL базой данных
- **Миграция данных:** Не требуется — чистая установка PostgreSQL (v2.0)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| TypeScript вместо Python | gantt-lib написана на TS — естественная совместимость типов | ✓ Good |
| npm workspaces вместо lerna/turborepo | 3 packages — достаточно простого workspace | ✓ Good |
| Fastify + WebSocket вместо Express | Native WebSocket support, better performance | ✓ Good |
| SQLite вместо PostgreSQL | Проще деплой, нет внешних зависимостей | ⚠️ Revisiting → PostgreSQL for v2.0 scaling |
| PostgreSQL для production | Несколько контейнеров + concurrent users — SQLite bottleneck | ✓ Complete (v2.0) |
| gantt-lib вместо dhtmlx-gantt | TypeScript-first, lighter, better React integration | ✓ Good |
| Multi-stage Docker build | Отдельные этапы сборки для web и server | ✓ Good |
| OTP email вместо OAuth | Проще для internal tool, нет External dependencies | ✓ Good |
| In-memory → SQLite migration | Требовалась персистентность для production | ✓ Good |
| 127.0.0.1 вместо localhost в nginx | Alpine IPv6 DNS gotcha — localhost резолвится в ::1 | ✓ Good |

---
*Last updated: 2026-03-17 — v2.0 shipped*
