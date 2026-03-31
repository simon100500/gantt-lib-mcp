---
gsd_state_version: 1.0
milestone: v5.0
milestone_name: Plan Constraints
status: completed
last_updated: "2026-03-31T19:24:00.000Z"
last_activity: 2026-03-31
progress:
  total_phases: 6
  completed_phases: 1
  total_plans: 3
  completed_plans: 3
  percent: 100
---

# Project State: gantt-lib MCP Server

**Last updated:** 2026-03-31
**Current milestone:** v5.0 Plan Constraints
**Status:** Phase 35 complete

---

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-29)

**Core value:** AI может программно управлять диаграммами Ганта с enforceable тарифными лимитами
**Current focus:** Awaiting next planning step

---

## Current Position

Phase: 35 of 35 (Scheduling Core Adoption)
Plan: 3 of 3 complete
Status: Verified passed
Last activity: 2026-03-31 — Verified and completed phase 35 (authoritative scheduling adoption)

Progress: [██████████] 100%

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
| 260331-udj | Jira-like sidebar: hover overlay + click push dual-mode для переключения проектов | 2026-03-31 | eee8c8d | [260331-udj-sidebar-jira-hover-overlay-behavior](./quick/260331-udj-sidebar-jira-hover-overlay-behavior/) |

---

## Accumulated Context

- v1.0-v4.0 shipped successfully
- Billing infrastructure exists (YooKassa, subscription management)
- Plan definitions exist in code but no enforcement mechanism
- LimitReachedModal component exists from v4.0 (basic feature gate modal)
- Phase 35 added: Scheduling Core Adoption
- Phase 36 added: unified-scheduling-core
- MCP scheduler now uses a headless command core with authoritative changed-set responses
- `TaskService` and MCP tools expose move/resize/recalculate schedule commands for linked edits
- Agent verification and web persistence now treat server-returned changed tasks as authoritative for linked edits

---

*Last updated: 2026-03-31 — phase 35 verified passed and marked complete*
