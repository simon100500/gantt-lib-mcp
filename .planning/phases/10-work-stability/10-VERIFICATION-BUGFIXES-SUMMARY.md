---
phase: 10-work-stability
plan: verification-bugfixes
subsystem: [web, mcp, agent]
tags: [loading-state, project-creation, project-switching, ai-prompt]

# Dependency graph
requires:
  - phase: 10-work-stability
    provides: [auth integration, WebSocket reconnection, chat history persistence]
provides:
  - Fixed loading state stuck bug
  - Added project creation error handling
  - Fixed project switching state reset
  - Strengthened AI system prompt against verbose future-tense messages
affects: [user experience, AI interaction quality]

# Tech tracking
tech-stack:
  added: []
  patterns: [state-reset on project change, explicit past-tense AI instructions]

key-files:
  created: []
  modified: [packages/web/src/App.tsx, packages/web/src/components/ProjectSwitcher.tsx, packages/web/src/hooks/useTasks.ts, packages/mcp/agent/prompts/system.md]

key-decisions:
  - "Remove redundant aiThinking state set on token arrival - already set in handleSend"
  - "Add user-facing error alert when project creation fails"
  - "Clear all AI-related state (messages, streaming, aiThinking) when project changes"
  - "Strengthen system prompt with explicit CRITICAL instruction and BAD examples"

patterns-established:
  - "State reset pattern: when switching projects, clear all accumulated state"
  - "Error feedback pattern: show user-facing alerts for failed operations"
  - "AI instruction pattern: explicit negative examples reinforce positive instructions"

requirements-completed: []

# Metrics
duration: 15min
completed: 2026-03-08
---

# Phase 10: Verification Bug Fixes Summary

**Four UX bugs fixed: loading state no longer stuck, project creation has error feedback, project switching properly resets state, AI uses past tense instead of verbose future tense**

## Performance

- **Duration:** 15 min
- **Started:** 2026-03-08T00:55:00Z
- **Completed:** 2026-03-08T01:13:00Z
- **Tasks:** 4
- **Files modified:** 4

## Accomplishments
- Fixed loading state stuck bug that caused "AI думает..." to never clear
- Added user-facing error feedback for failed project creation
- Fixed project switching to clear old chat, tasks, and AI state
- Strengthened AI system prompt to eliminate verbose future-tense messages

## Task Commits

Each bug was fixed atomically:

1. **Bug 1: Loading state stuck** - `acda762` (fix)
2. **Bug 2: Project creation error handling** - `6f60a38` (fix)
3. **Bug 3: Project switching state reset** - `cf58995` (fix)
4. **Bug 4: AI verbose messages** - `a245b2e` (fix)

## Files Created/Modified

- `packages/web/src/App.tsx` - Removed redundant `setAiThinking(true)` on token, added state clearing on project change
- `packages/web/src/components/ProjectSwitcher.tsx` - Added async error handling and user alert
- `packages/web/src/hooks/useTasks.ts` - Set loading=true and clear error on fetch start
- `packages/mcp/agent/prompts/system.md` - Added CRITICAL past-tense instruction with bad examples

## Decisions Made

**Bug 1 - Loading state stuck:** The `setAiThinking(true)` call on token arrival was redundant since `handleSend` already sets it. The done event properly clears it, but the extra set was masking timing issues. Removed the redundant set.

**Bug 2 - Project creation:** The API endpoint was working correctly, but failures were silent. Added user-facing alert so users know when creation fails and can retry.

**Bug 3 - Project switching:** When switching projects, the old chat messages and AI state remained. Added explicit state clearing (`setMessages([])`, `setStreaming('')`, `setAiThinking(false)`) in the history load effect. Also added `setLoading(true)` and `setError(null)` in useTasks to show proper loading state during fetch.

**Bug 4 - AI verbose messages:** The existing system.md instruction was too weak. Added a "CRITICAL" section emphasizing PAST tense only, plus explicit "BAD examples" showing what NOT to say (future-tense phrases like "Я добавлю...", "Я проверю...").

## Deviations from Plan

None - all fixes were requested by the user in response to verification testing.

### Bugs Fixed

**1. [Rule 1 - Bug] Fixed loading state stuck bug**
- **Found during:** User verification after Phase 10 completion
- **Issue:** "AI думает..." never exits - loading state stuck forever
- **Fix:** Removed redundant `setAiThinking(true)` on token arrival - it was already set in `handleSend`
- **Files modified:** packages/web/src/App.tsx
- **Committed in:** acda762

**2. [Rule 1 - Bug] Added project creation error handling**
- **Found during:** User verification after Phase 10 completion
- **Issue:** Project creation fails silently with no user feedback
- **Fix:** Made handleCreateNew async, added error check, show alert on failure
- **Files modified:** packages/web/src/components/ProjectSwitcher.tsx
- **Committed in:** 6f60a38

**3. [Rule 1 - Bug] Fixed project switching state reset**
- **Found during:** User verification after Phase 10 completion
- **Issue:** Switching projects shows old Gantt chart and chat instead of fresh state
- **Fix:** Clear messages, streaming, and aiThinking when project changes; set loading=true in useTasks
- **Files modified:** packages/web/src/App.tsx, packages/web/src/hooks/useTasks.ts
- **Committed in:** cf58995

**4. [Rule 1 - Bug] Strengthened AI system prompt**
- **Found during:** User verification after Phase 10 completion
- **Issue:** AI still writes verbose future-tense messages like "Я добавлю ещё одну задачу..."
- **Fix:** Added CRITICAL instruction about PAST tense only, explicit BAD examples
- **Files modified:** packages/mcp/agent/prompts/system.md
- **Committed in:** a245b2e

---

**Total deviations:** 4 user-reported bugs fixed
**Impact on plan:** All fixes necessary for correct UX. No scope creep.

## Issues Encountered

None - all bugs were clearly described by the user and fixes were straightforward.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

All 4 verification bugs are fixed. The application should now:
- Show proper loading state that clears when AI completes
- Alert users when project creation fails
- Display fresh chat and tasks when switching projects
- Return concise past-tense confirmations from AI

**Recommendation:** Re-run verification to confirm all 4 bugs are resolved.

---
*Phase: 10-work-stability (verification bugfixes)*
*Completed: 2026-03-08*
