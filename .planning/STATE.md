---
gsd_state_version: 1.0
milestone: v5.0
milestone_name: Plan Constraints
current_phase: 35
status: ready_to_plan
last_updated: "2026-03-30T13:30:00.000Z"
progress:
  total_phases: 6
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
---

# Project State: gantt-lib MCP Server

**Last updated:** 2026-03-30
**Current milestone:** v5.0 Plan Constraints
**Status:** Ready to plan Phase 35

---

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-29)

**Core value:** AI может программно управлять диаграммами Ганта с enforceable тарифными лимитами
**Current focus:** Phase 35 — Scheduling Core Adoption

---

## Current Position

Phase: 35 of 35 (Scheduling Core Adoption)
Plan: 0 of ? in current phase
Status: Ready to plan
Last activity: 2026-03-30 — Completed quick task 260330-m7o: project gantt day mode

Progress: [░░░░░░░░░░] 0%

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

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260330-m7o | Сделать возможность выбирать юзеру режим работы графика: рабочие дни или календарные дни, сохранить настройку в БД на уровне проекта и вынести в меню toolbar | 2026-03-30 | b339dcc | [260330-m7o-gantt-lib](./quick/260330-m7o-gantt-lib/) |

---

## Accumulated Context

- v1.0-v4.0 shipped successfully
- Billing infrastructure exists (YooKassa, subscription management)
- Plan definitions exist in code but no enforcement mechanism
- LimitReachedModal component exists from v4.0 (basic feature gate modal)
- Phase 35 added: Scheduling Core Adoption

---

*Last updated: 2026-03-30 — completed quick task 260330-m7o (project gantt day mode)*
