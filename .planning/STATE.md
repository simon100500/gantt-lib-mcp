---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: MVP
current_phase: 26
status: ready
last_updated: "2026-03-25T17:34:24.000Z"
progress:
  total_phases: 4
  completed_phases: 2
  total_plans: 7
  completed_plans: 5
---


# Project State: gantt-lib MCP Server

**Last updated:** 2026-03-25
**Current milestone:** v4.0 Astro Landing
**Current phase:** 26

---

## Project Reference

### What This Is

Полноценный веб-редактор диаграмм Ганта с AI-ассистентом. MCP-сервер на TypeScript для программного управления задачами, React UI с интерактивным редактированием и WebSocket real-time sync. Деплой в один контейнер на CapRover с PostgreSQL персистентностью.

### Core Value

AI может программно управлять диаграммами Ганта: создавать задачи, устанавливать зависимости и автоматически пересчитывать сроки при изменениях. Пользователи могут редактировать диаграмму интерактивно (drag-to-edit) или через AI-чат.

---

## Current Position

Phase: 26 (content-seo) — COMPLETE
Plan: 2 of 2

### Recent Work

**v4.0 Phase 26 Plan 02 Complete (2026-03-25):**

- Published `/privacy` with practical Russian-first privacy copy and distinct metadata
- Published `/terms` with plain-language usage rules, service limitations, and distinct metadata
- Added `sitemap.xml` for `/`, `/features`, `/faq`, `/privacy`, and `/terms`
- Added `robots.txt` allowing indexing and pointing crawlers to `https://getgantt.ru/sitemap.xml`
- Verified the generated site build and emitted crawl assets after the approved checkpoint

**v4.0 Phase 26 Complete (2026-03-25):**

- Content pages now cover features, FAQ, privacy, and terms
- Shared metadata contract is live across all marketing content pages
- Search-discovery basics are complete with sitemap and robots assets

**v4.0 Phase 26 Plan 01 Complete (2026-03-25):**

- Shared `Layout.astro` metadata props for title, description, and OG tags
- Header and footer aligned to published content routes only
- `/features` page with six AI-first product sections and CTA to `ai.getgantt.ru`
- `/faq` page with 10 concise answers covering onboarding, pricing status, privacy, and sharing

**v4.0 Phase 25 Complete (2026-03-24):**

- gantt-lib@^0.28.0 installed in packages/site
- Interactive GanttPreview with 11 hierarchical tasks
- Collapse/expand functionality for parent groups
- Full drag-to-edit (reschedule + resize)
- CSS theme overrides for site integration
- Bonus: viewMode toggle, scrollToToday, responsive taskList

**v4.0 Phase 24 Complete (2026-03-23):**

- Astro 5.0 site with React + Tailwind
- Header, Footer, Layout components
- Hero section with rotating words, typewriter demo, gantt preview

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
| Shared Layout metadata props for Astro content pages | One SEO rendering path keeps per-route metadata consistent without duplicating tags | ✓ Good (v4.0) |
| /features story stays AI-first before manual editing | Matches the locked product narrative and avoids promising future-scope collaboration or pricing | ✓ Good (v4.0) |
| Legal pages stay practical and scope-honest | Avoids invented billing, compliance, or certification claims not documented in the repo | ✓ Good (v4.0) |
| sitemap.xml includes only shipped marketing routes | Keeps crawler output aligned to actual published pages instead of future roadmap placeholders | ✓ Good (v4.0) |
| Phase 24-astro-site-foundation P01 | 153 | 4 tasks | 8 files |
| Phase 24 P02 | 180 | 5 tasks | 12 files |
| Phase 24 P03 | 540 | 3 tasks | 15 files |
| Phase 26 P01 | 11 min | 5 tasks | 5 files |
| Phase 26 P02 | 5 min | 5 tasks | 4 files |

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

**Completed (Phase 25):**

- [x] Install gantt-lib@^0.28.0 in packages/site
- [x] Create interactive GanttPreview with 11 hierarchical tasks
- [x] Implement collapse/expand for parent groups
- [x] Add full drag-to-edit (reschedule + resize)
- [x] CSS theme overrides for site integration

**Immediate (Phase 26):**

- [x] Create /features page with feature descriptions
- [x] Create /faq page with 10 Q&A
- [x] Create /privacy and /terms pages
- [x] Add sitemap.xml and robots.txt
- [x] Configure meta tags and OG tags

**Upcoming (Phase 27):**

- [ ] Create Dockerfile.site for static build
- [ ] Configure CapRover multi-domain deployment
- [ ] Set up CORS for WebSocket on ai.getgantt.ru
- [ ] Update share link generation with PUBLIC_SHARE_URL

### Blockers

None currently.

### Quick Tasks Completed

| Date | Task | Files Changed |
|------|------|---------------|
| 2026-03-23 | Hero: обновить верстку и применить фиолетовый accent из web | Hero.astro, RotatingWords.tsx, global.css |
| 2026-03-24 | Hero: favicon.svg лого и убрать дыры в верстке | Header.astro, Hero.astro, RotatingWords.tsx, favicon.svg |
| 2026-03-25 | Agent-run: inline dependencies для новых последовательных подзадач и cheap path для "отдельным блоком" | packages/mcp/agent/prompts/system.md, packages/server/src/agent.ts, packages/server/src/agent.test.ts |
| 2026-03-25 | Agent-run: запрет guessed UUID для inline dependency и reuse exact createdTaskId | packages/mcp/agent/prompts/system.md, packages/server/src/agent.ts, packages/server/src/agent.test.ts |

---

## Next Steps

1. **Start Phase 27:** Configure domain separation for `getgantt.ru` and `ai.getgantt.ru`
2. **Add site deployment path:** Create `Dockerfile.site` for Astro static output
3. **Wire runtime boundaries:** Configure WebSocket CORS and `PUBLIC_SHARE_URL` for the app domain
4. **Complete Milestone:** `/gsd:complete-milestone`

---
*Last updated: 2026-03-25*
