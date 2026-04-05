---
phase: quick
plan: 01
subsystem: billing, ui
tags: [trial, rollback, archive, project-archiving, lucide-react]

# Dependency graph
requires:
  - phase: 38-paywall-trial-transition
    provides: trial-service with endTrialNow and rollbackTrialToFree
provides:
  - endTrialNow auto-rollback to free with project archiving
  - rollbackTrialToFree with actual project archiving (not just counting)
  - Lock icon visual indicator for archived projects in sidebar
affects: [admin-panel, project-list, trial-lifecycle]

# Tech tracking
tech-stack:
  added: []
  patterns: [auto-rollback-on-trial-end, archive-excess-projects-on-downgrade]

key-files:
  created: []
  modified:
    - packages/server/src/services/trial-service.ts
    - packages/server/src/services/trial-service.test.ts
    - packages/web/src/components/ProjectSwitcher.tsx

key-decisions:
  - "endTrialNow delegates to rollbackTrialToFree after setting trial_expired, avoiding duplication"
  - "rollbackTrialToFree archives oldest excess projects (desc order + skip), keeping newest active"
  - "Lock icon placed inline next to project name with opacity-60 dimming for archived rows"

patterns-established:
  - "Auto-archive on plan downgrade: excess projects archived with status='archived' and archivedAt timestamp"

requirements-completed: []

# Metrics
duration: 12min
completed: 2026-04-05
---

# Quick Task 260405-roi: Archive Readonly Trial End Rollback Summary

**endTrialNow auto-rollback with project archiving and Lock icon for archived projects in sidebar**

## Performance

- **Duration:** 12 min
- **Started:** 2026-04-05T17:07:11Z
- **Completed:** 2026-04-05T17:19:20Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- endTrialNow now automatically rolls back to free plan and archives excess projects beyond FREE_PROJECT_LIMIT
- rollbackTrialToFree archives oldest excess projects (keeping newest under free limit)
- Lock icon displayed next to archived project names in ProjectSwitcher with dimmed text

## Task Commits

1. **Task 1: endTrialNow auto-rollback + archive excess projects** - `1ee27f7` (fix)
2. **Task 2: Lock icon on archived projects in ProjectSwitcher** - `600c005` (feat)

## Files Created/Modified
- `packages/server/src/services/trial-service.ts` - endTrialNow calls rollbackTrialToFree; rollbackTrialToFree archives excess projects via findMany + updateMany
- `packages/server/src/services/trial-service.test.ts` - Updated stub with findMany/updateMany support; updated T4 and T6 for archiving assertions
- `packages/web/src/components/ProjectSwitcher.tsx` - Lock icon import; lock icon + opacity-60 on archived project rows

## Decisions Made
- endTrialNow delegates to rollbackTrialToFree after setting trial_expired state, so both manual admin "end trial" and cron-based expiry use the same archiving logic
- Project archiving uses desc order + skip to keep the newest project active and archive the oldest ones
- Lock icon placed inline next to project name using a flex container with gap-1

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Worktree was behind master by 20+ commits**
- **Found during:** Task 1 (file not found)
- **Issue:** trial-service.ts did not exist in worktree; Phase 38 code was only in master
- **Fix:** Merged master into worktree (fast-forward) to sync all Phase 38 code
- **Files modified:** none (git merge)
- **Verification:** trial-service.ts now present and readable
- **Committed in:** N/A (merge, not part of task commits)

**2. [Rule 1 - Bug] TypeScript error with select return type**
- **Found during:** Task 1 (tsc --noEmit)
- **Issue:** `excessProjects.map((p: ProjectRow) => p.id)` -- select returns `{ id: string }` not ProjectRow
- **Fix:** Changed type annotation to `(p: { id: string })`
- **Files modified:** trial-service.ts
- **Verification:** tsc --noEmit passes with zero errors
- **Committed in:** 1ee27f7 (Task 1 commit)

**3. [Rule 1 - Bug] lucide-react Lock icon does not accept title prop**
- **Found during:** Task 2 (tsc --noEmit)
- **Issue:** `title` prop not in LucideProps type
- **Fix:** Removed title prop, kept aria-label
- **Files modified:** ProjectSwitcher.tsx
- **Verification:** tsc --noEmit passes (excluding pre-existing vitest errors)
- **Committed in:** 600c005 (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (1 merge sync, 2 bugs)
**Impact on plan:** All fixes were necessary for correctness. No scope creep.

## Issues Encountered
- Initial test assertion expected wrong project IDs for archiving -- resolved by fixing sort order to desc (keep newest) and updating stub to handle desc ordering

## Self-Check: PASSED

- trial-service.ts: FOUND
- trial-service.test.ts: FOUND
- ProjectSwitcher.tsx: FOUND
- SUMMARY.md: FOUND
- Commit 1ee27f7: FOUND
- Commit 600c005: FOUND

## User Setup Required
None - no external service configuration required.

---
*Quick task: 260405-roi*
*Completed: 2026-04-05*
