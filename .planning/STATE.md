---
gsd_state_version: 1.0
milestone: v4.0
milestone_name: Astro Landing
status: in_progress
last_updated: "2026-03-23T00:00:00.000Z"
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
---

# STATE: gantt-lib MCP Server

**Last updated:** 2026-03-23

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-03-22)

**Core value:** AI может программно управлять диаграммами Ганта: создавать задачи, устанавливать зависимости и автоматически пересчитывать сроки при изменениях.

**Current focus:** Planning next milestone — use `/gsd:new-milestone`

## Current Position

Milestone: v4.0 — STARTED
Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-03-23 — Milestone v4.0 started

## Decisions

- Keep chat and UI types local to their store modules during the first Zustand pass so ownership can move without broad shared-type churn.
- Route save-state transport through `useUIStore.getState()` while keeping `useBatchTaskUpdate` as the stable migration hook surface.
- Keep `packages/web/src/hooks/useAuth.ts` as a compatibility wrapper so existing consumers can migrate incrementally to Zustand-backed auth state.
- Keep token refresh scheduling, visibility refresh, and storage synchronization inside `packages/web/src/stores/useAuthStore.ts` instead of spreading auth orchestration across components.
- Keep the existing task hooks as compatibility adapters while moving task source selection and loading into `useTaskStore`.
- Route WebSocket task and chat events directly into Zustand stores so `App.tsx` no longer depends on callback-local task or chat state.
- [Phase 22]: Keep App.tsx responsible for orchestration side effects while moving rendering into explicit workspace shells.
- [Phase 22]: Let Toolbar and ProjectMenu read UI state from useUIStore directly instead of receiving App-local control props.
- [Phase 23]: Import filter functions from 'gantt-lib' main module (not 'gantt-lib/filters' subpath)
- [Phase 23]: Return undefined when no active filters (shows all tasks)
- [Phase 23]: Use onPointerDownCapture to prevent DropdownMenu from closing on input interaction
- [v3.0]: Compact mode by default for get_tasks (token efficiency 50-90%)
- [v3.0]: Max 20 session turns + 2-minute timeout (agent safety)
- [v3.0]: parentId parameter for task hierarchy (simplicity)

## Recent Execution

**Milestone v3.0 Complete:** All 7 phases (17-23) shipped with 12 plans.

Archived:
- `.planning/milestones/v3.0-ROADMAP.md`
- `.planning/milestones/v3.0-REQUIREMENTS.md`

Git tag: `v3.0` (pending creation)

## Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260323-kw2 | Loading phrases без повторов | 2026-03-23 | 92e756a | [260323-kw2](./quick/260323-kw2/) |
| 260322-q76 | Двойной toggle календарь/тасклист | 2026-03-22 | d40b2c8 | [260322-q76](./quick/260322-q76-gantt-lib-grid-toggle/) |
| 260321-m9d | Primary кнопка + Ctrl+Enter | 2026-03-21 | 662f153 | [260321-m9d](./quick/260321-m9d-primary-ctrl-enter/) |
| 260321-m63 | Кнопка "+ задача" в поиске | 2026-03-21 | 2019ece | [260321-m63](./quick/260321-m63/) |
| 260320-fvq | Поиск по задачам в хедер | 2026-03-20 | 57ba246 | [260320-fvq-search-in-header](./quick/260320-fvq-search-in-header/) |
| 260320-fx2 | Popover Radix UI для чипа связи | 2026-03-20 | 3bb023a | [260320-fx2-popover-radix-id-popover](./quick/260320-fx2-popover-radix-id-popover/) |
| 260319-xbm | Recursive collapse all for parent tasks | 2026-03-20 | 4dbb2d7 | [260319-xbm](./quick/260319-xbm/) |
| 260319-vc2 | UI localStorage persistence | 2026-03-19 | d471757 | [260319-vc2-ui-localstorage-viewmode-collapsedparent](./quick/260319-vc2-ui-localstorage-viewmode-collapsedparent/) |
| 260319-uz3 | Loading Phrases | 2026-03-19 | fe3a27b | [260319-uz3-loading-phrases](./quick/260319-uz3-loading-phrases/) |
| 260319-kol | Zustand project sidebar fixes | 2026-03-19 | d9bc17d | [260319-kol-zustand](./quick/260319-kol-zustand/) |
| 260319-up3 | Auto-refresh projects on page load | 2026-03-19 | 55fd6e9 | [260319-up3](./quick/260319-up3/) |

## Session Continuity

**Last session:** 2026-03-22
**Milestone:** v3.0 COMPLETE

**Next actions:**

1. Use `/gsd:new-milestone` to start the next milestone cycle
2. Run `/clear` for fresh context window before next milestone

## Accumulated Context

### Roadmap Evolution

- Milestone v3.0 complete: Phases 17-23 (7 phases, 12 plans)
- Token economy, agent hardening, task hierarchy, conversation history, tool quality
- Zustand frontend refactor, UI filters

**Context for next milestone:**

- All phase summaries archived in `.planning/phases/17-*` through `23-*`
- All quick tasks archived in `.planning/quick/`
- MCP tools are production-ready with compact mode and pagination
- Frontend uses Zustand for all state management
- Task filtering UI shipped with localStorage persistence
