---
gsd_state_version: 1.0
milestone: v5.0
milestone_name: Plan Constraints
current_phase: null
status: defining_requirements
last_updated: "2026-03-29T14:00:00.000Z"
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
---

# Project State: gantt-lib MCP Server

**Last updated:** 2026-03-29
**Current milestone:** v5.0 Plan Constraints
**Status:** Defining requirements

---

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-29)

**Core value:** AI может программно управлять диаграммами Ганта: создавать задачи, устанавливать зависимости и автоматически пересчитывать сроки при изменениях
**Current focus:** v5.0 — Constraint engine + enforcement

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

## Accumulated Context

- v1.0-v4.0 shipped successfully
- Billing infrastructure exists (YooKassa, subscription management)
- Plan definitions exist in code but no enforcement mechanism
- LimitReachedModal component exists from v4.0 (basic feature gate modal)

---

*Last updated: 2026-03-29 — Milestone v5.0 started*
