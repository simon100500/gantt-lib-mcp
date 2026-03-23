# Project State: gantt-lib MCP Server

**Last updated:** 2026-03-23
**Current milestone:** v4.0 Astro Landing
**Current phase:** Phase 24 (Astro Site Foundation)

---

## Project Reference

### What This Is

Полноценный веб-редактор диаграмм Ганта с AI-ассистентом. MCP-сервер на TypeScript для программного управления задачами, React UI с интерактивным редактированием и WebSocket real-time sync. Деплой в один контейнер на CapRover с PostgreSQL персистентностью.

### Core Value

AI может программно управлять диаграммами Ганта: создавать задачи, устанавливать зависимости и автоматически пересчитывать сроки при изменениях. Пользователи могут редактировать диаграмму интерактивно (drag-to-edit) или через AI-чат.

---

## Current Position

### Milestone: v4.0 Astro Landing

**Goal:** Разделить marketing и app — создать Astro сайт на getgantt.ru, оставить редактор на ai.getgantt.ru

**Phase:** 24 - Astro Site Foundation
**Plan:** Not started
**Status:** Planning

**Progress:** Phase 24 of 27 (0% of milestone)

### Recent Work

**v3.0 Completed (2026-03-22):**
- Phase 17: Token Economy (compact mode, pagination, history limit)
- Phase 18: Agent Hardening (max turns, timeout, tool restrictions)
- Phase 19: Task Hierarchy (parentId in MCP tools)
- Phase 20: Conversation History (get_conversation_history, add_message)
- Phase 21: Tool Quality (descriptions, error messages)
- Phase 22: Zustand Frontend Refactor
- Phase 23: Task Filtering UI

**Known Gaps:**
- Phase 9 Plan 6: Auth UI (OTP modal, project switcher) — backend complete, UI pending

---

## Performance Metrics

### Milestone v3.0 Stats

- **Phases:** 7 (17-23)
- **Plans:** 13
- **Timeline:** 9 days (2026-03-13 → 2026-03-22)
- **Commits:** 112
- **Files changed:** 143 TypeScript files
- **Lines added:** ~28,500

### Cumulative Stats (v1.0 - v3.0)

- **Total phases:** 23
- **Total plans:** 45
- **Total timeline:** 31 days (2026-02-23 → 2026-03-22)
- **Total commits:** 354
- **Total LOC:** ~143,000 (TypeScript/JavaScript)

---

## Accumulated Context

### Key Decisions

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

### Architecture

**Monorepo structure:**
```
packages/
  mcp/       — MCP server with stdio transport
  server/    — Fastify + WebSocket + Prisma + PostgreSQL
  web/       — React + Vite + Zustand + gantt-lib
  site/      — Astro marketing site (NEW in v4.0)
```

**Tech stack:**
- MCP Server: @modelcontextprotocol/sdk
- Web Server: Fastify + WebSocket + Prisma + PostgreSQL
- Frontend: React + Vite + Zustand + gantt-lib
- Marketing: Astro 5.0 + React + Tailwind
- Auth: OTP email + JWT tokens
- Deployment: Docker multi-stage build + Nginx + CapRover

**Deployment (v4.0 target):**
- getgantt.ru → packages/site (Astro static)
- ai.getgantt.ru → packages/web + packages/server (React + Fastify)

### Constraints

- **Типизация:** Использовать типы из gantt-lib для совместимости (Task, TaskDependency)
- **Хранение:** PostgreSQL для production scaling
- **Язык:** TypeScript для соответствия gantt-lib экосистеме
- **Деплой:** Docker контейнер на CapRover с внешней PostgreSQL базой данных
- **State Management:** Zustand для всех frontend state

---

## Session Continuity

### Current Focus

**Milestone v4.0: Astro Landing**

Creating a separate marketing site on Astro to split marketing concerns from the app. This allows independent deployment cycles and better SEO for the landing page while keeping the interactive editor on ai.getgantt.ru.

**Key deliverables:**
- packages/site with Astro 5.0 + React + Tailwind
- Hero section with AI typing demo
- Interactive gantt preview via Astro islands
- Content pages (Features, FAQ, Privacy, Terms)
- SEO fundamentals (sitemap, robots, meta tags)
- Multi-domain deployment (getgantt.ru vs ai.getgantt.ru)

### Todos

**Immediate (Phase 24):**
- [ ] Set up Astro 5.0 project in packages/site
- [ ] Configure React + Tailwind integrations
- [ ] Create layout components (Header, Footer, Navigation)
- [ ] Implement hero section with typing demo
- [ ] Add responsive design (mobile/desktop breakpoints)

**Upcoming (Phase 25):**
- [ ] Integrate gantt-lib via Astro islands
- [ ] Create interactive demo with sample tasks
- [ ] Implement drag-to-edit functionality

**Upcoming (Phase 26):**
- [ ] Create /features page with feature descriptions
- [ ] Create /faq page with 10 Q&A
- [ ] Create /privacy and /terms pages
- [ ] Add sitemap.xml and robots.txt
- [ ] Configure meta tags and OG tags

**Upcoming (Phase 27):**
- [ ] Create Dockerfile.site for static build
- [ ] Configure CapRover multi-domain deployment
- [ ] Set up CORS for WebSocket on ai.getgantt.ru
- [ ] Update share link generation with PUBLIC_SHARE_URL

### Blockers

None currently.

### Quick Tasks Completed

See individual phase transitions in git history for completed quick tasks.

---

## Next Steps

1. **Execute Phase 24:** `/gsd:plan-phase 24`
2. **Complete Phase 24:** Implement Astro site foundation
3. **Execute Phase 25:** Add interactive gantt preview
4. **Execute Phase 26:** Add content pages and SEO
5. **Execute Phase 27:** Configure domain separation
6. **Complete Milestone:** `/gsd:complete-milestone`

---
*Last updated: 2026-03-23*
