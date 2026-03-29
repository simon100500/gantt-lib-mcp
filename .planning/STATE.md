---
gsd_state_version: 1.0
milestone: v4.0
milestone_name: Astro Landing
current_phase: null
status: shipped
last_updated: "2026-03-29T13:40:00.000Z"
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
---

# Project State: gantt-lib MCP Server

**Last updated:** 2026-03-29
**Current milestone:** None (v4.0 shipped)
**Status:** Awaiting next milestone

---

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-29)

**Core value:** AI может программно управлять диаграммами Ганта: создавать задачи, устанавливать зависимости и автоматически пересчитывать сроки при изменениях
**Current focus:** Planning next milestone

---

## Architecture

```
packages/
  mcp/       — MCP server with stdio transport
  server/    — Fastify + WebSocket + Prisma + PostgreSQL
  web/       — React + Vite + Zustand + gantt-lib
  site/      — Astro marketing site
```

**Deployment:**
- getgantt.ru → packages/site (Astro static, Nginx)
- ai.getgantt.ru → packages/web + packages/server (React + Fastify)

---

## Known Gaps

- Phase 9 Plan 6: Auth UI (OTP modal, project switcher) — backend complete, UI pending

---

## Next Steps

1. **Start next milestone:** `/gsd:new-milestone`

---
*Last updated: 2026-03-29 after v4.0 milestone completion*
