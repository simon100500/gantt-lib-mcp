---
phase: 33-frontend-constraints-ux
plan: 02
subsystem: ui
tags: [react, billing, usage, chat, projects]
requires:
  - phase: 33-frontend-constraints-ux
    provides: shared constraint helpers and structured limit modal contract
provides:
  - structured App-level limit modal wiring for project and AI denials
  - project usage indicators with disabled create affordances
  - chat usage indicators with proactive disabled send states
affects: [feature-gates, billing, chat, projects]
tech-stack:
  added: []
  patterns: [proactive constraint guards, shared denial payload wiring]
key-files:
  created: []
  modified:
    - packages/web/src/App.tsx
    - packages/web/src/stores/useAuthStore.ts
    - packages/web/src/components/layout/ProjectMenu.tsx
    - packages/web/src/components/ProjectSwitcher.tsx
    - packages/web/src/components/workspace/ProjectWorkspace.tsx
    - packages/web/src/components/ChatSidebar.tsx
key-decisions:
  - "Stored the real 403 payload for project creation in auth state so App can open the same structured modal used for backend denials."
  - "Used proactive denial derivation from usage/subscription state to disable project creation and AI chat before failed requests."
patterns-established:
  - "Constraint UI flow: App fetches usage on shell entry, derives proactive guard state, and routes both optimistic and backend denials through the same modal helper."
  - "Project/chat surfaces render small usage badges next to the action they guard and expose Russian tooltip copy when limits are exhausted."
requirements-completed: [FUX-01, FUX-03]
duration: 28min
completed: 2026-04-04
---

# Phase 33: Frontend Constraints UX Summary

**Project creation and AI chat now show live usage context, disable exhausted actions proactively, and open the structured limit modal from the same denial metadata path.**

## Performance

- **Duration:** 28 min
- **Started:** 2026-04-04T00:25:00+03:00
- **Completed:** 2026-04-04T00:52:58+03:00
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Replaced App's scenario-only modal flow with structured denial payload state plus usage refresh on shell entry and denial handling.
- Added project usage badges and disabled create affordances in the shell header and project switcher.
- Added AI usage context and a dedicated disabled-reason path in chat so exhausted or expired accounts are blocked before submission.

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace ad-hoc limit interception with structured modal and usage state wiring** - `00264f6` (feat)
2. **Task 2: Add visible usage indicators and proactive disabled guards to project and chat actions** - `5ad67e7` (feat)

## Files Created/Modified

- `packages/web/src/App.tsx` - Fetches usage, derives proactive denial state, and opens `LimitReachedModal` with structured payloads.
- `packages/web/src/stores/useAuthStore.ts` - Preserves project creation denial payloads instead of collapsing them to a boolean.
- `packages/web/src/components/layout/ProjectMenu.tsx` - Shows project usage near create actions and disables them with explanatory titles.
- `packages/web/src/components/ProjectSwitcher.tsx` - Adds section-level usage badge and disabled new-project affordance.
- `packages/web/src/components/workspace/ProjectWorkspace.tsx` - Passes billing usage and disabled-reason props into chat.
- `packages/web/src/components/ChatSidebar.tsx` - Renders AI usage, disabled reasoning, and blocks send when limits are exhausted.

## Decisions Made

- Kept the backend denial contract unchanged and normalized everything on the frontend with the shared helper from Plan 33-01.
- Derived proactive project/AI guards from `usage` plus subscription activity so the modal and disabled tooltips stay aligned.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 33 now exposes a consistent constraint UX contract across proactive guards and denied actions.
- Phase 34 can reuse the same project-shell and modal patterns for boolean feature gates and upgrade prompts.

## Self-Check: PASSED

- `cmd /c npx tsc -p packages/web/tsconfig.json`
- Grep confirmed `PROJECT_LIMIT_REACHED`, `AI_LIMIT_REACHED`, `SUBSCRIPTION_EXPIRED`, `usage.projects`, and `usage.ai_queries` in the expected frontend surfaces.

---
*Phase: 33-frontend-constraints-ux*
*Completed: 2026-04-04*
