---
phase: 22-zustand-frontend-refactor
plan: 03
subsystem: ui
tags: [zustand, react, websocket, task-store, chat-store]
requires:
  - phase: 22-zustand-frontend-refactor
    provides: "Foundational chat/UI Zustand store patterns from 22-01"
  - phase: 22-zustand-frontend-refactor
    provides: "Auth/session/project store ownership from 22-02"
provides:
  - "Task store as the source of truth for auth, local, and shared task loading"
  - "Legacy task hooks reduced to adapters over useTaskStore"
  - "WebSocket task and chat side effects routed directly into Zustand stores"
affects: [packages/web, task-loading, websocket, chat]
tech-stack:
  added: []
  patterns: [zustand task store, store-backed hook adapters, direct websocket-to-store routing]
key-files:
  created:
    - packages/web/src/stores/useTaskStore.ts
  modified:
    - packages/web/src/hooks/useTasks.ts
    - packages/web/src/hooks/useLocalTasks.ts
    - packages/web/src/hooks/useSharedProject.ts
    - packages/web/src/App.tsx
key-decisions:
  - "Kept useTasks, useLocalTasks, and useSharedProject as compatibility adapters while moving all task source selection and loading into useTaskStore."
  - "Routed WebSocket task and chat updates through useTaskStore.getState() and useChatStore.getState() so App no longer depends on callback-local task or chat state."
patterns-established:
  - "Task collections and source selection should go through useTaskStore actions rather than hook-local state."
  - "Realtime side effects should write directly into Zustand stores when the stores own the affected state."
requirements-completed: [WEB-ZUSTAND-04, WEB-ZUSTAND-05]
duration: 25 min
completed: 2026-03-19
---

# Phase 22 Plan 03: Task Store and WebSocket Routing Summary

**Zustand now owns task source selection and WebSocket task/chat side effects write directly into the task and chat stores.**

## Performance

- **Duration:** 25 min
- **Started:** 2026-03-19T00:54:15Z
- **Completed:** 2026-03-19T01:18:57Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Added `useTaskStore` to centralize task collections, source tracking, loading, errors, local persistence, and shared-project loading.
- Reduced `useTasks`, `useLocalTasks`, and `useSharedProject` to thin adapters over the task store so the migration can continue incrementally.
- Rewired App WebSocket handling and chat rendering to use direct Zustand store writes for task replacement and streaming chat updates.

## Task Commits

Each task was committed atomically:

1. **Task 1: Build the task store and absorb task-source selection** - `417c2df` (feat)
2. **Task 2: Rewrite WebSocket side effects to write directly into stores** - `1409fbc` (refactor)

## Files Created/Modified
- `packages/web/src/stores/useTaskStore.ts` - Centralized task store for authenticated, local, and shared loading flows.
- `packages/web/src/hooks/useTasks.ts` - Auth-task compatibility adapter that syncs source selection into the store.
- `packages/web/src/hooks/useLocalTasks.ts` - Local-task adapter over store-managed task and project-name state.
- `packages/web/src/hooks/useSharedProject.ts` - Shared-project adapter exposing store-backed readonly task data.
- `packages/web/src/App.tsx` - Direct WebSocket routing into `useTaskStore` and `useChatStore`, plus store-backed chat rendering.

## Decisions Made
- Kept the three existing task hooks as migration boundaries so call sites can keep their current API while state ownership moves into Zustand.
- Used direct `getState()` writes for WebSocket side effects because the stores now own the affected task and chat state, which removes stale component callback routing.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- `npm run build --workspace=packages/web` failed in the sandbox with `spawn EPERM` while Vite/esbuild tried to start its worker process. Re-ran the same build outside the sandbox and the verification passed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 22 now has Zustand-backed ownership for UI, chat, auth, and task loading flows.
- The next plan can focus on turning `App.tsx` into a thinner workspace router and moving remaining toolbar/menu orchestration into stores.

## Self-Check
PASSED

---
*Phase: 22-zustand-frontend-refactor*
*Completed: 2026-03-19*
