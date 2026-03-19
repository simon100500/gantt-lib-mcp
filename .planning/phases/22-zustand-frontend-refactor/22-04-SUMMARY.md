---
phase: 22-zustand-frontend-refactor
plan: 04
subsystem: ui
tags: [react, zustand, workspace-router, layout]
requires:
  - phase: 22-01
    provides: auth and ui store foundation
  - phase: 22-02
    provides: websocket-aware auth store orchestration
  - phase: 22-03
    provides: task and chat state routed through Zustand stores
provides:
  - thin App workspace router with explicit guest, draft, shared, and project shells
  - project workspace composition around GanttChart, ChatSidebar, and store selectors
  - UI-store-driven toolbar and project menu controls
affects: [phase-22, frontend-shell, workspace-components]
tech-stack:
  added: []
  patterns: [workspace shell decomposition, store-driven layout controls]
key-files:
  created:
    - packages/web/src/components/layout/Toolbar.tsx
    - packages/web/src/components/layout/ProjectMenu.tsx
    - packages/web/src/components/workspace/SharedWorkspace.tsx
    - packages/web/src/components/workspace/GuestWorkspace.tsx
    - packages/web/src/components/workspace/DraftWorkspace.tsx
    - packages/web/src/components/workspace/ProjectWorkspace.tsx
  modified:
    - packages/web/src/App.tsx
key-decisions:
  - "Keep App.tsx responsible for orchestration side effects while moving rendering into explicit workspace shells."
  - "Let Toolbar and ProjectMenu read UI state from useUIStore directly instead of receiving App-local control props."
patterns-established:
  - "Workspace router pattern: App selects a shell by workspace.kind and delegates rendering."
  - "Layout controls pattern: header and toolbar components read UI selectors/actions from useUIStore."
requirements-completed: [WEB-ZUSTAND-06, WEB-ZUSTAND-07]
duration: 2min
completed: 2026-03-19
---

# Phase 22 Plan 04: Workspace Router Summary

**Workspace shell decomposition with a thin App router, explicit workspace components, and UI-store-driven layout controls**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-18T22:42:13Z
- **Completed:** 2026-03-18T22:43:56Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Replaced the monolithic `App.tsx` render tree with explicit shared, guest, draft, and project workspace shells.
- Added dedicated `Toolbar` and `ProjectMenu` layout components so workspace rendering is composed outside the app root.
- Routed toolbar and project-menu UI interactions through `useUIStore` selectors/actions while preserving existing auth, task, and chat orchestration.

## Task Commits

Each task was committed atomically:

1. **Task 1: Extract workspace and layout components** - `620d6fb` (feat)
2. **Task 2: Move UI-driven controls onto the UI store** - `3805141` (refactor)

## Files Created/Modified

- `packages/web/src/App.tsx` - narrows the app root to orchestration plus workspace routing.
- `packages/web/src/components/layout/ProjectMenu.tsx` - owns the shell header/sidebar and reads UI-store layout state.
- `packages/web/src/components/layout/Toolbar.tsx` - owns gantt toolbar controls via `useUIStore`.
- `packages/web/src/components/workspace/ProjectWorkspace.tsx` - composes `GanttChart`, `ChatSidebar`, task selectors, and chat selectors.
- `packages/web/src/components/workspace/GuestWorkspace.tsx` - renders the guest start screen or local task workspace shell.
- `packages/web/src/components/workspace/DraftWorkspace.tsx` - renders the draft start flow.
- `packages/web/src/components/workspace/SharedWorkspace.tsx` - renders the shared read-only workspace shell.

## Decisions Made

- Kept data loading, websocket effects, and auth-triggered side effects inside `App.tsx` so the workspace split stayed focused on presentation boundaries.
- Reused `ProjectWorkspace` as the main chart shell for guest and shared modes, with flags controlling read-only and chat behavior.
- Moved project edit modal toggles into `ProjectMenu` so project-menu interactions no longer depend on App-local UI control state.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed forwarded ref typing for the extracted project workspace**
- **Found during:** Task 1 (Extract workspace and layout components)
- **Issue:** The new `ProjectWorkspace` passed a typed gantt ref object that did not match the forwarded `GanttChart` ref signature, causing the build to fail.
- **Fix:** Cast the extracted ref to the forwarded `GanttChartRef` type at the composition boundary.
- **Files modified:** `packages/web/src/components/workspace/ProjectWorkspace.tsx`
- **Verification:** `npm run build -w packages/web`
- **Committed in:** `620d6fb`

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** The fix was limited to the extracted workspace boundary and did not expand scope.

## Issues Encountered

- Git index writes were blocked inside the sandbox, so staging and commit creation required elevated git access for the task commits.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 22 now has a thin router and explicit workspace shells, so future UI changes can target individual workspace/layout modules instead of the app root.
- The frontend build passes after the decomposition.

## Self-Check: PASSED

---
*Phase: 22-zustand-frontend-refactor*
*Completed: 2026-03-19*
