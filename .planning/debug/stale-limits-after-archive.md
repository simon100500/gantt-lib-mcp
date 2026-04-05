---
status: verifying
trigger: "After archiving or unarchiving a project, the project limit counters are not refreshed in the frontend. The user must reload the page to see updated limits."
created: 2026-04-05T00:00:00.000Z
updated: 2026-04-05T00:05:00.000Z
---

## Current Focus

hypothesis: CONFIRMED — billing store usage not refreshed after archive/restore/delete.
test: Added fetchUsage() calls in App.tsx callbacks, type-checked successfully.
expecting: After archiving/restoring/deleting, billingStore.usage.projects reflects the new active count.
next_action: Request human verification.

## Symptoms

expected: After archiving a project, the active project count should immediately decrease (3->2), allowing the user to create a new project without page reload.
actual: After archiving, the limit counter stays at 3/3 in the UI/backend. Creating a new project is blocked. Only a page reload fixes it.
errors: No errors shown, just stale limit data.
reproduction: 1) Have 3/3 projects on Старт plan. 2) Archive one project. 3) Immediately try to create a new project. 4) LimitReachedModal appears as if still 3/3. 5) Reload page -> shows 2/3 and creation works.
started: Likely existed since limit enforcement was added in Phase 32/33.

## Eliminated

## Evidence

- timestamp: 2026-04-05T00:01:00Z
  checked: constraint-service.ts getUsage for 'projects'
  found: Server counts active projects via prisma.project.count({ where: { userId, status: 'active' } }) — this is always fresh from DB.
  implication: Server side is correct. Problem is client-side caching.

- timestamp: 2026-04-05T00:02:00Z
  checked: useAuthStore archiveProject() (line 606-647)
  found: After successful archive API call, only updates projects array in auth store. Does NOT call useBillingStore.fetchUsage().
  implication: Billing store usage data stays stale after archive.

- timestamp: 2026-04-05T00:03:00Z
  checked: useAuthStore restoreProject() (line 649-684)
  found: Same pattern — updates projects array but does NOT call useBillingStore.fetchUsage().
  implication: Restore also leaves billing store stale.

- timestamp: 2026-04-05T00:04:00Z
  checked: App.tsx handleArchiveProject (line 723-729) and handleRestoreProject (line 731-733)
  found: Neither callback calls fetchUsage() or fetchSubscription() after archive/restore completes.
  implication: The fix should go here — call fetchUsage() after archive/restore to refresh billing limits.

- timestamp: 2026-04-05T00:04:30Z
  checked: App.tsx DeleteProjectModal onDelete callback (line 1071-1074)
  found: Same issue — deleteProject does not call fetchUsage() after removing project.
  implication: Also fixed — added fetchUsage() after delete.

## Resolution

root_cause: After archive/restore/delete operations, App.tsx callbacks do not call useBillingStore.fetchUsage(). The billing store retains stale project count from initial page load, causing LimitReachedModal to appear with outdated limits. The server-side constraint-service always queries DB directly (prisma.project.count with status='active'), so the issue is purely a client-side cache staleness problem.
fix: Added fetchUsage() call in three places in App.tsx: (1) handleArchiveProject after archiveProject(), (2) handleRestoreProject after restoreProject(), (3) DeleteProjectModal onDelete after deleteProject(). Also updated useCallback dependency arrays to include fetchUsage.
verification: TypeScript compiles without errors (only unrelated vitest type issues). Awaiting human verification.
files_changed: [packages/web/src/App.tsx]
