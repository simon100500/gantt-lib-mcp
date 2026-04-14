---
gsd_state_version: 1.0
milestone: v5.0
milestone_name: Plan Constraints
status: verifying
last_updated: "2026-04-14T10:16:59.390Z"
last_activity: 2026-04-14
progress:
  total_phases: 14
  completed_phases: 12
  total_plans: 43
  completed_plans: 43
  percent: 100
---

# Project State: gantt-lib MCP Server

**Last updated:** 2026-04-14
**Current milestone:** v5.0 Plan Constraints
**Status:** Phase complete — ready for verification

---

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-04)

**Core value:** AI может программно управлять диаграммами Ганта с enforceable тарифными лимитами
**Current focus:** Phase 43 — initial-gen-no-regexp

---

## Current Position

Phase: 43 (initial-gen-no-regexp) — EXECUTING
Plan: 3 of 3
Status: Phase complete — ready for verification
Last activity: 2026-04-14

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
| 260405-roi | endTrialNow auto-rollback + archive excess projects + Lock icon for archived projects | 2026-04-05 | 600c005 | [260405-roi-archive-readonly-trial-end-rollback-to-f](./quick/260405-roi-archive-readonly-trial-end-rollback-to-f/) |

---

## Accumulated Context

### Roadmap Evolution

- Phase 43 added: initial-gen-no-regexp
- Phase 41 added: initial-gen-refactor
- Phase 40 added: yandex-auth

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
- [Phase 38]: Used window.confirm for rollback impact preview instead of custom modal to match existing admin panel simplicity
- [Phase 38]: Showed billingState badges only for non-free/non-paid_active states to avoid badge clutter in user list
- [Phase 38]: Trial state selectors colocated with billing store for single import
- [Phase 38]: Post-trial gate detection via reasonCode or upgradeHint content matching in constraintUi
- [Phase 38]: Trigger B (premium_feature_attempt) is deliberately simple: client detects constraint denial 403s, server validates project with tasks exists
- [Phase 38]: Trial decline tracked in sessionStorage to re-offer in new sessions
- [Phase 38]: useTrialTrigger integrates with authStore.constraintDenial for automatic trigger on feature denial
- [Quick 260405-roi]: endTrialNow auto-rollback to free + archive excess projects; rollbackTrialToFree archives oldest projects beyond FREE_PROJECT_LIMIT
- [Quick 260405-roi]: Lock icon (lucide-react) with opacity-60 on archived projects in ProjectSwitcher sidebar
- [Phase 41]: Empty-project broad prompts now route through selectAgentRoute() before any fast path or SDK run.
- [Phase 41]: Server-side model choice is resolved once per run through resolveModelRoutingDecision() and logged as a typed decision.
- [Phase 41]: Keep placeholder titles schema-invalid so repair focuses on hierarchy, coverage, and sequencing instead of filler cleanup.
- [Phase 41]: Reuse the construction intent map as compact prompt context rather than reviving deterministic starter templates.
- [Phase 41]: Deterministic initial-generation task IDs now derive from projectId and nodeKey so repeated compiles stay stable for the same serverDate.
- [Phase 41]: Initial-generation partial builds prune only broken references, cycle edges, and empty containers, then require the locked 60% and 3-phase floor before commit.
- [Phase 41]: The agent now passes a dedicated planner SDK query and project baseVersion into the initial-generation orchestrator instead of reusing mutation execution.
- [Phase 41]: Controlled initial-generation failures are surfaced as assistant messages with final lifecycle logs, not as a silent fallback into ordinary mutation flow.
- [Phase 42]: Ordinary mutation requests now enter a typed staged shell before any legacy SDK mutation attempt.
- [Phase 42]: Intent classification owns requiresResolution and requiresSchedulingPlacement so agent.ts does not recompute those flags ad hoc.
- [Phase 42]: Resolver helpers stay read-only inside TaskService so Stage 2 can gather evidence without mutating project state.
- [Phase 42]: Ordinary staged mutations now stop with typed controlled failures after resolution; only full_agent and unsupported intents may still fall back to the legacy path.
- [Phase 42]: MutationPlan now carries a typed operation union instead of string placeholders so the executor can compile authoritative commands without freeform payload synthesis.
- [Phase 42]: Hybrid fan-out and WBS expansion use a constrained StructuredFragmentPlan contract; the server owns final task IDs, parent placement, and command commits.
- [Phase 42]: Execution success is accepted only when commandService changedTaskIds match the plan's expected changed set.
- [Phase 42]: Staged mutation UX now comes from shared server-side message builders so ordinary failures never fall back to the legacy no-tool-call message.
- [Phase 42]: The remaining full_agent path must consume ResolvedMutationContext and optional MutationPlan instead of inventing IDs or dates from scratch.
- [Phase 43]: Route selection now trusts the shared interpreter payload and maps only interpreter outcomes or project-state fallback reasons.
- [Phase 43]: Conservative fallback uses only project emptiness, hierarchy, extracted worklist count, and parsed location scope; it does not inspect semantic user words.
- [Phase 43]: The existing route-decision query hook in agent.ts was widened to interpreter and repair stages so the new boundary could reuse the production query path.
- [Phase 43]: Phase 43 Plan 02 moved initial-generation normalization to technical-only evidence and removed semantic scope inference from runtime code.
- [Phase 43]: Phase 43 Plan 02 made classification, clarification, brief assembly, and domain assembly deterministic projections of the shared interpretation contract.
- [Phase 43]: Phase 43 Plan 02 made the initial-generation orchestrator compute one shared interpretation payload and log it before downstream planning.
- [Phase 43]: Phase 43 Plan 03 logs flattened interpretation, validation, fallback, and normalized-decision events so one intake run can be reconstructed from structured telemetry.
- [Phase 43]: Phase 43 Plan 03 forwards interpretation evidence from agent.ts before initial-generation branching so route selection and orchestration share one trace.
- [Phase 43]: Phase 43 Plan 03 gives interpreted location scope precedence over technical parsing in classification so paraphrases stay aligned with the shared interpretation contract.

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
| Phase 38 P04 | 2min | 1 tasks | 1 files |
| Phase 38 P05 | 2min | 1 tasks | 5 files |
| Phase 38 P06 | 6min | 2 tasks | 4 files |
| Phase 41 P01 | 18 min | 2 tasks | 6 files |
| Phase 41 P02 | 8 min | 2 tasks | 7 files |
| Phase 41 P03 | 25 min | 2 tasks | 3 files |
| 41 | 04 | 5min | 2 | 4 | 2026-04-08 |
| Phase 42 P01 | 7min | 2 tasks | 8 files |
| Phase 42 P02 | 8min | 2 tasks | 7 files |
| Phase 42 P04 | 4 min | 2 tasks | 5 files |
| Phase 43 P01 | 6 min | 2 tasks | 6 files |
| Phase 43 P02 | 32min | 2 tasks | 11 files |
| Phase 43 P03 | 6 min | 2 tasks | 9 files |

## Session

- Last session: 2026-04-14T10:16:59Z
- Stopped at: Completed 43-03-PLAN.md

---

*Last updated: 2026-04-14 — Phase 43 Plan 03 completed*
