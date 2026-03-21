---
gsd_state_version: 1.0
milestone: v3.0
milestone_name: MCP Server Refactoring
status: unknown
stopped_at: "Completed quick-260321-m9d: Primary button + Ctrl+Enter for task creation"
last_updated: "2026-03-21T13:04:40.735Z"
progress:
  total_phases: 7
  completed_phases: 7
  total_plans: 12
  completed_plans: 12
---

# STATE: gantt-lib MCP Server

**Last updated:** 2026-03-18 22:45:37 UTC

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-03-17)

**Current focus:** Phase 23 — filters

## Current Position

Phase: 23 (filters) — COMPLETED
Plan: 2 of 2 (all plans complete)

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

## Recent Execution

- `231afbb` - Fixed task count sync and removed sidebar auto-close on project switch.
- `ecf2147` - Removed "current project" badge from sidebar and moved edit button to header.
- `npm run build --workspace=packages/web` passed after quick task 260319-kol.

## Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
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

**Last session:** 2026-03-21T13:04:40.732Z
**Stopped at:** Completed quick-260321-m9d: Primary button + Ctrl+Enter for task creation
**Resume file:** None

**Next actions:**

1. Review `.planning/phases/22-zustand-frontend-refactor/22-04-SUMMARY.md` for the completed shell decomposition details.
2. Decide whether to close out the v3.0 milestone or queue follow-up frontend polish work.
3. Keep phase 22 planning docs aligned with the newer frontmatter format so the GSD helpers can parse them reliably.

## Accumulated Context

### Roadmap Evolution

- Phase 23 added: filters

**Context for next session:**

- Summary written at `.planning/phases/22-zustand-frontend-refactor/22-01-SUMMARY.md`
- Summary written at `.planning/phases/22-zustand-frontend-refactor/22-02-SUMMARY.md`
- Summary written at `.planning/phases/22-zustand-frontend-refactor/22-03-SUMMARY.md`
- Summary written at `.planning/phases/22-zustand-frontend-refactor/22-04-SUMMARY.md`
- Summary written at `.planning/quick/260319-kol-zustand/260319-kol-SUMMARY.md`
- Summary written at `.planning/quick/260320-fx2-popover-radix-id-popover/260320-fx2-SUMMARY.md`
- Phase 22 now has four recorded summaries on disk
- Quick task 260319-kol completed: fixed task count sync, removed current project badge, moved edit to header
- Quick task 260320-fvq completed: added task search in header with navigation and scroll
- Quick task 260320-fx2 completed: added Popover UI component and RelationChip component
- `App.tsx` now routes workspace shells while `Toolbar` and `ProjectMenu` read layout state directly from `useUIStore`
- Pre-existing unrelated worktree changes remain in `packages/web/src/components/OtpModal.tsx`
