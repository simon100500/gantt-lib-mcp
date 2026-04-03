---
gsd_state_version: 1.0
milestone: v5.0
milestone_name: Plan Constraints
status: planning
last_updated: "2026-04-03T08:16:25.842Z"
last_activity: 2026-04-03
progress:
  total_phases: 8
  completed_phases: 5
  total_plans: 17
  completed_plans: 17
  percent: 100
---

# Project State: gantt-lib MCP Server

**Last updated:** 2026-04-03
**Current milestone:** v5.0 Plan Constraints
**Status:** Ready to plan

---

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-03)

**Core value:** AI может программно управлять диаграммами Ганта с enforceable тарифными лимитами
**Current focus:** Phase 32 complete — backend-enforcement ready for verification

---

## Current Position

Phase: 35
Plan: Not started
Status: Phase complete — ready for verification
Last activity: 2026-04-03

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
- gantt-lib/core/scheduling subpath export fixed: DTS generation works, zero React/DOM dependencies
- gantt-lib 0.62.0 linked to MCP package via file: protocol (dev-only, npm has 0.28.1)
- Phase 36 Plan 02: ProjectCommand discriminated union (13 types), CommitProjectCommandRequest/Response, Patch model, ScheduleExecutionResult, ProjectEventRecord, Prisma ProjectEvent model with versioning
- Phase 36 Plan 04: POST /api/commands/commit endpoint with CommandService handling all 13 command types via gantt-lib/core/scheduling, atomic Prisma $transaction with optimistic concurrency, event log persistence, patch reason attribution
- Phase 36 Plan 05: Frontend three-layer Zustand store (confirmed/pending/dragPreview) with useCommandCommit hook routing schedule mutations through /api/commands/commit
- Phase 36 Plan 06: MCP schedule tools and API mutations routed through CommandService.commitCommand
- Phase 36 Plan 07: 19-test suite covering parity (P1-P3), concurrency (C1-C3), patch reasons (R1-R3), dependency regression (REG1-REG4). FS lag semantics: succStart = predEnd + lag + 1
- Phase 37 added: Calendar source of truth cleanup
- Remaining scheduling tech debt: holiday definitions are still hardcoded in `packages/mcp/src/services/projectScheduleOptions.ts` and `packages/web/src/lib/russianHolidays2026.ts`
- Next phase must remove frontend/server holiday duplication and make DB + server payload the only source of truth for calendar days
- Phase 32 Plan 01 centralized HTTP constraint guards and structured denial payloads for Fastify mutation routes
- `/api/projects`, `/api/projects/:id/restore`, `/api/chat`, and `/api/commands/commit` now reject over-limit or expired-plan writes before business logic runs
- Phase 32 Plan 02 added a Prisma-backed MCP enforcement service that resolves `projectId` ownership before denying expired paid-plan mutation tools
- Public MCP mutation tools now return normalized `limit_reached` payloads while read-only MCP tools remain available for project inspection and conversation history

## Decisions

- Phase 32 Plan 01 centralized HTTP tariff denials in shared Fastify constraint middleware so every guarded mutation returns the same limit metadata contract.
- Phase 32 Plan 01 used route contract tests to lock preHandler placement and post-check mutation ordering without adding a dedicated Fastify integration harness.
- Phase 32 Plan 02 resolved MCP mutation enforcement from projectId to owning userId through Prisma so denials match server-side ownership semantics.
- Phase 32 Plan 02 scoped MCP enforcement to the eight public task-mutation tools and left read-only tools plus `add_message` available.

## Performance Metrics

| Phase | Plan | Duration | Tasks | Files | Date |
|-------|------|----------|-------|-------|------|
| 32 | 01 | 11 min | 3 | 8 | 2026-04-03 |
| 32 | 02 | 4 min | 2 | 6 | 2026-04-03 |

## Session

- Last session: 2026-04-03T08:11:16Z
- Stopped at: Completed 32-02-PLAN.md

---

*Last updated: 2026-04-03 — Phase 32 completed and ready for verification*
