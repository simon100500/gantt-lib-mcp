---
gsd_state_version: 1.0
milestone: v5.0
milestone_name: Plan Constraints
status: executing
last_updated: "2026-04-01T06:52:48.559Z"
last_activity: 2026-04-01
progress:
  total_phases: 7
  completed_phases: 2
  total_plans: 10
  completed_plans: 10
  percent: 80
---

# Project State: gantt-lib MCP Server

**Last updated:** 2026-04-01
**Current milestone:** v5.0 Plan Constraints
**Status:** Ready to execute

---

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-29)

**Core value:** AI может программно управлять диаграммами Ганта с enforceable тарифными лимитами
**Current focus:** Phase 36 — Unified Scheduling Core (All 7 plans complete)

---

## Current Position

Phase: 36 of 36 (Unified Scheduling Core)
Plan: 7 of 7 complete
Status: Ready to execute
Last activity: 2026-04-01

Progress: [████████░░] 80%

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
- gantt-lib/core/scheduling subpath export fixed: DTS generation works, zero React/DOM dependencies
- gantt-lib 0.62.0 linked to MCP package via file: protocol (dev-only, npm has 0.28.1)
- Phase 36 Plan 02: ProjectCommand discriminated union (13 types), CommitProjectCommandRequest/Response, Patch model, ScheduleExecutionResult, ProjectEventRecord, Prisma ProjectEvent model with versioning
- Phase 36 Plan 04: POST /api/commands/commit endpoint with CommandService handling all 13 command types via gantt-lib/core/scheduling, atomic Prisma $transaction with optimistic concurrency, event log persistence, patch reason attribution
- Phase 36 Plan 05: Frontend three-layer Zustand store (confirmed/pending/dragPreview) with useCommandCommit hook routing schedule mutations through /api/commands/commit
- Phase 36 Plan 06: MCP schedule tools and API mutations routed through CommandService.commitCommand
- Phase 36 Plan 07: 19-test suite covering parity (P1-P3), concurrency (C1-C3), patch reasons (R1-R3), dependency regression (REG1-REG4). FS lag semantics: succStart = predEnd + lag + 1

---

*Last updated: 2026-04-01 — completed 36-07 (test suite, Phase 36 complete)*
