---
gsd_state_version: 1.0
milestone: v5.0
milestone_name: Plan Constraints
status: planning
last_updated: "2026-04-04T22:30:54.759Z"
last_activity: 2026-04-04
progress:
  total_phases: 10
  completed_phases: 7
  total_plans: 29
  completed_plans: 24
  percent: 89
---

# Project State: gantt-lib MCP Server

**Last updated:** 2026-04-04
**Current milestone:** v5.0 Plan Constraints
**Status:** Ready to plan

---

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-04)

**Core value:** AI может программно управлять диаграммами Ганта с enforceable тарифными лимитами
**Current focus:** Phase 34 — feature-gates plans 03/04 remaining

---

## Current Position

Phase: 35
Plan: Not started
Status: Phase 34 complete — all feature gates implemented
Last activity: 2026-04-04

Progress: [████████░░] 89%

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
- Phase 37 completed: hardcoded holidays removed, DB-first calendar flow in place
- `russianHolidays2026.ts` deleted, `systemDefaultCalendarDays` removed from server
- Frontend builds weekendPredicate only from server-provided calendarDays payload
- Phase 32 Plan 01 centralized HTTP constraint guards and structured denial payloads for Fastify mutation routes
- `/api/projects`, `/api/projects/:id/restore`, `/api/chat`, and `/api/commands/commit` now reject over-limit or expired-plan writes before business logic runs
- Phase 32 Plan 02 added a Prisma-backed MCP enforcement service that resolves `projectId` ownership before denying expired paid-plan mutation tools
- Public MCP mutation tools now return normalized `limit_reached` payloads while read-only MCP tools remain available for project inspection and conversation history
- Phase 33 introduced a shared frontend constraint contract (`constraintUi.ts`) so project and AI denials map to one structured modal API.
- Phase 33 surfaces project and AI usage near the create/send controls and proactively disables exhausted actions with Russian explanatory copy before backend rejection.

## Decisions

- Phase 32 Plan 01 centralized HTTP tariff denials in shared Fastify constraint middleware so every guarded mutation returns the same limit metadata contract.
- Phase 32 Plan 01 used route contract tests to lock preHandler placement and post-check mutation ordering without adding a dedicated Fastify integration harness.
- Phase 32 Plan 02 resolved MCP mutation enforcement from projectId to owning userId through Prisma so denials match server-side ownership semantics.
- Phase 32 Plan 02 scoped MCP enforcement to the eight public task-mutation tools and left read-only tools plus `add_message` available.
- Phase 33 kept legacy modal scenarios as a compatibility shim while making structured denial payloads the primary limit UX contract.
- Phase 33 centralized project/AI usage selectors in the billing store so future feature gates can reuse the same normalized tariff state.
- [Phase 34]: requireFeatureGate omits tracked usage fields (used/limit) from denial payload since non-tracked limits have no counters.
- [Phase 34]: Archive route preHandler composes authMiddleware then requireArchiveAccess, matching the established pattern from Phase 32.
- [Phase 34]: Feature gates skip usage snapshots in modal content since archive/resource_pool/export are boolean/access-level, not tracked counters.
- [Phase 34]: Plan-to-tier map for export upgrade targets so modal shows next concrete access level (free->start/pdf, start->team/pdf_excel, team->enterprise/pdf_excel_api).
- [Phase 34]: Frontend constraint contract expanded to cover archive, resource_pool, export with typed selectors, expanded ConstraintLimitKey, FEATURE_GATE_CODES, plan-aware descriptions.
- [Phase 34]: Renamed projectLimitDenial to constraintDenial as generic denial bridge for all 403 constraint responses.
- [Phase 34]: Extended buildProactiveConstraintDenial to handle boolean feature gates (archive, resource_pool) alongside tracked limits.
- [Phase 34]: Export tier comparison uses ordered array index for clear level ordering
- [Phase 34]: Locked export tiers are clickable buttons triggering upsell modal instead of dead/hidden UI
- [Phase 38]: TrialService and Prisma schema created inline as 38-01 dependency prerequisite in parallel worktree execution
- [Phase 38]: Any-cast pattern for Prisma calls to new fields required due to npm workspace symlink resolving to main repo types in git worktree

## Performance Metrics

| Phase | Plan | Duration | Tasks | Files | Date |
|-------|------|----------|-------|-------|------|
| 32 | 01 | 11 min | 3 | 8 | 2026-04-03 |
| 32 | 02 | 4 min | 2 | 6 | 2026-04-03 |
| 33 | 01 | 20 min | 2 | 3 | 2026-04-04 |
| 33 | 02 | 15 min | 2 | 6 | 2026-04-04 |
| 34 | 01 | 4 min | 2 | 4 | 2026-04-04 |
| 34 | 02 | 7 min | 2 | 5 | 2026-04-04 |
| 34 | 03 | 8 min | 2 | 4 | 2026-04-04 |
| 34 | 04 | 4 min | 2 | 4 | 2026-04-04 |
| Phase 38 P03 | 10min | 1 tasks | 4 files |

## Session

- Last session: 2026-04-04T14:08:00+03:00
- Stopped at: Completed 34-02-PLAN.md

---

*Last updated: 2026-04-04 — Phase 37 formally closed, Phase 34 in progress*
